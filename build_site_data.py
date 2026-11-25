import argparse
import hashlib
import json
import math
import re
import shutil
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

BASE_DIR = Path(__file__).parent
CACHE_DIR = BASE_DIR / "cache"
DOCS_DATA_DIR = BASE_DIR / "docs" / "data"
CACHE_DIR.mkdir(exist_ok=True)
DOCS_DATA_DIR.mkdir(parents=True, exist_ok=True)

CURL_BIN = shutil.which("curl.exe") or shutil.which("curl") or "curl"

LEAGUES = [
    ("esp.1", "لالیگا اسپانیا", "La Liga"),
    ("eng.1", "لیگ برتر انگلیس", "Premier League"),
    ("ita.1", "سری آ ایتالیا", "Serie A"),
    ("fra.1", "لیگ ۱ فرانسه", "Ligue 1"),
    ("ger.1", "بوندس‌لیگا آلمان", "Bundesliga"),
]


def fetch_json(url: str, ttl_seconds: int = 3600, retries: int = 10) -> dict:
    key = hashlib.sha256(url.encode("utf-8")).hexdigest()[:24]
    cache_path = CACHE_DIR / f"{key}.json"
    if cache_path.exists():
        age = time.time() - cache_path.stat().st_mtime
        if ttl_seconds <= 0 or age < ttl_seconds:
            return json.loads(cache_path.read_text(encoding="utf-8"))

    cmd = [
        CURL_BIN,
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


def parse_minute(clock_obj: dict | None) -> int:
    if not clock_obj:
        return 0
    val = clock_obj.get("value")
    if isinstance(val, (int, float)) and val > 0:
        return max(1, min(95, int(round(val / 60.0))))
    disp = str(clock_obj.get("displayValue", ""))
    m = re.search(r"(\d+)", disp)
    return int(m.group(1)) if m else 0


def to_num(val, is_float: bool = False):
    try:
        v = float(val)
        return round(v, 1) if is_float else int(round(v))
    except (ValueError, TypeError):
        return 0.0 if is_float else 0


def fetch_standings(slug: str, season: int) -> tuple[dict[str, dict], int, int, int]:
    url = f"https://site.api.espn.com/apis/v2/sports/soccer/{slug}/standings?season={season}"
    data = fetch_json(url, ttl_seconds=1800)
    entries = data["children"][0]["standings"]["entries"]
    n_teams = len(entries)
    top_cut = math.ceil(n_teams / 3)
    bot_start = n_teams - top_cut + 1

    def tier_key(rank: int) -> str:
        if rank <= top_cut:
            return "top"
        if rank >= bot_start:
            return "bottom"
        return "mid"

    standings = {}
    for idx, entry in enumerate(entries, 1):
        team = entry["team"]
        tid = str(team["id"])
        stats_map = {s.get("name"): s.get("value") for s in entry.get("stats", [])}
        rank = int(round(float(stats_map.get("rank") or idx)))
        gp = int(round(float(stats_map.get("gamesPlayed") or 0)))
        pts = int(round(float(stats_map.get("points") or 0)))
        gd = int(round(float(stats_map.get("pointDifferential") or 0)))
        standings[tid] = {
            "id": tid,
            "name": team["displayName"],
            "short": team.get("shortDisplayName") or team["displayName"],
            "rank": rank,
            "tier": tier_key(rank),
            "gp": gp,
            "pts": pts,
            "gd": gd,
        }
    return standings, n_teams, top_cut, bot_start


def fetch_team_completed(team_id: str, season: int) -> list[dict]:
    url = f"https://site.api.espn.com/apis/site/v2/sports/soccer/all/teams/{team_id}/schedule?season={season}"
    try:
        data = fetch_json(url, ttl_seconds=1800)
    except Exception:
        return []
    out = []
    for ev in data.get("events", []):
        comp = ev.get("competitions", [{}])[0]
        if not comp.get("status", {}).get("type", {}).get("completed"):
            continue
        lg = ev.get("league", {})
        lg_slug = lg.get("slug") or ""
        lg_name = lg.get("abbreviation") or lg.get("name") or "Club"
        if "friendly" in lg_slug.lower() or "friendly" in lg_name.lower():
            continue
        out.append(
            {
                "event_id": str(ev["id"]),
                "date": ev.get("date", "")[:10],
                "datetime": ev.get("date", ""),
                "league_slug": lg_slug,
                "comp": lg_name,
            }
        )
    return out


def fetch_team_next_fixture(
    team_id: str, league_slug: str, season: int, standings: dict[str, dict]
) -> dict:
    url = f"https://site.api.espn.com/apis/site/v2/sports/soccer/all/teams/{team_id}/schedule?season={season}&fixture=true"
    try:
        data = fetch_json(url, ttl_seconds=1800)
    except Exception:
        return {"next_official": None, "next_league": None}

    next_official = None
    next_league = None
    now_day = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    events = sorted(data.get("events", []), key=lambda x: x.get("date", ""))
    for ev in events:
        comp = ev.get("competitions", [{}])[0]
        if comp.get("status", {}).get("type", {}).get("completed"):
            continue
        ev_date = ev.get("date", "")
        if ev_date and ev_date[:10] < now_day:
            continue
        lg = ev.get("league", {})
        lg_slug = lg.get("slug") or ""
        lg_name = lg.get("abbreviation") or lg.get("name") or "Club"
        if "friendly" in lg_slug.lower() or "friendly" in lg_name.lower():
            continue

        opp_id = ""
        opp_name = "?"
        ha = "H"
        for c in comp.get("competitors", []):
            cid = str(c.get("team", {}).get("id", ""))
            if cid == team_id:
                ha = "H" if c.get("homeAway") == "home" else "A"
            else:
                opp_id = cid
                opp_name = c.get("team", {}).get("displayName", "?")

        opp_st = standings.get(opp_id)
        item = {
            "id": str(ev["id"]),
            "date": ev_date,
            "comp": lg_name,
            "lg": 1 if lg_slug == league_slug else 0,
            "ha": ha,
            "oid": opp_id,
            "opp": opp_st["short"] if opp_st else opp_name,
            "opp_full": opp_st["name"] if opp_st else opp_name,
            "ork": opp_st["rank"] if opp_st else None,
            "ot": opp_st["tier"] if opp_st else None,
        }
        if next_official is None:
            next_official = item
        if next_league is None and lg_slug == league_slug:
            next_league = item
        if next_official and next_league:
            break

    return {"next_official": next_official, "next_league": next_league}


def parse_match_summary(event_id: str) -> dict:
    url = f"https://site.api.espn.com/apis/site/v2/sports/soccer/all/summary?event={event_id}"
    sm = fetch_json(url, ttl_seconds=0)

    comp = sm.get("header", {}).get("competitions", [{}])[0]
    scores_by_tid: dict[str, tuple[int, str, str]] = {}
    for c in comp.get("competitors", []):
        tid = str(c.get("team", {}).get("id", ""))
        sc_raw = c.get("score", "0")
        if isinstance(sc_raw, dict):
            sc_raw = sc_raw.get("displayValue", "0")
        sc_int = to_num(sc_raw)
        ha = "H" if c.get("homeAway") == "home" else "A"
        tname = c.get("team", {}).get("shortDisplayName") or c.get("team", {}).get("displayName", "?")
        scores_by_tid[tid] = (sc_int, ha, tname)

    # Boxscore team stats (shots + full non-shot tactical metrics)
    box_by_tid: dict[str, dict] = {}
    for t in sm.get("boxscore", {}).get("teams", []):
        tid = str(t.get("team", {}).get("id", ""))
        st = {s["name"]: s.get("displayValue", "0") for s in t.get("statistics", [])}
        pp_raw = to_num(st.get("passPct"), is_float=True)
        pp_pct = round(pp_raw * 100, 1) if 0 < pp_raw <= 1.0 else pp_raw
        box_by_tid[tid] = {
            "shots": to_num(st.get("totalShots")),
            "sot": to_num(st.get("shotsOnTarget")),
            "yc": to_num(st.get("yellowCards")),
            "rc": to_num(st.get("redCards")),
            "cor": to_num(st.get("wonCorners")),
            "fl": to_num(st.get("foulsCommitted")),
            "off": to_num(st.get("offsides")),
            "pos": to_num(st.get("possessionPct"), is_float=True),
            "pp": pp_pct,
            "cr": to_num(st.get("totalCrosses")),
            "sv": to_num(st.get("saves")),
            "tk": to_num(st.get("effectiveTackles")),
            "itc": to_num(st.get("interceptions")),
            "blk": to_num(st.get("blockedShots")),
        }

    # Parse keyEvents for exact timing splits (1H / 2H / 75+) & player minutes
    sub_in_min: dict[str, int] = {}
    sub_out_min: dict[str, int] = {}
    red_min: dict[str, int] = {}
    timing_by_tid: dict[str, dict] = {
        tid: {"g1": 0, "g2": 0, "g75": 0, "yc1": 0, "yc2": 0, "yc75": 0} for tid in scores_by_tid
    }

    for kev in sm.get("keyEvents", []):
        etype = (kev.get("type", {}).get("text") or "").lower()
        minute = parse_minute(kev.get("clock"))
        period = int(kev.get("period", {}).get("number") or (1 if minute <= 45 else 2))
        etid = str(kev.get("team", {}).get("id", ""))
        parts = [str(x.get("athlete", {}).get("id", "")) for x in kev.get("participants", [])]

        if "substitution" in etype and len(parts) >= 2:
            if parts[0]:
                sub_in_min[parts[0]] = minute
            if parts[1]:
                sub_out_min[parts[1]] = minute
        elif "red card" in etype and parts:
            if parts[0]:
                red_min[parts[0]] = minute
        elif "yellow card" in etype:
            if etid in timing_by_tid:
                if period == 1:
                    timing_by_tid[etid]["yc1"] += 1
                else:
                    timing_by_tid[etid]["yc2"] += 1
                    if minute >= 75:
                        timing_by_tid[etid]["yc75"] += 1
        elif "goal" in etype and "disallowed" not in etype and "no goal" not in etype:
            if etid in timing_by_tid:
                if period == 1:
                    timing_by_tid[etid]["g1"] += 1
                else:
                    timing_by_tid[etid]["g2"] += 1
                    if minute >= 75:
                        timing_by_tid[etid]["g75"] += 1

    # Player appearances (excluding unused subs) with exact minutes & full stats
    players = []
    for tr in sm.get("rosters", []):
        tid = str(tr.get("team", {}).get("id", ""))
        tname = tr.get("team", {}).get("displayName", "")
        for p in tr.get("roster", []):
            starter = bool(p.get("starter", False))
            subbed_in = bool(p.get("subbedIn", False))
            subbed_out = bool(p.get("subbedOut", False))
            if bool(p.get("didNotPlay", False)) or (not starter and not subbed_in):
                continue

            aid = str(p.get("athlete", {}).get("id", ""))
            pos_abbr = p.get("position", {}).get("abbreviation") or ""

            # Fallback substitution minute from player's own plays array
            play_sub_min = 0
            for pl_ev in p.get("plays", []):
                if pl_ev.get("substitution"):
                    play_sub_min = parse_minute(pl_ev.get("clock"))
                    break

            start_m = 0 if starter else (sub_in_min.get(aid) or play_sub_min or 70)
            end_m = 90
            if aid in red_min:
                end_m = min(end_m, red_min[aid])
            if subbed_out:
                out_m = sub_out_min.get(aid) or play_sub_min or 70
                end_m = min(end_m, out_m)
            minutes = max(1, min(90, end_m - start_m))

            ps = {s["name"]: s.get("value", 0) for s in p.get("stats", [])}
            players.append(
                {
                    "aid": aid,
                    "name": p.get("athlete", {}).get("displayName", ""),
                    "pos": pos_abbr,
                    "tid": tid,
                    "tname": tname,
                    "xi": 1 if starter else 0,
                    "min": minutes,
                    "s": to_num(ps.get("totalShots")),
                    "sot": to_num(ps.get("shotsOnTarget")),
                    "g": to_num(ps.get("totalGoals")),
                    "a": to_num(ps.get("goalAssists")),
                    "yc": to_num(ps.get("yellowCards")),
                    "rc": to_num(ps.get("redCards")),
                    "fc": to_num(ps.get("foulsCommitted")),
                    "fs": to_num(ps.get("foulsSuffered")),
                    "sv": to_num(ps.get("saves")),
                    "sf": to_num(ps.get("shotsFaced")),
                    "gc": to_num(ps.get("goalsConceded")),
                }
            )

    for tid in scores_by_tid:
        if tid not in box_by_tid:
            tp = [x for x in players if x["tid"] == tid]
            box_by_tid[tid] = {
                "shots": sum(x["s"] for x in tp),
                "sot": sum(x["sot"] for x in tp),
                "yc": sum(x["yc"] for x in tp),
                "rc": sum(x["rc"] for x in tp),
                "cor": 0,
                "fl": sum(x["fc"] for x in tp),
                "off": 0,
                "pos": 50.0,
                "pp": 0.0,
                "cr": 0,
                "sv": sum(x["sv"] for x in tp),
                "tk": 0,
                "itc": 0,
                "blk": 0,
            }

    return {"scores": scores_by_tid, "box": box_by_tid, "timing": timing_by_tid, "players": players}


def build_league(slug: str, name_fa: str, name_en: str, season: int) -> dict:
    print(f"\n[{slug}] Building {name_en} ({season}/{season + 1})...")
    standings, n_teams, top_cut, bot_start = fetch_standings(slug, season)
    tids = list(standings.keys())

    events_by_id: dict[str, dict] = {}
    next_fixtures: dict[str, dict] = {}

    with ThreadPoolExecutor(max_workers=10) as ex:
        comp_futs = {ex.submit(fetch_team_completed, tid, season): tid for tid in tids}
        next_futs = {
            ex.submit(fetch_team_next_fixture, tid, slug, season, standings): tid for tid in tids
        }
        for fut in as_completed(comp_futs):
            for ev in fut.result():
                events_by_id[ev["event_id"]] = ev
        for fut in as_completed(next_futs):
            tid = next_futs[fut]
            next_fixtures[tid] = fut.result()

    all_events = sorted(events_by_id.values(), key=lambda x: x["datetime"], reverse=True)
    print(f"  [{slug}] {n_teams} teams | {len(all_events)} unique completed official club matches")

    parsed_by_eid: dict[str, dict] = {}
    with ThreadPoolExecutor(max_workers=12) as ex:
        futs = {ex.submit(parse_match_summary, ev["event_id"]): ev["event_id"] for ev in all_events}
        done = 0
        for fut in as_completed(futs):
            eid = futs[fut]
            try:
                parsed_by_eid[eid] = fut.result()
            except Exception as e:
                print(f"  [WARN] Skipped match {eid}: {e}")
            done += 1
            if done % 60 == 0 or done == len(all_events):
                print(f"  [{slug}] Progress: {done}/{len(all_events)}")

    teams_data: dict[str, dict] = {tid: {"matches": []} for tid in tids}
    players_data: dict[str, dict] = {}

    for ev in all_events:
        eid = ev["event_id"]
        parsed = parsed_by_eid.get(eid)
        if not parsed:
            continue
        scores = parsed["scores"]
        box = parsed["box"]
        timing = parsed["timing"]
        match_tids = list(scores.keys())
        if len(match_tids) != 2:
            continue

        is_lg = 1 if ev["league_slug"] == slug else 0

        for idx, tid in enumerate(match_tids):
            if tid not in teams_data:
                continue
            oid = match_tids[1 - idx]
            gf, ha, _ = scores[tid]
            ga, _, opp_name = scores[oid]
            bf = box.get(tid, {})
            ba = box.get(oid, {})
            tf = timing.get(tid, {})
            ta = timing.get(oid, {})
            opp_st = standings.get(oid) if is_lg else None
            ork = opp_st["rank"] if opp_st else None
            ot = opp_st["tier"] if opp_st else None
            opp_short = opp_st["short"] if opp_st else opp_name

            teams_data[tid]["matches"].append(
                {
                    "id": eid,
                    "d": ev["date"],
                    "c": ev["comp"],
                    "lg": is_lg,
                    "ha": ha,
                    "oid": oid,
                    "opp": opp_short,
                    "ork": ork,
                    "ot": ot,
                    "gf": gf,
                    "ga": ga,
                    "sf": bf.get("shots", 0),
                    "sotf": bf.get("sot", 0),
                    "sa": ba.get("shots", 0),
                    "sota": ba.get("sot", 0),
                    "ycf": bf.get("yc", 0),
                    "yca": ba.get("yc", 0),
                    "rcf": bf.get("rc", 0),
                    "rca": ba.get("rc", 0),
                    "cf": bf.get("cor", 0),
                    "ca": ba.get("cor", 0),
                    "ff": bf.get("fl", 0),
                    "fa": ba.get("fl", 0),
                    "off": bf.get("off", 0),
                    "ofa": ba.get("off", 0),
                    "pos": bf.get("pos", 50.0),
                    "pp": bf.get("pp", 0.0),
                    "cr": bf.get("cr", 0),
                    "sv": bf.get("sv", 0),
                    "tk": bf.get("tk", 0),
                    "itc": bf.get("itc", 0),
                    "blk": bf.get("blk", 0),
                    "g1f": tf.get("g1", 0),
                    "g2f": tf.get("g2", 0),
                    "g75f": tf.get("g75", 0),
                    "g1a": ta.get("g1", 0),
                    "g2a": ta.get("g2", 0),
                    "g75a": ta.get("g75", 0),
                    "yc1": tf.get("yc1", 0),
                    "yc2": tf.get("yc2", 0),
                    "yc75": tf.get("yc75", 0),
                }
            )

            for pl in parsed["players"]:
                if pl["tid"] != tid:
                    continue
                aid = pl["aid"]
                if aid not in players_data:
                    players_data[aid] = {
                        "id": aid,
                        "name": pl["name"],
                        "pos": pl["pos"],
                        "team_id": tid,
                        "team": standings[tid]["name"],
                        "matches": [],
                    }
                elif not players_data[aid]["pos"] and pl["pos"]:
                    players_data[aid]["pos"] = pl["pos"]

                players_data[aid]["matches"].append(
                    {
                        "d": ev["date"],
                        "c": ev["comp"],
                        "lg": is_lg,
                        "ha": ha,
                        "opp": opp_short,
                        "ork": ork,
                        "ot": ot,
                        "sc": f"{gf}-{ga}",
                        "xi": pl["xi"],
                        "m": pl["min"],
                        "s": pl["s"],
                        "sot": pl["sot"],
                        "g": pl["g"],
                        "a": pl["a"],
                        "yc": pl["yc"],
                        "rc": pl["rc"],
                        "fc": pl["fc"],
                        "fs": pl["fs"],
                        "sv": pl["sv"],
                        "sf": pl["sf"],
                        "gc": pl["gc"],
                    }
                )

    # Build deduplicated upcoming league fixtures list for Matchup Center
    upcoming_league_by_id: dict[str, dict] = {}
    for tid, nf in next_fixtures.items():
        nl = nf.get("next_league")
        if not nl or nl.get("ha") != "H":
            continue
        eid = nl.get("id") or f"{tid}_{nl['oid']}"
        if eid not in upcoming_league_by_id:
            upcoming_league_by_id[eid] = {
                "id": eid,
                "date": nl["date"],
                "home_id": tid,
                "home": standings[tid]["short"],
                "home_rank": standings[tid]["rank"],
                "away_id": nl["oid"],
                "away": nl["opp"],
                "away_rank": nl["ork"],
            }
    upcoming_matches = sorted(upcoming_league_by_id.values(), key=lambda x: x["date"])

    updated_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    payload = {
        "updated_at": updated_at,
        "slug": slug,
        "name_fa": name_fa,
        "name_en": name_en,
        "season": f"{season}/{season + 1}",
        "n_teams": n_teams,
        "top_cut": top_cut,
        "bot_start": bot_start,
        "standings": standings,
        "next_fixtures": next_fixtures,
        "upcoming_matches": upcoming_matches,
        "teams": teams_data,
        "players": players_data,
    }
    out_file = DOCS_DATA_DIR / f"{slug}.json"
    out_file.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    size_kb = round(out_file.stat().st_size / 1024, 1)
    print(f"  [{slug}] Saved {out_file.name} ({size_kb} KB, {len(players_data)} players, {len(upcoming_matches)} upcoming)")
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description="Build daily static JSON snapshots for GitHub Pages")
    parser.add_argument("--season", type=int, default=2026)
    parser.add_argument(
        "--leagues",
        nargs="*",
        default=[x[0] for x in LEAGUES],
        help="League slugs to build (default: all 5 top leagues)",
    )
    args = parser.parse_args()

    selected = [lg for lg in LEAGUES if lg[0] in args.leagues]
    index_leagues = []
    index_teams = []
    index_players = []

    for slug, name_fa, name_en in selected:
        payload = build_league(slug, name_fa, name_en, args.season)
        index_leagues.append(
            {
                "slug": slug,
                "name_fa": name_fa,
                "name_en": name_en,
                "n_teams": payload["n_teams"],
                "matches_count": sum(len(t["matches"]) for t in payload["teams"].values()) // 2,
                "players_count": len(payload["players"]),
            }
        )
        for tid, st in payload["standings"].items():
            index_teams.append(
                {
                    "id": tid,
                    "name": st["name"],
                    "short": st["short"],
                    "slug": slug,
                    "rank": st["rank"],
                }
            )
        for aid, p in payload["players"].items():
            ms = p["matches"]
            index_players.append(
                {
                    "id": aid,
                    "name": p["name"],
                    "pos": p.get("pos", ""),
                    "team_id": p["team_id"],
                    "team": p["team"],
                    "slug": slug,
                    "g": len(ms),
                    "s": sum(m["s"] for m in ms),
                    "sot": sum(m["sot"] for m in ms),
                }
            )

    index_players.sort(key=lambda x: (x["sot"], x["s"]), reverse=True)
    index_teams.sort(key=lambda x: (x["slug"], x["rank"]))

    index_payload = {
        "updated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "season": f"{args.season}/{args.season + 1}",
        "leagues": index_leagues,
        "teams": index_teams,
        "players": index_players,
    }
    idx_file = DOCS_DATA_DIR / "index.json"
    idx_file.write_text(json.dumps(index_payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"\nSaved {idx_file.name} ({round(idx_file.stat().st_size / 1024, 1)} KB)")


if __name__ == "__main__":
    main()
