import argparse
import csv
import hashlib
import json
import math
import re
import statistics
import subprocess
import sys
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

BASE_DIR = Path(__file__).parent
CACHE_DIR = BASE_DIR / "cache"
OUT_DIR = BASE_DIR / "output"
CACHE_DIR.mkdir(exist_ok=True)
OUT_DIR.mkdir(exist_ok=True)

LEAGUE_ALIASES = {
    "epl": "eng.1",
    "pl": "eng.1",
    "premier": "eng.1",
    "premierleague": "eng.1",
    "england": "eng.1",
    "eng.1": "eng.1",
    "laliga": "esp.1",
    "spain": "esp.1",
    "esp.1": "esp.1",
    "seriea": "ita.1",
    "italy": "ita.1",
    "ita.1": "ita.1",
    "ligue1": "fra.1",
    "france": "fra.1",
    "fra.1": "fra.1",
    "bundesliga": "ger.1",
    "germany": "ger.1",
    "ger.1": "ger.1",
}

LEAGUE_NAMES = {
    "eng.1": "Premier League",
    "esp.1": "La Liga",
    "ita.1": "Serie A",
    "fra.1": "Ligue 1",
    "ger.1": "Bundesliga",
}

TOP5_SLUGS = ["esp.1", "eng.1", "ita.1", "fra.1", "ger.1"]


def normalize_text(text: str) -> str:
    nfkd = unicodedata.normalize("NFKD", text)
    ascii_only = "".join(ch for ch in nfkd if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]+", " ", ascii_only.lower()).strip()


def resolve_league(name: str) -> str:
    key = re.sub(r"[^a-z0-9.]+", "", name.lower())
    if key in LEAGUE_ALIASES:
        return LEAGUE_ALIASES[key]
    raise ValueError(
        f"Unknown league '{name}'. Try one of: epl, laliga, seriea, ligue1, bundesliga"
    )


def fetch_json(url: str, ttl_seconds: int = 3600, retries: int = 10) -> dict:
    key = hashlib.sha256(url.encode("utf-8")).hexdigest()[:24]
    cache_path = CACHE_DIR / f"{key}.json"
    if cache_path.exists():
        age = time.time() - cache_path.stat().st_mtime
        if ttl_seconds <= 0 or age < ttl_seconds:
            return json.loads(cache_path.read_text(encoding="utf-8"))

    cmd = [
        "curl.exe",
        "-fsSL",
        "--http1.1",
        "--max-time",
        "20",
        "-H",
        "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        url,
    ]
    last_err = ""
    for attempt in range(retries):
        res = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
        if res.returncode == 0 and res.stdout.strip():
            data = json.loads(res.stdout)
            cache_path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
            return data
        last_err = res.stderr.strip() or f"exit={res.returncode}"
        time.sleep(min(3.0, 0.5 + attempt * 0.4))
    raise RuntimeError(f"Failed {url}: {last_err}")


def get_standings_map(league_slug: str, season: int) -> tuple[dict[str, dict], int]:
    """Returns ({team_id: {rank, name, tier, ...}}, total_teams)."""
    url = f"https://site.api.espn.com/apis/v2/sports/soccer/{league_slug}/standings?season={season}"
    data = fetch_json(url, ttl_seconds=1800)
    entries = data["children"][0]["standings"]["entries"]
    n_teams = len(entries)
    top_cut = math.ceil(n_teams / 3)       # 20 -> 7, 18 -> 6
    bot_start = n_teams - top_cut + 1      # 20 -> 14, 18 -> 13

    def classify_tier(rank: int) -> str:
        if rank <= top_cut:
            return f"Top 1/3 (1-{top_cut})"
        if rank >= bot_start:
            return f"Bottom 1/3 ({bot_start}-{n_teams})"
        return f"Mid 1/3 ({top_cut + 1}-{bot_start - 1})"

    table = {}
    for idx, entry in enumerate(entries, 1):
        team = entry["team"]
        tid = str(team["id"])
        # Prefer ESPN's explicit rank stat when available
        rank = idx
        for st in entry.get("stats", []):
            if st.get("name") == "rank" and st.get("value") is not None:
                rank = int(round(float(st["value"])))
                break
        table[tid] = {
            "team_id": tid,
            "name": team["displayName"],
            "short_name": team.get("shortDisplayName") or team["displayName"],
            "rank": rank,
            "tier": classify_tier(rank),
            "top_cut": top_cut,
            "bot_start": bot_start,
            "n_teams": n_teams,
        }
    return table, n_teams


def build_league_roster_index(league_slug: str, season: int) -> list[dict]:
    index_path = CACHE_DIR / f"roster_index_{league_slug}_{season}.json"
    if index_path.exists() and (time.time() - index_path.stat().st_mtime) < 24 * 3600:
        return json.loads(index_path.read_text(encoding="utf-8"))

    standings, _ = get_standings_map(league_slug, season)

    def fetch_team_roster(tid: str, tname: str) -> list[dict]:
        url = f"https://site.api.espn.com/apis/site/v2/sports/soccer/{league_slug}/teams/{tid}/roster"
        data = fetch_json(url, ttl_seconds=24 * 3600)
        out = []
        for a in data.get("athletes", []):
            out.append(
                {
                    "athlete_id": str(a["id"]),
                    "athlete_name": a.get("displayName", ""),
                    "norm_name": normalize_text(a.get("displayName", "")),
                    "team_id": tid,
                    "team_name": tname,
                    "league_slug": league_slug,
                }
            )
        return out

    players: list[dict] = []
    with ThreadPoolExecutor(max_workers=8) as ex:
        futs = [ex.submit(fetch_team_roster, tid, info["name"]) for tid, info in standings.items()]
        for fut in as_completed(futs):
            players.extend(fut.result())

    index_path.write_text(json.dumps(players, ensure_ascii=False), encoding="utf-8")
    return players


def find_player(query: str, season: int, league_hint: str | None = None) -> dict:
    q_norm = normalize_text(query)
    q_tokens = set(q_norm.split())
    slugs = [resolve_league(league_hint)] if league_hint else TOP5_SLUGS

    candidates = []
    for slug in slugs:
        roster = build_league_roster_index(slug, season)
        for p in roster:
            p_norm = p["norm_name"]
            p_tokens = set(p_norm.split())
            if q_norm == p_norm:
                return p
            if q_tokens and q_tokens.issubset(p_tokens):
                candidates.append((0, p))
            elif q_norm in p_norm:
                candidates.append((1, p))
            elif q_tokens and all(any(qt in pt for pt in p_tokens) for qt in q_tokens):
                candidates.append((2, p))
        if candidates and not league_hint:
            break  # Found cleanly in this league

    if not candidates:
        raise RuntimeError(
            f"Player '{query}' not found in rosters ({', '.join(slugs)}). "
            "Check spelling or pass --league."
        )
    candidates.sort(key=lambda x: (x[0], len(x[1]["athlete_name"])))
    return candidates[0][1]


def get_team_completed_events(team_id: str, seasons: list[int], league_only: str | None = None) -> list[dict]:
    events_by_id: dict[str, dict] = {}
    scope = league_only if league_only else "all"
    for season in seasons:
        url = f"https://site.api.espn.com/apis/site/v2/sports/soccer/{scope}/teams/{team_id}/schedule?season={season}"
        try:
            data = fetch_json(url, ttl_seconds=1800 if season == seasons[0] else 0)
        except Exception:
            continue
        for ev in data.get("events", []):
            comp = ev.get("competitions", [{}])[0]
            if not comp.get("status", {}).get("type", {}).get("completed"):
                continue
            eid = str(ev["id"])
            if eid in events_by_id:
                continue
            lg = ev.get("league", {})
            lg_slug = lg.get("slug") or (league_only or "")
            lg_name = lg.get("abbreviation") or lg.get("name") or LEAGUE_NAMES.get(lg_slug, "Club")
            if not league_only and ("friendly" in lg_slug.lower() or "friendly" in lg_name.lower()):
                continue

            opp_id = ""
            opp_name = "?"
            ha = "?"
            team_score = ""
            opp_score = ""
            for c in comp.get("competitors", []):
                cid = str(c.get("team", {}).get("id", ""))
                sc = c.get("score", {})
                sc_val = sc.get("displayValue", "") if isinstance(sc, dict) else str(sc)
                if cid == team_id:
                    ha = "H" if c.get("homeAway") == "home" else "A"
                    team_score = sc_val
                else:
                    opp_id = cid
                    opp_name = c.get("team", {}).get("shortDisplayName") or c.get("team", {}).get("displayName", "?")
                    opp_score = sc_val

            events_by_id[eid] = {
                "event_id": eid,
                "season": season,
                "date": ev.get("date", "")[:10],
                "datetime": ev.get("date", ""),
                "league_slug": lg_slug,
                "competition": lg_name,
                "opponent_id": opp_id,
                "opponent": opp_name,
                "home_away": ha,
                "score": f"{team_score}-{opp_score}" if team_score != "" else "",
            }
    return sorted(events_by_id.values(), key=lambda x: x["datetime"], reverse=True)


def fetch_match_summary(event_id: str) -> dict:
    url = f"https://site.api.espn.com/apis/site/v2/sports/soccer/all/summary?event={event_id}"
    return fetch_json(url, ttl_seconds=0)


def extract_all_played_players(summary: dict) -> list[dict]:
    out = []
    for team_roster in summary.get("rosters", []):
        team = team_roster.get("team", {})
        tid = str(team.get("id", ""))
        tname = team.get("displayName", "")
        for p in team_roster.get("roster", []):
            starter = bool(p.get("starter", False))
            subbed_in = bool(p.get("subbedIn", False))
            did_not_play = bool(p.get("didNotPlay", False))
            if did_not_play or (not starter and not subbed_in):
                continue
            stats = {s["name"]: s.get("value", 0) for s in p.get("stats", [])}
            out.append(
                {
                    "athlete_id": str(p.get("athlete", {}).get("id", "")),
                    "athlete_name": p.get("athlete", {}).get("displayName", ""),
                    "team_id": tid,
                    "team_name": tname,
                    "starter": starter,
                    "shots": int(round(float(stats.get("totalShots", 0)))),
                    "sot": int(round(float(stats.get("shotsOnTarget", 0)))),
                    "goals": int(round(float(stats.get("totalGoals", 0)))),
                    "yellow_cards": int(round(float(stats.get("yellowCards", 0)))),
                }
            )
    return out


def summarize(matches: list[dict]) -> dict:
    shots = [m["shots"] for m in matches]
    sot = [m["sot"] for m in matches]
    tot_s = sum(shots)
    tot_sot = sum(sot)
    return {
        "n": len(matches),
        "shots_sum": tot_s,
        "shots_mean": round(statistics.mean(shots), 2) if shots else 0.0,
        "shots_median": round(statistics.median(shots), 2) if shots else 0.0,
        "sot_sum": tot_sot,
        "sot_mean": round(statistics.mean(sot), 2) if sot else 0.0,
        "sot_median": round(statistics.median(sot), 2) if sot else 0.0,
        "sot_rate_pct": round((tot_sot / tot_s) * 100, 1) if tot_s > 0 else 0.0,
    }


def print_table(headers: list[str], rows: list[list], alignments: list[str] | None = None) -> None:
    str_rows = [[str(c) for c in r] for r in rows]
    widths = [max(len(h), *(len(r[i]) for r in str_rows)) if str_rows else len(h) for i, h in enumerate(headers)]
    aligns = alignments or ["<" for _ in headers]

    def fmt_row(cols: list[str]) -> str:
        return " | ".join(f"{c:{a}{w}}" for c, a, w in zip(cols, aligns, widths))

    print(fmt_row(headers))
    print("-+-".join("-" * w for w in widths))
    for r in str_rows:
        print(fmt_row(r))


def run_player_analysis(names: list[str], season: int, league_hint: str | None) -> None:
    players = [find_player(n, season, league_hint) for n in names]
    standings_cache: dict[str, dict[str, dict]] = {}

    summary_table_10 = []
    summary_table_5 = []

    for p in players:
        slug = p["league_slug"]
        if slug not in standings_cache:
            standings_cache[slug], _ = get_standings_map(slug, season)
        standings = standings_cache[slug]
        team_info = standings.get(p["team_id"], {})
        team_rank = team_info.get("rank")
        n_teams = team_info.get("n_teams", 20)
        top_cut = team_info.get("top_cut", math.ceil(n_teams / 3))
        bot_start = team_info.get("bot_start", n_teams - top_cut + 1)

        # Fetch all club matches of current season (+ previous season if needed for last 10)
        events = get_team_completed_events(p["team_id"], [season, season - 1])
        # Fetch current-season matches + buffer from previous season in parallel
        current_season_evs = [e for e in events if e["season"] == season]
        prev_buffer = [e for e in events if e["season"] == season - 1][:12]
        to_fetch = current_season_evs + prev_buffer

        summaries_by_eid: dict[str, dict] = {}
        with ThreadPoolExecutor(max_workers=8) as ex:
            futs = {ex.submit(fetch_match_summary, e["event_id"]): e["event_id"] for e in to_fetch}
            for fut in as_completed(futs):
                eid = futs[fut]
                summaries_by_eid[eid] = fut.result()

        played_all: list[dict] = []
        for ev in to_fetch:
            sm = summaries_by_eid[ev["event_id"]]
            matched = next(
                (
                    x
                    for x in extract_all_played_players(sm)
                    if x["athlete_id"] == p["athlete_id"] and x["team_id"] == p["team_id"]
                ),
                None,
            )
            if not matched:
                continue
            is_league = ev["league_slug"] == slug and ev["season"] == season
            opp_info = standings.get(ev["opponent_id"]) if is_league else None
            opp_rank = opp_info["rank"] if opp_info else None
            opp_tier = opp_info["tier"] if opp_info else "Non-League"
            rel_rank = ""
            if opp_rank is not None and team_rank is not None:
                rel_rank = "Higher in Table" if opp_rank < team_rank else "Lower in Table"

            played_all.append(
                {
                    **ev,
                    **matched,
                    "is_current_league": is_league,
                    "team_rank": team_rank,
                    "opp_rank": opp_rank,
                    "opp_tier": opp_tier,
                    "rel_rank": rel_rank,
                }
            )

        last10 = played_all[:10]
        last5 = played_all[:5]
        w10 = summarize(last10)
        w5 = summarize(last5)

        summary_table_10.append(
            [
                p["athlete_name"],
                p["team_name"],
                w10["n"],
                w10["shots_sum"],
                f"{w10['shots_mean']:.2f}",
                f"{w10['shots_median']:.1f}",
                w10["sot_sum"],
                f"{w10['sot_mean']:.2f}",
                f"{w10['sot_median']:.1f}",
                f"{w10['sot_rate_pct']:.1f}%",
            ]
        )
        summary_table_5.append(
            [
                p["athlete_name"],
                p["team_name"],
                w5["n"],
                w5["shots_sum"],
                f"{w5['shots_mean']:.2f}",
                f"{w5['shots_median']:.1f}",
                w5["sot_sum"],
                f"{w5['sot_mean']:.2f}",
                f"{w5['sot_median']:.1f}",
                f"{w5['sot_rate_pct']:.1f}%",
            ]
        )

        # Tier EDA on current season domestic league matches
        league_matches = [m for m in played_all if m["is_current_league"]]
        tier_labels = [
            f"Top 1/3 (1-{top_cut})",
            f"Mid 1/3 ({top_cut + 1}-{bot_start - 1})",
            f"Bottom 1/3 ({bot_start}-{n_teams})",
        ]
        tier_rows = []
        tier_csv_rows = []
        for label in tier_labels:
            subset = [m for m in league_matches if m["opp_tier"] == label]
            s = summarize(subset)
            tier_rows.append(
                [
                    label,
                    s["n"],
                    s["shots_sum"],
                    f"{s['shots_mean']:.2f}",
                    f"{s['shots_median']:.1f}",
                    s["sot_sum"],
                    f"{s['sot_mean']:.2f}",
                    f"{s['sot_median']:.1f}",
                    f"{s['sot_rate_pct']:.1f}%",
                ]
            )
            tier_csv_rows.append({"player": p["athlete_name"], "group": label, **s})

        for rel in ("Higher in Table", "Lower in Table"):
            subset = [m for m in league_matches if m["rel_rank"] == rel]
            s = summarize(subset)
            tier_rows.append(
                [
                    f"vs {rel}",
                    s["n"],
                    s["shots_sum"],
                    f"{s['shots_mean']:.2f}",
                    f"{s['shots_median']:.1f}",
                    s["sot_sum"],
                    f"{s['sot_mean']:.2f}",
                    f"{s['sot_median']:.1f}",
                    f"{s['sot_rate_pct']:.1f}%",
                ]
            )
            tier_csv_rows.append({"player": p["athlete_name"], "group": f"vs {rel}", **s})

        print(f"\n{'=' * 92}")
        print(
            f"PLAYER: {p['athlete_name']} | TEAM: {p['team_name']} "
            f"(#{team_rank} in {LEAGUE_NAMES.get(slug, slug)}, {season}/{season + 1})"
        )
        print(f"{'=' * 92}")

        print("\n[A] Last 10 vs Last 5 Club Matches:")
        print_table(
            ["Window", "N", "Shots", "Mean S", "Med S", "SoT", "Mean SoT", "Med SoT", "SoT%"],
            [
                [
                    "Last 10 Club",
                    w10["n"],
                    w10["shots_sum"],
                    f"{w10['shots_mean']:.2f}",
                    f"{w10['shots_median']:.1f}",
                    w10["sot_sum"],
                    f"{w10['sot_mean']:.2f}",
                    f"{w10['sot_median']:.1f}",
                    f"{w10['sot_rate_pct']:.1f}%",
                ],
                [
                    "Last 5 Club",
                    w5["n"],
                    w5["shots_sum"],
                    f"{w5['shots_mean']:.2f}",
                    f"{w5['shots_median']:.1f}",
                    w5["sot_sum"],
                    f"{w5['sot_mean']:.2f}",
                    f"{w5['sot_median']:.1f}",
                    f"{w5['sot_rate_pct']:.1f}%",
                ],
            ],
            ["<", ">", ">", ">", ">", ">", ">", ">", ">"],
        )

        print(f"\n[B] Opponent Table-Tier EDA ({LEAGUE_NAMES.get(slug, slug)} {season}/{season + 1}, {len(league_matches)} league matches):")
        print_table(
            ["Opponent Tier", "N", "Shots", "Mean S", "Med S", "SoT", "Mean SoT", "Med SoT", "SoT%"],
            tier_rows,
            ["<", ">", ">", ">", ">", ">", ">", ">", ">"],
        )

        print("\n[C] Last 10 Club Matches Breakdown:")
        detail_rows = []
        for i, m in enumerate(last10, 1):
            rk = f"#{m['opp_rank']}" if m["opp_rank"] else "-"
            detail_rows.append(
                [
                    i,
                    m["date"],
                    m["competition"][:14],
                    m["home_away"],
                    m["opponent"],
                    rk,
                    m["opp_tier"],
                    m["score"],
                    "XI" if m["starter"] else "Sub",
                    m["shots"],
                    m["sot"],
                    m["goals"],
                ]
            )
        print_table(
            ["#", "Date", "Comp", "H/A", "Opponent", "Rk", "Tier", "Score", "Role", "S", "SoT", "G"],
            detail_rows,
            [">", "<", "<", "<", "<", ">", "<", "<", "<", ">", ">", ">"],
        )

        # Save per-player CSVs
        slug_name = normalize_text(p["athlete_name"]).replace(" ", "_")
        m_path = OUT_DIR / f"player_{slug_name}_{season}_matches.csv"
        t_path = OUT_DIR / f"player_{slug_name}_{season}_tiers.csv"
        if played_all:
            with m_path.open("w", newline="", encoding="utf-8-sig") as f:
                w = csv.DictWriter(f, fieldnames=list(played_all[0].keys()))
                w.writeheader()
                w.writerows(played_all)
        with t_path.open("w", newline="", encoding="utf-8-sig") as f:
            w = csv.DictWriter(f, fieldnames=list(tier_csv_rows[0].keys()))
            w.writeheader()
            w.writerows(tier_csv_rows)

    if len(players) > 1:
        print(f"\n{'=' * 92}")
        print("COMPARISON SUMMARY — LAST 10 CLUB MATCHES")
        print(f"{'=' * 92}")
        print_table(
            ["Player", "Team", "N", "Shots", "Mean S", "Med S", "SoT", "Mean SoT", "Med SoT", "SoT%"],
            summary_table_10,
            ["<", "<", ">", ">", ">", ">", ">", ">", ">", ">"],
        )
        print(f"\n{'=' * 92}")
        print("COMPARISON SUMMARY — LAST 5 CLUB MATCHES")
        print(f"{'=' * 92}")
        print_table(
            ["Player", "Team", "N", "Shots", "Mean S", "Med S", "SoT", "Mean SoT", "Med SoT", "SoT%"],
            summary_table_5,
            ["<", "<", ">", ">", ">", ">", ">", ">", ">", ">"],
        )


def run_league_leaderboard(
    league_name: str, season: int, top_n: int, min_games_10: int, min_games_5: int
) -> None:
    slug = resolve_league(league_name)
    standings, n_teams = get_standings_map(slug, season)
    print(f"Loading completed {LEAGUE_NAMES.get(slug, slug)} ({slug}) {season}/{season + 1} matches ({n_teams} teams)...")

    # Collect all unique completed league event_ids from team schedules
    events_by_id: dict[str, dict] = {}
    with ThreadPoolExecutor(max_workers=8) as ex:
        futs = [
            ex.submit(get_team_completed_events, tid, [season], slug)
            for tid in standings.keys()
        ]
        for fut in as_completed(futs):
            for ev in fut.result():
                events_by_id[ev["event_id"]] = ev

    all_events = sorted(events_by_id.values(), key=lambda x: x["datetime"], reverse=True)
    print(f"Found {len(all_events)} completed league matches. Fetching match player stats (cached)...")

    summaries_by_eid: dict[str, dict] = {}
    with ThreadPoolExecutor(max_workers=10) as ex:
        futs = {ex.submit(fetch_match_summary, ev["event_id"]): ev["event_id"] for ev in all_events}
        done = 0
        for fut in as_completed(futs):
            eid = futs[fut]
            summaries_by_eid[eid] = fut.result()
            done += 1
            if done % 40 == 0 or done == len(all_events):
                print(f"  Progress: {done}/{len(all_events)} matches loaded")

    # Group appearances chronologically descending per player
    player_logs: dict[str, list[dict]] = {}
    player_meta: dict[str, tuple[str, str]] = {}
    for ev in all_events:
        sm = summaries_by_eid[ev["event_id"]]
        for rec in extract_all_played_players(sm):
            aid = rec["athlete_id"]
            if aid not in player_meta:
                player_meta[aid] = (rec["athlete_name"], rec["team_name"])
            player_logs.setdefault(aid, []).append({"date": ev["date"], **rec})

    rows_10 = []
    rows_5 = []
    for aid, logs in player_logs.items():
        pname, tname = player_meta[aid]
        if len(logs) >= min_games_10:
            s10 = summarize(logs[:10])
            rows_10.append({"player": pname, "team": tname, **s10})
        if len(logs) >= min_games_5:
            s5 = summarize(logs[:5])
            rows_5.append({"player": pname, "team": tname, **s5})

    sort_key = lambda r: (r["sot_mean"], r["sot_median"], r["sot_sum"], r["shots_mean"])
    rows_10.sort(key=sort_key, reverse=True)
    rows_5.sort(key=sort_key, reverse=True)

    def fmt_lb(rows: list[dict]) -> list[list]:
        out = []
        for idx, r in enumerate(rows[:top_n], 1):
            out.append(
                [
                    idx,
                    r["player"],
                    r["team"],
                    r["n"],
                    f"{r['sot_mean']:.2f}",
                    f"{r['sot_median']:.1f}",
                    r["sot_sum"],
                    f"{r['shots_mean']:.2f}",
                    f"{r['shots_median']:.1f}",
                    r["shots_sum"],
                    f"{r['sot_rate_pct']:.1f}%",
                ]
            )
        return out

    headers = ["#", "Player", "Team", "N", "Mean SoT", "Med SoT", "SoT", "Mean S", "Med S", "Shots", "SoT%"]
    aligns = [">", "<", "<", ">", ">", ">", ">", ">", ">", ">", ">"]

    print(f"\n{'=' * 96}")
    print(
        f"TOP {top_n} — {LEAGUE_NAMES.get(slug, slug).upper()} ({season}/{season + 1}) | "
        f"LAST 10 LEAGUE MATCHES (min {min_games_10} games)"
    )
    print(f"{'=' * 96}")
    print_table(headers, fmt_lb(rows_10), aligns)

    print(f"\n{'=' * 96}")
    print(
        f"TOP {top_n} — {LEAGUE_NAMES.get(slug, slug).upper()} ({season}/{season + 1}) | "
        f"LAST 5 LEAGUE MATCHES (min {min_games_5} games)"
    )
    print(f"{'=' * 96}")
    print_table(headers, fmt_lb(rows_5), aligns)

    # Save CSVs
    for suffix, data in (("last10", rows_10), ("last5", rows_5)):
        path = OUT_DIR / f"league_{slug}_{season}_{suffix}.csv"
        if data:
            with path.open("w", newline="", encoding="utf-8-sig") as f:
                w = csv.DictWriter(f, fieldnames=list(data[0].keys()))
                w.writeheader()
                w.writerows(data)
    print(f"\nSaved full league rankings to output/league_{slug}_{season}_last10.csv and _last5.csv")


TEAM_ALIASES = {
    "barca": "barcelona",
    "fcb": "barcelona",
    "atleti": "atletico madrid",
    "atletico": "atletico madrid",
    "sociedad": "real sociedad",
    "inter": "internazionale",
    "psg": "paris saint germain",
    "man utd": "manchester united",
    "man united": "manchester united",
    "man city": "manchester city",
    "spurs": "tottenham hotspur",
    "bayern": "bayern munich",
}


def find_team(query: str, season: int, league_hint: str | None = None) -> dict:
    q_norm = normalize_text(query)
    q_norm = TEAM_ALIASES.get(q_norm, q_norm)
    q_tokens = set(q_norm.split())
    slugs = [resolve_league(league_hint)] if league_hint else TOP5_SLUGS

    candidates = []
    for slug in slugs:
        standings, _ = get_standings_map(slug, season)
        for tid, info in standings.items():
            for nm in (info["name"], info["short_name"]):
                t_norm = normalize_text(nm)
                t_tokens = set(t_norm.split())
                if q_norm == t_norm:
                    return {**info, "league_slug": slug}
                if q_tokens and q_tokens.issubset(t_tokens):
                    candidates.append((0, {**info, "league_slug": slug}))
                elif q_norm in t_norm:
                    candidates.append((1, {**info, "league_slug": slug}))
    if not candidates:
        raise RuntimeError(
            f"Team '{query}' not found in top 5 leagues ({', '.join(slugs)}). "
            "Check spelling or pass --league."
        )
    candidates.sort(key=lambda x: (x[0], len(x[1]["name"])))
    return candidates[0][1]


def extract_team_match_stats(summary: dict, team_id: str) -> dict:
    team_shots = None
    team_sot = None
    opp_shots = 0
    opp_sot = 0
    for t in summary.get("boxscore", {}).get("teams", []):
        tid = str(t.get("team", {}).get("id", ""))
        st = {s["name"]: s.get("displayValue", "0") for s in t.get("statistics", [])}
        try:
            sh = int(round(float(st.get("totalShots", 0))))
            sot = int(round(float(st.get("shotsOnTarget", 0))))
        except ValueError:
            sh, sot = 0, 0
        if tid == team_id:
            team_shots, team_sot = sh, sot
        else:
            opp_shots, opp_sot = sh, sot

    # Fallback to summing player stats if boxscore team stats are missing
    if team_shots is None:
        players = [p for p in extract_all_played_players(summary) if p["team_id"] == team_id]
        team_shots = sum(p["shots"] for p in players)
        team_sot = sum(p["sot"] for p in players)
    return {"shots": team_shots, "sot": team_sot or 0, "opp_shots": opp_shots, "opp_sot": opp_sot}


def run_team_analysis(
    team_names: list[str], season: int, league_hint: str | None, top_n: int, min_games: int
) -> None:
    teams = [find_team(name, season, league_hint) for name in team_names]
    standings_cache: dict[str, dict[str, dict]] = {}

    for t in teams:
        slug = t["league_slug"]
        tid = t["team_id"]
        if slug not in standings_cache:
            standings_cache[slug], _ = get_standings_map(slug, season)
        standings = standings_cache[slug]
        team_rank = t["rank"]
        n_teams = t["n_teams"]
        top_cut = t["top_cut"]
        bot_start = t["bot_start"]

        events = get_team_completed_events(tid, [season])
        summaries_by_eid: dict[str, dict] = {}
        with ThreadPoolExecutor(max_workers=10) as ex:
            futs = {ex.submit(fetch_match_summary, ev["event_id"]): ev["event_id"] for ev in events}
            for fut in as_completed(futs):
                summaries_by_eid[futs[fut]] = fut.result()

        club_matches = []
        player_logs: dict[str, list[dict]] = {}
        player_names: dict[str, str] = {}

        for ev in events:
            sm = summaries_by_eid[ev["event_id"]]
            tstats = extract_team_match_stats(sm, tid)
            is_league = ev["league_slug"] == slug and ev["season"] == season
            opp_info = standings.get(ev["opponent_id"]) if is_league else None
            opp_rank = opp_info["rank"] if opp_info else None
            opp_tier = opp_info["tier"] if opp_info else "Non-League"
            rel_rank = ""
            if opp_rank is not None:
                rel_rank = "Higher in Table" if opp_rank < team_rank else "Lower in Table"

            club_matches.append(
                {
                    **ev,
                    **tstats,
                    "is_current_league": is_league,
                    "opp_rank": opp_rank,
                    "opp_tier": opp_tier,
                    "rel_rank": rel_rank,
                }
            )

            for rec in extract_all_played_players(sm):
                if rec["team_id"] != tid:
                    continue
                aid = rec["athlete_id"]
                player_names[aid] = rec["athlete_name"]
                player_logs.setdefault(aid, []).append({"date": ev["date"], **rec})

        # Club window summaries
        w_all = summarize(club_matches)
        w10 = summarize(club_matches[:10])
        w5 = summarize(club_matches[:5])

        # Club opponent tier EDA (league matches only)
        league_matches = [m for m in club_matches if m["is_current_league"]]
        tier_labels = [
            f"Top 1/3 (1-{top_cut})",
            f"Mid 1/3 ({top_cut + 1}-{bot_start - 1})",
            f"Bottom 1/3 ({bot_start}-{n_teams})",
        ]
        tier_rows = []
        tier_csv_rows = []

        def add_tier_row(label: str, subset: list[dict]) -> None:
            s = summarize(subset)
            opp_sot_mean = round(statistics.mean([m["opp_sot"] for m in subset]), 2) if subset else 0.0
            tier_rows.append(
                [
                    label,
                    s["n"],
                    s["shots_sum"],
                    f"{s['shots_mean']:.2f}",
                    f"{s['shots_median']:.1f}",
                    s["sot_sum"],
                    f"{s['sot_mean']:.2f}",
                    f"{s['sot_median']:.1f}",
                    f"{s['sot_rate_pct']:.1f}%",
                    f"{opp_sot_mean:.2f}",
                ]
            )
            tier_csv_rows.append({"team": t["name"], "group": label, **s, "opp_sot_mean": opp_sot_mean})

        for label in tier_labels:
            add_tier_row(label, [m for m in league_matches if m["opp_tier"] == label])
        for rel in ("Higher in Table", "Lower in Table"):
            add_tier_row(f"vs {rel}", [m for m in league_matches if m["rel_rank"] == rel])

        # Top N players of this club across current season official matches
        effective_min = min(min_games, max(1, len(club_matches)))
        player_rows = []
        for aid, logs in player_logs.items():
            if len(logs) < effective_min:
                continue
            s = summarize(logs)
            if s["shots_sum"] == 0:
                continue
            player_rows.append({"player": player_names[aid], "team": t["name"], **s})

        # Sort by (Total Shots + Mean SoT balance): primary Mean SoT desc, then Total Shots desc
        player_rows.sort(
            key=lambda r: (r["sot_mean"], r["shots_sum"], r["sot_sum"], r["shots_mean"]),
            reverse=True,
        )

        print(f"\n{'=' * 98}")
        print(
            f"CLUB: {t['name']} (#{team_rank} in {LEAGUE_NAMES.get(slug, slug)}, {season}/{season + 1}) | "
            f"{len(club_matches)} official matches ({len(league_matches)} league)"
        )
        print(f"{'=' * 98}")

        print("\n[A] Club Shots & Shots on Target Overview:")
        print_table(
            ["Window", "N", "Shots", "Mean S", "Med S", "SoT", "Mean SoT", "Med SoT", "SoT%"],
            [
                [
                    "Season Official",
                    w_all["n"],
                    w_all["shots_sum"],
                    f"{w_all['shots_mean']:.2f}",
                    f"{w_all['shots_median']:.1f}",
                    w_all["sot_sum"],
                    f"{w_all['sot_mean']:.2f}",
                    f"{w_all['sot_median']:.1f}",
                    f"{w_all['sot_rate_pct']:.1f}%",
                ],
                [
                    "Last 10 Club",
                    w10["n"],
                    w10["shots_sum"],
                    f"{w10['shots_mean']:.2f}",
                    f"{w10['shots_median']:.1f}",
                    w10["sot_sum"],
                    f"{w10['sot_mean']:.2f}",
                    f"{w10['sot_median']:.1f}",
                    f"{w10['sot_rate_pct']:.1f}%",
                ],
                [
                    "Last 5 Club",
                    w5["n"],
                    w5["shots_sum"],
                    f"{w5['shots_mean']:.2f}",
                    f"{w5['shots_median']:.1f}",
                    w5["sot_sum"],
                    f"{w5['sot_mean']:.2f}",
                    f"{w5['sot_median']:.1f}",
                    f"{w5['sot_rate_pct']:.1f}%",
                ],
            ],
            ["<", ">", ">", ">", ">", ">", ">", ">", ">"],
        )

        print(f"\n[B] Club Shots & SoT vs Opponent Table Tiers ({LEAGUE_NAMES.get(slug, slug)} {season}/{season + 1}):")
        print_table(
            ["Opponent Tier", "N", "Shots", "Mean S", "Med S", "SoT", "Mean SoT", "Med SoT", "SoT%", "Opp SoT/g"],
            tier_rows,
            ["<", ">", ">", ">", ">", ">", ">", ">", ">", ">"],
        )

        print(f"\n[C] Top {top_n} Players in {t['name']} (Season Official, min {effective_min} games — by Mean SoT & Shots):")
        p_table = []
        for idx, r in enumerate(player_rows[:top_n], 1):
            p_table.append(
                [
                    idx,
                    r["player"],
                    r["n"],
                    r["shots_sum"],
                    f"{r['shots_mean']:.2f}",
                    f"{r['shots_median']:.1f}",
                    r["sot_sum"],
                    f"{r['sot_mean']:.2f}",
                    f"{r['sot_median']:.1f}",
                    f"{r['sot_rate_pct']:.1f}%",
                ]
            )
        print_table(
            ["#", "Player", "N", "Shots", "Mean S", "Med S", "SoT", "Mean SoT", "Med SoT", "SoT%"],
            p_table,
            [">", "<", ">", ">", ">", ">", ">", ">", ">", ">"],
        )

        # Save CSVs
        t_slug = normalize_text(t["name"]).replace(" ", "_")
        with (OUT_DIR / f"team_{t_slug}_{season}_tiers.csv").open("w", newline="", encoding="utf-8-sig") as f:
            w = csv.DictWriter(f, fieldnames=list(tier_csv_rows[0].keys()))
            w.writeheader()
            w.writerows(tier_csv_rows)
        if player_rows:
            with (OUT_DIR / f"team_{t_slug}_{season}_players.csv").open("w", newline="", encoding="utf-8-sig") as f:
                w = csv.DictWriter(f, fieldnames=list(player_rows[0].keys()))
                w.writeheader()
                w.writerows(player_rows)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Automated Football Shot & SoT Analyzer (ESPN API + Local Cache)"
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_cmd = sub.add_parser("player", help="Analyze one or more players (Last 10/5 + Table-Tier EDA)")
    p_cmd.add_argument("names", nargs="+", help='Player name(s), e.g. "Lamine Yamal" "Raphinha"')
    p_cmd.add_argument("--season", type=int, default=2026, help="Season start year (default: 2026)")
    p_cmd.add_argument("--league", type=str, default=None, help="Optional league hint (e.g. laliga, epl)")

    t_cmd = sub.add_parser("team", help="Analyze one or more clubs (Top 10 players + Club SoT vs Table Tiers)")
    t_cmd.add_argument("names", nargs="+", help='Club name(s), e.g. "Barcelona" "Osasuna" "Real Sociedad"')
    t_cmd.add_argument("--season", type=int, default=2026, help="Season start year (default: 2026)")
    t_cmd.add_argument("--league", type=str, default=None, help="Optional league hint (e.g. laliga, epl)")
    t_cmd.add_argument("--top", type=int, default=10, help="Number of top club players (default: 10)")
    t_cmd.add_argument("--min-games", type=int, default=3, help="Minimum appearances for club players (default: 3)")

    l_cmd = sub.add_parser("league", help="Top players by SoT mean & median in last 10 and last 5 league matches")
    l_cmd.add_argument("league", type=str, help="League name (epl, laliga, seriea, ligue1, bundesliga)")
    l_cmd.add_argument("--season", type=int, default=2026, help="Season start year (default: 2026)")
    l_cmd.add_argument("--top", type=int, default=10, help="Number of top players to display (default: 10)")
    l_cmd.add_argument("--min10", type=int, default=8, help="Minimum appearances for Last-10 table (default: 8)")
    l_cmd.add_argument("--min5", type=int, default=5, help="Minimum appearances for Last-5 table (default: 5)")

    args = parser.parse_args()
    if args.command == "player":
        run_player_analysis(args.names, args.season, args.league)
    elif args.command == "team":
        run_team_analysis(args.names, args.season, args.league, args.top, args.min_games)
    elif args.command == "league":
        run_league_leaderboard(args.league, args.season, args.top, args.min10, args.min5)


if __name__ == "__main__":
    main()
