// Generates assets/hero.svg and assets/stats.svg from live GitHub data.
// Usage: GITHUB_TOKEN=... bun scripts/generate.mjs
import { mkdirSync, writeFileSync } from "node:fs";

const USER = "lolieatapple";
const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) throw new Error("GITHUB_TOKEN is required");

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fmt = (n) => n.toLocaleString("en-US");
const short = (n) => (n >= 10000 ? (n / 1000).toFixed(1) + "k" : fmt(n));

async function gh(path) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}`, "User-Agent": USER },
  });
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}

async function gql(query) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "User-Agent": USER },
    body: JSON.stringify({ query }),
  });
  const body = await res.json();
  if (!res.ok || body.errors) throw new Error(`GraphQL failed: ${JSON.stringify(body)}`);
  return body.data;
}

// ---------- data ----------
const user = await gh(`/users/${USER}`);
const firstYear = new Date(user.created_at).getUTCFullYear();
const thisYear = new Date().getUTCFullYear();

const years = [];
for (let y = firstYear; y <= thisYear; y++) years.push(y);
const yearQuery = years
  .map(
    (y) =>
      `y${y}: contributionsCollection(from: "${y}-01-01T00:00:00Z", to: "${y}-12-31T23:59:59Z") { contributionCalendar { totalContributions } }`
  )
  .join("\n");
const g = await gql(`{ user(login: "${USER}") {
  pullRequests { totalCount }
  issues { totalCount }
  lastYear: contributionsCollection { contributionCalendar { totalContributions
    weeks { contributionDays { date contributionCount contributionLevel } } } }
  ${yearQuery}
} }`);
const calendar = g.user.lastYear.contributionCalendar;
const perYear = years
  .map((y) => ({ year: y, count: g.user[`y${y}`].contributionCalendar.totalContributions }))
  .filter((d) => d.count > 0);
const total = perYear.reduce((a, d) => a + d.count, 0);
const ytd = perYear.find((d) => d.year === thisYear);
if (!ytd) throw new Error(`no contributions found for ${thisYear}`);

const repos = [];
for (let page = 1; ; page++) {
  const batch = await gh(`/users/${USER}/repos?per_page=100&type=owner&page=${page}`);
  repos.push(...batch);
  if (batch.length < 100) break;
}
const langCount = {};
for (const r of repos) {
  if (r.fork || !r.language) continue;
  langCount[r.language] = (langCount[r.language] ?? 0) + 1;
}
const langTotal = Object.values(langCount).reduce((a, b) => a + b, 0);
const langs = Object.entries(langCount)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 6)
  .map(([name, n]) => ({ name, pct: (n / langTotal) * 100 }));

console.log({ total, ytd: ytd.count, repos: user.public_repos, prs: g.user.pullRequests.totalCount, perYear, langs });

// ---------- shared pieces ----------
const FONT_SANS = `'Segoe UI', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif`;
const FONT_MONO = `'JetBrains Mono', 'SF Mono', Menlo, Consolas, 'DejaVu Sans Mono', monospace`;

const background = (w, h) => `
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#0b1020"/>
    <stop offset="0.55" stop-color="#11142b"/>
    <stop offset="1" stop-color="#1c1036"/>
  </linearGradient>
  <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
    <path d="M40 0H0V40" fill="none" stroke="#ffffff" stroke-opacity="0.045"/>
  </pattern>
  <filter id="blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="45"/></filter>
  <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
    <feGaussianBlur stdDeviation="4" result="b"/>
    <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
  <clipPath id="frame"><rect width="${w}" height="${h}" rx="22"/></clipPath>`;

const backdrop = (w, h) => `
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <rect width="${w}" height="${h}" fill="url(#grid)"/>
  <circle class="orb o1" cx="${w * 0.8}" cy="${h * 0.2}" r="140" fill="#8b5cf6" opacity="0.35" filter="url(#blur)"/>
  <circle class="orb o2" cx="${w * 0.15}" cy="${h * 0.85}" r="120" fill="#ff4d6d" opacity="0.28" filter="url(#blur)"/>
  <circle class="orb o3" cx="${w * 0.55}" cy="${h * 0.6}" r="110" fill="#22d3ee" opacity="0.18" filter="url(#blur)"/>`;

const baseCss = `
  .orb { animation: drift 14s ease-in-out infinite alternate; }
  .o2 { animation-duration: 18s; animation-delay: -4s; }
  .o3 { animation-duration: 22s; animation-delay: -9s; }
  @keyframes drift { 0% { transform: translate(0,0); } 50% { transform: translate(-60px,30px); } 100% { transform: translate(40px,-25px); } }
  .rise { opacity: 0; animation: rise .8s cubic-bezier(.2,.8,.2,1) forwards; }
  @keyframes rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) { * { animation: none !important; } .rise { opacity: 1; } }`;

// ---------- hero ----------
function hero() {
  const W = 1200, H = 420;
  const TX = 330;

  // typing lines: each line gets a 4s slot (type, hold, erase, pause)
  const lines = [
    "building cross-chain bridges @ Wanchain",
    "shipping DeFi bots in TypeScript & Rust",
    "writing Claude Code skills & CLI tools",
    "making tiny Rust games for fun",
  ];
  const SLOT = 4, TYPE = 1.6, HOLD = 1.6, ERASE = 0.5;
  const DUR = SLOT * lines.length;
  const CW = 13.2; // char width at 22px, fixed via textLength
  const LX = TX + 30, LY = 262;

  const kt = (t) => (t / DUR).toFixed(4);
  const cursorVals = [], cursorTimes = [];
  const lineEls = lines.map((line, i) => {
    const start = i * SLOT;
    const n = line.length;
    const vals = ["0"], times = ["0"];
    if (start > 0) { vals.push("0"); times.push(kt(start)); }
    for (let c = 1; c <= n; c++) {
      vals.push((c * CW).toFixed(1));
      times.push(kt(start + (TYPE * c) / n));
    }
    const eraseAt = start + TYPE + HOLD;
    const steps = 8;
    for (let s = 1; s <= steps; s++) {
      vals.push(((n * CW * (steps - s)) / steps).toFixed(1));
      times.push(kt(eraseAt + (ERASE * s) / steps));
    }
    // cursor follows the same path
    vals.forEach((v, k) => {
      if (k === 0 && i > 0) return;
      cursorVals.push((LX + Number(v) + 2).toFixed(1));
      cursorTimes.push(times[k]);
    });
    // One <text> per character, toggled by opacity. Safari does not repaint
    // an animated clipPath inside <img>, so the lines must not rely on one.
    return [...line].map((ch, c) => {
      if (ch === " ") return "";
      const on = start + (TYPE * (c + 1)) / n;
      let s = 1;
      while ((n * (steps - s)) / steps >= c + 1) s++;
      const off = eraseAt + (ERASE * s) / steps;
      return `<text x="${(LX + c * CW + CW / 2).toFixed(1)}" y="${LY}" opacity="0">${esc(ch)}<animate attributeName="opacity" dur="${DUR}s" repeatCount="indefinite" calcMode="discrete" values="0;1;0" keyTimes="0;${kt(on)};${kt(off)}"/></text>`;
    }).join("");
  });
  // dedupe keyTimes that collide (SMIL needs increasing values)
  const cv = [], ct = [];
  cursorTimes.forEach((t, k) => {
    if (ct.length && ct[ct.length - 1] === t) { cv[cv.length - 1] = cursorVals[k]; return; }
    ct.push(t); cv.push(cursorVals[k]);
  });
  if (ct[ct.length - 1] !== "1.0000") { ct.push("1"); cv.push(cv[cv.length - 1]); }

  const chips = ["Web3", "Cross-chain", "DeFi", "Solidity", "TypeScript", "Rust", "AI agents", "macOS"];
  let cx = TX;
  const chipEls = chips.map((c, i) => {
    const w = c.length * 8.6 + 28;
    const el = `<g class="rise" style="animation-delay:${1 + i * 0.12}s">
      <rect x="${cx}" y="292" width="${w}" height="30" rx="15" fill="#ffffff" fill-opacity="0.06" stroke="#ffffff" stroke-opacity="0.14"/>
      <text x="${cx + w / 2}" y="312" text-anchor="middle" font-family="${FONT_MONO}" font-size="14" fill="#c8cde4">${esc(c)}</text></g>`;
    cx += w + 10;
    return el;
  });

  // cross-chain rail
  const chains = [
    ["ETH", "#8c9eff"], ["BTC", "#f7931a"], ["WAN", "#2a6af1"], ["BNB", "#f3ba2f"],
    ["ARB", "#28a0f0"], ["BASE", "#3b82f6"], ["TRX", "#ff4d4f"], ["XRP", "#9aa4b8"],
  ];
  const RY = 378, RX0 = 70, RX1 = W - 70;
  const step = (RX1 - RX0) / (chains.length - 1);
  const nodes = chains.map(([name, color], i) => {
    const x = RX0 + i * step;
    return `<g>
      <circle cx="${x}" cy="${RY}" r="9" fill="none" stroke="${color}" stroke-width="2" opacity="0">
        <animate attributeName="r" values="9;22" dur="3s" begin="${i * 0.37}s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="0.8;0" dur="3s" begin="${i * 0.37}s" repeatCount="indefinite"/>
      </circle>
      <circle cx="${x}" cy="${RY}" r="8" fill="#0b1020" stroke="${color}" stroke-width="2.5"/>
      <circle cx="${x}" cy="${RY}" r="3" fill="${color}"/>
      <text x="${x}" y="${RY - 17}" text-anchor="middle" font-family="${FONT_MONO}" font-size="11" fill="${color}" opacity="0.9">${name}</text>
    </g>`;
  });
  const packets = [
    { d: `M${RX0} ${RY}H${RX1}`, dur: 6, begin: 0, color: "#3ddc97" },
    { d: `M${RX1} ${RY}H${RX0}`, dur: 7.5, begin: 1.2, color: "#ff4d6d" },
    { d: `M${RX0 + step * 2} ${RY}H${RX1}`, dur: 4.5, begin: 2.5, color: "#22d3ee" },
    { d: `M${RX0 + step * 6} ${RY}H${RX0}`, dur: 5, begin: 3.3, color: "#c084fc" },
  ].map(
    (p) => `<circle r="4.5" fill="${p.color}" filter="url(#glow)">
      <animateMotion path="${p.d}" dur="${p.dur}s" begin="${p.begin}s" repeatCount="indefinite"/></circle>`
  );

  // the apple, getting eaten
  const bites = [
    { x: 78, y: -18, t: 0.12 },
    { x: 74, y: 38, t: 0.32 },
    { x: -80, y: 12, t: 0.52 },
    { x: -62, y: 66, t: 0.72 },
  ].map(
    (b) => `<circle cx="${b.x}" cy="${b.y}" r="0" fill="#000">
      <animate attributeName="r" dur="10s" repeatCount="indefinite"
        values="0;0;27;27;0" keyTimes="0;${b.t};${(b.t + 0.03).toFixed(2)};0.93;1"/></circle>`
  );
  const crumbs = [0.12, 0.32, 0.52, 0.72].flatMap((t, i) =>
    [0, 1, 2].map((k) => {
      const side = i < 2 ? 1 : -1;
      const x0 = side * 80, y0 = [-18, 38, 12, 66][i];
      const dx = side * (30 + k * 18), dy = -20 + k * 22;
      return `<circle r="${3 - k * 0.6}" fill="#ffd6dc" opacity="0">
        <animate attributeName="opacity" dur="10s" repeatCount="indefinite" values="0;0;1;0;0" keyTimes="0;${t};${(t + 0.01).toFixed(2)};${(t + 0.08).toFixed(2)};1"/>
        <animate attributeName="cx" dur="10s" repeatCount="indefinite" values="${x0};${x0};${x0};${x0 + dx};${x0 + dx}" keyTimes="0;${t};${(t + 0.01).toFixed(2)};${(t + 0.08).toFixed(2)};1"/>
        <animate attributeName="cy" dur="10s" repeatCount="indefinite" values="${y0};${y0};${y0};${y0 + dy};${y0 + dy}" keyTimes="0;${t};${(t + 0.01).toFixed(2)};${(t + 0.08).toFixed(2)};1"/>
      </circle>`;
    })
  );

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="lolieatapple — cross-chain, DeFi and Rust builder">
<defs>${background(W, H)}
  <linearGradient id="title" x1="0" y1="0" x2="480" y2="0" gradientUnits="userSpaceOnUse" spreadMethod="reflect">
    <stop offset="0" stop-color="#ff4d6d"/><stop offset="0.35" stop-color="#ffb86b"/>
    <stop offset="0.7" stop-color="#c084fc"/><stop offset="1" stop-color="#22d3ee"/>
    <animateTransform attributeName="gradientTransform" type="translate" values="0 0;480 0" dur="6s" repeatCount="indefinite"/>
  </linearGradient>
  <radialGradient id="appleFill" cx="0.35" cy="0.3" r="0.8">
    <stop offset="0" stop-color="#ff8a95"/><stop offset="0.45" stop-color="#ff3b5c"/><stop offset="1" stop-color="#a3123a"/>
  </radialGradient>
  <mask id="bite" maskUnits="userSpaceOnUse" x="-120" y="-130" width="240" height="260">
    <rect x="-120" y="-130" width="240" height="260" fill="#fff"/>
    ${bites.join("\n    ")}
  </mask>
  <linearGradient id="rail" x1="${RX0 - 60}" y1="0" x2="${RX1 + 60}" y2="0" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="#ffffff" stop-opacity="0"/><stop offset="0.1" stop-color="#ffffff" stop-opacity="0.25"/>
    <stop offset="0.9" stop-color="#ffffff" stop-opacity="0.25"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
  </linearGradient>
</defs>
<style>${baseCss}
  .apple { animation: bob 4s ease-in-out infinite; transform-origin: 170px 185px; }
  @keyframes bob { 0%,100% { transform: translateY(0) rotate(-3deg); } 50% { transform: translateY(-10px) rotate(3deg); } }
  .cursor { animation: blink 1s steps(1) infinite; }
  @keyframes blink { 50% { opacity: 0; } }
  .dash { stroke-dasharray: 6 10; animation: flow 1.2s linear infinite; }
  @keyframes flow { to { stroke-dashoffset: -16; } }
</style>
<g clip-path="url(#frame)">
  ${backdrop(W, H)}

  <g class="apple">
    <ellipse cx="170" cy="300" rx="70" ry="9" fill="#000" opacity="0.35"/>
    <g transform="translate(170 185)">
      <g mask="url(#bite)">
        <path d="M0 -58 C28 -84 86 -70 86 -2 C86 58 48 100 20 100 C8 100 6 92 0 92 C-6 92 -8 100 -20 100 C-48 100 -86 58 -86 -2 C-86 -70 -28 -84 0 -58 Z" fill="url(#appleFill)"/>
        <ellipse cx="-38" cy="-30" rx="14" ry="26" fill="#fff" opacity="0.28" transform="rotate(25 -38 -30)"/>
      </g>
      <path d="M0 -58 C1 -76 6 -88 14 -98" fill="none" stroke="#6b3e1f" stroke-width="6" stroke-linecap="round"/>
      <path d="M8 -80 C18 -106 50 -110 62 -100 C50 -80 24 -72 8 -80 Z" fill="#3ddc97"/>
      ${crumbs.join("\n      ")}
    </g>
  </g>

  <text class="rise" style="animation-delay:.1s" x="${TX}" y="118" font-family="${FONT_MONO}" font-size="20" fill="#3ddc97">// hi there, I'm</text>
  <text class="rise" style="animation-delay:.3s" x="${TX - 4}" y="200" font-family="${FONT_SANS}" font-size="80" font-weight="800" letter-spacing="-2" fill="url(#title)">lolieatapple</text>
  <text x="${TX}" y="${LY}" font-family="${FONT_MONO}" font-size="22" fill="#ff4d6d" font-weight="700">❯</text>
  <g font-family="${FONT_MONO}" font-size="22" fill="#e6e9f5" text-anchor="middle">${lineEls.join("")}</g>
  <rect class="cursor" x="${LX}" y="${LY - 20}" width="11" height="25" fill="#3ddc97">
    <animate attributeName="x" dur="${DUR}s" repeatCount="indefinite" calcMode="discrete" values="${cv.join(";")}" keyTimes="${ct.join(";")}"/>
  </rect>
  ${chipEls.join("\n  ")}

  <line x1="${RX0 - 60}" y1="${RY}" x2="${RX1 + 60}" y2="${RY}" stroke="url(#rail)" stroke-width="2" class="dash"/>
  ${packets.join("\n  ")}
  ${nodes.join("\n  ")}
</g>
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="22" fill="none" stroke="#ffffff" stroke-opacity="0.08"/>
</svg>`;
}

// ---------- stats ----------
const LANG_COLORS = {
  JavaScript: "#f1e05a", TypeScript: "#3178c6", Solidity: "#aa6746", Rust: "#dea584",
  HTML: "#e34c26", CSS: "#663399", Shell: "#89e051", Python: "#3572a5", GDScript: "#478cbf",
  Swift: "#f05138", Go: "#00add8",
};

function stats() {
  const W = 1200, H = 470;
  const kpis = [
    { v: short(total), l: "contributions since " + perYear[0].year, c: "#ff4d6d" },
    { v: fmt(ytd.count), l: `contributions in ${thisYear}`, c: "#3ddc97" },
    { v: fmt(user.public_repos), l: "public repositories", c: "#22d3ee" },
    { v: fmt(g.user.pullRequests.totalCount + g.user.issues.totalCount), l: "pull requests + issues", c: "#c084fc" },
  ];
  const kw = 265, kg = (W - 80 - kw * 4) / 3;
  const kpiEls = kpis.map((k, i) => {
    const x = 40 + i * (kw + kg);
    return `<g class="rise" style="animation-delay:${0.15 + i * 0.15}s">
      <rect x="${x}" y="64" width="${kw}" height="112" rx="16" fill="#ffffff" fill-opacity="0.05" stroke="#ffffff" stroke-opacity="0.1"/>
      <rect x="${x}" y="64" width="4" height="112" rx="2" fill="${k.c}"/>
      <text x="${x + 24}" y="124" font-family="${FONT_SANS}" font-size="44" font-weight="800" fill="${k.c}">${esc(k.v)}</text>
      <text x="${x + 24}" y="154" font-family="${FONT_MONO}" font-size="14" fill="#9aa3c7">${esc(k.l)}</text>
    </g>`;
  });

  // yearly bars
  const CX = 40, CY = 236, CW = 640, CH = 190;
  const max = Math.max(...perYear.map((d) => d.count));
  const bw = CW / perYear.length;
  const bars = perYear.map((d, i) => {
    const h = Math.max(4, (d.count / max) * (CH - 40));
    const x = CX + i * bw + bw * 0.18;
    const w = bw * 0.64;
    const y = CY + CH - h;
    const cur = d.year === thisYear;
    const delay = 0.6 + i * 0.1;
    return `<g>
      <rect${cur ? ' class="now"' : ""} x="${x}" y="${CY + CH}" width="${w}" height="0" rx="6" fill="url(#${cur ? "barNow" : "barFill"})">
        <animate attributeName="height" from="0" to="${h.toFixed(1)}" begin="${delay}s" dur="1s" fill="freeze" calcMode="spline" keySplines=".2 .8 .2 1" keyTimes="0;1"/>
        <animate attributeName="y" from="${CY + CH}" to="${y.toFixed(1)}" begin="${delay}s" dur="1s" fill="freeze" calcMode="spline" keySplines=".2 .8 .2 1" keyTimes="0;1"/></rect>
      <text class="rise" style="animation-delay:${delay + 0.6}s" x="${x + w / 2}" y="${y - 8}" text-anchor="middle" font-family="${FONT_MONO}" font-size="13" fill="${cur ? "#3ddc97" : "#c8cde4"}">${fmt(d.count)}</text>
      <text x="${x + w / 2}" y="${CY + CH + 22}" text-anchor="middle" font-family="${FONT_MONO}" font-size="13" fill="${cur ? "#3ddc97" : "#7c85aa"}">${d.year}${cur ? " ▲" : ""}</text>
    </g>`;
  });

  // languages
  const LX = 740, LW = 420;
  const langEls = langs.map((l, i) => {
    const y = CY + 18 + i * 31;
    const color = LANG_COLORS[l.name] ?? "#9aa4b8";
    const w = Math.max(6, (l.pct / 100) * (LW - 150));
    const begin = (1 + i * 0.12).toFixed(2);
    return `<g class="rise" style="animation-delay:${0.8 + i * 0.12}s">
      <circle cx="${LX + 6}" cy="${y - 5}" r="5" fill="${color}"/>
      <text x="${LX + 20}" y="${y}" font-family="${FONT_MONO}" font-size="14" fill="#e6e9f5">${esc(l.name)}</text>
      <rect x="${LX + 130}" y="${y - 11}" width="${LW - 150}" height="10" rx="5" fill="#ffffff" fill-opacity="0.06"/>
      <rect x="${LX + 130}" y="${y - 11}" width="0" height="10" rx="5" fill="${color}">
        <animate attributeName="width" from="0" to="${w.toFixed(1)}" begin="${begin}s" dur="1.1s" fill="freeze" calcMode="spline" keySplines=".2 .8 .2 1" keyTimes="0;1"/></rect>
      <text x="${LX + LW}" y="${y}" text-anchor="end" font-family="${FONT_MONO}" font-size="13" fill="#9aa3c7">${l.pct.toFixed(0)}%</text>
    </g>`;
  });

  const updated = new Date().toISOString().slice(0, 10);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${fmt(total)} GitHub contributions since ${perYear[0].year}">
<defs>${background(W, H)}
  <linearGradient id="barFill" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#c084fc"/><stop offset="1" stop-color="#6d28d9" stop-opacity="0.5"/>
  </linearGradient>
  <linearGradient id="barNow" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#3ddc97"/><stop offset="1" stop-color="#0f766e" stop-opacity="0.6"/>
  </linearGradient>
</defs>
<style>${baseCss}
  .now { animation: pulse 2.4s ease-in-out 2s infinite; }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: .65; } }
</style>
<g clip-path="url(#frame)">
  ${backdrop(W, H)}
  <text x="40" y="42" font-family="${FONT_MONO}" font-size="16" fill="#3ddc97">// by the numbers</text>
  <text x="${W - 40}" y="42" text-anchor="end" font-family="${FONT_MONO}" font-size="12" fill="#5d6690">auto-updated ${updated}</text>
  ${kpiEls.join("\n  ")}
  <text x="${CX}" y="${CY - 8}" font-family="${FONT_MONO}" font-size="14" fill="#9aa3c7">contributions per year</text>
  <line x1="${CX}" y1="${CY + CH}" x2="${CX + CW}" y2="${CY + CH}" stroke="#ffffff" stroke-opacity="0.15"/>
  ${bars.join("\n  ")}
  <text x="${LX}" y="${CY - 8}" font-family="${FONT_MONO}" font-size="14" fill="#9aa3c7">top languages · by repo</text>
  ${langEls.join("\n  ")}
</g>
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="22" fill="none" stroke="#ffffff" stroke-opacity="0.08"/>
</svg>`;
}

// ---------- contribution grid ----------
const LEVEL_FILL = {
  NONE: "#ffffff", FIRST_QUARTILE: "#7a1f3d", SECOND_QUARTILE: "#c9184a",
  THIRD_QUARTILE: "#ff4d6d", FOURTH_QUARTILE: "#ffb3c1",
};

function grid() {
  const W = 1200, H = 250, CELL = 15, GAP = 4, P = CELL + GAP;
  const weeks = calendar.weeks;
  const GX = (W - weeks.length * P + GAP) / 2, GY = 62;
  const days = weeks.flatMap((w) => w.contributionDays);
  const best = days.reduce((a, d) => (d.contributionCount > a.contributionCount ? d : a), days[0]);
  const active = days.filter((d) => d.contributionCount > 0).length;

  const SWEEP = 6; // seconds for the glow to cross the grid
  const cells = weeks.flatMap((w, wi) =>
    w.contributionDays.map((d) => {
      const row = new Date(d.date + "T00:00:00Z").getUTCDay();
      const fill = LEVEL_FILL[d.contributionLevel];
      if (!fill) throw new Error(`unknown level ${d.contributionLevel}`);
      const none = d.contributionLevel === "NONE";
      const x = GX + wi * P, y = GY + row * P;
      const pop = (wi * 0.025 + row * 0.02).toFixed(3);
      const glow = none ? "" :
        `<animate attributeName="opacity" values="1;1;0.35;1;1" keyTimes="0;${(wi / weeks.length * 0.8).toFixed(3)};${(wi / weeks.length * 0.8 + 0.04).toFixed(3)};${(wi / weeks.length * 0.8 + 0.1).toFixed(3)};1" dur="${SWEEP}s" begin="2.5s" repeatCount="indefinite"/>`;
      return `<rect class="c" style="animation-delay:${pop}s" x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="4" fill="${fill}"${none ? ' fill-opacity="0.06"' : ""}>${glow}</rect>`;
    })
  );

  const bestDate = new Date(best.date + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${fmt(calendar.totalContributions)} contributions in the last year">
<defs>${background(W, H)}</defs>
<style>${baseCss}
  .c { transform-box: fill-box; transform-origin: center; opacity: 0; animation: pop .5s cubic-bezier(.3,1.6,.5,1) forwards; }
  @keyframes pop { from { opacity: 0; transform: scale(0.2); } to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) { .c { opacity: 1; } }
</style>
<g clip-path="url(#frame)">
  ${backdrop(W, H)}
  <text x="${GX}" y="40" font-family="${FONT_MONO}" font-size="16" fill="#3ddc97">// ${fmt(calendar.totalContributions)} contributions in the last year</text>
  <text x="${W - GX}" y="40" text-anchor="end" font-family="${FONT_MONO}" font-size="13" fill="#9aa3c7">active ${active}/${days.length} days · best ${bestDate} (${best.contributionCount})</text>
  ${cells.join("\n  ")}
  <text x="${W - GX - 44 - 5 * 16 - 6}" y="${GY + 7 * P + 22}" text-anchor="end" font-family="${FONT_MONO}" font-size="12" fill="#7c85aa">less</text>
  ${Object.values(LEVEL_FILL).map((f, i) => `<rect x="${W - GX - 44 - (5 - i) * 16}" y="${GY + 7 * P + 11}" width="12" height="12" rx="3" fill="${f}"${i === 0 ? ' fill-opacity="0.06"' : ""}/>`).join("")}
  <text x="${W - GX}" y="${GY + 7 * P + 22}" text-anchor="end" font-family="${FONT_MONO}" font-size="12" fill="#7c85aa">more</text>
</g>
<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="22" fill="none" stroke="#ffffff" stroke-opacity="0.08"/>
</svg>`;
}

mkdirSync("assets", { recursive: true });
writeFileSync("assets/grid.svg", grid());
writeFileSync("assets/hero.svg", hero());
writeFileSync("assets/stats.svg", stats());
console.log("wrote assets/hero.svg, assets/stats.svg, assets/grid.svg");
