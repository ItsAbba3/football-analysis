/* ==========================================================================
   Radar Shot — Client Analytics Engine (Static Daily JSON + Live ESPN CORS)
   ========================================================================== */

const PERSIAN_ALIASES = {
  "یامال": "Lamine Yamal",
  "لامین یامال": "Lamine Yamal",
  "رافینیا": "Raphinha",
  "الوارز": "Julian Alvarez",
  "آلوارز": "Julian Alvarez",
  "خولین الوارز": "Julian Alvarez",
  "خولین آلوارز": "Julian Alvarez",
  "سیمئونه": "Giuliano Simeone",
  "جولیانو سیمئونه": "Giuliano Simeone",
  "بائنا": "Alex Baena",
  "الکس بائنا": "Alex Baena",
  "کانگ این لی": "Lee Kang-In",
  "لی کانگ این": "Lee Kang-In",
  "جاناتان دیوید": "Jonathan David",
  "پابلو باریوس": "Pablo Barrios",
  "باریوس": "Pablo Barrios",
  "چالهان اوغلو": "Hakan Calhanoglu",
  "چاهان اوغلو": "Hakan Calhanoglu",
  "هاکان چالهان اوغلو": "Hakan Calhanoglu",
  "هاکان چاهان اوغلو": "Hakan Calhanoglu",
  "اماد دیالو": "Amad Diallo",
  "آماد دیالو": "Amad Diallo",
  "امباپه": "Kylian Mbappe",
  "کیلیان امباپه": "Kylian Mbappe",
  "هالند": "Erling Haaland",
  "ارلینگ هالند": "Erling Haaland",
  "صلاح": "Mohamed Salah",
  "محمد صلاح": "Mohamed Salah",
  "بلینگام": "Jude Bellingham",
  "وینیسیوس": "Vinicius",
  "گولر": "Arda Guler",
  "بارسا": "Barcelona",
  "بارسلونا": "Barcelona",
  "اتلتیکو": "Atletico Madrid",
  "اتلتیکو مادرید": "Atletico Madrid",
  "رئال مادرید": "Real Madrid",
  "رئال سوسیداد": "Real Sociedad",
  "سوسیداد": "Real Sociedad",
  "اساسونا": "Osasuna",
  "اوساسونا": "Osasuna",
  "آرسنال": "Arsenal",
  "ارسنال": "Arsenal",
  "لیورپول": "Liverpool",
  "چلسی": "Chelsea",
  "منچستر یونایتد": "Manchester United",
  "منچستر سیتی": "Manchester City",
  "اینتر": "Internazionale",
  "اینتر میلان": "Internazionale",
  "میلان": "AC Milan",
  "یوونتوس": "Juventus",
  "ناپولی": "Napoli",
  "پاریس": "Paris Saint-Germain",
  "پاری سن ژرمن": "Paris Saint-Germain",
  "بایرن": "Bayern Munich",
  "بایرن مونیخ": "Bayern Munich",
  "دورتموند": "Borussia Dortmund",
  "barca": "Barcelona",
  "atleti": "Atletico Madrid",
  "atletico": "Atletico Madrid",
  "sociedad": "Real Sociedad",
  "inter": "Internazionale",
  "psg": "Paris Saint-Germain",
  "man utd": "Manchester United",
  "man city": "Manchester City",
};

const STATE = {
  index: null,
  leagues: {},
  activeTab: "player",
  currentPlayer: null,
  comparePlayer: null,
  currentTeam: null,
  leagueSlug: "esp.1",
  leagueWindow: 10,
  leagueSort: "sot_mean",
  homeLeagueSlug: "esp.1",
  homeSort: "total_goals",
  charts: {},
};

/* ---------- Utility Helpers ---------- */
function normalizeText(str) {
  if (!str) return "";
  const trimmed = str.trim();
  const mapped = PERSIAN_ALIASES[trimmed] || PERSIAN_ALIASES[trimmed.toLowerCase()] || trimmed;
  return mapped
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function escapeHtml(val) {
  return String(val ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function fmt(n, dec = 2) {
  return Number(n || 0).toLocaleString("fa-IR", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });
}

function fmtInt(n) {
  return Math.round(Number(n || 0)).toLocaleString("fa-IR");
}

function formatDateFa(iso) {
  if (!iso) return "";
  try {
    const dt = new Date(iso);
    return new Intl.DateTimeFormat("fa-IR", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(dt);
  } catch {
    return iso.slice(0, 10);
  }
}

function tierLabelFa(tierKey, league) {
  if (!tierKey) return "غیرلیگی";
  const topCut = league?.top_cut || 7;
  const botStart = league?.bot_start || 14;
  const nTeams = league?.n_teams || 20;
  if (tierKey === "top") return `یک‌سوم بالایی (${fmtInt(1)} تا ${fmtInt(topCut)})`;
  if (tierKey === "mid") return `یک‌سوم میانی (${fmtInt(topCut + 1)} تا ${fmtInt(botStart - 1)})`;
  if (tierKey === "bottom") return `یک‌سوم پایینی (${fmtInt(botStart)} تا ${fmtInt(nTeams)})`;
  return "غیرلیگی";
}

function tierShortFa(tierKey) {
  if (tierKey === "top") return "یک‌سوم بالایی";
  if (tierKey === "mid") return "یک‌سوم میانی";
  if (tierKey === "bottom") return "یک‌سوم پایینی";
  return "غیرلیگی";
}

function summarizePlayerMatches(matches) {
  const shots = matches.map((m) => m.s);
  const sot = matches.map((m) => m.sot);
  const sSum = shots.reduce((a, b) => a + b, 0);
  const sotSum = sot.reduce((a, b) => a + b, 0);
  return {
    n: matches.length,
    sSum,
    sMean: mean(shots),
    sMed: median(shots),
    sotSum,
    sotMean: mean(sot),
    sotMed: median(sot),
    sotRate: sSum > 0 ? (sotSum / sSum) * 100 : 0,
  };
}

function summarizeTeamMatches(matches) {
  const sf = matches.map((m) => m.sf);
  const sotf = matches.map((m) => m.sotf);
  const sa = matches.map((m) => m.sa);
  const sota = matches.map((m) => m.sota);
  const sfSum = sf.reduce((a, b) => a + b, 0);
  const sotfSum = sotf.reduce((a, b) => a + b, 0);
  return {
    n: matches.length,
    sSum: sfSum,
    sMean: mean(sf),
    sMed: median(sf),
    sotSum: sotfSum,
    sotMean: mean(sotf),
    sotMed: median(sotf),
    sotRate: sfSum > 0 ? (sotfSum / sfSum) * 100 : 0,
    saMean: mean(sa),
    saMed: median(sa),
    sotaMean: mean(sota),
    sotaMed: median(sota),
  };
}

function getThemeColors() {
  const cs = getComputedStyle(document.documentElement);
  const dark = document.documentElement.getAttribute("data-theme") === "dark";
  return {
    ink: cs.getPropertyValue("--ink").trim(),
    muted: cs.getPropertyValue("--ink-muted").trim(),
    border: cs.getPropertyValue("--border").trim(),
    accent: cs.getPropertyValue("--accent").trim(),
    secondary: cs.getPropertyValue("--secondary").trim(),
    surface: cs.getPropertyValue("--surface").trim(),
    accentFill: dark ? "rgba(52, 211, 153, 0.22)" : "rgba(13, 106, 70, 0.18)",
    secondaryFill: dark ? "rgba(245, 158, 11, 0.22)" : "rgba(180, 83, 9, 0.16)",
    grid: dark ? "rgba(255, 255, 255, 0.08)" : "rgba(20, 25, 24, 0.09)",
  };
}

function destroyChart(key) {
  if (STATE.charts[key]) {
    STATE.charts[key].destroy();
    delete STATE.charts[key];
  }
}

function showFeedback(msg, isError = false) {
  const el = document.getElementById("global-feedback");
  el.textContent = msg;
  el.classList.toggle("is-error", isError);
  el.hidden = false;
  clearTimeout(showFeedback._t);
  showFeedback._t = setTimeout(() => {
    el.hidden = true;
  }, 5500);
}

function setStateBox(id, { type, title, message, actionLabel, onAction } = {}) {
  const box = document.getElementById(id);
  if (!type) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }
  box.hidden = false;
  box.className = "state-box" + (type === "error" ? " is-error" : "");
  const spinnerHtml = type === "loading" ? '<div class="spinner" aria-hidden="true"></div>' : "";
  const btnHtml = actionLabel
    ? `<button type="button" class="btn-primary" id="${id}-action">${escapeHtml(actionLabel)}</button>`
    : "";
  box.innerHTML = `${spinnerHtml}<h2>${escapeHtml(title)}</h2><p>${escapeHtml(message)}</p>${btnHtml}`;
  if (actionLabel && onAction) {
    document.getElementById(`${id}-action`).addEventListener("click", onAction);
  }
}

/* ---------- Data Loading ---------- */
async function loadIndex() {
  const res = await fetch("./data/index.json", { cache: "no-cache" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  STATE.index = await res.json();
  const statusEl = document.getElementById("data-status");
  const updatedFa = formatDateFa(STATE.index.updated_at);
  statusEl.textContent = `آخرین به‌روزرسانی: ${updatedFa} | فصل ${STATE.index.season}`;
  document.getElementById("footer-season").textContent = `فصل ${STATE.index.season} (${fmtInt(STATE.index.players.length)} بازیکن، ${fmtInt(STATE.index.teams.length)} باشگاه)`;
}

async function loadLeague(slug) {
  if (STATE.leagues[slug]) return STATE.leagues[slug];
  const res = await fetch(`./data/${slug}.json`, { cache: "no-cache" });
  if (!res.ok) throw new Error(`داده لیگ ${slug} در دسترس نیست (HTTP ${res.status})`);
  const data = await res.json();
  STATE.leagues[slug] = data;
  return data;
}

/* ---------- Finders & Autocomplete ---------- */
function searchPlayers(query, limit = 8) {
  if (!STATE.index) return [];
  const q = normalizeText(query);
  if (!q) return STATE.index.players.slice(0, limit);
  const tokens = q.split(" ");
  const scored = [];
  for (const p of STATE.index.players) {
    const pn = normalizeText(p.name);
    const tn = normalizeText(p.team);
    if (pn === q) {
      scored.push([0, p]);
    } else if (tokens.every((t) => pn.includes(t))) {
      scored.push([1, p]);
    } else if (tokens.every((t) => pn.includes(t) || tn.includes(t))) {
      scored.push([2, p]);
    }
  }
  scored.sort((a, b) => a[0] - b[0] || b[1].sot - a[1].sot);
  return scored.slice(0, limit).map((x) => x[1]);
}

function searchTeams(query, limit = 8) {
  if (!STATE.index) return [];
  const q = normalizeText(query);
  if (!q) return STATE.index.teams.slice(0, limit);
  const tokens = q.split(" ");
  const scored = [];
  for (const t of STATE.index.teams) {
    const tn = normalizeText(t.name);
    const sn = normalizeText(t.short);
    if (tn === q || sn === q) {
      scored.push([0, t]);
    } else if (tokens.every((tok) => tn.includes(tok) || sn.includes(tok))) {
      scored.push([1, t]);
    }
  }
  scored.sort((a, b) => a[0] - b[0] || a[1].rank - b[1].rank);
  return scored.slice(0, limit).map((x) => x[1]);
}

function attachAutocomplete(inputId, listId, searchFn, renderItem, onSelect) {
  const input = document.getElementById(inputId);
  const list = document.getElementById(listId);
  let activeIdx = -1;
  let currentItems = [];

  function close() {
    list.hidden = true;
    activeIdx = -1;
  }

  function render(items) {
    currentItems = items;
    if (!items.length) {
      close();
      return;
    }
    list.innerHTML = items
      .map(
        (item, idx) =>
          `<li role="option" data-idx="${idx}" aria-selected="${idx === activeIdx}">
             <span class="sugg-main">${escapeHtml(renderItem(item).main)}</span>
             <span class="sugg-meta">${escapeHtml(renderItem(item).meta)}</span>
           </li>`
      )
      .join("");
    list.hidden = false;
  }

  input.addEventListener("input", () => {
    const val = input.value.trim();
    if (val.length < 1) {
      close();
      return;
    }
    activeIdx = -1;
    render(searchFn(val, 7));
  });

  input.addEventListener("keydown", (e) => {
    if (list.hidden) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIdx = (activeIdx + 1) % currentItems.length;
      render(currentItems);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIdx = (activeIdx - 1 + currentItems.length) % currentItems.length;
      render(currentItems);
    } else if (e.key === "Enter" && activeIdx >= 0) {
      e.preventDefault();
      const chosen = currentItems[activeIdx];
      close();
      onSelect(chosen);
    } else if (e.key === "Escape") {
      close();
    }
  });

  list.addEventListener("mousedown", (e) => {
    const li = e.target.closest("li[data-idx]");
    if (!li) return;
    e.preventDefault();
    const chosen = currentItems[Number(li.dataset.idx)];
    close();
    onSelect(chosen);
  });

  document.addEventListener("click", (e) => {
    if (!input.contains(e.target) && !list.contains(e.target)) close();
  });
}

/* ---------- Next Opponent Conceded Shots & SoT Builder ---------- */
async function buildNextOpponentCardHtml(teamId, leagueData, playerLeagueMatches = null) {
  const nf = leagueData.next_fixtures?.[teamId];
  const nextFix = nf?.next_official || nf?.next_league;
  if (!nextFix) {
    return `
      <section class="card reveal reveal-d1">
        <div class="card-head">
          <h3 class="card-title">حریف بعدی و آمار شوت‌پذیری</h3>
          <span class="card-note">مسابقه برنامه‌ریزی‌شده‌ای در تقویم فعلی ثبت نشده است</span>
        </div>
      </section>`;
  }

  // Locate opponent team's match history (in same league or across other top-5 leagues for UCL)
  let oppMatches = leagueData.teams?.[nextFix.oid]?.matches || null;
  let oppLeague = leagueData;
  if (!oppMatches && STATE.index) {
    const oppEntry = STATE.index.teams.find((t) => t.id === nextFix.oid);
    if (oppEntry) {
      try {
        oppLeague = await loadLeague(oppEntry.slug);
        oppMatches = oppLeague.teams?.[nextFix.oid]?.matches || null;
      } catch {
        oppMatches = null;
      }
    }
  }

  // Fallback to next domestic league fixture if next official is outside top-5 leagues
  let activeFix = nextFix;
  let fallbackNote = "";
  if (!oppMatches && nf?.next_league && nf.next_league.oid !== nextFix.oid) {
    fallbackNote = `بازی رسمی بعدی مقابل ${nextFix.opp_full} (${nextFix.comp}) خارج از ۵ لیگ اصلی است؛ آمار شوت‌پذیری حریف بعدی در لیگ (${nf.next_league.opp_full}) نمایش داده می‌شود.`;
    activeFix = nf.next_league;
    oppLeague = leagueData;
    oppMatches = leagueData.teams?.[activeFix.oid]?.matches || null;
  }

  const venueLabel = activeFix.ha === "H" ? "بازی خانگی" : "بازی خارج از خانه";
  const oppVenue = activeFix.ha === "H" ? "A" : "H"; // If our team is Home, opponent is Away
  const oppVenueLabel = oppVenue === "A" ? "خارج از خانه" : "خانگی";
  const rankBadge = activeFix.ork
    ? `رتبه #${fmtInt(activeFix.ork)} (${tierShortFa(activeFix.ot)})`
    : activeFix.comp;

  if (!oppMatches || !oppMatches.length) {
    return `
      <section class="matchup-panel reveal reveal-d1">
        <div class="matchup-head">
          <span class="matchup-eyebrow">حریف بعدی (${escapeHtml(activeFix.comp)})</span>
          <h3 class="matchup-title">${escapeHtml(activeFix.opp_full || activeFix.opp)}</h3>
          <p class="matchup-sub">${formatDateFa(activeFix.date)} | ${venueLabel} | ${rankBadge}</p>
        </div>
        <p class="card-note">داده مسابقات این حریف در ۵ لیگ اصلی ثبت نشده است.</p>
      </section>`;
  }

  const allStats = summarizeTeamMatches(oppMatches);
  const last5Stats = summarizeTeamMatches(oppMatches.slice(0, 5));
  const venueMatches = oppMatches.filter((m) => m.ha === oppVenue);
  const venueStats = summarizeTeamMatches(venueMatches);

  // If rendering for a player and opponent is in the same league, compare player's record vs that exact 1/3 tier!
  let playerTierNote = "";
  if (playerLeagueMatches && activeFix.lg === 1 && activeFix.ot) {
    const vsSameTier = playerLeagueMatches.filter((m) => m.ot === activeFix.ot);
    if (vsSameTier.length) {
      const ps = summarizePlayerMatches(vsSameTier);
      playerTierNote = `عملکرد بازیکن در فصل جاری مقابل تیم‌های ${tierShortFa(activeFix.ot)} (${fmtInt(ps.n)} بازی): میانگین ${fmt(ps.sMean)} شوت و ${fmt(ps.sotMean)} شوت در چارچوب (میانه ${fmt(ps.sotMed, 1)}).`;
    }
  }

  return `
    <section class="matchup-panel reveal reveal-d1" aria-label="تحلیل حریف بعدی">
      <div class="matchup-head">
        <span class="matchup-eyebrow">حریف بعدی و آمار شوت‌پذیری (${escapeHtml(activeFix.comp)})</span>
        <h3 class="matchup-title">${escapeHtml(activeFix.opp_full || activeFix.opp)}</h3>
        <p class="matchup-sub">${formatDateFa(activeFix.date)} | ${venueLabel} | ${rankBadge}</p>
        ${fallbackNote ? `<p class="card-note">${escapeHtml(fallbackNote)}</p>` : ""}
        ${playerTierNote ? `<p class="card-note" style="color:var(--ink);font-weight:600;margin-top:4px;">${escapeHtml(playerTierNote)}</p>` : ""}
      </div>

      <div class="matchup-metrics">
        <div class="matchup-stat">
          <div class="kpi-label">شوت خورده حریف (فصل، ${fmtInt(allStats.n)} بازی)</div>
          <div class="val is-secondary num">${fmt(allStats.saMean)}</div>
          <div class="kpi-sub">میانه فصل: ${fmt(allStats.saMed, 1)} | ۵ بازی آخر: ${fmt(last5Stats.saMean)}</div>
        </div>
        <div class="matchup-stat">
          <div class="kpi-label">SoT خورده حریف (فصل)</div>
          <div class="val is-accent num">${fmt(allStats.sotaMean)}</div>
          <div class="kpi-sub">میانه فصل: ${fmt(allStats.sotaMed, 1)} | ۵ بازی آخر: ${fmt(last5Stats.sotaMean)}</div>
        </div>
        <div class="matchup-stat">
          <div class="kpi-label">شوت‌پذیری حریف در بازی ${oppVenueLabel} (${fmtInt(venueStats.n)})</div>
          <div class="val num">${fmt(venueStats.saMean)} / ${fmt(venueStats.sotaMean)}</div>
          <div class="kpi-sub">میانگین کل شوت / شوت در چارچوب خورده</div>
        </div>
      </div>
    </section>`;
}

/* ---------- TAB 1: PLAYER ANALYSIS ---------- */
function computePlayerRadarValues(player, leagueData) {
  const all = player.matches;
  const w10 = summarizePlayerMatches(all.slice(0, 10));
  const w5 = summarizePlayerMatches(all.slice(0, 5));
  const topTier = summarizePlayerMatches(all.filter((m) => m.lg === 1 && m.ot === "top"));
  // Normalize to 0-100 against realistic elite football benchmarks so radar is readable & comparable
  const cap = (val, max) => Math.min(100, Math.round((val / max) * 100));
  return {
    scaled: [
      cap(w10.sMean, 5.5),
      cap(w10.sotMean, 2.2),
      cap(w10.sotMed, 2.0),
      cap(w10.sotRate, 70),
      cap(w5.sotMean, 2.2),
      cap(topTier.n ? topTier.sotMean : w10.sotMean, 2.0),
    ],
    raw: [
      `${fmt(w10.sMean)} شوت/بازی`,
      `${fmt(w10.sotMean)} SoT/بازی`,
      `میانه ${fmt(w10.sotMed, 1)}`,
      `${fmt(w10.sotRate, 1)}%`,
      `${fmt(w5.sotMean)} SoT/بازی`,
      topTier.n ? `${fmt(topTier.sotMean)} SoT (${fmtInt(topTier.n)} بازی)` : "بدون بازی",
    ],
  };
}

async function renderPlayerAnalysis(playerMeta, compareMeta = null) {
  const resultsEl = document.getElementById("player-results");
  resultsEl.hidden = true;
  setStateBox("player-state", {
    type: "loading",
    title: `در حال بارگذاری آمار ${playerMeta.name}`,
    message: "در حال محاسبه ۱۰ بازی و ۵ بازی اخیر، تفکیک یک‌سوم جدول و آمار حریف بعدی...",
  });

  try {
    const leagueData = await loadLeague(playerMeta.slug);
    const player = leagueData.players[playerMeta.id];
    if (!player || !player.matches.length) {
      setStateBox("player-state", {
        type: "empty",
        title: "مسابقه‌ای برای این بازیکن ثبت نشده است",
        message: "این بازیکن در فصل جاری هنوز دقایق رسمی در دیتاست ثبت نکرده است.",
      });
      return;
    }

    let compareObj = null;
    let compareLeague = null;
    if (compareMeta) {
      compareLeague = await loadLeague(compareMeta.slug);
      compareObj = compareLeague.players[compareMeta.id] || null;
    }

    STATE.currentPlayer = playerMeta;
    STATE.comparePlayer = compareMeta;

    const teamSt = leagueData.standings[player.team_id];
    const teamRank = teamSt?.rank || 0;
    const allMatches = player.matches;
    const last10 = allMatches.slice(0, 10);
    const last5 = allMatches.slice(0, 5);
    const w10 = summarizePlayerMatches(last10);
    const w5 = summarizePlayerMatches(last5);
    const leagueMatches = allMatches.filter((m) => m.lg === 1);

    const tierGroups = [
      { key: "top", label: tierLabelFa("top", leagueData), list: leagueMatches.filter((m) => m.ot === "top") },
      { key: "mid", label: tierLabelFa("mid", leagueData), list: leagueMatches.filter((m) => m.ot === "mid") },
      { key: "bottom", label: tierLabelFa("bottom", leagueData), list: leagueMatches.filter((m) => m.ot === "bottom") },
      { key: "higher", label: "تیم‌های بالاتر در جدول", list: leagueMatches.filter((m) => m.ork && teamRank && m.ork < teamRank) },
      { key: "lower", label: "تیم‌های پایین‌تر در جدول", list: leagueMatches.filter((m) => m.ork && teamRank && m.ork > teamRank) },
    ].map((g) => ({ ...g, stats: summarizePlayerMatches(g.list) }));

    const matchupHtml = await buildNextOpponentCardHtml(player.team_id, leagueData, leagueMatches);

    setStateBox("player-state", {});
    resultsEl.innerHTML = `
      <section class="profile-banner reveal">
        <div class="profile-identity">
          <h2>${escapeHtml(player.name)}${compareObj ? ` در مقایسه با ${escapeHtml(compareObj.name)}` : ""}</h2>
          <div class="profile-meta">
            <span class="meta-tag is-accent">${escapeHtml(player.team)}</span>
            <span class="meta-tag">${escapeHtml(leagueData.name_fa)}</span>
            <span class="meta-tag">رتبه باشگاه: #${fmtInt(teamRank)}</span>
            <span class="meta-tag">${fmtInt(allMatches.length)} بازی رسمی فصل</span>
          </div>
        </div>
        <div class="kpi-strip">
          <div class="kpi-box">
            <div class="kpi-label">۱۰ بازی اخیر (میانگین / میانه شوت)</div>
            <div class="kpi-value num">${fmt(w10.sMean)} / ${fmt(w10.sMed, 1)}</div>
            <div class="kpi-sub">مجموع ${fmtInt(w10.sSum)} شوت | دقت ${fmt(w10.sotRate, 1)}%</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-label">۱۰ بازی اخیر (میانگین / میانه SoT)</div>
            <div class="kpi-value num" style="color:var(--accent)">${fmt(w10.sotMean)} / ${fmt(w10.sotMed, 1)}</div>
            <div class="kpi-sub">مجموع ${fmtInt(w10.sotSum)} شوت در چارچوب</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-label">۵ بازی اخیر (میانگین / میانه شوت)</div>
            <div class="kpi-value num">${fmt(w5.sMean)} / ${fmt(w5.sMed, 1)}</div>
            <div class="kpi-sub">مجموع ${fmtInt(w5.sSum)} شوت | دقت ${fmt(w5.sotRate, 1)}%</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-label">۵ بازی اخیر (میانگین / میانه SoT)</div>
            <div class="kpi-value num" style="color:var(--secondary)">${fmt(w5.sotMean)} / ${fmt(w5.sotMed, 1)}</div>
            <div class="kpi-sub">مجموع ${fmtInt(w5.sotSum)} شوت در چارچوب</div>
          </div>
        </div>
      </section>

      ${matchupHtml}

      <div class="charts-grid-2 reveal reveal-d2">
        <section class="card">
          <div class="card-head">
            <h3 class="card-title">روند شوت و شوت در چارچوب در ${fmtInt(last10.length)} بازی اخیر باشگاهی</h3>
            <span class="card-note">خط چین: میانگین و میانه شوت در چارچوب</span>
          </div>
          <div class="chart-stage"><canvas id="chart-player-trend"></canvas></div>
        </section>

        <section class="card">
          <div class="card-head">
            <h3 class="card-title">نمودار راداری پروفایل شوت‌زنی</h3>
            <span class="card-note">${compareObj ? "مقایسه دو بازیکن (مقیاس ۰ تا ۱۰۰)" : "ارزیابی ۶ شاخص کلیدی (مقیاس ۰ تا ۱۰۰)"}</span>
          </div>
          <div class="chart-stage is-radar"><canvas id="chart-player-radar"></canvas></div>
        </section>
      </div>

      <section class="card reveal reveal-d3">
        <div class="card-head">
          <h3 class="card-title">عملکرد مقابل یک‌سوم بالایی، میانی و پایینی جدول</h3>
          <span class="card-note">${fmtInt(leagueMatches.length)} بازی لیگ ${escapeHtml(leagueData.name_fa)}</span>
        </div>
        <div class="chart-stage"><canvas id="chart-player-tiers"></canvas></div>
      </section>

      <section class="card reveal reveal-d3">
        <div class="card-head">
          <h3 class="card-title">جدول تفکیک رده حریف در جدول لیگ</h3>
          <span class="card-note">میانگین، میانه و نرخ دقت</span>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>رده حریف</th>
                <th>بازی</th>
                <th>کل شوت</th>
                <th>میانگین شوت</th>
                <th>میانه شوت</th>
                <th>کل SoT</th>
                <th>میانگین SoT</th>
                <th>میانه SoT</th>
                <th>SoT%</th>
              </tr>
            </thead>
            <tbody>
              ${tierGroups
                .map(
                  (g) => `
                <tr>
                  <td><strong>${escapeHtml(g.label)}</strong></td>
                  <td class="td-num">${fmtInt(g.stats.n)}</td>
                  <td class="td-num">${fmtInt(g.stats.sSum)}</td>
                  <td class="td-num">${fmt(g.stats.sMean)}</td>
                  <td class="td-num">${fmt(g.stats.sMed, 1)}</td>
                  <td class="td-num">${fmtInt(g.stats.sotSum)}</td>
                  <td class="td-num td-strong">${fmt(g.stats.sotMean)}</td>
                  <td class="td-num">${fmt(g.stats.sotMed, 1)}</td>
                  <td class="td-num">${fmt(g.stats.sotRate, 1)}%</td>
                </tr>`
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </section>

      <section class="card reveal reveal-d4">
        <div class="card-head">
          <h3 class="card-title">ریز ${fmtInt(last10.length)} بازی رسمی اخیر ${escapeHtml(player.name)}</h3>
          <span class="card-note">بدون احتساب بازی‌های دوستانه و نیمکت‌نشینی بدون حضور</span>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>تاریخ</th>
                <th>رقابت</th>
                <th>میزبان/مهمان</th>
                <th>حریف</th>
                <th>رده جدول</th>
                <th>نتیجه</th>
                <th>نقش</th>
                <th>شوت</th>
                <th>SoT</th>
                <th>گل</th>
              </tr>
            </thead>
            <tbody>
              ${last10
                .map(
                  (m, i) => `
                <tr>
                  <td class="td-num">${fmtInt(i + 1)}</td>
                  <td class="td-num">${formatDateFa(m.d)}</td>
                  <td>${escapeHtml(m.c)}</td>
                  <td>${m.ha === "H" ? "خانه" : "بیرون"}</td>
                  <td><strong>${escapeHtml(m.opp)}</strong>${m.ork ? ` <span class="card-note">(#${fmtInt(m.ork)})</span>` : ""}</td>
                  <td><span class="tier-pill ${m.ot === "top" ? "is-top" : m.ot === "bottom" ? "is-bottom" : ""}">${tierShortFa(m.ot)}</span></td>
                  <td class="td-num">${escapeHtml(m.sc)}</td>
                  <td>${m.xi ? "ثابت" : "تعویضی"}</td>
                  <td class="td-num">${fmtInt(m.s)}</td>
                  <td class="td-num td-strong">${fmtInt(m.sot)}</td>
                  <td class="td-num">${fmtInt(m.g)}</td>
                </tr>`
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </section>
    `;
    resultsEl.hidden = false;

    renderPlayerCharts(player, last10, w10, tierGroups.slice(0, 3), leagueData, compareObj, compareLeague);
  } catch (err) {
    setStateBox("player-state", {
      type: "error",
      title: "خطا در بارگذاری اطلاعات بازیکن",
      message: `${err.message}. اتصال اینترنت یا دکمه تلاش مجدد را بررسی کنید.`,
      actionLabel: "تلاش مجدد",
      onAction: () => renderPlayerAnalysis(playerMeta, compareMeta),
    });
  }
}

function renderPlayerCharts(player, last10, w10, tier3, leagueData, compareObj, compareLeague) {
  const c = getThemeColors();
  const rev = [...last10].reverse(); // chronological left-to-right

  // 1. Combo Trend Chart
  destroyChart("playerTrend");
  STATE.charts.playerTrend = new Chart(document.getElementById("chart-player-trend"), {
    type: "bar",
    data: {
      labels: rev.map((m) => `${m.opp} (${m.ha === "H" ? "خ" : "ب"})`),
      datasets: [
        {
          label: "کل شوت",
          data: rev.map((m) => m.s),
          backgroundColor: c.secondaryFill,
          borderColor: c.secondary,
          borderWidth: 1.8,
          borderRadius: 6,
          order: 3,
        },
        {
          label: "شوت در چارچوب (SoT)",
          data: rev.map((m) => m.sot),
          backgroundColor: c.accent,
          borderRadius: 6,
          order: 2,
        },
        {
          type: "line",
          label: `میانگین SoT (${fmt(w10.sotMean)})`,
          data: rev.map(() => Number(w10.sotMean.toFixed(2))),
          borderColor: c.ink,
          borderDash: [6, 4],
          borderWidth: 1.8,
          pointRadius: 0,
          tension: 0,
          order: 1,
        },
        {
          type: "line",
          label: `میانه SoT (${fmt(w10.sotMed, 1)})`,
          data: rev.map(() => Number(w10.sotMed.toFixed(2))),
          borderColor: c.accent,
          borderDash: [3, 3],
          borderWidth: 1.6,
          pointRadius: 0,
          tension: 0,
          order: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 750, easing: "easeOutQuart" },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { labels: { color: c.ink, font: { family: "Vazirmatn", size: 12 } } },
        tooltip: {
          rtl: true,
          titleFont: { family: "Vazirmatn", weight: "bold" },
          bodyFont: { family: "Vazirmatn" },
        },
      },
      scales: {
        x: { ticks: { color: c.muted, font: { family: "Vazirmatn", size: 11 } }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { stepSize: 1, color: c.muted, font: { family: "Vazirmatn" } }, grid: { color: c.grid } },
      },
    },
  });

  // 2. Radar Chart
  destroyChart("playerRadar");
  const r1 = computePlayerRadarValues(player, leagueData);
  const radarDatasets = [
    {
      label: player.name,
      data: r1.scaled,
      rawLabels: r1.raw,
      backgroundColor: c.accentFill,
      borderColor: c.accent,
      borderWidth: 2.2,
      pointBackgroundColor: c.accent,
      pointRadius: 3.5,
    },
  ];
  if (compareObj) {
    const r2 = computePlayerRadarValues(compareObj, compareLeague);
    radarDatasets.push({
      label: compareObj.name,
      data: r2.scaled,
      rawLabels: r2.raw,
      backgroundColor: c.secondaryFill,
      borderColor: c.secondary,
      borderWidth: 2.2,
      pointBackgroundColor: c.secondary,
      pointRadius: 3.5,
    });
  }

  STATE.charts.playerRadar = new Chart(document.getElementById("chart-player-radar"), {
    type: "radar",
    data: {
      labels: [
        "حجم شوت (۱۰ بازی)",
        "میانگین SoT (۱۰ بازی)",
        "ثبات / میانه SoT",
        "نرخ دقت (SoT%)",
        "فرم ۵ بازی اخیر",
        "مقابل یک‌سوم بالایی",
      ],
      datasets: radarDatasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 820, easing: "easeOutQuart" },
      plugins: {
        legend: { labels: { color: c.ink, font: { family: "Vazirmatn", size: 12 } } },
        tooltip: {
          rtl: true,
          titleFont: { family: "Vazirmatn", weight: "bold" },
          bodyFont: { family: "Vazirmatn" },
          callbacks: {
            label(ctx) {
              const raw = ctx.dataset.rawLabels?.[ctx.dataIndex] || ctx.formattedValue;
              return `${ctx.dataset.label}: ${raw} (امتیاز ${fmtInt(ctx.raw)}/۱۰۰)`;
            },
          },
        },
      },
      scales: {
        r: {
          min: 0,
          max: 100,
          ticks: { display: false, stepSize: 25 },
          grid: { color: c.grid },
          angleLines: { color: c.grid },
          pointLabels: { color: c.ink, font: { family: "Vazirmatn", size: 11, weight: "600" } },
        },
      },
    },
  });

  // 3. Table-Tier Grouped Bar Chart
  destroyChart("playerTiers");
  STATE.charts.playerTiers = new Chart(document.getElementById("chart-player-tiers"), {
    type: "bar",
    data: {
      labels: tier3.map((g) => `${tierShortFa(g.key)} (${fmtInt(g.stats.n)})`),
      datasets: [
        {
          label: "میانگین کل شوت",
          data: tier3.map((g) => Number(g.stats.sMean.toFixed(2))),
          backgroundColor: c.secondary,
          borderRadius: 7,
        },
        {
          label: "میانگین شوت در چارچوب",
          data: tier3.map((g) => Number(g.stats.sotMean.toFixed(2))),
          backgroundColor: c.accent,
          borderRadius: 7,
        },
        {
          label: "میانه شوت در چارچوب",
          data: tier3.map((g) => Number(g.stats.sotMed.toFixed(2))),
          backgroundColor: c.accentFill,
          borderColor: c.accent,
          borderWidth: 1.8,
          borderRadius: 7,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 750, easing: "easeOutQuart" },
      plugins: {
        legend: { labels: { color: c.ink, font: { family: "Vazirmatn", size: 12 } } },
        tooltip: { rtl: true, titleFont: { family: "Vazirmatn" }, bodyFont: { family: "Vazirmatn" } },
      },
      scales: {
        x: { ticks: { color: c.ink, font: { family: "Vazirmatn", size: 11 } }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { color: c.muted, font: { family: "Vazirmatn" } }, grid: { color: c.grid } },
      },
    },
  });
}

/* ---------- TAB 2: CLUB ANALYSIS ---------- */
async function renderTeamAnalysis(teamMeta, minGames = 3) {
  const resultsEl = document.getElementById("team-results");
  resultsEl.hidden = true;
  setStateBox("team-state", {
    type: "loading",
    title: `در حال بارگذاری آمار باشگاه ${teamMeta.name}`,
    message: "در حال محاسبه آمار شوت در چارچوب مقابل یک‌سوم جدول و ۱۰ بازیکن برتر باشگاه...",
  });

  try {
    const leagueData = await loadLeague(teamMeta.slug);
    const tObj = leagueData.teams[teamMeta.id];
    const st = leagueData.standings[teamMeta.id];
    if (!tObj || !tObj.matches.length) {
      setStateBox("team-state", {
        type: "empty",
        title: "داده مسابقه‌ای برای این باشگاه یافت نشد",
        message: "باشگاه دیگری را از فهرست انتخاب کنید.",
      });
      return;
    }

    STATE.currentTeam = teamMeta;
    const allM = tObj.matches;
    const lgM = allM.filter((m) => m.lg === 1);
    const wSeason = summarizeTeamMatches(allM);
    const w10 = summarizeTeamMatches(allM.slice(0, 10));
    const w5 = summarizeTeamMatches(allM.slice(0, 5));

    const tierGroups = [
      { key: "top", label: tierLabelFa("top", leagueData), list: lgM.filter((m) => m.ot === "top") },
      { key: "mid", label: tierLabelFa("mid", leagueData), list: lgM.filter((m) => m.ot === "mid") },
      { key: "bottom", label: tierLabelFa("bottom", leagueData), list: lgM.filter((m) => m.ot === "bottom") },
      { key: "higher", label: "تیم‌های بالاتر در جدول", list: lgM.filter((m) => m.ork && m.ork < st.rank) },
      { key: "lower", label: "تیم‌های پایین‌تر در جدول", list: lgM.filter((m) => m.ork && m.ork > st.rank) },
    ].map((g) => ({ ...g, stats: summarizeTeamMatches(g.list) }));

    // Club's top 10 players
    const squadPlayers = Object.values(leagueData.players)
      .filter((p) => p.team_id === teamMeta.id && p.matches.length >= minGames)
      .map((p) => ({ id: p.id, name: p.name, slug: teamMeta.slug, team: p.team, ...summarizePlayerMatches(p.matches) }))
      .filter((p) => p.sSum > 0)
      .sort((a, b) => b.sotMean - a.sotMean || b.sSum - a.sSum)
      .slice(0, 10);

    const matchupHtml = await buildNextOpponentCardHtml(teamMeta.id, leagueData);

    setStateBox("team-state", {});
    resultsEl.innerHTML = `
      <section class="profile-banner reveal">
        <div class="profile-identity">
          <h2>${escapeHtml(st.name)}</h2>
          <div class="profile-meta">
            <span class="meta-tag is-accent">رتبه #${fmtInt(st.rank)} در ${escapeHtml(leagueData.name_fa)}</span>
            <span class="meta-tag">${fmtInt(st.pts)} امتیاز (${fmtInt(st.gp)} بازی لیگ)</span>
            <span class="meta-tag">${fmtInt(allM.length)} بازی رسمی فصل</span>
          </div>
        </div>
        <div class="kpi-strip">
          <div class="kpi-box">
            <div class="kpi-label">میانگین شوت / SoT فصل</div>
            <div class="kpi-value num">${fmt(wSeason.sMean)} / <span style="color:var(--accent)">${fmt(wSeason.sotMean)}</span></div>
            <div class="kpi-sub">میانه SoT: ${fmt(wSeason.sotMed, 1)} | دقت ${fmt(wSeason.sotRate, 1)}%</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-label">۵ بازی اخیر (شوت / SoT)</div>
            <div class="kpi-value num">${fmt(w5.sMean)} / <span style="color:var(--secondary)">${fmt(w5.sotMean)}</span></div>
            <div class="kpi-sub">۱۰ بازی اخیر: ${fmt(w10.sotMean)} SoT در هر بازی</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-label">شوت‌پذیری (شوت خورده فصل)</div>
            <div class="kpi-value num">${fmt(wSeason.saMean)}</div>
            <div class="kpi-sub">میانه شوت خورده: ${fmt(wSeason.saMed, 1)}</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-label">SoT خورده فصل</div>
            <div class="kpi-value num">${fmt(wSeason.sotaMean)}</div>
            <div class="kpi-sub">۵ بازی اخیر: ${fmt(w5.sotaMean)} SoT خورده</div>
          </div>
        </div>
      </section>

      ${matchupHtml}

      <div class="charts-grid-2 reveal reveal-d2">
        <section class="card">
          <div class="card-head">
            <h3 class="card-title">شوت در چارچوب باشگاه مقابل رده‌های جدول (زده vs خورده)</h3>
            <span class="card-note">مقایسه میانگین SoT زده و خورده در ${fmtInt(lgM.length)} بازی لیگ</span>
          </div>
          <div class="chart-stage"><canvas id="chart-team-tiers"></canvas></div>
        </section>

        <section class="card">
          <div class="card-head">
            <h3 class="card-title">نمودار راداری ساختار هجومی و دفاعی باشگاه</h3>
            <span class="card-note">مقیاس ۰ تا ۱۰۰ بر اساس آمار فصل جاری</span>
          </div>
          <div class="chart-stage is-radar"><canvas id="chart-team-radar"></canvas></div>
        </section>
      </div>

      <section class="card reveal reveal-d3">
        <div class="card-head">
          <h3 class="card-title">جدول آمار شوت باشگاه مقابل یک‌سوم بالایی، میانی و پایینی</h3>
          <span class="card-note">${escapeHtml(leagueData.name_fa)} فصل ${escapeHtml(leagueData.season)}</span>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>رده حریف</th>
                <th>بازی</th>
                <th>کل شوت</th>
                <th>میانگین شوت</th>
                <th>کل SoT</th>
                <th>میانگین SoT</th>
                <th>میانه SoT</th>
                <th>SoT%</th>
                <th>SoT خورده/بازی</th>
              </tr>
            </thead>
            <tbody>
              ${tierGroups
                .map(
                  (g) => `
                <tr>
                  <td><strong>${escapeHtml(g.label)}</strong></td>
                  <td class="td-num">${fmtInt(g.stats.n)}</td>
                  <td class="td-num">${fmtInt(g.stats.sSum)}</td>
                  <td class="td-num">${fmt(g.stats.sMean)}</td>
                  <td class="td-num">${fmtInt(g.stats.sotSum)}</td>
                  <td class="td-num td-strong">${fmt(g.stats.sotMean)}</td>
                  <td class="td-num">${fmt(g.stats.sotMed, 1)}</td>
                  <td class="td-num">${fmt(g.stats.sotRate, 1)}%</td>
                  <td class="td-num">${fmt(g.stats.sotaMean)}</td>
                </tr>`
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </section>

      <section class="card reveal reveal-d4">
        <div class="card-head">
          <h3 class="card-title">۱۰ بازیکن برتر ${escapeHtml(st.short)} (کل شوت و میانگین SoT)</h3>
          <span class="card-note">حداقل ${fmtInt(minGames)} بازی رسمی</span>
        </div>
        <div class="chart-stage is-tall"><canvas id="chart-team-players"></canvas></div>
      </section>

      <section class="card reveal reveal-d4">
        <div class="card-head">
          <h3 class="card-title">جدول بازیکنان برتر باشگاه</h3>
          <span class="card-note">برای تحلیل کامل، روی نام بازیکن کلیک کنید</span>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>بازیکن</th>
                <th>بازی</th>
                <th>کل شوت</th>
                <th>میانگین شوت</th>
                <th>کل SoT</th>
                <th>میانگین SoT</th>
                <th>میانه SoT</th>
                <th>SoT%</th>
              </tr>
            </thead>
            <tbody>
              ${squadPlayers
                .map(
                  (p, idx) => `
                <tr>
                  <td class="td-num">${fmtInt(idx + 1)}</td>
                  <td><button type="button" class="row-link-btn" data-jump-player="${escapeHtml(p.id)}" data-jump-slug="${escapeHtml(p.slug)}">${escapeHtml(p.name)}</button></td>
                  <td class="td-num">${fmtInt(p.n)}</td>
                  <td class="td-num">${fmtInt(p.sSum)}</td>
                  <td class="td-num">${fmt(p.sMean)}</td>
                  <td class="td-num">${fmtInt(p.sotSum)}</td>
                  <td class="td-num td-strong">${fmt(p.sotMean)}</td>
                  <td class="td-num">${fmt(p.sotMed, 1)}</td>
                  <td class="td-num">${fmt(p.sotRate, 1)}%</td>
                </tr>`
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </section>
    `;
    resultsEl.hidden = false;

    renderTeamCharts(st, wSeason, w5, tierGroups.slice(0, 3), squadPlayers);
  } catch (err) {
    setStateBox("team-state", {
      type: "error",
      title: "خطا در بارگذاری آمار باشگاه",
      message: err.message,
      actionLabel: "تلاش مجدد",
      onAction: () => renderTeamAnalysis(teamMeta, minGames),
    });
  }
}

function renderTeamCharts(st, wSeason, w5, tier3, squadPlayers) {
  const c = getThemeColors();

  // 1. Club SoT For vs Against across 1/3 tiers
  destroyChart("teamTiers");
  STATE.charts.teamTiers = new Chart(document.getElementById("chart-team-tiers"), {
    type: "bar",
    data: {
      labels: tier3.map((g) => `${tierShortFa(g.key)} (${fmtInt(g.stats.n)})`),
      datasets: [
        {
          label: "میانگین SoT زده‌شده",
          data: tier3.map((g) => Number(g.stats.sotMean.toFixed(2))),
          backgroundColor: c.accent,
          borderRadius: 7,
        },
        {
          label: "میانگین SoT خورده‌شده",
          data: tier3.map((g) => Number(g.stats.sotaMean.toFixed(2))),
          backgroundColor: c.secondary,
          borderRadius: 7,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 750, easing: "easeOutQuart" },
      plugins: {
        legend: { labels: { color: c.ink, font: { family: "Vazirmatn", size: 12 } } },
        tooltip: { rtl: true, titleFont: { family: "Vazirmatn" }, bodyFont: { family: "Vazirmatn" } },
      },
      scales: {
        x: { ticks: { color: c.ink, font: { family: "Vazirmatn" } }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { color: c.muted, font: { family: "Vazirmatn" } }, grid: { color: c.grid } },
      },
    },
  });

  // 2. Club Radar Chart
  destroyChart("teamRadar");
  const topStats = tier3[0].stats;
  const cap = (v, m) => Math.max(0, Math.min(100, Math.round((v / m) * 100)));
  const defScore = Math.max(0, Math.min(100, Math.round(((8 - wSeason.sotaMean) / 6.5) * 100)));
  const radarRaw = [
    `${fmt(wSeason.sMean)} شوت/بازی`,
    `${fmt(wSeason.sotMean)} SoT/بازی`,
    `${fmt(wSeason.sotRate, 1)}%`,
    `${fmt(wSeason.sotaMean)} SoT خورده`,
    topStats.n ? `${fmt(topStats.sotMean)} SoT` : "بدون بازی",
    `${fmt(w5.sotMean)} SoT/بازی`,
  ];

  STATE.charts.teamRadar = new Chart(document.getElementById("chart-team-radar"), {
    type: "radar",
    data: {
      labels: [
        "حجم شوت تیمی",
        "میانگین SoT",
        "دقت شوت‌زنی",
        "استحکام دفاعی",
        "مقابل یک‌سوم بالایی",
        "فرم ۵ بازی اخیر",
      ],
      datasets: [
        {
          label: st.short,
          data: [
            cap(wSeason.sMean, 22),
            cap(wSeason.sotMean, 8.5),
            cap(wSeason.sotRate, 50),
            defScore,
            cap(topStats.n ? topStats.sotMean : wSeason.sotMean, 8.5),
            cap(w5.sotMean, 8.5),
          ],
          rawLabels: radarRaw,
          backgroundColor: c.accentFill,
          borderColor: c.accent,
          borderWidth: 2.2,
          pointBackgroundColor: c.accent,
          pointRadius: 3.5,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 820, easing: "easeOutQuart" },
      plugins: {
        legend: { labels: { color: c.ink, font: { family: "Vazirmatn" } } },
        tooltip: {
          rtl: true,
          bodyFont: { family: "Vazirmatn" },
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${ctx.dataset.rawLabels[ctx.dataIndex]} (${fmtInt(ctx.raw)}/۱۰۰)`,
          },
        },
      },
      scales: {
        r: {
          min: 0,
          max: 100,
          ticks: { display: false, stepSize: 25 },
          grid: { color: c.grid },
          angleLines: { color: c.grid },
          pointLabels: { color: c.ink, font: { family: "Vazirmatn", size: 11, weight: "600" } },
        },
      },
    },
  });

  // 3. Top 10 Club Players Horizontal Bar Chart
  destroyChart("teamPlayers");
  STATE.charts.teamPlayers = new Chart(document.getElementById("chart-team-players"), {
    type: "bar",
    data: {
      labels: squadPlayers.map((p) => p.name),
      datasets: [
        {
          label: "میانگین شوت در بازی",
          data: squadPlayers.map((p) => Number(p.sMean.toFixed(2))),
          backgroundColor: c.secondaryFill,
          borderColor: c.secondary,
          borderWidth: 1.5,
          borderRadius: 5,
        },
        {
          label: "میانگین SoT در بازی",
          data: squadPlayers.map((p) => Number(p.sotMean.toFixed(2))),
          backgroundColor: c.accent,
          borderRadius: 5,
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 750, easing: "easeOutQuart" },
      plugins: {
        legend: { labels: { color: c.ink, font: { family: "Vazirmatn", size: 12 } } },
        tooltip: { rtl: true, titleFont: { family: "Vazirmatn" }, bodyFont: { family: "Vazirmatn" } },
      },
      scales: {
        x: { beginAtZero: true, ticks: { color: c.muted, font: { family: "Vazirmatn" } }, grid: { color: c.grid } },
        y: { ticks: { color: c.ink, font: { family: "Vazirmatn", size: 11, weight: "600" } }, grid: { display: false } },
      },
    },
  });
}

/* ---------- TAB 3: LEAGUE TOP 10 ---------- */
async function renderLeagueTab() {
  const resultsEl = document.getElementById("league-results");
  resultsEl.hidden = true;
  setStateBox("league-state", {
    type: "loading",
    title: "در حال محاسبه برترین‌های لیگ",
    message: "در حال رتبه‌بندی بازیکنان بر اساس میانگین و میانه شوت در چارچوب...",
  });

  try {
    const lg = await loadLeague(STATE.leagueSlug);
    const win = STATE.leagueWindow;
    const minG = win === 10 ? 8 : 5;
    const minShotsForRate = win === 10 ? 15 : 8;

    const rows = [];
    for (const p of Object.values(lg.players)) {
      const lgMatches = p.matches.filter((m) => m.lg === 1);
      if (lgMatches.length < minG) continue;
      const stats = summarizePlayerMatches(lgMatches.slice(0, win));
      if (STATE.leagueSort === "sot_rate" && stats.sSum < minShotsForRate) continue;
      rows.push({ id: p.id, name: p.name, team: p.team, slug: lg.slug, ...stats });
    }

    if (STATE.leagueSort === "sot_rate") {
      rows.sort((a, b) => b.sotRate - a.sotRate || b.sotSum - a.sotSum);
    } else if (STATE.leagueSort === "shots_mean") {
      rows.sort((a, b) => b.sMean - a.sMean || b.sotMean - a.sotMean);
    } else {
      rows.sort((a, b) => b.sotMean - a.sotMean || b.sotMed - a.sotMed || b.sotSum - a.sotSum);
    }

    const top10 = rows.slice(0, 10);
    const scatterPool = rows.slice(0, 30);

    setStateBox("league-state", {});
    resultsEl.innerHTML = `
      <section class="card reveal">
        <div class="card-head">
          <h3 class="card-title">نقشه حجم شوت در برابر شوت در چارچوب: ${escapeHtml(lg.name_fa)} (${fmtInt(win)} بازی اخیر)</h3>
          <span class="card-note">۳۰ بازیکن برتر (اندازه نقطه متناسب با نرخ دقت SoT%)</span>
        </div>
        <div class="chart-stage"><canvas id="chart-league-scatter"></canvas></div>
      </section>

      <section class="card reveal reveal-d1">
        <div class="card-head">
          <h3 class="card-title">۱۰ بازیکن برتر ${escapeHtml(lg.name_fa)} در ${fmtInt(win)} بازی اخیر لیگ</h3>
          <span class="card-note">حداقل ${fmtInt(minG)} بازی لیگ${STATE.leagueSort === "sot_rate" ? ` و حداقل ${fmtInt(minShotsForRate)} شوت` : ""} | برای تحلیل کامل روی نام بازیکن کلیک کنید</span>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>بازیکن</th>
                <th>باشگاه</th>
                <th>بازی</th>
                <th>میانگین SoT</th>
                <th>میانه SoT</th>
                <th>کل SoT</th>
                <th>میانگین شوت</th>
                <th>میانه شوت</th>
                <th>کل شوت</th>
                <th>SoT%</th>
              </tr>
            </thead>
            <tbody>
              ${top10
                .map(
                  (r, i) => `
                <tr>
                  <td class="td-num">${fmtInt(i + 1)}</td>
                  <td><button type="button" class="row-link-btn" data-jump-player="${escapeHtml(r.id)}" data-jump-slug="${escapeHtml(r.slug)}">${escapeHtml(r.name)}</button></td>
                  <td>${escapeHtml(r.team)}</td>
                  <td class="td-num">${fmtInt(r.n)}</td>
                  <td class="td-num td-strong">${fmt(r.sotMean)}</td>
                  <td class="td-num">${fmt(r.sotMed, 1)}</td>
                  <td class="td-num">${fmtInt(r.sotSum)}</td>
                  <td class="td-num">${fmt(r.sMean)}</td>
                  <td class="td-num">${fmt(r.sMed, 1)}</td>
                  <td class="td-num">${fmtInt(r.sSum)}</td>
                  <td class="td-num">${fmt(r.sotRate, 1)}%</td>
                </tr>`
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </section>
    `;
    resultsEl.hidden = false;

    const c = getThemeColors();
    destroyChart("leagueScatter");
    STATE.charts.leagueScatter = new Chart(document.getElementById("chart-league-scatter"), {
      type: "bubble",
      data: {
        datasets: [
          {
            label: "۱۰ بازیکن اول",
            data: scatterPool.slice(0, 10).map((r) => ({
              x: Number(r.sMean.toFixed(2)),
              y: Number(r.sotMean.toFixed(2)),
              r: Math.max(5, Math.min(13, r.sotRate / 6)),
              meta: r,
            })),
            backgroundColor: c.accent,
          },
          {
            label: "رتبه ۱۱ تا ۳۰",
            data: scatterPool.slice(10).map((r) => ({
              x: Number(r.sMean.toFixed(2)),
              y: Number(r.sotMean.toFixed(2)),
              r: Math.max(4, Math.min(10, r.sotRate / 7.5)),
              meta: r,
            })),
            backgroundColor: c.secondaryFill,
            borderColor: c.secondary,
            borderWidth: 1.4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 750, easing: "easeOutQuart" },
        plugins: {
          legend: { labels: { color: c.ink, font: { family: "Vazirmatn", size: 12 } } },
          tooltip: {
            rtl: true,
            titleFont: { family: "Vazirmatn" },
            bodyFont: { family: "Vazirmatn" },
            callbacks: {
              label(ctx) {
                const m = ctx.raw.meta;
                return `${m.name} (${m.team}) | شوت: ${fmt(m.sMean)} | SoT: ${fmt(m.sotMean)} (میانه ${fmt(m.sotMed, 1)}) | دقت: ${fmt(m.sotRate, 1)}%`;
              },
            },
          },
        },
        scales: {
          x: {
            title: { display: true, text: "میانگین کل شوت در هر بازی", color: c.muted, font: { family: "Vazirmatn", weight: "700" } },
            ticks: { color: c.muted, font: { family: "Vazirmatn" } },
            grid: { color: c.grid },
          },
          y: {
            beginAtZero: true,
            title: { display: true, text: "میانگین شوت در چارچوب (SoT)", color: c.muted, font: { family: "Vazirmatn", weight: "700" } },
            ticks: { color: c.muted, font: { family: "Vazirmatn" } },
            grid: { color: c.grid },
          },
        },
      },
    });
  } catch (err) {
    setStateBox("league-state", {
      type: "error",
      title: "خطا در بارگذاری جدول لیگ",
      message: err.message,
      actionLabel: "تلاش مجدد",
      onAction: () => renderLeagueTab(),
    });
  }
}

/* ---------- TAB 4: HOME GOALS & YELLOW CARDS (PHASE 3) ---------- */
async function renderHomeTab() {
  const resultsEl = document.getElementById("home-results");
  resultsEl.hidden = true;
  setStateBox("home-state", {
    type: "loading",
    title: "در حال محاسبه آمار بازی‌های خانگی",
    message: "میانگین گل زده، گل خورده، مجموع گل و کارت زرد در بازی‌های خانگی لیگ...",
  });

  try {
    const lg = await loadLeague(STATE.homeLeagueSlug);
    const allHomeMatches = [];
    const teamRows = [];

    for (const [tid, st] of Object.entries(lg.standings)) {
      const hm = (lg.teams[tid]?.matches || []).filter((m) => m.lg === 1 && m.ha === "H");
      allHomeMatches.push(...hm);
      if (!hm.length) continue;
      const gf = mean(hm.map((m) => m.gf));
      const ga = mean(hm.map((m) => m.ga));
      const ycf = mean(hm.map((m) => m.ycf));
      const yca = mean(hm.map((m) => m.yca));
      teamRows.push({
        id: tid,
        name: st.name,
        short: st.short,
        slug: lg.slug,
        rank: st.rank,
        n: hm.length,
        gf,
        ga,
        total_goals: gf + ga,
        ycf,
        yca,
        total_yc: ycf + yca,
      });
    }

    const lgGf = mean(allHomeMatches.map((m) => m.gf));
    const lgGa = mean(allHomeMatches.map((m) => m.ga));
    const lgYcf = mean(allHomeMatches.map((m) => m.ycf));
    const lgYca = mean(allHomeMatches.map((m) => m.yca));

    teamRows.sort((a, b) => b[STATE.homeSort] - a[STATE.homeSort]);

    setStateBox("home-state", {});
    resultsEl.innerHTML = `
      <section class="home-kpi-grid reveal">
        <div class="kpi-box">
          <div class="kpi-label">میانگین گل زده میزبان</div>
          <div class="kpi-value num" style="color:var(--accent)">${fmt(lgGf)}</div>
          <div class="kpi-sub">کل ${fmtInt(allHomeMatches.length)} بازی لیگ</div>
        </div>
        <div class="kpi-box">
          <div class="kpi-label">میانگین گل خورده میزبان</div>
          <div class="kpi-value num">${fmt(lgGa)}</div>
          <div class="kpi-sub">گل تیم مهمان</div>
        </div>
        <div class="kpi-box">
          <div class="kpi-label">میانگین کل گل بازی</div>
          <div class="kpi-value num" style="color:var(--secondary)">${fmt(lgGf + lgGa)}</div>
          <div class="kpi-sub">مجموع دو تیم</div>
        </div>
        <div class="kpi-box">
          <div class="kpi-label">کارت زرد میزبان</div>
          <div class="kpi-value num">${fmt(lgYcf)}</div>
          <div class="kpi-sub">در هر بازی خانگی</div>
        </div>
        <div class="kpi-box">
          <div class="kpi-label">کارت زرد مهمان</div>
          <div class="kpi-value num">${fmt(lgYca)}</div>
          <div class="kpi-sub">در هر بازی خانگی</div>
        </div>
        <div class="kpi-box">
          <div class="kpi-label">مجموع کارت زرد بازی</div>
          <div class="kpi-value num" style="color:var(--secondary)">${fmt(lgYcf + lgYca)}</div>
          <div class="kpi-sub">میانگین کل مسابقه</div>
        </div>
      </section>

      <div class="charts-grid-equal reveal reveal-d1">
        <section class="card">
          <div class="card-head">
            <h3 class="card-title">میانگین گل زده و خورده در بازی‌های خانگی (۱۰ تیم اول)</h3>
            <span class="card-note">${escapeHtml(lg.name_fa)}</span>
          </div>
          <div class="chart-stage"><canvas id="chart-home-goals"></canvas></div>
        </section>

        <section class="card">
          <div class="card-head">
            <h3 class="card-title">میانگین کارت زرد میزبان و مهمان (۱۰ تیم پرکارت‌ترین)</h3>
            <span class="card-note">${escapeHtml(lg.name_fa)}</span>
          </div>
          <div class="chart-stage"><canvas id="chart-home-cards"></canvas></div>
        </section>
      </div>

      <section class="card reveal reveal-d2">
        <div class="card-head">
          <h3 class="card-title">جدول کامل بازی‌های خانگی ${escapeHtml(lg.name_fa)} (گل و کارت زرد)</h3>
          <span class="card-note">فصل ${escapeHtml(lg.season)} | کلیک روی نام تیم برای تحلیل باشگاه</span>
        </div>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>تیم میزبان</th>
                <th>بازی خانگی</th>
                <th>گل زده/بازی</th>
                <th>گل خورده/بازی</th>
                <th>کل گل/بازی</th>
                <th>کارت زرد میزبان</th>
                <th>کارت زرد مهمان</th>
                <th>کل کارت زرد</th>
              </tr>
            </thead>
            <tbody>
              ${teamRows
                .map(
                  (r, i) => `
                <tr>
                  <td class="td-num">${fmtInt(i + 1)}</td>
                  <td><button type="button" class="row-link-btn" data-jump-team="${escapeHtml(r.id)}" data-jump-slug="${escapeHtml(r.slug)}">${escapeHtml(r.name)}</button></td>
                  <td class="td-num">${fmtInt(r.n)}</td>
                  <td class="td-num td-strong">${fmt(r.gf)}</td>
                  <td class="td-num">${fmt(r.ga)}</td>
                  <td class="td-num">${fmt(r.total_goals)}</td>
                  <td class="td-num">${fmt(r.ycf)}</td>
                  <td class="td-num">${fmt(r.yca)}</td>
                  <td class="td-num td-strong">${fmt(r.total_yc)}</td>
                </tr>`
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </section>
    `;
    resultsEl.hidden = false;

    const c = getThemeColors();
    const topGoals = [...teamRows].sort((a, b) => b.total_goals - a.total_goals).slice(0, 10);
    const topCards = [...teamRows].sort((a, b) => b.total_yc - a.total_yc).slice(0, 10);

    destroyChart("homeGoals");
    STATE.charts.homeGoals = new Chart(document.getElementById("chart-home-goals"), {
      type: "bar",
      data: {
        labels: topGoals.map((r) => r.short),
        datasets: [
          { label: "گل زده میزبان", data: topGoals.map((r) => Number(r.gf.toFixed(2))), backgroundColor: c.accent, borderRadius: 5 },
          { label: "گل خورده میزبان", data: topGoals.map((r) => Number(r.ga.toFixed(2))), backgroundColor: c.secondary, borderRadius: 5 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 750, easing: "easeOutQuart" },
        plugins: {
          legend: { labels: { color: c.ink, font: { family: "Vazirmatn" } } },
          tooltip: { rtl: true, titleFont: { family: "Vazirmatn" }, bodyFont: { family: "Vazirmatn" } },
        },
        scales: {
          x: { stacked: true, ticks: { color: c.ink, font: { family: "Vazirmatn", size: 11 } }, grid: { display: false } },
          y: { stacked: true, beginAtZero: true, ticks: { color: c.muted, font: { family: "Vazirmatn" } }, grid: { color: c.grid } },
        },
      },
    });

    destroyChart("homeCards");
    STATE.charts.homeCards = new Chart(document.getElementById("chart-home-cards"), {
      type: "bar",
      data: {
        labels: topCards.map((r) => r.short),
        datasets: [
          { label: "کارت زرد میزبان", data: topCards.map((r) => Number(r.ycf.toFixed(2))), backgroundColor: c.secondary, borderRadius: 5 },
          { label: "کارت زرد مهمان", data: topCards.map((r) => Number(r.yca.toFixed(2))), backgroundColor: c.accent, borderRadius: 5 },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 750, easing: "easeOutQuart" },
        plugins: {
          legend: { labels: { color: c.ink, font: { family: "Vazirmatn" } } },
          tooltip: { rtl: true, titleFont: { family: "Vazirmatn" }, bodyFont: { family: "Vazirmatn" } },
        },
        scales: {
          x: { stacked: true, ticks: { color: c.ink, font: { family: "Vazirmatn", size: 11 } }, grid: { display: false } },
          y: { stacked: true, beginAtZero: true, ticks: { color: c.muted, font: { family: "Vazirmatn" } }, grid: { color: c.grid } },
        },
      },
    });
  } catch (err) {
    setStateBox("home-state", {
      type: "error",
      title: "خطا در بارگذاری آمار بازی‌های خانگی",
      message: err.message,
      actionLabel: "تلاش مجدد",
      onAction: () => renderHomeTab(),
    });
  }
}

/* ---------- Live ESPN Browser Refresh ---------- */
async function liveRefreshCurrent() {
  const btn = document.getElementById("btn-live-refresh");
  btn.disabled = true;
  btn.classList.add("is-spinning");

  try {
    const slug =
      STATE.activeTab === "player" && STATE.currentPlayer
        ? STATE.currentPlayer.slug
        : STATE.activeTab === "team" && STATE.currentTeam
        ? STATE.currentTeam.slug
        : STATE.activeTab === "home"
        ? STATE.homeLeagueSlug
        : STATE.leagueSlug;

    const stRes = await fetch(`https://site.api.espn.com/apis/v2/sports/soccer/${slug}/standings?season=2026`);
    if (!stRes.ok) throw new Error(`ESPN HTTP ${stRes.status}`);
    const stJson = await stRes.json();

    const lg = await loadLeague(slug);
    const entries = stJson.children?.[0]?.standings?.entries || [];
    const nTeams = entries.length || lg.n_teams;
    const topCut = Math.ceil(nTeams / 3);
    const botStart = nTeams - topCut + 1;

    entries.forEach((entry, idx) => {
      const tid = String(entry.team.id);
      const smap = Object.fromEntries((entry.stats || []).map((s) => [s.name, s.value]));
      const rank = Math.round(Number(smap.rank || idx + 1));
      if (lg.standings[tid]) {
        lg.standings[tid].rank = rank;
        lg.standings[tid].tier = rank <= topCut ? "top" : rank >= botStart ? "bottom" : "mid";
        lg.standings[tid].gp = Math.round(Number(smap.gamesPlayed || lg.standings[tid].gp));
        lg.standings[tid].pts = Math.round(Number(smap.points || lg.standings[tid].pts));
      }
    });

    // If viewing a player or team, also refresh their club's latest completed & upcoming match live!
    const targetTid =
      STATE.activeTab === "player" && STATE.currentPlayer
        ? STATE.currentPlayer.team_id
        : STATE.activeTab === "team" && STATE.currentTeam
        ? STATE.currentTeam.id
        : null;

    let addedMatches = 0;
    if (targetTid) {
      const schRes = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/all/teams/${targetTid}/schedule?season=2026`);
      if (schRes.ok) {
        const schJson = await schRes.json();
        const existingIds = new Set((lg.teams[targetTid]?.matches || []).map((m) => m.id));
        const newEvents = (schJson.events || []).filter((ev) => {
          const comp = ev.competitions?.[0];
          const lgName = (ev.league?.abbreviation || "").toLowerCase();
          return comp?.status?.type?.completed && !existingIds.has(String(ev.id)) && !lgName.includes("friendly");
        });

        for (const ev of newEvents) {
          const eid = String(ev.id);
          const smRes = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/all/summary?event=${eid}`);
          if (!smRes.ok) continue;
          const sm = await smRes.json();
          const comp = sm.header?.competitions?.[0];
          const competitors = comp?.competitors || [];
          if (competitors.length !== 2) continue;
          const selfC = competitors.find((x) => String(x.team.id) === targetTid);
          const oppC = competitors.find((x) => String(x.team.id) !== targetTid);
          if (!selfC || !oppC) continue;
          const gf = Number(selfC.score || 0);
          const ga = Number(oppC.score || 0);
          const ha = selfC.homeAway === "home" ? "H" : "A";
          const oid = String(oppC.team.id);
          const isLg = ev.league?.slug === slug ? 1 : 0;
          const oppSt = isLg ? lg.standings[oid] : null;
          const oppShort = oppSt?.short || oppC.team.shortDisplayName || oppC.team.displayName;

          const boxMap = {};
          for (const bt of sm.boxscore?.teams || []) {
            const btid = String(bt.team.id);
            const bstat = Object.fromEntries((bt.statistics || []).map((s) => [s.name, Number(s.displayValue || 0)]));
            boxMap[btid] = { shots: Math.round(bstat.totalShots || 0), sot: Math.round(bstat.shotsOnTarget || 0), yc: Math.round(bstat.yellowCards || 0) };
          }

          lg.teams[targetTid].matches.unshift({
            id: eid,
            d: (ev.date || "").slice(0, 10),
            c: ev.league?.abbreviation || "Club",
            lg: isLg,
            ha,
            oid,
            opp: oppShort,
            ork: oppSt?.rank || null,
            ot: oppSt?.tier || null,
            gf,
            ga,
            sf: boxMap[targetTid]?.shots || 0,
            sotf: boxMap[targetTid]?.sot || 0,
            sa: boxMap[oid]?.shots || 0,
            sota: boxMap[oid]?.sot || 0,
            ycf: boxMap[targetTid]?.yc || 0,
            yca: boxMap[oid]?.yc || 0,
          });

          for (const tr of sm.rosters || []) {
            if (String(tr.team?.id) !== targetTid) continue;
            for (const pl of tr.roster || []) {
              if (pl.didNotPlay || (!pl.starter && !pl.subbedIn)) continue;
              const aid = String(pl.athlete?.id);
              const ps = Object.fromEntries((pl.stats || []).map((s) => [s.name, Number(s.value || 0)]));
              if (!lg.players[aid]) {
                lg.players[aid] = { id: aid, name: pl.athlete?.displayName || "", team_id: targetTid, team: lg.standings[targetTid]?.name || "", matches: [] };
              }
              lg.players[aid].matches.unshift({
                d: (ev.date || "").slice(0, 10),
                c: ev.league?.abbreviation || "Club",
                lg: isLg,
                ha,
                opp: oppShort,
                ork: oppSt?.rank || null,
                ot: oppSt?.tier || null,
                sc: `${gf}-${ga}`,
                xi: pl.starter ? 1 : 0,
                s: Math.round(ps.totalShots || 0),
                sot: Math.round(ps.shotsOnTarget || 0),
                g: Math.round(ps.totalGoals || 0),
                yc: Math.round(ps.yellowCards || 0),
              });
            }
          }
          addedMatches++;
        }
      }
    }

    await rerenderActiveTab();
    showFeedback(
      addedMatches > 0
        ? `به‌روزرسانی زنده انجام شد: جدول لیگ و ${fmtInt(addedMatches)} مسابقه جدید از ESPN دریافت شد.`
        : "جدول لیگ به‌صورت زنده از ESPN به‌روز شد (مسابقه تمام‌شده جدیدتری نسبت به آخرین اسنپ‌شات ثبت نشده بود)."
    );
  } catch (err) {
    showFeedback(`دریافت زنده از ESPN ناموفق بود (${err.message}). اگر داخل ایران هستید برای دریافت زنده باید VPN روشن باشد؛ آمار روزانه همچنان در دسترس است.`, true);
  } finally {
    btn.disabled = false;
    btn.classList.remove("is-spinning");
  }
}

/* ---------- Navigation & Theme ---------- */
async function switchTab(tabName) {
  STATE.activeTab = tabName;
  document.querySelectorAll("[data-tab]").forEach((btn) => {
    const active = btn.dataset.tab === tabName;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    const active = panel.id === `panel-${tabName}`;
    panel.classList.toggle("is-active", active);
    panel.hidden = !active;
  });
  await rerenderActiveTab();
}

async function rerenderActiveTab() {
  if (STATE.activeTab === "player" && STATE.currentPlayer) {
    await renderPlayerAnalysis(STATE.currentPlayer, STATE.comparePlayer);
  } else if (STATE.activeTab === "team") {
    const t = STATE.currentTeam || searchTeams("Barcelona", 1)[0];
    if (t) {
      document.getElementById("team-input").value = t.name;
      await renderTeamAnalysis(t, Number(document.getElementById("team-min-games").value));
    }
  } else if (STATE.activeTab === "league") {
    await renderLeagueTab();
  } else if (STATE.activeTab === "home") {
    await renderHomeTab();
  }
}

function initTheme() {
  const saved = localStorage.getItem("radar_theme");
  const initial = saved === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", initial);
  const btn = document.getElementById("btn-theme");
  btn.setAttribute("aria-pressed", initial === "dark" ? "true" : "false");

  btn.addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("radar_theme", next);
    btn.setAttribute("aria-pressed", next === "dark" ? "true" : "false");
    rerenderActiveTab();
  });
}

/* ---------- Bootstrap ---------- */
async function init() {
  initTheme();

  // Tab switchers (desktop + mobile)
  document.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  // Live refresh button
  document.getElementById("btn-live-refresh").addEventListener("click", liveRefreshCurrent);

  // Delegated click handlers for jump-to-player & jump-to-team links inside tables
  document.getElementById("main-content").addEventListener("click", (e) => {
    const pBtn = e.target.closest("[data-jump-player]");
    if (pBtn && STATE.index) {
      const found = STATE.index.players.find((x) => x.id === pBtn.dataset.jumpPlayer && x.slug === pBtn.dataset.jumpSlug);
      if (found) {
        document.getElementById("player-input").value = found.name;
        document.getElementById("player-compare-input").value = "";
        STATE.comparePlayer = null;
        STATE.currentPlayer = found;
        switchTab("player");
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      return;
    }
    const tBtn = e.target.closest("[data-jump-team]");
    if (tBtn && STATE.index) {
      const found = STATE.index.teams.find((x) => x.id === tBtn.dataset.jumpTeam && x.slug === tBtn.dataset.jumpSlug);
      if (found) {
        document.getElementById("team-input").value = found.name;
        STATE.currentTeam = found;
        switchTab("team");
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    }
  });

  // Player Search Form & Quick Picks
  attachAutocomplete(
    "player-input",
    "player-suggestions",
    searchPlayers,
    (p) => ({ main: p.name, meta: `${p.team} (${fmtInt(p.sot)} SoT)` }),
    (p) => {
      document.getElementById("player-input").value = p.name;
      const cmpVal = document.getElementById("player-compare-input").value.trim();
      const cmp = cmpVal ? searchPlayers(cmpVal, 1)[0] : null;
      renderPlayerAnalysis(p, cmp);
    }
  );

  attachAutocomplete(
    "player-compare-input",
    "player-compare-suggestions",
    searchPlayers,
    (p) => ({ main: p.name, meta: `${p.team} (${fmtInt(p.sot)} SoT)` }),
    (p) => {
      document.getElementById("player-compare-input").value = p.name;
      if (STATE.currentPlayer) renderPlayerAnalysis(STATE.currentPlayer, p);
    }
  );

  document.getElementById("player-search-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = document.getElementById("player-input").value.trim();
    const cmpQ = document.getElementById("player-compare-input").value.trim();
    const matches = searchPlayers(q, 1);
    if (!matches.length) {
      setStateBox("player-state", {
        type: "empty",
        title: `بازیکنی با نام «${q}» پیدا نشد`,
        message: "نام بازیکن را به انگلیسی (مثلاً Lamine Yamal یا Julian Alvarez) یا از دکمه‌های دسترسی سریع انتخاب کنید.",
      });
      document.getElementById("player-results").hidden = true;
      return;
    }
    const cmp = cmpQ ? searchPlayers(cmpQ, 1)[0] || null : null;
    document.getElementById("player-input").value = matches[0].name;
    if (cmp) document.getElementById("player-compare-input").value = cmp.name;
    renderPlayerAnalysis(matches[0], cmp);
  });

  document.querySelectorAll("[data-quick-player]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const p = searchPlayers(btn.dataset.quickPlayer, 1)[0];
      if (!p) return;
      document.getElementById("player-input").value = p.name;
      document.getElementById("player-compare-input").value = "";
      renderPlayerAnalysis(p, null);
    });
  });

  // Team Search Form & Quick Picks
  attachAutocomplete(
    "team-input",
    "team-suggestions",
    searchTeams,
    (t) => ({ main: t.name, meta: `رتبه #${fmtInt(t.rank)}` }),
    (t) => {
      document.getElementById("team-input").value = t.name;
      renderTeamAnalysis(t, Number(document.getElementById("team-min-games").value));
    }
  );

  document.getElementById("team-search-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = document.getElementById("team-input").value.trim();
    const found = searchTeams(q, 1)[0];
    if (!found) {
      setStateBox("team-state", {
        type: "empty",
        title: `باشگاهی با نام «${q}» پیدا نشد`,
        message: "نام یکی از باشگاه‌های ۵ لیگ معتبر اروپا (مثلاً Barcelona یا Arsenal) را وارد کنید.",
      });
      document.getElementById("team-results").hidden = true;
      return;
    }
    document.getElementById("team-input").value = found.name;
    renderTeamAnalysis(found, Number(document.getElementById("team-min-games").value));
  });

  document.getElementById("team-min-games").addEventListener("change", () => {
    if (STATE.currentTeam) {
      renderTeamAnalysis(STATE.currentTeam, Number(document.getElementById("team-min-games").value));
    }
  });

  document.querySelectorAll("[data-quick-team]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const t = searchTeams(btn.dataset.quickTeam, 1)[0];
      if (!t) return;
      document.getElementById("team-input").value = t.name;
      renderTeamAnalysis(t, Number(document.getElementById("team-min-games").value));
    });
  });

  // League Top 10 controls
  document.getElementById("league-select").addEventListener("change", (e) => {
    STATE.leagueSlug = e.target.value;
    renderLeagueTab();
  });
  document.getElementById("league-sort").addEventListener("change", (e) => {
    STATE.leagueSort = e.target.value;
    renderLeagueTab();
  });
  document.querySelectorAll("[data-league-window]").forEach((btn) => {
    btn.addEventListener("click", () => {
      STATE.leagueWindow = Number(btn.dataset.leagueWindow);
      document.querySelectorAll("[data-league-window]").forEach((b) => {
        const active = b === btn;
        b.classList.toggle("is-active", active);
        b.setAttribute("aria-pressed", active ? "true" : "false");
      });
      renderLeagueTab();
    });
  });

  // Home Goals & Yellow Cards controls
  document.getElementById("home-league-select").addEventListener("change", (e) => {
    STATE.homeLeagueSlug = e.target.value;
    renderHomeTab();
  });
  document.querySelectorAll("[data-home-sort]").forEach((btn) => {
    btn.addEventListener("click", () => {
      STATE.homeSort = btn.dataset.homeSort;
      document.querySelectorAll("[data-home-sort]").forEach((b) => {
        const active = b === btn;
        b.classList.toggle("is-active", active);
        b.setAttribute("aria-pressed", active ? "true" : "false");
      });
      renderHomeTab();
    });
  });

  // Load initial index + default player (Lamine Yamal)
  setStateBox("player-state", {
    type: "loading",
    title: "در حال آماده‌سازی داده‌های ۵ لیگ معتبر اروپا",
    message: "بارگذاری شاخص بازیکنان و باشگاه‌ها...",
  });

  try {
    await loadIndex();
    const defaultPlayer = searchPlayers("Lamine Yamal", 1)[0] || STATE.index.players[0];
    if (defaultPlayer) {
      document.getElementById("player-input").value = defaultPlayer.name;
      await renderPlayerAnalysis(defaultPlayer, null);
    }
  } catch (err) {
    setStateBox("player-state", {
      type: "error",
      title: "عدم دسترسی به فایل‌های داده",
      message: `فایل data/index.json بارگذاری نشد (${err.message}). اگر فایل را مستقیم با file:// باز کرده‌اید، از طریق سرور محلی یا GitHub Pages اجرا کنید.`,
      actionLabel: "تلاش مجدد",
      onAction: () => init(),
    });
  }
}

document.addEventListener("DOMContentLoaded", init);
