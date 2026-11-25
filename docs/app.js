/* ==========================================================================
   Radar Shot v2.0 — Complete Football Analytics Engine
   Static Daily JSON (5 Top European Leagues) + Live ESPN CORS Refresh
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

const ALL_LEAGUE_SLUGS = ["esp.1", "eng.1", "ita.1", "fra.1", "ger.1"];

const STATE = {
  index: null,
  leagues: {},
  activeTab: "player",
  currentPlayer: null,
  comparePlayer: null,
  currentTeam: null,
  matchupLeague: "esp.1",
  matchupHomeId: null,
  matchupAwayId: null,
  leagueSlug: "esp.1",
  leagueMode: "sot",
  leagueWindow: 10,
  leagueSort: "sot_mean",
  homeLeagueSlug: "esp.1",
  homeScope: "H",
  homeCat: "goals",
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
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function sum(arr) {
  return arr.reduce((a, b) => a + b, 0);
}

function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function pct(num, den) {
  return den > 0 ? (num / den) * 100 : 0;
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
    return new Intl.DateTimeFormat("fa-IR", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(iso));
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

/* ---------- Statistical Summaries ---------- */
function summarizePlayerMatches(matches) {
  const n = matches.length;
  const shots = matches.map((m) => m.s || 0);
  const sot = matches.map((m) => m.sot || 0);
  const mins = matches.map((m) => m.m || 90);
  const sSum = sum(shots);
  const sotSum = sum(sot);
  const minSum = sum(mins);
  const gSum = sum(matches.map((m) => m.g || 0));
  const aSum = sum(matches.map((m) => m.a || 0));
  const fcSum = sum(matches.map((m) => m.fc || 0));
  const fsSum = sum(matches.map((m) => m.fs || 0));
  const ycSum = sum(matches.map((m) => m.yc || 0));
  const svSum = sum(matches.map((m) => m.sv || 0));
  const sfSum = sum(matches.map((m) => m.sf || 0));
  const gcSum = sum(matches.map((m) => m.gc || 0));
  const p90 = (v) => (minSum > 0 ? (v / minSum) * 90 : 0);

  return {
    n,
    sSum,
    sMean: mean(shots),
    sMed: median(shots),
    sotSum,
    sotMean: mean(sot),
    sotMed: median(sot),
    sotRate: pct(sotSum, sSum),
    minSum,
    minMean: mean(mins),
    sPer90: p90(sSum),
    sotPer90: p90(sotSum),
    gaPer90: p90(gSum + aSum),
    fsPer90: p90(fsSum),
    fcPer90: p90(fcSum),
    gSum,
    aSum,
    fcSum,
    fsSum,
    fcMean: n ? fcSum / n : 0,
    fsMean: n ? fsSum / n : 0,
    ycSum,
    svSum,
    svMean: n ? svSum / n : 0,
    sfSum,
    gcSum,
    savePct: pct(svSum, svSum + gcSum),
    hitSot1: matches.filter((m) => (m.sot || 0) >= 1).length,
    hitSot2: matches.filter((m) => (m.sot || 0) >= 2).length,
    hitS2: matches.filter((m) => (m.s || 0) >= 2).length,
    hitS3: matches.filter((m) => (m.s || 0) >= 3).length,
    hitFs2: matches.filter((m) => (m.fs || 0) >= 2).length,
    hitFc2: matches.filter((m) => (m.fc || 0) >= 2).length,
  };
}

function summarizeTeamMatches(matches) {
  const n = matches.length;
  const sf = matches.map((m) => m.sf || 0);
  const sotf = matches.map((m) => m.sotf || 0);
  const sa = matches.map((m) => m.sa || 0);
  const sota = matches.map((m) => m.sota || 0);
  const gf = matches.map((m) => m.gf || 0);
  const ga = matches.map((m) => m.ga || 0);
  const cf = matches.map((m) => m.cf || 0);
  const ca = matches.map((m) => m.ca || 0);
  const ycf = matches.map((m) => m.ycf || 0);
  const yca = matches.map((m) => m.yca || 0);
  const sfSum = sum(sf);
  const sotfSum = sum(sotf);

  const over25 = matches.filter((m) => (m.gf || 0) + (m.ga || 0) >= 3).length;
  const btts = matches.filter((m) => (m.gf || 0) >= 1 && (m.ga || 0) >= 1).length;
  const cs = matches.filter((m) => (m.ga || 0) === 0).length;
  const fts = matches.filter((m) => (m.gf || 0) === 0).length;

  return {
    n,
    sSum: sfSum,
    sMean: mean(sf),
    sMed: median(sf),
    sotSum: sotfSum,
    sotMean: mean(sotf),
    sotMed: median(sotf),
    sotRate: pct(sotfSum, sfSum),
    saMean: mean(sa),
    saMed: median(sa),
    sotaMean: mean(sota),
    sotaMed: median(sota),
    gfMean: mean(gf),
    gaMean: mean(ga),
    totalGoalsMean: mean(gf) + mean(ga),
    over25Pct: pct(over25, n),
    bttsPct: pct(btts, n),
    csPct: pct(cs, n),
    ftsPct: pct(fts, n),
    cfMean: mean(cf),
    cfMed: median(cf),
    caMean: mean(ca),
    totalCorMean: mean(cf) + mean(ca),
    ycfMean: mean(ycf),
    ycaMean: mean(yca),
    totalYcMean: mean(ycf) + mean(yca),
    ffMean: mean(matches.map((m) => m.ff || 0)),
    faMean: mean(matches.map((m) => m.fa || 0)),
    offMean: mean(matches.map((m) => m.off || 0)),
    ofaMean: mean(matches.map((m) => m.ofa || 0)),
    posMean: mean(matches.map((m) => m.pos || 50)),
    ppMean: mean(matches.map((m) => { const v = m.pp || 0; return v > 0 && v <= 1 ? v * 100 : v; })),
    crMean: mean(matches.map((m) => m.cr || 0)),
    svMean: mean(matches.map((m) => m.sv || 0)),
    tkMean: mean(matches.map((m) => m.tk || 0)),
    itcMean: mean(matches.map((m) => m.itc || 0)),
    g1f: sum(matches.map((m) => m.g1f || 0)),
    g2f: sum(matches.map((m) => m.g2f || 0)),
    g75f: sum(matches.map((m) => m.g75f || 0)),
    g1a: sum(matches.map((m) => m.g1a || 0)),
    g2a: sum(matches.map((m) => m.g2a || 0)),
    g75a: sum(matches.map((m) => m.g75a || 0)),
    yc1: sum(matches.map((m) => m.yc1 || 0)),
    yc2: sum(matches.map((m) => m.yc2 || 0)),
    yc75: sum(matches.map((m) => m.yc75 || 0)),
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

/* ---------- Export Helpers (PNG & CSV) ---------- */
function exportChartPng(chartKey, fileBase) {
  const chart = STATE.charts[chartKey];
  if (!chart) return;
  const src = chart.canvas;
  const tmp = document.createElement("canvas");
  tmp.width = src.width;
  tmp.height = src.height;
  const ctx = tmp.getContext("2d");
  ctx.fillStyle = getThemeColors().surface;
  ctx.fillRect(0, 0, tmp.width, tmp.height);
  ctx.drawImage(src, 0, 0);
  const a = document.createElement("a");
  a.href = tmp.toDataURL("image/png");
  a.download = `${fileBase}.png`;
  a.click();
  showFeedback(`تصویر نمودار با نام ${fileBase}.png ذخیره شد.`);
}

function exportTableCsv(tableId, fileBase) {
  const table = document.getElementById(tableId);
  if (!table) return;
  const rows = [];
  table.querySelectorAll("tr").forEach((tr) => {
    const cols = [...tr.querySelectorAll("th, td")].map((cell) => {
      const txt = cell.innerText.replace(/\s+/g, " ").trim().replace(/"/g, '""');
      return `"${txt}"`;
    });
    if (cols.length) rows.push(cols.join(","));
  });
  const blob = new Blob(["\uFEFF" + rows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${fileBase}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  showFeedback(`فایل اکسل/CSV با نام ${fileBase}.csv دانلود شد.`);
}

function exportBtnPng(chartKey, fileBase) {
  return `<button type="button" class="btn-export" data-export-png="${escapeHtml(chartKey)}" data-export-name="${escapeHtml(fileBase)}">ذخیره PNG</button>`;
}

function exportBtnCsv(tableId, fileBase) {
  return `<button type="button" class="btn-export" data-export-csv="${escapeHtml(tableId)}" data-export-name="${escapeHtml(fileBase)}">دانلود CSV</button>`;
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
  statusEl.textContent = `آخرین به‌روزرسانی: ${formatDateFa(STATE.index.updated_at)} | فصل ${STATE.index.season}`;
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

async function loadAllLeagues() {
  await Promise.all(ALL_LEAGUE_SLUGS.map((s) => loadLeague(s)));
}

/* ---------- Search & Autocomplete ---------- */
function searchPlayers(query, limit = 8) {
  if (!STATE.index) return [];
  const q = normalizeText(query);
  if (!q) return STATE.index.players.slice(0, limit);
  const tokens = q.split(" ");
  const scored = [];
  for (const p of STATE.index.players) {
    const pn = normalizeText(p.name);
    const tn = normalizeText(p.team);
    if (pn === q) scored.push([0, p]);
    else if (tokens.every((t) => pn.includes(t))) scored.push([1, p]);
    else if (tokens.every((t) => pn.includes(t) || tn.includes(t))) scored.push([2, p]);
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
    if (tn === q || sn === q) scored.push([0, t]);
    else if (tokens.every((tok) => tn.includes(tok) || sn.includes(tok))) scored.push([1, t]);
  }
  scored.sort((a, b) => a[0] - b[0] || a[1].rank - b[1].rank);
  return scored.slice(0, limit).map((x) => x[1]);
}

function attachAutocomplete(inputId, listId, searchFn, renderItem, onSelect) {
  const input = document.getElementById(inputId);
  const list = document.getElementById(listId);
  let activeIdx = -1;
  let currentItems = [];

  const close = () => {
    list.hidden = true;
    activeIdx = -1;
  };

  const render = (items) => {
    currentItems = items;
    if (!items.length) return close();
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
  };

  input.addEventListener("input", () => {
    const val = input.value.trim();
    if (!val) return close();
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

/* ---------- Next Opponent Conceded Stats Helper ---------- */
async function resolveNextOpponentInfo(teamId, leagueData) {
  const nf = leagueData.next_fixtures?.[teamId];
  const nextFix = nf?.next_official || nf?.next_league;
  if (!nextFix) return null;

  let oppMatches = leagueData.teams?.[nextFix.oid]?.matches || null;
  if (!oppMatches && STATE.index) {
    const oppEntry = STATE.index.teams.find((t) => t.id === nextFix.oid);
    if (oppEntry) {
      try {
        const oppLg = await loadLeague(oppEntry.slug);
        oppMatches = oppLg.teams?.[nextFix.oid]?.matches || null;
      } catch {
        oppMatches = null;
      }
    }
  }

  let activeFix = nextFix;
  let fallbackNote = "";
  if (!oppMatches && nf?.next_league && nf.next_league.oid !== nextFix.oid) {
    fallbackNote = `بازی رسمی بعدی مقابل ${nextFix.opp_full} (${nextFix.comp}) خارج از ۵ لیگ اصلی است؛ آمار شوت‌پذیری حریف بعدی در لیگ (${nf.next_league.opp_full}) نمایش داده می‌شود.`;
    activeFix = nf.next_league;
    oppMatches = leagueData.teams?.[activeFix.oid]?.matches || null;
  }

  return { activeFix, oppMatches, fallbackNote };
}

async function buildNextOpponentCardHtml(teamId, leagueData, playerLeagueMatches = null) {
  const info = await resolveNextOpponentInfo(teamId, leagueData);
  if (!info) {
    return `
      <section class="card reveal reveal-d1">
        <div class="card-head">
          <h3 class="card-title">حریف بعدی و آمار شوت‌پذیری</h3>
          <span class="card-note">مسابقه برنامه‌ریزی‌شده‌ای در تقویم فعلی ثبت نشده است</span>
        </div>
      </section>`;
  }

  const { activeFix, oppMatches, fallbackNote } = info;
  const venueLabel = activeFix.ha === "H" ? "بازی خانگی" : "بازی خارج از خانه";
  const oppVenue = activeFix.ha === "H" ? "A" : "H";
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
  const venueStats = summarizeTeamMatches(oppMatches.filter((m) => m.ha === oppVenue));

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
          <div class="kpi-sub">میانگین کل شوت / SoT خورده | کرنر خورده: ${fmt(allStats.caMean)}</div>
        </div>
      </div>
    </section>`;
}

/* ==========================================================================
   TAB 1: PLAYER ANALYSIS (Upgraded: Hit-Rates + Per-90 + XI/Sub + H/A + Fouls)
   ========================================================================== */
function computePlayerRadarValues(player) {
  const all = player.matches;
  const w10 = summarizePlayerMatches(all.slice(0, 10));
  const w5 = summarizePlayerMatches(all.slice(0, 5));
  const topTier = summarizePlayerMatches(all.filter((m) => m.lg === 1 && m.ot === "top"));
  const cap = (val, max) => Math.min(100, Math.round((val / max) * 100));
  return {
    scaled: [
      cap(w10.sPer90, 5.5),
      cap(w10.sotPer90, 2.2),
      cap(pct(w10.hitSot1, w10.n), 100),
      cap(w10.sotRate, 70),
      cap(w5.sotMean, 2.2),
      cap(topTier.n ? topTier.sotMean : w10.sotMean, 2.0),
    ],
    raw: [
      `${fmt(w10.sPer90)} شوت در ۹۰ دقیقه`,
      `${fmt(w10.sotPer90)} SoT در ۹۰ دقیقه`,
      `${fmt(pct(w10.hitSot1, w10.n), 0)}% (${fmtInt(w10.hitSot1)} از ${fmtInt(w10.n)})`,
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
    message: "در حال محاسبه Hit-Rate، آمار ۹۰ دقیقه‌ای، تفکیک رده جدول و شوت‌پذیری حریف بعدی...",
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
    if (compareMeta) {
      const cmpLg = await loadLeague(compareMeta.slug);
      compareObj = cmpLg.players[compareMeta.id] || null;
    }

    STATE.currentPlayer = playerMeta;
    STATE.comparePlayer = compareMeta;

    const teamSt = leagueData.standings[player.team_id];
    const teamRank = teamSt?.rank || 0;
    const allMatches = player.matches;
    const last10 = allMatches.slice(0, 10);
    const last5 = allMatches.slice(0, 5);
    const wAll = summarizePlayerMatches(allMatches);
    const w10 = summarizePlayerMatches(last10);
    const w5 = summarizePlayerMatches(last5);
    const wXI = summarizePlayerMatches(allMatches.filter((m) => m.xi === 1));
    const wSub = summarizePlayerMatches(allMatches.filter((m) => m.xi === 0));
    const wHome = summarizePlayerMatches(allMatches.filter((m) => m.ha === "H"));
    const wAway = summarizePlayerMatches(allMatches.filter((m) => m.ha === "A"));
    const leagueMatches = allMatches.filter((m) => m.lg === 1);

    const tierGroups = [
      { key: "top", label: tierLabelFa("top", leagueData), list: leagueMatches.filter((m) => m.ot === "top") },
      { key: "mid", label: tierLabelFa("mid", leagueData), list: leagueMatches.filter((m) => m.ot === "mid") },
      { key: "bottom", label: tierLabelFa("bottom", leagueData), list: leagueMatches.filter((m) => m.ot === "bottom") },
      { key: "higher", label: "تیم‌های بالاتر در جدول", list: leagueMatches.filter((m) => m.ork && teamRank && m.ork < teamRank) },
      { key: "lower", label: "تیم‌های پایین‌تر در جدول", list: leagueMatches.filter((m) => m.ork && teamRank && m.ork > teamRank) },
    ].map((g) => ({ ...g, stats: summarizePlayerMatches(g.list) }));

    const matchupHtml = await buildNextOpponentCardHtml(player.team_id, leagueData, leagueMatches);
    const pSlug = normalizeText(player.name).replace(/ /g, "_");

    const hitCards = [
      { label: "حداقل ۱ شوت در چارچوب (1+ SoT)", h10: w10.hitSot1, h5: w5.hitSot1, sec: false },
      { label: "حداقل ۲ شوت در چارچوب (2+ SoT)", h10: w10.hitSot2, h5: w5.hitSot2, sec: false },
      { label: "حداقل ۲ شوت کل (2+ Shots)", h10: w10.hitS2, h5: w5.hitS2, sec: true },
      { label: "حداقل ۳ شوت کل (3+ Shots)", h10: w10.hitS3, h5: w5.hitS3, sec: true },
    ];

    setStateBox("player-state", {});
    resultsEl.innerHTML = `
      <section class="profile-banner reveal">
        <div class="profile-identity">
          <h2>${escapeHtml(player.name)}${compareObj ? ` در مقایسه با ${escapeHtml(compareObj.name)}` : ""}</h2>
          <div class="profile-meta">
            <span class="meta-tag is-accent">${escapeHtml(player.team)}</span>
            <span class="meta-tag">${escapeHtml(leagueData.name_fa)}</span>
            <span class="meta-tag">رتبه باشگاه: #${fmtInt(teamRank)}</span>
            ${player.pos ? `<span class="meta-tag">پست: ${escapeHtml(player.pos)}</span>` : ""}
            <span class="meta-tag">${fmtInt(allMatches.length)} بازی رسمی (${fmtInt(wAll.minSum)} دقیقه)</span>
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
            <div class="kpi-sub">مجموع ${fmtInt(w10.sotSum)} SoT | در ۹۰ دقیقه: ${fmt(w10.sotPer90)}</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-label">۵ بازی اخیر (میانگین / میانه شوت)</div>
            <div class="kpi-value num">${fmt(w5.sMean)} / ${fmt(w5.sMed, 1)}</div>
            <div class="kpi-sub">مجموع ${fmtInt(w5.sSum)} شوت | دقت ${fmt(w5.sotRate, 1)}%</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-label">۵ بازی اخیر (میانگین / میانه SoT)</div>
            <div class="kpi-value num" style="color:var(--secondary)">${fmt(w5.sotMean)} / ${fmt(w5.sotMed, 1)}</div>
            <div class="kpi-sub">مجموع ${fmtInt(w5.sotSum)} SoT | در ۹۰ دقیقه: ${fmt(w5.sotPer90)}</div>
          </div>
        </div>
      </section>

      ${matchupHtml}

      <section class="card reveal reveal-d1">
        <div class="card-head">
          <h3 class="card-title">نرخ تحقق شوت و شوت در چارچوب (Hit-Rate در ۱۰ و ۵ بازی اخیر)</h3>
          <span class="card-note">درصد بازی‌هایی که بازیکن به آستانه هدف رسیده است</span>
        </div>
        <div class="hit-grid">
          ${hitCards
            .map((hc) => {
              const p10 = pct(hc.h10, w10.n);
              const p5 = pct(hc.h5, w5.n);
              return `
                <div class="hit-card">
                  <div class="hit-top">
                    <span class="hit-title">${hc.label}</span>
                    <span class="hit-pct num" ${hc.sec ? 'style="color:var(--secondary)"' : ""}>${fmt(p10, 0)}%</span>
                  </div>
                  <div class="hit-bar"><div class="hit-fill ${hc.sec ? "is-secondary" : ""}" style="width:${Math.round(p10)}%"></div></div>
                  <div class="hit-sub">۱۰ بازی: ${fmtInt(hc.h10)} از ${fmtInt(w10.n)} | ۵ بازی آخر: <strong>${fmtInt(hc.h5)} از ${fmtInt(w5.n)} (${fmt(p5, 0)}%)</strong></div>
                </div>`;
            })
            .join("")}
        </div>
      </section>

      <section class="card reveal reveal-d2">
        <div class="card-head">
          <h3 class="card-title">تفکیک ۹۰ دقیقه‌ای (Per 90)، فیکس در برابر تعویضی، خانگی در برابر بیرون و خطاها</h3>
          <span class="card-note">مبتنی بر ${fmtInt(allMatches.length)} بازی رسمی فصل جاری</span>
        </div>
        <div class="splits-grid">
          <div class="split-card">
            <h4>آمار به ازای ۹۰ دقیقه (Per 90)</h4>
            <div class="split-row"><span>شوت در ۹۰ دقیقه</span><strong>${fmt(wAll.sPer90)}</strong></div>
            <div class="split-row"><span>SoT در ۹۰ دقیقه</span><strong style="color:var(--accent)">${fmt(wAll.sotPer90)}</strong></div>
            <div class="split-row"><span>گل + پاس گل در ۹۰ دقیقه</span><strong>${fmt(wAll.gaPer90)}</strong></div>
            <div class="split-row"><span>میانگین دقیقه بازی</span><strong>${fmt(wAll.minMean, 0)} دقیقه</strong></div>
          </div>
          <div class="split-card">
            <h4>فیکس (XI) در برابر تعویضی (Sub)</h4>
            <div class="split-row"><span>بازی فیکس (${fmtInt(wXI.n)}) شوت / SoT</span><strong>${fmt(wXI.sMean)} / ${fmt(wXI.sotMean)}</strong></div>
            <div class="split-row"><span>میانه SoT در بازی فیکس</span><strong>${fmt(wXI.sotMed, 1)}</strong></div>
            <div class="split-row"><span>بازی تعویضی (${fmtInt(wSub.n)}) شوت / SoT</span><strong>${wSub.n ? `${fmt(wSub.sMean)} / ${fmt(wSub.sotMean)}` : "ندارد"}</strong></div>
            <div class="split-row"><span>دقت SoT در فیکس</span><strong>${fmt(wXI.sotRate, 1)}%</strong></div>
          </div>
          <div class="split-card">
            <h4>خانگی در برابر خارج از خانه</h4>
            <div class="split-row"><span>خانگی (${fmtInt(wHome.n)}) شوت / SoT</span><strong>${fmt(wHome.sMean)} / ${fmt(wHome.sotMean)}</strong></div>
            <div class="split-row"><span>میانه SoT در خانه</span><strong>${fmt(wHome.sotMed, 1)}</strong></div>
            <div class="split-row"><span>بیرون خانه (${fmtInt(wAway.n)}) شوت / SoT</span><strong>${fmt(wAway.sMean)} / ${fmt(wAway.sotMean)}</strong></div>
            <div class="split-row"><span>میانه SoT در بیرون خانه</span><strong>${fmt(wAway.sotMed, 1)}</strong></div>
          </div>
          <div class="split-card">
            <h4>خطا، کارت زرد و مشارکت گل</h4>
            <div class="split-row"><span>گل / پاس گل فصل</span><strong>${fmtInt(wAll.gSum)} / ${fmtInt(wAll.aSum)}</strong></div>
            <div class="split-row"><span>خطای گرفته‌شده (میانگین)</span><strong>${fmt(wAll.fsMean)} (${fmtInt(wAll.fsSum)})</strong></div>
            <div class="split-row"><span>خطای مرتکب‌شده (میانگین)</span><strong>${fmt(wAll.fcMean)} (${fmtInt(wAll.fcSum)})</strong></div>
            <div class="split-row"><span>کارت زرد فصل</span><strong>${fmtInt(wAll.ycSum)}</strong></div>
          </div>
        </div>
      </section>

      <div class="charts-grid-2 reveal reveal-d2">
        <section class="card">
          <div class="card-head">
            <div>
              <h3 class="card-title">روند شوت و شوت در چارچوب در ${fmtInt(last10.length)} بازی اخیر</h3>
              <span class="card-note">خط چین: میانگین و میانه شوت در چارچوب</span>
            </div>
            <div class="card-actions">${exportBtnPng("playerTrend", `trend_${pSlug}`)}</div>
          </div>
          <div class="chart-stage"><canvas id="chart-player-trend"></canvas></div>
        </section>

        <section class="card">
          <div class="card-head">
            <div>
              <h3 class="card-title">نمودار راداری پروفایل شوت‌زنی</h3>
              <span class="card-note">${compareObj ? "مقایسه دو بازیکن (مقیاس ۰ تا ۱۰۰)" : "۶ شاخص کلیدی ۹۰ دقیقه‌ای و ثبات"}</span>
            </div>
            <div class="card-actions">${exportBtnPng("playerRadar", `radar_${pSlug}`)}</div>
          </div>
          <div class="chart-stage is-radar"><canvas id="chart-player-radar"></canvas></div>
        </section>
      </div>

      <section class="card reveal reveal-d3">
        <div class="card-head">
          <div>
            <h3 class="card-title">عملکرد مقابل یک‌سوم بالایی، میانی و پایینی جدول</h3>
            <span class="card-note">${fmtInt(leagueMatches.length)} بازی لیگ ${escapeHtml(leagueData.name_fa)}</span>
          </div>
          <div class="card-actions">${exportBtnPng("playerTiers", `tiers_${pSlug}`)}</div>
        </div>
        <div class="chart-stage"><canvas id="chart-player-tiers"></canvas></div>
      </section>

      <section class="card reveal reveal-d3">
        <div class="card-head">
          <div>
            <h3 class="card-title">جدول تفکیک رده حریف در جدول لیگ</h3>
            <span class="card-note">میانگین، میانه، نرخ دقت و Per 90</span>
          </div>
          <div class="card-actions">${exportBtnCsv("tbl-player-tiers", `tiers_${pSlug}`)}</div>
        </div>
        <div class="table-wrap">
          <table class="data-table" id="tbl-player-tiers">
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
                <th>SoT در ۹۰دقیقه</th>
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
                  <td class="td-num">${fmt(g.stats.sotPer90)}</td>
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
          <div>
            <h3 class="card-title">ریز ${fmtInt(last10.length)} بازی رسمی اخیر ${escapeHtml(player.name)}</h3>
            <span class="card-note">همراه با دقایق حضور، خطای گرفته‌شده، خطای مرتکب‌شده و کارت زرد</span>
          </div>
          <div class="card-actions">${exportBtnCsv("tbl-player-matches", `matches_${pSlug}`)}</div>
        </div>
        <div class="table-wrap">
          <table class="data-table" id="tbl-player-matches">
            <thead>
              <tr>
                <th>#</th>
                <th>تاریخ</th>
                <th>رقابت</th>
                <th>میزبان/مهمان</th>
                <th>حریف</th>
                <th>رده جدول</th>
                <th>نتیجه</th>
                <th>نقش / دقیقه</th>
                <th>شوت</th>
                <th>SoT</th>
                <th>گل/پاس</th>
                <th>خطا گ/م</th>
                <th>کارت</th>
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
                  <td class="td-num">${m.xi ? "ثابت" : "تعویض"} (${fmtInt(m.m || 90)}')</td>
                  <td class="td-num">${fmtInt(m.s)}</td>
                  <td class="td-num td-strong">${fmtInt(m.sot)}</td>
                  <td class="td-num">${fmtInt(m.g)} / ${fmtInt(m.a || 0)}</td>
                  <td class="td-num">${fmtInt(m.fs || 0)} / ${fmtInt(m.fc || 0)}</td>
                  <td class="td-num">${fmtInt(m.yc || 0)}</td>
                </tr>`
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </section>
    `;
    resultsEl.hidden = false;

    renderPlayerCharts(player, last10, w10, tierGroups.slice(0, 3), compareObj);
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

function renderPlayerCharts(player, last10, w10, tier3, compareObj) {
  const c = getThemeColors();
  const rev = [...last10].reverse();

  destroyChart("playerTrend");
  STATE.charts.playerTrend = new Chart(document.getElementById("chart-player-trend"), {
    type: "bar",
    data: {
      labels: rev.map((m) => `${m.opp} (${m.ha === "H" ? "خ" : "ب"})`),
      datasets: [
        { label: "کل شوت", data: rev.map((m) => m.s), backgroundColor: c.secondaryFill, borderColor: c.secondary, borderWidth: 1.8, borderRadius: 6, order: 3 },
        { label: "شوت در چارچوب (SoT)", data: rev.map((m) => m.sot), backgroundColor: c.accent, borderRadius: 6, order: 2 },
        { type: "line", label: `میانگین SoT (${fmt(w10.sotMean)})`, data: rev.map(() => Number(w10.sotMean.toFixed(2))), borderColor: c.ink, borderDash: [6, 4], borderWidth: 1.8, pointRadius: 0, order: 1 },
        { type: "line", label: `میانه SoT (${fmt(w10.sotMed, 1)})`, data: rev.map(() => Number(w10.sotMed.toFixed(2))), borderColor: c.accent, borderDash: [3, 3], borderWidth: 1.6, pointRadius: 0, order: 0 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 750, easing: "easeOutQuart" },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { labels: { color: c.ink, font: { family: "Vazirmatn", size: 12 } } },
        tooltip: { rtl: true, titleFont: { family: "Vazirmatn", weight: "bold" }, bodyFont: { family: "Vazirmatn" } },
      },
      scales: {
        x: { ticks: { color: c.muted, font: { family: "Vazirmatn", size: 11 } }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { stepSize: 1, color: c.muted, font: { family: "Vazirmatn" } }, grid: { color: c.grid } },
      },
    },
  });

  destroyChart("playerRadar");
  const r1 = computePlayerRadarValues(player);
  const radarDatasets = [
    { label: player.name, data: r1.scaled, rawLabels: r1.raw, backgroundColor: c.accentFill, borderColor: c.accent, borderWidth: 2.2, pointBackgroundColor: c.accent, pointRadius: 3.5 },
  ];
  if (compareObj) {
    const r2 = computePlayerRadarValues(compareObj);
    radarDatasets.push({ label: compareObj.name, data: r2.scaled, rawLabels: r2.raw, backgroundColor: c.secondaryFill, borderColor: c.secondary, borderWidth: 2.2, pointBackgroundColor: c.secondary, pointRadius: 3.5 });
  }

  STATE.charts.playerRadar = new Chart(document.getElementById("chart-player-radar"), {
    type: "radar",
    data: {
      labels: ["شوت در ۹۰دقیقه", "SoT در ۹۰دقیقه", "Hit-Rate (1+ SoT)", "نرخ دقت (SoT%)", "فرم ۵ بازی اخیر", "مقابل یک‌سوم بالایی"],
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
          bodyFont: { family: "Vazirmatn" },
          callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.dataset.rawLabels?.[ctx.dataIndex]} (${fmtInt(ctx.raw)}/۱۰۰)` },
        },
      },
      scales: {
        r: { min: 0, max: 100, ticks: { display: false, stepSize: 25 }, grid: { color: c.grid }, angleLines: { color: c.grid }, pointLabels: { color: c.ink, font: { family: "Vazirmatn", size: 11, weight: "600" } } },
      },
    },
  });

  destroyChart("playerTiers");
  STATE.charts.playerTiers = new Chart(document.getElementById("chart-player-tiers"), {
    type: "bar",
    data: {
      labels: tier3.map((g) => `${tierShortFa(g.key)} (${fmtInt(g.stats.n)})`),
      datasets: [
        { label: "میانگین کل شوت", data: tier3.map((g) => Number(g.stats.sMean.toFixed(2))), backgroundColor: c.secondary, borderRadius: 7 },
        { label: "میانگین شوت در چارچوب", data: tier3.map((g) => Number(g.stats.sotMean.toFixed(2))), backgroundColor: c.accent, borderRadius: 7 },
        { label: "میانه شوت در چارچوب", data: tier3.map((g) => Number(g.stats.sotMed.toFixed(2))), backgroundColor: c.accentFill, borderColor: c.accent, borderWidth: 1.8, borderRadius: 7 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 750, easing: "easeOutQuart" },
      plugins: { legend: { labels: { color: c.ink, font: { family: "Vazirmatn", size: 12 } } }, tooltip: { rtl: true, bodyFont: { family: "Vazirmatn" } } },
      scales: {
        x: { ticks: { color: c.ink, font: { family: "Vazirmatn", size: 11 } }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { color: c.muted, font: { family: "Vazirmatn" } }, grid: { color: c.grid } },
      },
    },
  });
}

/* ==========================================================================
   TAB 2: CLUB ANALYSIS (Upgraded: Non-Shot Tactical Profile + Timing Splits)
   ========================================================================== */
async function renderTeamAnalysis(teamMeta, minGames = 3) {
  const resultsEl = document.getElementById("team-results");
  resultsEl.hidden = true;
  setStateBox("team-state", {
    type: "loading",
    title: `در حال بارگذاری آمار باشگاه ${teamMeta.name}`,
    message: "محاسبه آمار شوت، کرنر، مالکیت، تایمینگ نیمه‌ها، حریف بعدی و ۱۰ بازیکن برتر...",
  });

  try {
    const leagueData = await loadLeague(teamMeta.slug);
    const tObj = leagueData.teams[teamMeta.id];
    const st = leagueData.standings[teamMeta.id];
    if (!tObj || !tObj.matches.length) {
      setStateBox("team-state", { type: "empty", title: "داده مسابقه‌ای یافت نشد", message: "باشگاه دیگری را انتخاب کنید." });
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

    const squadPlayers = Object.values(leagueData.players)
      .filter((p) => p.team_id === teamMeta.id && p.matches.length >= minGames)
      .map((p) => ({ id: p.id, name: p.name, slug: teamMeta.slug, team: p.team, ...summarizePlayerMatches(p.matches) }))
      .filter((p) => p.sSum > 0)
      .sort((a, b) => b.sotMean - a.sotMean || b.sSum - a.sSum)
      .slice(0, 10);

    const matchupHtml = await buildNextOpponentCardHtml(teamMeta.id, leagueData);
    const tSlug = normalizeText(st.name).replace(/ /g, "_");

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
            <div class="kpi-label">شوت‌پذیری (شوت / SoT خورده)</div>
            <div class="kpi-value num">${fmt(wSeason.saMean)} / ${fmt(wSeason.sotaMean)}</div>
            <div class="kpi-sub">۵ بازی اخیر SoT خورده: ${fmt(w5.sotaMean)}</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-label">کرنر زده / خورده در هر بازی</div>
            <div class="kpi-value num" style="color:var(--accent)">${fmt(wSeason.cfMean)} / ${fmt(wSeason.caMean)}</div>
            <div class="kpi-sub">مجموع کرنر بازی: ${fmt(wSeason.totalCorMean)}</div>
          </div>
        </div>
      </section>

      ${matchupHtml}

      <section class="card reveal reveal-d1">
        <div class="card-head">
          <h3 class="card-title">پروفایل کامل تیمی فراتر از شوت (گل، کرنر، مالکیت، دفاع و انضباط)</h3>
          <span class="card-note">میانگین کل ${fmtInt(allM.length)} بازی رسمی فصل جاری</span>
        </div>
        <div class="splits-grid">
          <div class="split-card">
            <h4>شاخص‌های گل‌زنی و نتیجه</h4>
            <div class="split-row"><span>میانگین گل زده / خورده</span><strong>${fmt(wSeason.gfMean)} / ${fmt(wSeason.gaMean)}</strong></div>
            <div class="split-row"><span>نرخ بالای ۲.۵ گل (Over 2.5)</span><strong style="color:var(--accent)">${fmt(wSeason.over25Pct, 0)}%</strong></div>
            <div class="split-row"><span>گل‌زنی هر دو تیم (BTTS)</span><strong>${fmt(wSeason.bttsPct, 0)}%</strong></div>
            <div class="split-row"><span>کلین‌شیت / بدون گل زده</span><strong>${fmt(wSeason.csPct, 0)}% / ${fmt(wSeason.ftsPct, 0)}%</strong></div>
          </div>
          <div class="split-card">
            <h4>کرنر، سانتر و آفساید</h4>
            <div class="split-row"><span>کرنر زده / خورده</span><strong>${fmt(wSeason.cfMean)} / ${fmt(wSeason.caMean)}</strong></div>
            <div class="split-row"><span>مجموع کرنر مسابقه</span><strong style="color:var(--secondary)">${fmt(wSeason.totalCorMean)}</strong></div>
            <div class="split-row"><span>سانتر در هر بازی</span><strong>${fmt(wSeason.crMean)}</strong></div>
            <div class="split-row"><span>آفساید زده / خورده</span><strong>${fmt(wSeason.offMean)} / ${fmt(wSeason.ofaMean)}</strong></div>
          </div>
          <div class="split-card">
            <h4>مالکیت، پاس و ساختار دفاعی</h4>
            <div class="split-row"><span>میانگین مالکیت توپ</span><strong style="color:var(--accent)">${fmt(wSeason.posMean, 1)}%</strong></div>
            <div class="split-row"><span>دقت پاس تیمی</span><strong>${fmt(wSeason.ppMean, 1)}%</strong></div>
            <div class="split-row"><span>تکل موفق / توپ‌ربایی</span><strong>${fmt(wSeason.tkMean)} / ${fmt(wSeason.itcMean)}</strong></div>
            <div class="split-row"><span>سیو دروازه‌بان در بازی</span><strong>${fmt(wSeason.svMean)}</strong></div>
          </div>
          <div class="split-card">
            <h4>خطا و کارت زرد</h4>
            <div class="split-row"><span>خطای مرتکب‌شده / گرفته</span><strong>${fmt(wSeason.ffMean)} / ${fmt(wSeason.faMean)}</strong></div>
            <div class="split-row"><span>کارت زرد تیم / حریف</span><strong>${fmt(wSeason.ycfMean)} / ${fmt(wSeason.ycaMean)}</strong></div>
            <div class="split-row"><span>مجموع کارت زرد بازی</span><strong style="color:var(--secondary)">${fmt(wSeason.totalYcMean)}</strong></div>
            <div class="split-row"><span>گل دقیقه ۷۵ تا +۹۰ (زده/خورده)</span><strong>${fmtInt(wSeason.g75f)} / ${fmtInt(wSeason.g75a)}</strong></div>
          </div>
        </div>
      </section>

      <div class="charts-grid-2 reveal reveal-d2">
        <section class="card">
          <div class="card-head">
            <div>
              <h3 class="card-title">شوت در چارچوب باشگاه مقابل رده‌های جدول (زده vs خورده)</h3>
              <span class="card-note">${fmtInt(lgM.length)} بازی لیگ ${escapeHtml(leagueData.name_fa)}</span>
            </div>
            <div class="card-actions">${exportBtnPng("teamTiers", `club_tiers_${tSlug}`)}</div>
          </div>
          <div class="chart-stage"><canvas id="chart-team-tiers"></canvas></div>
        </section>

        <section class="card">
          <div class="card-head">
            <div>
              <h3 class="card-title">نمودار راداری ساختار هجومی، مالکیت و دفاع</h3>
              <span class="card-note">۶ محور کلیدی فصل جاری</span>
            </div>
            <div class="card-actions">${exportBtnPng("teamRadar", `club_radar_${tSlug}`)}</div>
          </div>
          <div class="chart-stage is-radar"><canvas id="chart-team-radar"></canvas></div>
        </section>
      </div>

      <section class="card reveal reveal-d2">
        <div class="card-head">
          <div>
            <h3 class="card-title">تایمینگ گل‌ها و کارت‌های زرد (نیمه اول در برابر نیمه دوم و دقیقه ۷۵ تا +۹۰)</h3>
            <span class="card-note">مجموع کل مسابقات رسمی ثبت‌شده در فصل جاری</span>
          </div>
          <div class="card-actions">${exportBtnPng("teamTiming", `club_timing_${tSlug}`)}</div>
        </div>
        <div class="chart-stage"><canvas id="chart-team-timing"></canvas></div>
      </section>

      <section class="card reveal reveal-d3">
        <div class="card-head">
          <div>
            <h3 class="card-title">جدول آمار شوت و کرنر باشگاه مقابل یک‌سوم بالایی، میانی و پایینی</h3>
            <span class="card-note">${escapeHtml(leagueData.name_fa)} فصل ${escapeHtml(leagueData.season)}</span>
          </div>
          <div class="card-actions">${exportBtnCsv("tbl-team-tiers", `club_tiers_${tSlug}`)}</div>
        </div>
        <div class="table-wrap">
          <table class="data-table" id="tbl-team-tiers">
            <thead>
              <tr>
                <th>رده حریف</th>
                <th>بازی</th>
                <th>میانگین شوت</th>
                <th>میانگین SoT</th>
                <th>میانه SoT</th>
                <th>SoT%</th>
                <th>SoT خورده</th>
                <th>کرنر زده</th>
                <th>کرنر خورده</th>
                <th>مالکیت%</th>
              </tr>
            </thead>
            <tbody>
              ${tierGroups
                .map(
                  (g) => `
                <tr>
                  <td><strong>${escapeHtml(g.label)}</strong></td>
                  <td class="td-num">${fmtInt(g.stats.n)}</td>
                  <td class="td-num">${fmt(g.stats.sMean)}</td>
                  <td class="td-num td-strong">${fmt(g.stats.sotMean)}</td>
                  <td class="td-num">${fmt(g.stats.sotMed, 1)}</td>
                  <td class="td-num">${fmt(g.stats.sotRate, 1)}%</td>
                  <td class="td-num">${fmt(g.stats.sotaMean)}</td>
                  <td class="td-num">${fmt(g.stats.cfMean)}</td>
                  <td class="td-num">${fmt(g.stats.caMean)}</td>
                  <td class="td-num">${fmt(g.stats.posMean, 1)}%</td>
                </tr>`
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </section>

      <section class="card reveal reveal-d4">
        <div class="card-head">
          <div>
            <h3 class="card-title">۱۰ بازیکن برتر ${escapeHtml(st.short)} (کل شوت و میانگین SoT)</h3>
            <span class="card-note">حداقل ${fmtInt(minGames)} بازی رسمی</span>
          </div>
          <div class="card-actions">${exportBtnPng("teamPlayers", `club_players_${tSlug}`)}</div>
        </div>
        <div class="chart-stage is-tall"><canvas id="chart-team-players"></canvas></div>
      </section>

      <section class="card reveal reveal-d4">
        <div class="card-head">
          <div>
            <h3 class="card-title">جدول بازیکنان برتر باشگاه</h3>
            <span class="card-note">همراه با آمار در ۹۰ دقیقه و Hit-Rate 1+ SoT | برای تحلیل کامل روی نام بازیکن کلیک کنید</span>
          </div>
          <div class="card-actions">${exportBtnCsv("tbl-team-players", `club_players_${tSlug}`)}</div>
        </div>
        <div class="table-wrap">
          <table class="data-table" id="tbl-team-players">
            <thead>
              <tr>
                <th>#</th>
                <th>بازیکن</th>
                <th>بازی</th>
                <th>کل شوت</th>
                <th>کل SoT</th>
                <th>میانگین SoT</th>
                <th>میانه SoT</th>
                <th>SoT در ۹۰دقیقه</th>
                <th>1+ SoT%</th>
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
                  <td class="td-num">${fmtInt(p.sotSum)}</td>
                  <td class="td-num td-strong">${fmt(p.sotMean)}</td>
                  <td class="td-num">${fmt(p.sotMed, 1)}</td>
                  <td class="td-num">${fmt(p.sotPer90)}</td>
                  <td class="td-num">${fmt(pct(p.hitSot1, p.n), 0)}%</td>
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
    setStateBox("team-state", { type: "error", title: "خطا در بارگذاری آمار باشگاه", message: err.message, actionLabel: "تلاش مجدد", onAction: () => renderTeamAnalysis(teamMeta, minGames) });
  }
}

function renderTeamCharts(st, wSeason, w5, tier3, squadPlayers) {
  const c = getThemeColors();

  destroyChart("teamTiers");
  STATE.charts.teamTiers = new Chart(document.getElementById("chart-team-tiers"), {
    type: "bar",
    data: {
      labels: tier3.map((g) => `${tierShortFa(g.key)} (${fmtInt(g.stats.n)})`),
      datasets: [
        { label: "میانگین SoT زده‌شده", data: tier3.map((g) => Number(g.stats.sotMean.toFixed(2))), backgroundColor: c.accent, borderRadius: 7 },
        { label: "میانگین SoT خورده‌شده", data: tier3.map((g) => Number(g.stats.sotaMean.toFixed(2))), backgroundColor: c.secondary, borderRadius: 7 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 750, easing: "easeOutQuart" },
      plugins: { legend: { labels: { color: c.ink, font: { family: "Vazirmatn", size: 12 } } }, tooltip: { rtl: true, bodyFont: { family: "Vazirmatn" } } },
      scales: {
        x: { ticks: { color: c.ink, font: { family: "Vazirmatn" } }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { color: c.muted, font: { family: "Vazirmatn" } }, grid: { color: c.grid } },
      },
    },
  });

  destroyChart("teamRadar");
  const cap = (v, m) => Math.max(0, Math.min(100, Math.round((v / m) * 100)));
  const defScore = Math.max(0, Math.min(100, Math.round(((8 - wSeason.sotaMean) / 6.5) * 100)));
  const radarRaw = [
    `${fmt(wSeason.sMean)} شوت/بازی`,
    `${fmt(wSeason.sotMean)} SoT/بازی`,
    `${fmt(wSeason.cfMean)} کرنر/بازی`,
    `${fmt(wSeason.posMean, 1)}% مالکیت`,
    `${fmt(wSeason.sotaMean)} SoT خورده`,
    `${fmt(w5.sotMean)} SoT/بازی`,
  ];
  STATE.charts.teamRadar = new Chart(document.getElementById("chart-team-radar"), {
    type: "radar",
    data: {
      labels: ["حجم شوت", "میانگین SoT", "کرنر تهاجمی", "مالکیت توپ", "استحکام دفاعی", "فرم ۵ بازی اخیر"],
      datasets: [
        {
          label: st.short,
          data: [cap(wSeason.sMean, 22), cap(wSeason.sotMean, 8.5), cap(wSeason.cfMean, 8.5), cap(wSeason.posMean, 70), defScore, cap(w5.sotMean, 8.5)],
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
        tooltip: { rtl: true, bodyFont: { family: "Vazirmatn" }, callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.dataset.rawLabels[ctx.dataIndex]} (${fmtInt(ctx.raw)}/۱۰۰)` } },
      },
      scales: { r: { min: 0, max: 100, ticks: { display: false, stepSize: 25 }, grid: { color: c.grid }, angleLines: { color: c.grid }, pointLabels: { color: c.ink, font: { family: "Vazirmatn", size: 11, weight: "600" } } } },
    },
  });

  destroyChart("teamTiming");
  STATE.charts.teamTiming = new Chart(document.getElementById("chart-team-timing"), {
    type: "bar",
    data: {
      labels: ["نیمه اول (۱ تا ۴۵)", "نیمه دوم (۴۶ تا ۹۰+)", "۱۵ دقیقه پایانی (۷۵ تا ۹۰+)"],
      datasets: [
        { label: "گل زده", data: [wSeason.g1f, wSeason.g2f, wSeason.g75f], backgroundColor: c.accent, borderRadius: 6 },
        { label: "گل خورده", data: [wSeason.g1a, wSeason.g2a, wSeason.g75a], backgroundColor: c.secondary, borderRadius: 6 },
        { label: "کارت زرد تیم", data: [wSeason.yc1, wSeason.yc2, wSeason.yc75], backgroundColor: c.secondaryFill, borderColor: c.secondary, borderWidth: 1.8, borderRadius: 6 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 750, easing: "easeOutQuart" },
      plugins: { legend: { labels: { color: c.ink, font: { family: "Vazirmatn" } } }, tooltip: { rtl: true, bodyFont: { family: "Vazirmatn" } } },
      scales: {
        x: { ticks: { color: c.ink, font: { family: "Vazirmatn", size: 11 } }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { stepSize: 2, color: c.muted, font: { family: "Vazirmatn" } }, grid: { color: c.grid } },
      },
    },
  });

  destroyChart("teamPlayers");
  STATE.charts.teamPlayers = new Chart(document.getElementById("chart-team-players"), {
    type: "bar",
    data: {
      labels: squadPlayers.map((p) => p.name),
      datasets: [
        { label: "میانگین شوت در بازی", data: squadPlayers.map((p) => Number(p.sMean.toFixed(2))), backgroundColor: c.secondaryFill, borderColor: c.secondary, borderWidth: 1.5, borderRadius: 5 },
        { label: "میانگین SoT در بازی", data: squadPlayers.map((p) => Number(p.sotMean.toFixed(2))), backgroundColor: c.accent, borderRadius: 5 },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 750, easing: "easeOutQuart" },
      plugins: { legend: { labels: { color: c.ink, font: { family: "Vazirmatn", size: 12 } } }, tooltip: { rtl: true, bodyFont: { family: "Vazirmatn" } } },
      scales: {
        x: { beginAtZero: true, ticks: { color: c.muted, font: { family: "Vazirmatn" } }, grid: { color: c.grid } },
        y: { ticks: { color: c.ink, font: { family: "Vazirmatn", size: 11, weight: "600" } }, grid: { display: false } },
      },
    },
  });
}

/* ==========================================================================
   TAB 3: MATCHUP / PRE-MATCH CENTER (NEW!)
   ========================================================================== */
async function populateMatchupSelectors(slug) {
  const lg = await loadLeague(slug);
  const teams = Object.values(lg.standings).sort((a, b) => a.rank - b.rank);
  const homeSel = document.getElementById("matchup-home");
  const awaySel = document.getElementById("matchup-away");

  const opts = teams.map((t) => `<option value="${t.id}">#${fmtInt(t.rank)} ${escapeHtml(t.name)}</option>`).join("");
  homeSel.innerHTML = opts;
  awaySel.innerHTML = opts;

  const upcoming = lg.upcoming_matches || [];
  const upWrap = document.getElementById("matchup-upcoming-list");
  if (upcoming.length) {
    upWrap.innerHTML =
      '<span class="quick-label">بازی‌های پیش‌روی هفته:</span>' +
      upcoming
        .map(
          (u, idx) =>
            `<button type="button" class="fixture-chip ${idx === 0 ? "is-active" : ""}" data-fix-home="${u.home_id}" data-fix-away="${u.away_id}">${escapeHtml(u.home)} - ${escapeHtml(u.away)} (${formatDateFa(u.date)})</button>`
        )
        .join("");
    STATE.matchupHomeId = upcoming[0].home_id;
    STATE.matchupAwayId = upcoming[0].away_id;
  } else {
    upWrap.innerHTML = '<span class="quick-label">دو تیم دلخواه را برای مقایسه انتخاب کنید.</span>';
    STATE.matchupHomeId = teams[0]?.id;
    STATE.matchupAwayId = teams[1]?.id;
  }

  homeSel.value = STATE.matchupHomeId;
  awaySel.value = STATE.matchupAwayId;
}

function getMainGoalkeeper(leagueData, teamId) {
  const gks = Object.values(leagueData.players)
    .filter((p) => p.team_id === teamId && (p.pos === "G" || p.pos === "GK" || sum(p.matches.map((m) => m.sv || 0)) >= 3))
    .map((p) => ({ name: p.name, id: p.id, ...summarizePlayerMatches(p.matches) }))
    .sort((a, b) => b.n - a.n || b.svSum - a.svSum);
  return gks[0] || null;
}

function getTopHitPlayers(leagueData, teamId, limit = 5) {
  return Object.values(leagueData.players)
    .filter((p) => p.team_id === teamId && p.matches.length >= 4)
    .map((p) => {
      const last10 = p.matches.slice(0, 10);
      const s10 = summarizePlayerMatches(last10);
      const s5 = summarizePlayerMatches(p.matches.slice(0, 5));
      return { id: p.id, name: p.name, slug: leagueData.slug, hit10Pct: pct(s10.hitSot1, s10.n), hit5Pct: pct(s5.hitSot1, s5.n), ...s10 };
    })
    .filter((p) => p.sotSum > 0)
    .sort((a, b) => b.hit10Pct - a.hit10Pct || b.sotMean - a.sotMean)
    .slice(0, limit);
}

async function renderMatchupTab(forcePopulate = false) {
  const resultsEl = document.getElementById("matchup-results");
  resultsEl.hidden = true;
  setStateBox("matchup-state", { type: "loading", title: "در حال آماده‌سازی تحلیل پیش‌بازی", message: "مقایسه آمار خانگی میزبان و خارج‌ازخانه مهمان..." });

  try {
    const lg = await loadLeague(STATE.matchupLeague);
    if (forcePopulate || !STATE.matchupHomeId || !lg.standings[STATE.matchupHomeId]) {
      await populateMatchupSelectors(STATE.matchupLeague);
    }

    const hid = STATE.matchupHomeId;
    const aid = STATE.matchupAwayId;
    if (!hid || !aid || hid === aid) {
      setStateBox("matchup-state", { type: "empty", title: "دو تیم متفاوت انتخاب کنید", message: "تیم میزبان و مهمان نمی‌توانند یکسان باشند." });
      return;
    }

    const hSt = lg.standings[hid];
    const aSt = lg.standings[aid];
    const hAll = summarizeTeamMatches(lg.teams[hid]?.matches || []);
    const aAll = summarizeTeamMatches(lg.teams[aid]?.matches || []);
    const hHome = summarizeTeamMatches((lg.teams[hid]?.matches || []).filter((m) => m.lg === 1 && m.ha === "H"));
    const aAway = summarizeTeamMatches((lg.teams[aid]?.matches || []).filter((m) => m.lg === 1 && m.ha === "A"));

    // Match projections blending Home's home performance with Away's away performance
    const expHomeSot = (hHome.sotMean + aAway.sotaMean) / 2;
    const expAwaySot = (aAway.sotMean + hHome.sotaMean) / 2;
    const expGoals = (hHome.totalGoalsMean + aAway.totalGoalsMean) / 2;
    const expOver25 = (hHome.over25Pct + aAway.over25Pct) / 2;
    const expBtts = (hHome.bttsPct + aAway.bttsPct) / 2;
    const expCorners = (hHome.totalCorMean + aAway.totalCorMean) / 2;
    const expYc = (hHome.totalYcMean + aAway.totalYcMean) / 2;

    const hGk = getMainGoalkeeper(lg, hid);
    const aGk = getMainGoalkeeper(lg, aid);
    const hPlayers = getTopHitPlayers(lg, hid, 5);
    const aPlayers = getTopHitPlayers(lg, aid, 5);

    setStateBox("matchup-state", {});
    resultsEl.innerHTML = `
      <section class="h2h-banner reveal">
        <div class="h2h-side">
          <span class="matchup-eyebrow">میزبان (#${fmtInt(hSt.rank)} | ${tierShortFa(hSt.tier)})</span>
          <h2>${escapeHtml(hSt.name)}</h2>
          <p class="matchup-sub">در خانه (${fmtInt(hHome.n)} بازی): ${fmt(hHome.sotMean)} SoT زده | ${fmt(hHome.sotaMean)} SoT خورده | ${fmt(hHome.cfMean)} کرنر</p>
        </div>
        <div class="h2h-vs">پیش‌بازی<br/>${escapeHtml(lg.name_fa)}</div>
        <div class="h2h-side is-away">
          <span class="matchup-eyebrow">مهمان (#${fmtInt(aSt.rank)} | ${tierShortFa(aSt.tier)})</span>
          <h2>${escapeHtml(aSt.name)}</h2>
          <p class="matchup-sub">بیرون خانه (${fmtInt(aAway.n)} بازی): ${fmt(aAway.sotMean)} SoT زده | ${fmt(aAway.sotaMean)} SoT خورده | ${fmt(aAway.cfMean)} کرنر</p>
        </div>
      </section>

      <section class="home-kpi-grid reveal reveal-d1">
        <div class="kpi-box">
          <div class="kpi-label">SoT مورد انتظار (میزبان / مهمان)</div>
          <div class="kpi-value num" style="color:var(--accent)">${fmt(expHomeSot)} / ${fmt(expAwaySot)}</div>
          <div class="kpi-sub">میانگین زده و شوت‌پذیری طرفین</div>
        </div>
        <div class="kpi-box">
          <div class="kpi-label">میانگین کل گل ترکیبی</div>
          <div class="kpi-value num">${fmt(expGoals)}</div>
          <div class="kpi-sub">Over 2.5 ترکیبی: ${fmt(expOver25, 0)}%</div>
        </div>
        <div class="kpi-box">
          <div class="kpi-label">احتمال گل‌زنی هر دو تیم (BTTS)</div>
          <div class="kpi-value num" style="color:var(--secondary)">${fmt(expBtts, 0)}%</div>
          <div class="kpi-sub">میزبان ${fmt(hHome.bttsPct, 0)}% | مهمان ${fmt(aAway.bttsPct, 0)}%</div>
        </div>
        <div class="kpi-box">
          <div class="kpi-label">میانگین کل کرنر بازی</div>
          <div class="kpi-value num">${fmt(expCorners)}</div>
          <div class="kpi-sub">میزبان ${fmt(hHome.cfMean)} | مهمان ${fmt(aAway.cfMean)}</div>
        </div>
        <div class="kpi-box">
          <div class="kpi-label">میانگین کل کارت زرد</div>
          <div class="kpi-value num" style="color:var(--secondary)">${fmt(expYc)}</div>
          <div class="kpi-sub">خطای بازی: ${fmt(hHome.ffMean + aAway.ffMean)}</div>
        </div>
        <div class="kpi-box">
          <div class="kpi-label">گل‌های دیرهنگام (+۷۵ دقیقه)</div>
          <div class="kpi-value num">${fmtInt(hAll.g75f + aAll.g75f)}</div>
          <div class="kpi-sub">${escapeHtml(hSt.short)}: ${fmtInt(hAll.g75f)} | ${escapeHtml(aSt.short)}: ${fmtInt(aAll.g75f)}</div>
        </div>
      </section>

      <div class="charts-grid-equal reveal reveal-d2">
        <section class="card">
          <div class="card-head">
            <div>
              <h3 class="card-title">نمودار راداری مقایسه مستقیم دو باشگاه</h3>
              <span class="card-note">${escapeHtml(hSt.short)} در برابر ${escapeHtml(aSt.short)}</span>
            </div>
            <div class="card-actions">${exportBtnPng("matchupRadar", `matchup_${hSt.id}_${aSt.id}`)}</div>
          </div>
          <div class="chart-stage is-radar"><canvas id="chart-matchup-radar"></canvas></div>
        </section>

        <section class="card">
          <div class="card-head">
            <h3 class="card-title">مقایسه آمار کلیدی و دروازه‌بان‌های اصلی</h3>
            <span class="card-note">میزبان (بازی‌های خانگی) در برابر مهمان (خارج از خانه)</span>
          </div>
          <div class="splits-grid" style="grid-template-columns: repeat(2, minmax(0, 1fr));">
            <div class="split-card">
              <h4>دروازه‌بان ${escapeHtml(hSt.short)}</h4>
              ${
                hGk
                  ? `<div class="split-row"><span>نام</span><strong>${escapeHtml(hGk.name)}</strong></div>
                     <div class="split-row"><span>سیو در هر بازی (${fmtInt(hGk.n)})</span><strong style="color:var(--accent)">${fmt(hGk.svMean)}</strong></div>
                     <div class="split-row"><span>درصد مهار (Save%)</span><strong>${fmt(hGk.savePct, 1)}%</strong></div>
                     <div class="split-row"><span>کلین‌شیت خانگی تیم</span><strong>${fmt(hHome.csPct, 0)}%</strong></div>`
                  : '<p class="card-note">آمار ثبت نشده</p>'
              }
            </div>
            <div class="split-card">
              <h4>دروازه‌بان ${escapeHtml(aSt.short)}</h4>
              ${
                aGk
                  ? `<div class="split-row"><span>نام</span><strong>${escapeHtml(aGk.name)}</strong></div>
                     <div class="split-row"><span>سیو در هر بازی (${fmtInt(aGk.n)})</span><strong style="color:var(--secondary)">${fmt(aGk.svMean)}</strong></div>
                     <div class="split-row"><span>درصد مهار (Save%)</span><strong>${fmt(aGk.savePct, 1)}%</strong></div>
                     <div class="split-row"><span>کلین‌شیت بیرون تیم</span><strong>${fmt(aAway.csPct, 0)}%</strong></div>`
                  : '<p class="card-note">آمار ثبت نشده</p>'
              }
            </div>
            <div class="split-card">
              <h4>مالکیت و آفساید (${escapeHtml(hSt.short)})</h4>
              <div class="split-row"><span>مالکیت خانگی</span><strong>${fmt(hHome.posMean, 1)}%</strong></div>
              <div class="split-row"><span>دقت پاس</span><strong>${fmt(hHome.ppMean, 1)}%</strong></div>
              <div class="split-row"><span>آفساید / سانتر</span><strong>${fmt(hHome.offMean)} / ${fmt(hHome.crMean)}</strong></div>
            </div>
            <div class="split-card">
              <h4>مالکیت و آفساید (${escapeHtml(aSt.short)})</h4>
              <div class="split-row"><span>مالکیت بیرون خانه</span><strong>${fmt(aAway.posMean, 1)}%</strong></div>
              <div class="split-row"><span>دقت پاس</span><strong>${fmt(aAway.ppMean, 1)}%</strong></div>
              <div class="split-row"><span>آفساید / سانتر</span><strong>${fmt(aAway.offMean)} / ${fmt(aAway.crMean)}</strong></div>
            </div>
          </div>
        </section>
      </div>

      <div class="charts-grid-equal reveal reveal-d3">
        <section class="card">
          <div class="card-head">
            <h3 class="card-title">بازیکنان کلیدی ${escapeHtml(hSt.short)} (بالاترین Hit-Rate 1+ SoT)</h3>
            <span class="card-note">مقابل حریف با شوت‌پذیری ${fmt(aAway.sotaMean)} SoT بیرون خانه</span>
          </div>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr><th>بازیکن</th><th>1+ SoT (۱۰ بازی)</th><th>۵ بازی</th><th>میانگین SoT</th><th>SoT در ۹۰دقیقه</th></tr>
              </thead>
              <tbody>
                ${hPlayers
                  .map(
                    (p) => `
                  <tr>
                    <td><button type="button" class="row-link-btn" data-jump-player="${p.id}" data-jump-slug="${p.slug}">${escapeHtml(p.name)}</button></td>
                    <td class="td-num td-strong">${fmt(p.hit10Pct, 0)}%</td>
                    <td class="td-num">${fmt(p.hit5Pct, 0)}%</td>
                    <td class="td-num">${fmt(p.sotMean)}</td>
                    <td class="td-num">${fmt(p.sotPer90)}</td>
                  </tr>`
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <h3 class="card-title">بازیکنان کلیدی ${escapeHtml(aSt.short)} (بالاترین Hit-Rate 1+ SoT)</h3>
            <span class="card-note">مقابل حریف با شوت‌پذیری ${fmt(hHome.sotaMean)} SoT خانگی</span>
          </div>
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr><th>بازیکن</th><th>1+ SoT (۱۰ بازی)</th><th>۵ بازی</th><th>میانگین SoT</th><th>SoT در ۹۰دقیقه</th></tr>
              </thead>
              <tbody>
                ${aPlayers
                  .map(
                    (p) => `
                  <tr>
                    <td><button type="button" class="row-link-btn" data-jump-player="${p.id}" data-jump-slug="${p.slug}">${escapeHtml(p.name)}</button></td>
                    <td class="td-num td-strong">${fmt(p.hit10Pct, 0)}%</td>
                    <td class="td-num">${fmt(p.hit5Pct, 0)}%</td>
                    <td class="td-num">${fmt(p.sotMean)}</td>
                    <td class="td-num">${fmt(p.sotPer90)}</td>
                  </tr>`
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    `;
    resultsEl.hidden = false;

    const c = getThemeColors();
    const cap = (v, m) => Math.max(0, Math.min(100, Math.round((v / m) * 100)));
    const defS = (sota) => Math.max(0, Math.min(100, Math.round(((8 - sota) / 6.5) * 100)));
    destroyChart("matchupRadar");
    STATE.charts.matchupRadar = new Chart(document.getElementById("chart-matchup-radar"), {
      type: "radar",
      data: {
        labels: ["میانگین شوت", "میانگین SoT", "کرنر", "مالکیت توپ", "استحکام دفاعی", "گل زده"],
        datasets: [
          {
            label: `${hSt.short} (خانه)`,
            data: [cap(hHome.sMean, 22), cap(hHome.sotMean, 8.5), cap(hHome.cfMean, 9), cap(hHome.posMean, 70), defS(hHome.sotaMean), cap(hHome.gfMean, 3.2)],
            backgroundColor: c.accentFill,
            borderColor: c.accent,
            borderWidth: 2.2,
            pointBackgroundColor: c.accent,
          },
          {
            label: `${aSt.short} (بیرون)`,
            data: [cap(aAway.sMean, 22), cap(aAway.sotMean, 8.5), cap(aAway.cfMean, 9), cap(aAway.posMean, 70), defS(aAway.sotaMean), cap(aAway.gfMean, 3.2)],
            backgroundColor: c.secondaryFill,
            borderColor: c.secondary,
            borderWidth: 2.2,
            pointBackgroundColor: c.secondary,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 800, easing: "easeOutQuart" },
        plugins: { legend: { labels: { color: c.ink, font: { family: "Vazirmatn" } } }, tooltip: { rtl: true, bodyFont: { family: "Vazirmatn" } } },
        scales: { r: { min: 0, max: 100, ticks: { display: false, stepSize: 25 }, grid: { color: c.grid }, angleLines: { color: c.grid }, pointLabels: { color: c.ink, font: { family: "Vazirmatn", size: 11, weight: "600" } } } },
      },
    });
  } catch (err) {
    setStateBox("matchup-state", { type: "error", title: "خطا در تحلیل پیش‌بازی", message: err.message, actionLabel: "تلاش مجدد", onAction: () => renderMatchupTab(true) });
  }
}

/* ==========================================================================
   TAB 4: SMART SCREENER ACROSS ALL 5 LEAGUES (NEW!)
   ========================================================================== */
async function renderScreenerTab() {
  const resultsEl = document.getElementById("screener-results");
  resultsEl.hidden = true;
  setStateBox("screener-state", { type: "loading", title: "در حال اسکن ۵ لیگ معتبر اروپا", message: "بررسی نرخ تحقق (Hit-Rate) و آمار شوت‌پذیری حریف بعدی برای همه بازیکنان..." });

  try {
    const lgFilter = document.getElementById("scr-league").value;
    const win = Number(document.getElementById("scr-window").value);
    const metric = document.getElementById("scr-metric").value;
    const minHit = Number(document.getElementById("scr-hit").value);
    const oppFilter = document.getElementById("scr-opp").value;
    const minMinutes = Number(document.getElementById("scr-min").value);

    const targetSlugs = lgFilter === "all" ? ALL_LEAGUE_SLUGS : [lgFilter];
    await Promise.all(targetSlugs.map((s) => loadLeague(s)));

    // Precompute every team's conceded SoT & next league opponent quickly
    const teamConceded = {};
    for (const s of targetSlugs) {
      const lg = STATE.leagues[s];
      for (const [tid, tObj] of Object.entries(lg.teams)) {
        teamConceded[tid] = summarizeTeamMatches(tObj.matches);
      }
    }

    const metricLabelMap = {
      sot1: "1+ SoT",
      sot2: "2+ SoT",
      s2: "2+ شوت",
      s3: "3+ شوت",
      fs2: "2+ خطای گرفته",
      fc2: "2+ خطای مرتکب",
    };

    const hits = [];
    for (const s of targetSlugs) {
      const lg = STATE.leagues[s];
      for (const p of Object.values(lg.players)) {
        if (p.matches.length < win) continue;
        const slice = p.matches.slice(0, win);
        const st = summarizePlayerMatches(slice);
        if (st.minMean < minMinutes) continue;

        let hitCount = 0;
        let meanVal = st.sotMean;
        let medVal = st.sotMed;
        if (metric === "sot1") hitCount = st.hitSot1;
        else if (metric === "sot2") hitCount = st.hitSot2;
        else if (metric === "s2") { hitCount = st.hitS2; meanVal = st.sMean; medVal = st.sMed; }
        else if (metric === "s3") { hitCount = st.hitS3; meanVal = st.sMean; medVal = st.sMed; }
        else if (metric === "fs2") { hitCount = st.hitFs2; meanVal = st.fsMean; medVal = median(slice.map((m) => m.fs || 0)); }
        else if (metric === "fc2") { hitCount = st.hitFc2; meanVal = st.fcMean; medVal = median(slice.map((m) => m.fc || 0)); }

        const hitPct = pct(hitCount, st.n);
        if (hitPct < minHit) continue;

        const nf = lg.next_fixtures?.[p.team_id];
        const nextFix = nf?.next_league || nf?.next_official;
        const oppCon = nextFix ? teamConceded[nextFix.oid] : null;
        const oppSota = oppCon ? oppCon.sotaMean : 0;

        if (oppFilter === "bottom" && nextFix?.ot !== "bottom") continue;
        if (oppFilter === "sota45" && oppSota < 4.5) continue;
        if (oppFilter === "sota50" && oppSota < 5.0) continue;

        hits.push({
          id: p.id,
          name: p.name,
          team: p.team,
          leagueFa: lg.name_fa,
          slug: s,
          hitCount,
          n: st.n,
          hitPct,
          meanVal,
          medVal,
          sotPer90: st.sotPer90,
          minMean: st.minMean,
          nextOpp: nextFix ? `${nextFix.opp} (${nextFix.ha === "H" ? "خانه" : "بیرون"})` : "نامشخص",
          nextTier: nextFix?.ot || null,
          oppSota,
        });
      }
    }

    hits.sort((a, b) => b.hitPct - a.hitPct || b.meanVal - a.meanVal || b.oppSota - a.oppSota);

    if (!hits.length) {
      setStateBox("screener-state", {
        type: "empty",
        title: "هیچ بازیکنی با این ترکیب فیلتر پیدا نشد",
        message: "آستانه نرخ تحقق را کمی کمتر کنید (مثلاً ۶۰٪) یا شرط حریف بعدی را روی «همه حریف‌ها» بگذارید.",
      });
      return;
    }

    setStateBox("screener-state", {});
    resultsEl.innerHTML = `
      <section class="card reveal">
        <div class="card-head">
          <div>
            <h3 class="card-title">نتایج فیلتر هوشمند: ${fmtInt(hits.length)} بازیکن واجد شرایط (${metricLabelMap[metric]} در ${fmtInt(win)} بازی اخیر)</h3>
            <span class="card-note">نمایش تا ۵۰ نتیجه اول مرتب‌شده بر اساس نرخ تحقق و میانگین | روی نام بازیکن کلیک کنید</span>
          </div>
          <div class="card-actions">${exportBtnCsv("tbl-screener", `screener_${metric}_${win}g`)}</div>
        </div>
        <div class="table-wrap">
          <table class="data-table" id="tbl-screener">
            <thead>
              <tr>
                <th>#</th>
                <th>بازیکن</th>
                <th>باشگاه</th>
                <th>لیگ</th>
                <th>نرخ تحقق (${metricLabelMap[metric]})</th>
                <th>میانگین / میانه</th>
                <th>SoT در ۹۰دقیقه</th>
                <th>میانگین دقیقه</th>
                <th>حریف بعدی</th>
                <th>SoT خورده حریف</th>
              </tr>
            </thead>
            <tbody>
              ${hits
                .slice(0, 50)
                .map(
                  (r, i) => `
                <tr>
                  <td class="td-num">${fmtInt(i + 1)}</td>
                  <td><button type="button" class="row-link-btn" data-jump-player="${r.id}" data-jump-slug="${r.slug}">${escapeHtml(r.name)}</button></td>
                  <td>${escapeHtml(r.team)}</td>
                  <td>${escapeHtml(r.leagueFa)}</td>
                  <td class="td-num td-strong">${fmt(r.hitPct, 0)}% (${fmtInt(r.hitCount)}/${fmtInt(r.n)})</td>
                  <td class="td-num">${fmt(r.meanVal)} / ${fmt(r.medVal, 1)}</td>
                  <td class="td-num">${fmt(r.sotPer90)}</td>
                  <td class="td-num">${fmt(r.minMean, 0)}'</td>
                  <td>${escapeHtml(r.nextOpp)} ${r.nextTier ? `<span class="tier-pill ${r.nextTier === "top" ? "is-top" : r.nextTier === "bottom" ? "is-bottom" : ""}">${tierShortFa(r.nextTier)}</span>` : ""}</td>
                  <td class="td-num ${r.oppSota >= 4.5 ? "td-strong" : ""}">${r.oppSota ? fmt(r.oppSota) : "-"}</td>
                </tr>`
                )
                .join("")}
            </tbody>
          </table>
        </div>
      </section>
    `;
    resultsEl.hidden = false;
  } catch (err) {
    setStateBox("screener-state", { type: "error", title: "خطا در اجرای فیلتر هوشمند", message: err.message, actionLabel: "تلاش مجدد", onAction: () => renderScreenerTab() });
  }
}

/* ==========================================================================
   TAB 5: LEAGUE LEADERS (Upgraded: SoT + Per 90 + Goalkeepers + Fouls/Cards)
   ========================================================================== */
async function renderLeagueTab() {
  const resultsEl = document.getElementById("league-results");
  resultsEl.hidden = true;
  document.getElementById("league-window-group").hidden = STATE.leagueMode !== "sot";
  document.getElementById("league-sort-wrap").hidden = STATE.leagueMode !== "sot";

  setStateBox("league-state", { type: "loading", title: "در حال محاسبه برترین‌های لیگ", message: "مرتب‌سازی بازیکنان لیگ انتخاب‌شده..." });

  try {
    const lg = await loadLeague(STATE.leagueSlug);
    const c = getThemeColors();

    if (STATE.leagueMode === "sot") {
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
      if (STATE.leagueSort === "sot_rate") rows.sort((a, b) => b.sotRate - a.sotRate || b.sotSum - a.sotSum);
      else if (STATE.leagueSort === "shots_mean") rows.sort((a, b) => b.sMean - a.sMean || b.sotMean - a.sotMean);
      else rows.sort((a, b) => b.sotMean - a.sotMean || b.sotMed - a.sotMed || b.sotSum - a.sotSum);

      const top10 = rows.slice(0, 10);
      const scatterPool = rows.slice(0, 30);

      setStateBox("league-state", {});
      resultsEl.innerHTML = `
        <section class="card reveal">
          <div class="card-head">
            <div>
              <h3 class="card-title">نقشه حجم شوت در برابر شوت در چارچوب: ${escapeHtml(lg.name_fa)} (${fmtInt(win)} بازی اخیر)</h3>
              <span class="card-note">۳۰ بازیکن برتر (اندازه نقطه متناسب با نرخ دقت SoT%)</span>
            </div>
            <div class="card-actions">${exportBtnPng("leagueChart", `league_scatter_${lg.slug}_${win}g`)}</div>
          </div>
          <div class="chart-stage"><canvas id="chart-league-main"></canvas></div>
        </section>

        <section class="card reveal reveal-d1">
          <div class="card-head">
            <div>
              <h3 class="card-title">۱۰ بازیکن برتر ${escapeHtml(lg.name_fa)} در ${fmtInt(win)} بازی اخیر لیگ</h3>
              <span class="card-note">حداقل ${fmtInt(minG)} بازی لیگ | کلیک روی نام برای تحلیل کامل</span>
            </div>
            <div class="card-actions">${exportBtnCsv("tbl-league-main", `league_top10_${lg.slug}_${win}g`)}</div>
          </div>
          <div class="table-wrap">
            <table class="data-table" id="tbl-league-main">
              <thead>
                <tr><th>#</th><th>بازیکن</th><th>باشگاه</th><th>بازی</th><th>میانگین SoT</th><th>میانه SoT</th><th>کل SoT</th><th>میانگین شوت</th><th>1+ SoT%</th><th>SoT%</th></tr>
              </thead>
              <tbody>
                ${top10
                  .map(
                    (r, i) => `
                  <tr>
                    <td class="td-num">${fmtInt(i + 1)}</td>
                    <td><button type="button" class="row-link-btn" data-jump-player="${r.id}" data-jump-slug="${r.slug}">${escapeHtml(r.name)}</button></td>
                    <td>${escapeHtml(r.team)}</td>
                    <td class="td-num">${fmtInt(r.n)}</td>
                    <td class="td-num td-strong">${fmt(r.sotMean)}</td>
                    <td class="td-num">${fmt(r.sotMed, 1)}</td>
                    <td class="td-num">${fmtInt(r.sotSum)}</td>
                    <td class="td-num">${fmt(r.sMean)}</td>
                    <td class="td-num">${fmt(pct(r.hitSot1, r.n), 0)}%</td>
                    <td class="td-num">${fmt(r.sotRate, 1)}%</td>
                  </tr>`
                  )
                  .join("")}
              </tbody>
            </table>
          </div>
        </section>`;
      resultsEl.hidden = false;

      destroyChart("leagueChart");
      STATE.charts.leagueChart = new Chart(document.getElementById("chart-league-main"), {
        type: "bubble",
        data: {
          datasets: [
            { label: "۱۰ بازیکن اول", data: scatterPool.slice(0, 10).map((r) => ({ x: Number(r.sMean.toFixed(2)), y: Number(r.sotMean.toFixed(2)), r: Math.max(5, Math.min(13, r.sotRate / 6)), meta: r })), backgroundColor: c.accent },
            { label: "رتبه ۱۱ تا ۳۰", data: scatterPool.slice(10).map((r) => ({ x: Number(r.sMean.toFixed(2)), y: Number(r.sotMean.toFixed(2)), r: Math.max(4, Math.min(10, r.sotRate / 7.5)), meta: r })), backgroundColor: c.secondaryFill, borderColor: c.secondary, borderWidth: 1.4 },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 750, easing: "easeOutQuart" },
          plugins: {
            legend: { labels: { color: c.ink, font: { family: "Vazirmatn" } } },
            tooltip: { rtl: true, bodyFont: { family: "Vazirmatn" }, callbacks: { label: (ctx) => { const m = ctx.raw.meta; return `${m.name} (${m.team}) | شوت: ${fmt(m.sMean)} | SoT: ${fmt(m.sotMean)} | دقت: ${fmt(m.sotRate, 1)}%`; } } },
          },
          scales: {
            x: { title: { display: true, text: "میانگین کل شوت در هر بازی", color: c.muted, font: { family: "Vazirmatn", weight: "700" } }, ticks: { color: c.muted, font: { family: "Vazirmatn" } }, grid: { color: c.grid } },
            y: { beginAtZero: true, title: { display: true, text: "میانگین شوت در چارچوب (SoT)", color: c.muted, font: { family: "Vazirmatn", weight: "700" } }, ticks: { color: c.muted, font: { family: "Vazirmatn" } }, grid: { color: c.grid } },
          },
        },
      });
      return;
    }

    if (STATE.leagueMode === "per90") {
      const rows = Object.values(lg.players)
        .map((p) => ({ id: p.id, name: p.name, team: p.team, slug: lg.slug, ...summarizePlayerMatches(p.matches.filter((m) => m.lg === 1)) }))
        .filter((r) => r.minSum >= 450 && r.sotSum >= 5)
        .sort((a, b) => b.sotPer90 - a.sotPer90 || b.sPer90 - a.sPer90)
        .slice(0, 15);

      setStateBox("league-state", {});
      resultsEl.innerHTML = `
        <section class="card reveal">
          <div class="card-head">
            <div>
              <h3 class="card-title">برترین‌های شوت در چارچوب به ازای ۹۰ دقیقه: ${escapeHtml(lg.name_fa)}</h3>
              <span class="card-note">حداقل ۴۵۰ دقیقه حضور در لیگ (حذف خطای دقایق کم تعویضی)</span>
            </div>
            <div class="card-actions">${exportBtnPng("leagueChart", `per90_${lg.slug}`)}</div>
          </div>
          <div class="chart-stage is-tall"><canvas id="chart-league-main"></canvas></div>
        </section>
        <section class="card reveal reveal-d1">
          <div class="card-head">
            <h3 class="card-title">جدول ۱۵ بازیکن برتر Per 90</h3>
            <div class="card-actions">${exportBtnCsv("tbl-league-main", `per90_${lg.slug}`)}</div>
          </div>
          <div class="table-wrap">
            <table class="data-table" id="tbl-league-main">
              <thead><tr><th>#</th><th>بازیکن</th><th>باشگاه</th><th>دقیقه</th><th>SoT در ۹۰دقیقه</th><th>شوت در ۹۰دقیقه</th><th>گل+پاس در ۹۰دقیقه</th><th>کل SoT</th><th>SoT%</th></tr></thead>
              <tbody>
                ${rows.map((r, i) => `<tr><td class="td-num">${fmtInt(i + 1)}</td><td><button type="button" class="row-link-btn" data-jump-player="${r.id}" data-jump-slug="${r.slug}">${escapeHtml(r.name)}</button></td><td>${escapeHtml(r.team)}</td><td class="td-num">${fmtInt(r.minSum)}'</td><td class="td-num td-strong">${fmt(r.sotPer90)}</td><td class="td-num">${fmt(r.sPer90)}</td><td class="td-num">${fmt(r.gaPer90)}</td><td class="td-num">${fmtInt(r.sotSum)}</td><td class="td-num">${fmt(r.sotRate, 1)}%</td></tr>`).join("")}
              </tbody>
            </table>
          </div>
        </section>`;
      resultsEl.hidden = false;

      destroyChart("leagueChart");
      STATE.charts.leagueChart = new Chart(document.getElementById("chart-league-main"), {
        type: "bar",
        data: {
          labels: rows.slice(0, 10).map((r) => `${r.name} (${r.team})`),
          datasets: [
            { label: "SoT در ۹۰ دقیقه", data: rows.slice(0, 10).map((r) => Number(r.sotPer90.toFixed(2))), backgroundColor: c.accent, borderRadius: 5 },
            { label: "شوت در ۹۰ دقیقه", data: rows.slice(0, 10).map((r) => Number(r.sPer90.toFixed(2))), backgroundColor: c.secondaryFill, borderColor: c.secondary, borderWidth: 1.5, borderRadius: 5 },
          ],
        },
        options: { indexAxis: "y", responsive: true, maintainAspectRatio: false, animation: { duration: 750, easing: "easeOutQuart" }, plugins: { legend: { labels: { color: c.ink, font: { family: "Vazirmatn" } } }, tooltip: { rtl: true, bodyFont: { family: "Vazirmatn" } } }, scales: { x: { beginAtZero: true, ticks: { color: c.muted, font: { family: "Vazirmatn" } }, grid: { color: c.grid } }, y: { ticks: { color: c.ink, font: { family: "Vazirmatn", size: 11 } }, grid: { display: false } } } },
      });
      return;
    }

    if (STATE.leagueMode === "gk") {
      const rows = Object.values(lg.players)
        .filter((p) => p.pos === "G" || p.pos === "GK" || sum(p.matches.map((m) => m.sv || 0)) >= 10)
        .map((p) => {
          const lgM = p.matches.filter((m) => m.lg === 1);
          const topM = lgM.filter((m) => m.ot === "top");
          const s = summarizePlayerMatches(lgM);
          const stTop = summarizePlayerMatches(topM);
          return { id: p.id, name: p.name, team: p.team, slug: lg.slug, topSvMean: stTop.svMean, topN: stTop.n, ...s };
        })
        .filter((r) => r.n >= 5 && r.svSum >= 8)
        .sort((a, b) => b.svMean - a.svMean || b.savePct - a.savePct);

      setStateBox("league-state", {});
      resultsEl.innerHTML = `
        <section class="card reveal">
          <div class="card-head">
            <div>
              <h3 class="card-title">برترین دروازه‌بان‌های ${escapeHtml(lg.name_fa)} (میانگین سیو و درصد مهار Save%)</h3>
              <span class="card-note">حداقل ۵ بازی لیگ | شامل میانگین سیو مقابل یک‌سوم بالایی جدول</span>
            </div>
            <div class="card-actions">${exportBtnPng("leagueChart", `gk_${lg.slug}`)}</div>
          </div>
          <div class="chart-stage is-tall"><canvas id="chart-league-main"></canvas></div>
        </section>
        <section class="card reveal reveal-d1">
          <div class="card-head">
            <h3 class="card-title">جدول کامل دروازه‌بان‌ها</h3>
            <div class="card-actions">${exportBtnCsv("tbl-league-main", `gk_${lg.slug}`)}</div>
          </div>
          <div class="table-wrap">
            <table class="data-table" id="tbl-league-main">
              <thead><tr><th>#</th><th>دروازه‌بان</th><th>باشگاه</th><th>بازی</th><th>کل سیو</th><th>سیو در بازی</th><th>گل خورده</th><th>درصد مهار Save%</th><th>سیو مقابل یک‌سوم بالایی</th></tr></thead>
              <tbody>
                ${rows.map((r, i) => `<tr><td class="td-num">${fmtInt(i + 1)}</td><td><strong>${escapeHtml(r.name)}</strong></td><td>${escapeHtml(r.team)}</td><td class="td-num">${fmtInt(r.n)}</td><td class="td-num">${fmtInt(r.svSum)}</td><td class="td-num td-strong">${fmt(r.svMean)}</td><td class="td-num">${fmtInt(r.gcSum)}</td><td class="td-num">${fmt(r.savePct, 1)}%</td><td class="td-num">${r.topN ? `${fmt(r.topSvMean)} (${fmtInt(r.topN)})` : "-"}</td></tr>`).join("")}
              </tbody>
            </table>
          </div>
        </section>`;
      resultsEl.hidden = false;

      destroyChart("leagueChart");
      STATE.charts.leagueChart = new Chart(document.getElementById("chart-league-main"), {
        type: "bar",
        data: {
          labels: rows.slice(0, 12).map((r) => `${r.name} (${r.team})`),
          datasets: [{ label: "میانگین سیو در هر بازی", data: rows.slice(0, 12).map((r) => Number(r.svMean.toFixed(2))), backgroundColor: c.accent, borderRadius: 5 }],
        },
        options: { indexAxis: "y", responsive: true, maintainAspectRatio: false, animation: { duration: 750, easing: "easeOutQuart" }, plugins: { legend: { labels: { color: c.ink, font: { family: "Vazirmatn" } } }, tooltip: { rtl: true, bodyFont: { family: "Vazirmatn" } } }, scales: { x: { beginAtZero: true, ticks: { color: c.muted, font: { family: "Vazirmatn" } }, grid: { color: c.grid } }, y: { ticks: { color: c.ink, font: { family: "Vazirmatn", size: 11 } }, grid: { display: false } } } },
      });
      return;
    }

    // Fouls & Yellow Cards leaderboard
    const allP = Object.values(lg.players)
      .map((p) => ({ id: p.id, name: p.name, team: p.team, slug: lg.slug, ...summarizePlayerMatches(p.matches.filter((m) => m.lg === 1)) }))
      .filter((r) => r.n >= 6);
    const mostFouled = [...allP].sort((a, b) => b.fsMean - a.fsMean || b.fsSum - a.fsSum).slice(0, 10);
    const mostCards = [...allP].sort((a, b) => b.ycSum - a.ycSum || b.fcMean - a.fcMean).slice(0, 10);

    setStateBox("league-state", {});
    resultsEl.innerHTML = `
      <section class="card reveal">
        <div class="card-head">
          <div>
            <h3 class="card-title">بیشترین خطای گرفته‌شده (Fouls Won) در ${escapeHtml(lg.name_fa)}</h3>
            <span class="card-note">حداقل ۶ بازی لیگ | مهره‌های کارت‌ساز روی مدافع حریف</span>
          </div>
          <div class="card-actions">${exportBtnCsv("tbl-fouls-won", `fouls_won_${lg.slug}`)}</div>
        </div>
        <div class="table-wrap">
          <table class="data-table" id="tbl-fouls-won">
            <thead><tr><th>#</th><th>بازیکن</th><th>باشگاه</th><th>بازی</th><th>کل خطای گرفته</th><th>میانگین/بازی</th><th>در ۹۰دقیقه</th></tr></thead>
            <tbody>
              ${mostFouled.map((r, i) => `<tr><td class="td-num">${fmtInt(i + 1)}</td><td><button type="button" class="row-link-btn" data-jump-player="${r.id}" data-jump-slug="${r.slug}">${escapeHtml(r.name)}</button></td><td>${escapeHtml(r.team)}</td><td class="td-num">${fmtInt(r.n)}</td><td class="td-num">${fmtInt(r.fsSum)}</td><td class="td-num td-strong">${fmt(r.fsMean)}</td><td class="td-num">${fmt(r.fsPer90)}</td></tr>`).join("")}
            </tbody>
          </table>
        </div>
      </section>

      <section class="card reveal reveal-d1">
        <div class="card-head">
          <div>
            <h3 class="card-title">پراخطارترین بازیکنان (کارت زرد و خطا) در ${escapeHtml(lg.name_fa)}</h3>
            <span class="card-note">مرتب‌شده بر اساس کارت زرد و میانگین خطای مرتکب‌شده</span>
          </div>
          <div class="card-actions">${exportBtnCsv("tbl-fouls-comm", `cards_${lg.slug}`)}</div>
        </div>
        <div class="table-wrap">
          <table class="data-table" id="tbl-fouls-comm">
            <thead><tr><th>#</th><th>بازیکن</th><th>باشگاه</th><th>بازی</th><th>کارت زرد</th><th>کل خطا</th><th>خطا/بازی</th></tr></thead>
            <tbody>
              ${mostCards.map((r, i) => `<tr><td class="td-num">${fmtInt(i + 1)}</td><td><button type="button" class="row-link-btn" data-jump-player="${r.id}" data-jump-slug="${r.slug}">${escapeHtml(r.name)}</button></td><td>${escapeHtml(r.team)}</td><td class="td-num">${fmtInt(r.n)}</td><td class="td-num td-strong">${fmtInt(r.ycSum)}</td><td class="td-num">${fmtInt(r.fcSum)}</td><td class="td-num">${fmt(r.fcMean)}</td></tr>`).join("")}
            </tbody>
          </table>
        </div>
      </section>`;
    resultsEl.hidden = false;
  } catch (err) {
    setStateBox("league-state", { type: "error", title: "خطا در بارگذاری برترین‌های لیگ", message: err.message, actionLabel: "تلاش مجدد", onAction: () => renderLeagueTab() });
  }
}

/* ==========================================================================
   TAB 6: TEAM & HOME LAB (Goals/YC + Corners/Offsides + Possession/Def + Timing)
   ========================================================================== */
async function renderHomeTab() {
  const resultsEl = document.getElementById("home-results");
  resultsEl.hidden = true;
  setStateBox("home-state", { type: "loading", title: "در حال محاسبه آمار تیمی لیگ", message: "پردازش شاخص‌های گل، کارت زرد، کرنر، مالکیت، دفاع و تایمینگ..." });

  try {
    const lg = await loadLeague(STATE.homeLeagueSlug);
    const scope = STATE.homeScope;
    const cat = STATE.homeCat;
    const scopeLabel = scope === "H" ? "بازی‌های خانگی" : scope === "A" ? "بازی‌های خارج از خانه" : "کل فصل لیگ";

    const scopedAll = [];
    const teamRows = [];

    for (const [tid, st] of Object.entries(lg.standings)) {
      const ms = (lg.teams[tid]?.matches || []).filter((m) => m.lg === 1 && (scope === "ALL" || m.ha === scope));
      scopedAll.push(...ms);
      if (!ms.length) continue;
      teamRows.push({ id: tid, name: st.name, short: st.short, slug: lg.slug, rank: st.rank, ...summarizeTeamMatches(ms) });
    }

    const lgSummary = summarizeTeamMatches(scopedAll);
    const c = getThemeColors();

    let kpiHtml = "";
    let chart1Title = "";
    let chart2Title = "";
    let theadHtml = "";
    let tbodyHtml = "";
    let c1Data = null;
    let c2Data = null;

    if (cat === "goals") {
      teamRows.sort((a, b) => b.totalGoalsMean - a.totalGoalsMean);
      kpiHtml = `
        <div class="kpi-box"><div class="kpi-label">میانگین گل زده (${scopeLabel})</div><div class="kpi-value num" style="color:var(--accent)">${fmt(lgSummary.gfMean)}</div><div class="kpi-sub">${fmtInt(scopedAll.length)} نمونه تیم-بازی</div></div>
        <div class="kpi-box"><div class="kpi-label">میانگین گل خورده</div><div class="kpi-value num">${fmt(lgSummary.gaMean)}</div><div class="kpi-sub">میانگین کل گل: ${fmt(lgSummary.totalGoalsMean)}</div></div>
        <div class="kpi-box"><div class="kpi-label">نرخ بالای ۲.۵ گل (Over 2.5)</div><div class="kpi-value num" style="color:var(--secondary)">${fmt(lgSummary.over25Pct, 0)}%</div><div class="kpi-sub">نرخ BTTS: ${fmt(lgSummary.bttsPct, 0)}%</div></div>
        <div class="kpi-box"><div class="kpi-label">کارت زرد تیم</div><div class="kpi-value num">${fmt(lgSummary.ycfMean)}</div><div class="kpi-sub">در هر بازی</div></div>
        <div class="kpi-box"><div class="kpi-label">کارت زرد حریف</div><div class="kpi-value num">${fmt(lgSummary.ycaMean)}</div><div class="kpi-sub">در هر بازی</div></div>
        <div class="kpi-box"><div class="kpi-label">مجموع کارت زرد بازی</div><div class="kpi-value num" style="color:var(--secondary)">${fmt(lgSummary.totalYcMean)}</div><div class="kpi-sub">کلین‌شیت: ${fmt(lgSummary.csPct, 0)}%</div></div>`;

      chart1Title = `میانگین گل زده و خورده (${scopeLabel}، ۱۰ تیم پرگل‌تر)`;
      chart2Title = `میانگین کارت زرد تیم و حریف (${scopeLabel}، ۱۰ تیم پرکارت‌تر)`;
      const topG = [...teamRows].sort((a, b) => b.totalGoalsMean - a.totalGoalsMean).slice(0, 10);
      const topC = [...teamRows].sort((a, b) => b.totalYcMean - a.totalYcMean).slice(0, 10);
      c1Data = { labels: topG.map((r) => r.short), ds: [{ label: "گل زده", data: topG.map((r) => Number(r.gfMean.toFixed(2))), backgroundColor: c.accent }, { label: "گل خورده", data: topG.map((r) => Number(r.gaMean.toFixed(2))), backgroundColor: c.secondary }], stacked: true };
      c2Data = { labels: topC.map((r) => r.short), ds: [{ label: "کارت زرد تیم", data: topC.map((r) => Number(r.ycfMean.toFixed(2))), backgroundColor: c.secondary }, { label: "کارت زرد حریف", data: topC.map((r) => Number(r.ycaMean.toFixed(2))), backgroundColor: c.accent }], stacked: true };

      theadHtml = "<tr><th>#</th><th>باشگاه</th><th>بازی</th><th>گل زده</th><th>گل خورده</th><th>کل گل</th><th>Over 2.5%</th><th>BTTS%</th><th>کلین‌شیت%</th><th>کارت زرد (تیم/حریف/کل)</th></tr>";
      tbodyHtml = teamRows.map((r, i) => `<tr><td class="td-num">${fmtInt(i + 1)}</td><td><button type="button" class="row-link-btn" data-jump-team="${r.id}" data-jump-slug="${r.slug}">${escapeHtml(r.name)}</button></td><td class="td-num">${fmtInt(r.n)}</td><td class="td-num td-strong">${fmt(r.gfMean)}</td><td class="td-num">${fmt(r.gaMean)}</td><td class="td-num">${fmt(r.totalGoalsMean)}</td><td class="td-num">${fmt(r.over25Pct, 0)}%</td><td class="td-num">${fmt(r.bttsPct, 0)}%</td><td class="td-num">${fmt(r.csPct, 0)}%</td><td class="td-num">${fmt(r.ycfMean)} / ${fmt(r.ycaMean)} / <strong>${fmt(r.totalYcMean)}</strong></td></tr>`).join("");
    } else if (cat === "corners") {
      teamRows.sort((a, b) => b.totalCorMean - a.totalCorMean);
      kpiHtml = `
        <div class="kpi-box"><div class="kpi-label">کرنر زده تیم (${scopeLabel})</div><div class="kpi-value num" style="color:var(--accent)">${fmt(lgSummary.cfMean)}</div><div class="kpi-sub">میانه: ${fmt(lgSummary.cfMed, 1)}</div></div>
        <div class="kpi-box"><div class="kpi-label">کرنر خورده تیم</div><div class="kpi-value num">${fmt(lgSummary.caMean)}</div><div class="kpi-sub">در هر بازی</div></div>
        <div class="kpi-box"><div class="kpi-label">مجموع کرنر بازی</div><div class="kpi-value num" style="color:var(--secondary)">${fmt(lgSummary.totalCorMean)}</div><div class="kpi-sub">میانگین کل مسابقه</div></div>
        <div class="kpi-box"><div class="kpi-label">سانتر در هر بازی</div><div class="kpi-value num">${fmt(lgSummary.crMean)}</div><div class="kpi-sub">میانگین لیگ</div></div>
        <div class="kpi-box"><div class="kpi-label">آفساید زده تیم</div><div class="kpi-value num">${fmt(lgSummary.offMean)}</div><div class="kpi-sub">در هر بازی</div></div>
        <div class="kpi-box"><div class="kpi-label">آفساید حریف</div><div class="kpi-value num">${fmt(lgSummary.ofaMean)}</div><div class="kpi-sub">تله آفساید</div></div>`;

      chart1Title = `میانگین کرنر زده و خورده (${scopeLabel}، ۱۰ تیم اول)`;
      chart2Title = `میانگین آفساید زده و تله آفساید (${scopeLabel}، ۱۰ تیم اول)`;
      const topCor = [...teamRows].sort((a, b) => b.cfMean - a.cfMean).slice(0, 10);
      const topOff = [...teamRows].sort((a, b) => b.offMean + b.ofaMean - (a.offMean + a.ofaMean)).slice(0, 10);
      c1Data = { labels: topCor.map((r) => r.short), ds: [{ label: "کرنر زده", data: topCor.map((r) => Number(r.cfMean.toFixed(2))), backgroundColor: c.accent }, { label: "کرنر خورده", data: topCor.map((r) => Number(r.caMean.toFixed(2))), backgroundColor: c.secondary }], stacked: true };
      c2Data = { labels: topOff.map((r) => r.short), ds: [{ label: "آفساید زده", data: topOff.map((r) => Number(r.offMean.toFixed(2))), backgroundColor: c.secondary }, { label: "آفساید حریف", data: topOff.map((r) => Number(r.ofaMean.toFixed(2))), backgroundColor: c.accent }], stacked: false };

      theadHtml = "<tr><th>#</th><th>باشگاه</th><th>بازی</th><th>کرنر زده</th><th>میانه کرنر</th><th>کرنر خورده</th><th>مجموع کرنر</th><th>سانتر/بازی</th><th>آفساید زده</th><th>آفساید حریف</th></tr>";
      tbodyHtml = teamRows.map((r, i) => `<tr><td class="td-num">${fmtInt(i + 1)}</td><td><button type="button" class="row-link-btn" data-jump-team="${r.id}" data-jump-slug="${r.slug}">${escapeHtml(r.name)}</button></td><td class="td-num">${fmtInt(r.n)}</td><td class="td-num td-strong">${fmt(r.cfMean)}</td><td class="td-num">${fmt(r.cfMed, 1)}</td><td class="td-num">${fmt(r.caMean)}</td><td class="td-num td-strong">${fmt(r.totalCorMean)}</td><td class="td-num">${fmt(r.crMean)}</td><td class="td-num">${fmt(r.offMean)}</td><td class="td-num">${fmt(r.ofaMean)}</td></tr>`).join("");
    } else if (cat === "tactical") {
      teamRows.sort((a, b) => b.posMean - a.posMean);
      kpiHtml = `
        <div class="kpi-box"><div class="kpi-label">میانگین مالکیت (${scopeLabel})</div><div class="kpi-value num" style="color:var(--accent)">${fmt(lgSummary.posMean, 1)}%</div><div class="kpi-sub">میانگین لیگ</div></div>
        <div class="kpi-box"><div class="kpi-label">دقت پاس تیمی</div><div class="kpi-value num">${fmt(lgSummary.ppMean, 1)}%</div><div class="kpi-sub">پاس صحیح</div></div>
        <div class="kpi-box"><div class="kpi-label">خطای مرتکب‌شده</div><div class="kpi-value num" style="color:var(--secondary)">${fmt(lgSummary.ffMean)}</div><div class="kpi-sub">در هر بازی</div></div>
        <div class="kpi-box"><div class="kpi-label">تکل موفق</div><div class="kpi-value num">${fmt(lgSummary.tkMean)}</div><div class="kpi-sub">در هر بازی</div></div>
        <div class="kpi-box"><div class="kpi-label">توپ‌ربایی</div><div class="kpi-value num">${fmt(lgSummary.itcMean)}</div><div class="kpi-sub">Interceptions</div></div>
        <div class="kpi-box"><div class="kpi-label">سیو دروازه‌بان</div><div class="kpi-value num">${fmt(lgSummary.svMean)}</div><div class="kpi-sub">در هر بازی</div></div>`;

      chart1Title = `بیشترین مالکیت توپ (${scopeLabel}، ۱۰ تیم اول)`;
      chart2Title = `پرفشارترین تیم‌ها در خطا و تکل موفق (${scopeLabel})`;
      const topPos = [...teamRows].slice(0, 10);
      const topDef = [...teamRows].sort((a, b) => b.ffMean - a.ffMean).slice(0, 10);
      c1Data = { labels: topPos.map((r) => r.short), ds: [{ label: "مالکیت توپ %", data: topPos.map((r) => Number(r.posMean.toFixed(1))), backgroundColor: c.accent }, { label: "دقت پاس %", data: topPos.map((r) => Number(r.ppMean.toFixed(1))), backgroundColor: c.secondaryFill, borderColor: c.secondary, borderWidth: 1.5 }], stacked: false };
      c2Data = { labels: topDef.map((r) => r.short), ds: [{ label: "خطا/بازی", data: topDef.map((r) => Number(r.ffMean.toFixed(2))), backgroundColor: c.secondary }, { label: "تکل موفق/بازی", data: topDef.map((r) => Number(r.tkMean.toFixed(2))), backgroundColor: c.accent }], stacked: false };

      theadHtml = "<tr><th>#</th><th>باشگاه</th><th>بازی</th><th>مالکیت%</th><th>دقت پاس%</th><th>خطا/بازی</th><th>خطای حریف</th><th>تکل موفق</th><th>توپ‌ربایی</th><th>سیو/بازی</th></tr>";
      tbodyHtml = teamRows.map((r, i) => `<tr><td class="td-num">${fmtInt(i + 1)}</td><td><button type="button" class="row-link-btn" data-jump-team="${r.id}" data-jump-slug="${r.slug}">${escapeHtml(r.name)}</button></td><td class="td-num">${fmtInt(r.n)}</td><td class="td-num td-strong">${fmt(r.posMean, 1)}%</td><td class="td-num">${fmt(r.ppMean, 1)}%</td><td class="td-num">${fmt(r.ffMean)}</td><td class="td-num">${fmt(r.faMean)}</td><td class="td-num">${fmt(r.tkMean)}</td><td class="td-num">${fmt(r.itcMean)}</td><td class="td-num">${fmt(r.svMean)}</td></tr>`).join("");
    } else {
      // Timing splits (1H vs 2H vs 75-90+)
      teamRows.sort((a, b) => b.g75f + b.g75a - (a.g75f + a.g75a));
      const totG = lgSummary.g1f + lgSummary.g2f;
      const totYc = lgSummary.yc1 + lgSummary.yc2;
      kpiHtml = `
        <div class="kpi-box"><div class="kpi-label">سهم گل نیمه اول</div><div class="kpi-value num">${fmt(pct(lgSummary.g1f, totG), 0)}%</div><div class="kpi-sub">${fmtInt(lgSummary.g1f)} گل</div></div>
        <div class="kpi-box"><div class="kpi-label">سهم گل نیمه دوم</div><div class="kpi-value num" style="color:var(--accent)">${fmt(pct(lgSummary.g2f, totG), 0)}%</div><div class="kpi-sub">${fmtInt(lgSummary.g2f)} گل</div></div>
        <div class="kpi-box"><div class="kpi-label">سهم گل ۱۵ دقیقه پایانی (+۷۵)</div><div class="kpi-value num" style="color:var(--secondary)">${fmt(pct(lgSummary.g75f, totG), 0)}%</div><div class="kpi-sub">${fmtInt(lgSummary.g75f)} گل دیرهنگام</div></div>
        <div class="kpi-box"><div class="kpi-label">کارت زرد نیمه اول</div><div class="kpi-value num">${fmt(pct(lgSummary.yc1, totYc), 0)}%</div><div class="kpi-sub">${fmtInt(lgSummary.yc1)} کارت</div></div>
        <div class="kpi-box"><div class="kpi-label">کارت زرد نیمه دوم</div><div class="kpi-value num">${fmt(pct(lgSummary.yc2, totYc), 0)}%</div><div class="kpi-sub">${fmtInt(lgSummary.yc2)} کارت</div></div>
        <div class="kpi-box"><div class="kpi-label">کارت زرد دقیقه +۷۵</div><div class="kpi-value num" style="color:var(--secondary)">${fmt(pct(lgSummary.yc75, totYc), 0)}%</div><div class="kpi-sub">${fmtInt(lgSummary.yc75)} کارت پایانی</div></div>`;

      chart1Title = `گل‌های نیمه اول در برابر نیمه دوم (${scopeLabel})`;
      chart2Title = `تیم‌های پرگل در ۱۵ دقیقه پایانی (+۷۵ دقیقه)`;
      const topH = [...teamRows].sort((a, b) => b.g1f + b.g2f - (a.g1f + a.g2f)).slice(0, 10);
      const topLate = [...teamRows].slice(0, 10);
      c1Data = { labels: topH.map((r) => r.short), ds: [{ label: "گل نیمه اول", data: topH.map((r) => r.g1f), backgroundColor: c.secondary }, { label: "گل نیمه دوم", data: topH.map((r) => r.g2f), backgroundColor: c.accent }], stacked: true };
      c2Data = { labels: topLate.map((r) => r.short), ds: [{ label: "گل زده +۷۵", data: topLate.map((r) => r.g75f), backgroundColor: c.accent }, { label: "گل خورده +۷۵", data: topLate.map((r) => r.g75a), backgroundColor: c.secondary }], stacked: true };

      theadHtml = "<tr><th>#</th><th>باشگاه</th><th>بازی</th><th>گل نیمه ۱</th><th>گل نیمه ۲</th><th>گل زده +۷۵</th><th>گل خورده +۷۵</th><th>کارت نیمه ۱</th><th>کارت نیمه ۲</th><th>کارت +۷۵</th></tr>";
      tbodyHtml = teamRows.map((r, i) => `<tr><td class="td-num">${fmtInt(i + 1)}</td><td><button type="button" class="row-link-btn" data-jump-team="${r.id}" data-jump-slug="${r.slug}">${escapeHtml(r.name)}</button></td><td class="td-num">${fmtInt(r.n)}</td><td class="td-num">${fmtInt(r.g1f)}</td><td class="td-num">${fmtInt(r.g2f)}</td><td class="td-num td-strong">${fmtInt(r.g75f)}</td><td class="td-num">${fmtInt(r.g75a)}</td><td class="td-num">${fmtInt(r.yc1)}</td><td class="td-num">${fmtInt(r.yc2)}</td><td class="td-num td-strong">${fmtInt(r.yc75)}</td></tr>`).join("");
    }

    setStateBox("home-state", {});
    resultsEl.innerHTML = `
      <section class="home-kpi-grid reveal">${kpiHtml}</section>

      <div class="charts-grid-equal reveal reveal-d1">
        <section class="card">
          <div class="card-head">
            <h3 class="card-title">${chart1Title}</h3>
            <div class="card-actions">${exportBtnPng("homeChart1", `team_${lg.slug}_${cat}_1`)}</div>
          </div>
          <div class="chart-stage"><canvas id="chart-home-1"></canvas></div>
        </section>

        <section class="card">
          <div class="card-head">
            <h3 class="card-title">${chart2Title}</h3>
            <div class="card-actions">${exportBtnPng("homeChart2", `team_${lg.slug}_${cat}_2`)}</div>
          </div>
          <div class="chart-stage"><canvas id="chart-home-2"></canvas></div>
        </section>
      </div>

      <section class="card reveal reveal-d2">
        <div class="card-head">
          <div>
            <h3 class="card-title">جدول کامل تیمی ${escapeHtml(lg.name_fa)} (${scopeLabel})</h3>
            <span class="card-note">فصل ${escapeHtml(lg.season)} | کلیک روی نام باشگاه برای ورود به صفحه تحلیل باشگاه</span>
          </div>
          <div class="card-actions">${exportBtnCsv("tbl-home-main", `team_${lg.slug}_${scope}_${cat}`)}</div>
        </div>
        <div class="table-wrap">
          <table class="data-table" id="tbl-home-main">
            <thead>${theadHtml}</thead>
            <tbody>${tbodyHtml}</tbody>
          </table>
        </div>
      </section>`;
    resultsEl.hidden = false;

    const makeBar = (key, canvasId, cfg) => {
      destroyChart(key);
      STATE.charts[key] = new Chart(document.getElementById(canvasId), {
        type: "bar",
        data: { labels: cfg.labels, datasets: cfg.ds.map((d) => ({ ...d, borderRadius: 5 })) },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 750, easing: "easeOutQuart" },
          plugins: { legend: { labels: { color: c.ink, font: { family: "Vazirmatn" } } }, tooltip: { rtl: true, bodyFont: { family: "Vazirmatn" } } },
          scales: {
            x: { stacked: cfg.stacked, ticks: { color: c.ink, font: { family: "Vazirmatn", size: 11 } }, grid: { display: false } },
            y: { stacked: cfg.stacked, beginAtZero: true, ticks: { color: c.muted, font: { family: "Vazirmatn" } }, grid: { color: c.grid } },
          },
        },
      });
    };
    makeBar("homeChart1", "chart-home-1", c1Data);
    makeBar("homeChart2", "chart-home-2", c2Data);
  } catch (err) {
    setStateBox("home-state", { type: "error", title: "خطا در بارگذاری آمار تیمی", message: err.message, actionLabel: "تلاش مجدد", onAction: () => renderHomeTab() });
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
        : STATE.activeTab === "matchup"
        ? STATE.matchupLeague
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

    await rerenderActiveTab();
    showFeedback("جدول و رتبه‌بندی لیگ به‌صورت زنده از ESPN به‌روزرسانی شد.");
  } catch (err) {
    showFeedback(`دریافت زنده از ESPN ناموفق بود (${err.message}). اگر داخل ایران هستید برای دریافت زنده VPN را روشن کنید؛ آمار روزانه همچنان فعال است.`, true);
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
  } else if (STATE.activeTab === "matchup") {
    await renderMatchupTab(false);
  } else if (STATE.activeTab === "screener") {
    await renderScreenerTab();
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

  document.querySelectorAll("[data-tab]").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
  document.getElementById("btn-live-refresh").addEventListener("click", liveRefreshCurrent);

  // Delegated click handlers: jump-to-player, jump-to-team, export PNG/CSV, upcoming matchup chips
  document.getElementById("main-content").addEventListener("click", (e) => {
    const pngBtn = e.target.closest("[data-export-png]");
    if (pngBtn) return exportChartPng(pngBtn.dataset.exportPng, pngBtn.dataset.exportName);

    const csvBtn = e.target.closest("[data-export-csv]");
    if (csvBtn) return exportTableCsv(csvBtn.dataset.exportCsv, csvBtn.dataset.exportName);

    const fixBtn = e.target.closest("[data-fix-home]");
    if (fixBtn) {
      document.querySelectorAll(".fixture-chip").forEach((b) => b.classList.toggle("is-active", b === fixBtn));
      STATE.matchupHomeId = fixBtn.dataset.fixHome;
      STATE.matchupAwayId = fixBtn.dataset.fixAway;
      document.getElementById("matchup-home").value = STATE.matchupHomeId;
      document.getElementById("matchup-away").value = STATE.matchupAwayId;
      renderMatchupTab(false);
      return;
    }

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

  // Player Search
  attachAutocomplete("player-input", "player-suggestions", searchPlayers, (p) => ({ main: p.name, meta: `${p.team} (${fmtInt(p.sot)} SoT)` }), (p) => {
    document.getElementById("player-input").value = p.name;
    const cmpVal = document.getElementById("player-compare-input").value.trim();
    renderPlayerAnalysis(p, cmpVal ? searchPlayers(cmpVal, 1)[0] : null);
  });
  attachAutocomplete("player-compare-input", "player-compare-suggestions", searchPlayers, (p) => ({ main: p.name, meta: `${p.team} (${fmtInt(p.sot)} SoT)` }), (p) => {
    document.getElementById("player-compare-input").value = p.name;
    if (STATE.currentPlayer) renderPlayerAnalysis(STATE.currentPlayer, p);
  });
  document.getElementById("player-search-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = document.getElementById("player-input").value.trim();
    const cmpQ = document.getElementById("player-compare-input").value.trim();
    const m = searchPlayers(q, 1);
    if (!m.length) {
      setStateBox("player-state", { type: "empty", title: `بازیکنی با نام «${q}» پیدا نشد`, message: "نام بازیکن را به انگلیسی یا فارسی وارد کنید." });
      document.getElementById("player-results").hidden = true;
      return;
    }
    const cmp = cmpQ ? searchPlayers(cmpQ, 1)[0] || null : null;
    document.getElementById("player-input").value = m[0].name;
    if (cmp) document.getElementById("player-compare-input").value = cmp.name;
    renderPlayerAnalysis(m[0], cmp);
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

  // Team Search
  attachAutocomplete("team-input", "team-suggestions", searchTeams, (t) => ({ main: t.name, meta: `رتبه #${fmtInt(t.rank)}` }), (t) => {
    document.getElementById("team-input").value = t.name;
    renderTeamAnalysis(t, Number(document.getElementById("team-min-games").value));
  });
  document.getElementById("team-search-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const q = document.getElementById("team-input").value.trim();
    const found = searchTeams(q, 1)[0];
    if (!found) {
      setStateBox("team-state", { type: "empty", title: `باشگاهی با نام «${q}» پیدا نشد`, message: "نام یکی از ۹۶ باشگاه ۵ لیگ معتبر اروپا را وارد کنید." });
      document.getElementById("team-results").hidden = true;
      return;
    }
    document.getElementById("team-input").value = found.name;
    renderTeamAnalysis(found, Number(document.getElementById("team-min-games").value));
  });
  document.getElementById("team-min-games").addEventListener("change", () => {
    if (STATE.currentTeam) renderTeamAnalysis(STATE.currentTeam, Number(document.getElementById("team-min-games").value));
  });
  document.querySelectorAll("[data-quick-team]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const t = searchTeams(btn.dataset.quickTeam, 1)[0];
      if (!t) return;
      document.getElementById("team-input").value = t.name;
      renderTeamAnalysis(t, Number(document.getElementById("team-min-games").value));
    });
  });

  // Matchup controls
  document.getElementById("matchup-league").addEventListener("change", async (e) => {
    STATE.matchupLeague = e.target.value;
    await renderMatchupTab(true);
  });
  document.getElementById("btn-run-matchup").addEventListener("click", () => {
    STATE.matchupHomeId = document.getElementById("matchup-home").value;
    STATE.matchupAwayId = document.getElementById("matchup-away").value;
    document.querySelectorAll(".fixture-chip").forEach((b) => b.classList.remove("is-active"));
    renderMatchupTab(false);
  });

  // Screener controls (live filter on any change)
  ["scr-league", "scr-window", "scr-metric", "scr-hit", "scr-opp", "scr-min"].forEach((id) => {
    document.getElementById(id).addEventListener("change", () => renderScreenerTab());
  });

  // League Leaders controls
  document.getElementById("league-select").addEventListener("change", (e) => {
    STATE.leagueSlug = e.target.value;
    renderLeagueTab();
  });
  document.getElementById("league-sort").addEventListener("change", (e) => {
    STATE.leagueSort = e.target.value;
    renderLeagueTab();
  });
  document.querySelectorAll("[data-league-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      STATE.leagueMode = btn.dataset.leagueMode;
      document.querySelectorAll("[data-league-mode]").forEach((b) => {
        const active = b === btn;
        b.classList.toggle("is-active", active);
        b.setAttribute("aria-pressed", active ? "true" : "false");
      });
      renderLeagueTab();
    });
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

  // Team & Home Lab controls
  document.getElementById("home-league-select").addEventListener("change", (e) => {
    STATE.homeLeagueSlug = e.target.value;
    renderHomeTab();
  });
  document.querySelectorAll("[data-home-scope]").forEach((btn) => {
    btn.addEventListener("click", () => {
      STATE.homeScope = btn.dataset.homeScope;
      document.querySelectorAll("[data-home-scope]").forEach((b) => {
        const active = b === btn;
        b.classList.toggle("is-active", active);
        b.setAttribute("aria-pressed", active ? "true" : "false");
      });
      renderHomeTab();
    });
  });
  document.querySelectorAll("[data-home-cat]").forEach((btn) => {
    btn.addEventListener("click", () => {
      STATE.homeCat = btn.dataset.homeCat;
      document.querySelectorAll("[data-home-cat]").forEach((b) => {
        const active = b === btn;
        b.classList.toggle("is-active", active);
        b.setAttribute("aria-pressed", active ? "true" : "false");
      });
      renderHomeTab();
    });
  });

  // Initial load
  setStateBox("player-state", { type: "loading", title: "در حال آماده‌سازی داده‌های ۵ لیگ معتبر اروپا", message: "بارگذاری شاخص بازیکنان و باشگاه‌ها..." });
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
      message: `فایل data/index.json بارگذاری نشد (${err.message}).`,
      actionLabel: "تلاش مجدد",
      onAction: () => init(),
    });
  }
}

document.addEventListener("DOMContentLoaded", init);
