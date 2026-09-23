#!/usr/bin/env node
/**
 * generate-assets.mjs — builds every SVG in assets/ from live data.
 *
 *   GITHUB_TOKEN=ghp_... node scripts/generate-assets.mjs
 *
 * Design rules this file obeys (learned the hard way — please keep them):
 *
 *  1. NOTHING is fetched from a third-party stats service. github-readme-stats,
 *     github-profile-trophy and github-readme-activity-graph are dead (503/402).
 *     Everything on the profile is generated here and committed, so it can never
 *     404 or rate-limit in front of a visitor.
 *
 *  2. FRAME ZERO IS THE FINISHED PICTURE. GitHub renders README images through
 *     camo inside an <img>, and some browsers freeze a SMIL timeline at t=0.
 *     So every value that carries meaning — a number, a bar width, a heatmap
 *     cell — is final in the element's own attributes. Animation is an *overlay*
 *     only: clip-path wipes of a brighter copy, travelling sheens, slow drifts.
 *     If the timeline never advances, the card still looks deliberate.
 *
 *  3. Each card paints its own dark background, so it reads identically on
 *     GitHub's light and dark themes. (The tagline strip is the one place that
 *     ships -dark/-light variants, wired up with <picture> in the README.)
 *
 *  4. Offline-safe: every asset is built in memory first. If any API call
 *     fails we exit non-zero having written nothing, so a flaky network can
 *     never commit a half-built profile.
 *
 * No dependencies. Node 18+ (global fetch). Node 24 is what CI uses.
 */

import { writeFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ASSETS = join(ROOT, "assets");
const USER = process.env.GITHUB_USER || "IAshinsana";
const TOKEN = process.env.GITHUB_TOKEN;
const WEEKS = 26; // how much of the contribution calendar the activity card shows

/* ------------------------------------------------------------------ theme */

const T = {
  w: 854,
  bg0: "#070B14",
  bg1: "#0E1626",
  line: "#1E293F",
  lineSoft: "#161F33",
  text: "#E8EEF9",
  dim: "#A3B1C9",
  dim2: "#6B7C99",
  green: "#3FB950",
  blue: "#2F81F7",
  violet: "#A371F7",
  pad: 32,
  // stacked-bar / legend colours, in order
  langColors: ["#3FB950", "#2F81F7", "#A371F7", "#F0A93B", "#EC6A5E", "#2BB3B3", "#8B98AC"],
  // contribution heat ramp, index 0 = no contributions
  heat: ["#141D2F", "#0F4429", "#1D7F45", "#2EA44F", "#57D364"],
};

const SANS = `ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif`;
const MONO = `ui-monospace,'SF Mono','Cascadia Mono',Menlo,Consolas,'Liberation Mono',monospace`;

/* ---------------------------------------------------------------- helpers */

const esc = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const r1 = (n) => Math.round(n * 10) / 10;


/** Group digits, never rounding up. */
const group = (n) => Math.floor(n).toLocaleString("en-US");

/**
 * Compact display that always rounds DOWN, so we can never overstate a number.
 * 22849 -> "22.8K"   1149243 -> "1.14M"   940 -> "940"
 */
function compactDown(n) {
  if (n >= 1_000_000) return `${Math.floor(n / 10_000) / 100}M`;
  if (n >= 10_000) return `${Math.floor(n / 100) / 10}K`;
  return group(n);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const prettyDate = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};

/* ------------------------------------------------------------------ fetch */

async function api(path) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": `${USER}-profile-generator`,
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status} ${res.statusText}`);
  return res.json();
}

async function graphql(query, variables = {}) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": `${USER}-profile-generator`,
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`GraphQL -> ${res.status} ${res.statusText}`);
  const json = await res.json();
  if (json.errors?.length) throw new Error(`GraphQL: ${json.errors.map((e) => e.message).join("; ")}`);
  return json.data;
}

async function collect() {
  const user = await api(`/users/${USER}`);

  const repos = [];
  for (let page = 1; page <= 5; page++) {
    const batch = await api(`/users/${USER}/repos?per_page=100&type=owner&sort=updated&page=${page}`);
    repos.push(...batch);
    if (batch.length < 100) break;
  }

  const own = repos.filter((r) => !r.fork);
  const stars = repos.reduce((a, r) => a + r.stargazers_count, 0);
  const forks = repos.reduce((a, r) => a + r.forks_count, 0);

  // Language bytes, own (non-fork) repos only — counting forks would be
  // claiming other people's code.
  const bytes = new Map();
  for (const repo of own) {
    const langs = await api(`/repos/${USER}/${repo.name}/languages`);
    for (const [name, n] of Object.entries(langs)) bytes.set(name, (bytes.get(name) || 0) + n);
  }

  const data = await graphql(
    `query($login:String!){
       user(login:$login){
         contributionsCollection{
           contributionCalendar{
             totalContributions
             weeks{ firstDay contributionDays{ date weekday contributionCount } }
           }
         }
       }
     }`,
    { login: USER }
  );
  const cal = data.user.contributionsCollection.contributionCalendar;

  return {
    login: user.login,
    publicRepos: user.public_repos,
    followers: user.followers,
    stars,
    forks,
    ownRepoCount: own.length,
    languages: [...bytes.entries()].sort((a, b) => b[1] - a[1]),
    totalContributions: cal.totalContributions,
    weeks: cal.weeks,
    generatedAt: new Date().toISOString().slice(0, 10),
  };
}

/* ------------------------------------------------------- svg construction */

/**
 * The card chrome every asset shares: dark rounded panel, hairline border,
 * and a 3px gradient bar across the top with a sheen that travels along it.
 *
 * The sheen's base gradientTransform parks it off the left edge, so at t=0 —
 * animated or frozen — it is simply not there. Pure decoration.
 */
function chrome(h, idp) {
  return `
  <defs>
    <linearGradient id="${idp}-panel" x1="0" y1="0" x2="0.45" y2="1">
      <stop offset="0" stop-color="${T.bg0}"/>
      <stop offset="1" stop-color="${T.bg1}"/>
    </linearGradient>
    <linearGradient id="${idp}-accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${T.green}"/>
      <stop offset="0.5" stop-color="${T.blue}"/>
      <stop offset="1" stop-color="${T.violet}"/>
    </linearGradient>
    <linearGradient id="${idp}-sheen" x1="0" y1="0" x2="1" y2="0" gradientTransform="translate(-1 0)">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0"/>
      <stop offset="0.45" stop-color="#FFFFFF" stop-opacity="0.75"/>
      <stop offset="0.55" stop-color="#FFFFFF" stop-opacity="0.75"/>
      <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
      <animateTransform attributeName="gradientTransform" type="translate"
        values="-1 0; 1 0" dur="4.5s" begin="0s" repeatCount="indefinite"/>
    </linearGradient>
    <clipPath id="${idp}-clip"><rect x="0" y="0" width="${T.w}" height="${h}" rx="16"/></clipPath>
  </defs>
  <rect x="0.5" y="0.5" width="${T.w - 1}" height="${h - 1}" rx="15.5"
        fill="url(#${idp}-panel)" stroke="${T.line}"/>
  <g clip-path="url(#${idp}-clip)">
    <rect x="0" y="0" width="${T.w}" height="3" fill="url(#${idp}-accent)"/>
    <rect x="0" y="0" width="${T.w}" height="3" fill="url(#${idp}-sheen)"/>
  </g>`;
}

/** Small uppercase label at the top-left of a card, plus an optional right note. */
function eyebrow(text, note) {
  const right = note
    ? `<text x="${T.w - T.pad}" y="38" text-anchor="end" font-family="${SANS}" font-size="12"
             fill="${T.dim2}">${esc(note)}</text>`
    : "";
  return `
  <text x="${T.pad}" y="38" font-family="${SANS}" font-size="11.5" font-weight="700"
        letter-spacing="1.9" fill="${T.dim2}">${esc(text.toUpperCase())}</text>${right}`;
}

/**
 * A big number that is ALWAYS legible, with a gradient copy wiped in over it.
 * Base state = the plain readable number; the clip starts at width 0, so a
 * frozen timeline simply shows the plain number. This is the "counter that
 * settles" without ever risking an unreadable frame.
 */
function statTile({ cx, y, value, label, idp, i, gradient }) {
  const est = String(value).length * 0.62 * 38 + 24; // generous wipe box
  return `
  <clipPath id="${idp}-wipe${i}">
    <rect x="${cx - est / 2}" y="${y - 40}" width="0" height="54">
      <animate attributeName="width" values="0;${est}" dur="0.85s"
               begin="${0.15 + i * 0.12}s" fill="freeze" repeatCount="1"/>
    </rect>
  </clipPath>
  <text x="${cx}" y="${y}" text-anchor="middle" font-family="${SANS}" font-size="38"
        font-weight="700" fill="${T.text}" style="font-variant-numeric:tabular-nums">${esc(value)}</text>
  <text x="${cx}" y="${y}" text-anchor="middle" font-family="${SANS}" font-size="38"
        font-weight="700" fill="url(#${gradient})" clip-path="url(#${idp}-wipe${i})"
        style="font-variant-numeric:tabular-nums">${esc(value)}</text>
  <text x="${cx}" y="${y + 24}" text-anchor="middle" font-family="${SANS}" font-size="12.5"
        letter-spacing="0.4" fill="${T.dim}">${esc(label)}</text>`;
}

/* ------------------------------------------------------------ 1. header */

function buildHeader(d, site) {
  const h = 208;
  const chips = [
    `${group(site.tools_live)} free tools`,
    `${group(site.articles)} articles`,
    "no signup, no paywall",
  ];

  let x = T.pad;
  const chipSvg = chips
    .map((c) => {
      const w = c.length * 7.1 + 28;
      const s = `
    <rect x="${r1(x)}" y="158" width="${r1(w)}" height="30" rx="15" fill="#0B1322"
          stroke="${T.line}"/>
    <text x="${r1(x + w / 2)}" y="177.5" text-anchor="middle" font-family="${SANS}"
          font-size="12.5" fill="${T.dim}">${esc(c)}</text>`;
      x += w + 10;
      return s;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${T.w}" height="${h}" viewBox="0 0 ${T.w} ${h}"
     role="img" aria-label="Induwara Ashinsana — I build tools that ship themselves">
  <title>Induwara Ashinsana — I build tools that ship themselves</title>
  ${chrome(h, "hd")}
  <defs>
    <filter id="hd-blur" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="46"/>
    </filter>
    <linearGradient id="hd-mono" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${T.green}"/>
      <stop offset="1" stop-color="${T.violet}"/>
    </linearGradient>
  </defs>

  <!-- Aurora. Base positions are the finished composition; the drift is a slow
       nudge around them, so a frozen frame is still the intended picture. -->
  <g clip-path="url(#hd-clip)" filter="url(#hd-blur)">
    <ellipse cx="120" cy="56" rx="150" ry="96" fill="${T.green}" opacity="0.30">
      <animateTransform attributeName="transform" type="translate"
        values="0 0; 26 14; 0 0" dur="17s" repeatCount="indefinite"/>
    </ellipse>
    <ellipse cx="470" cy="210" rx="190" ry="104" fill="${T.blue}" opacity="0.26">
      <animateTransform attributeName="transform" type="translate"
        values="0 0; -30 -12; 0 0" dur="21s" repeatCount="indefinite"/>
    </ellipse>
    <ellipse cx="790" cy="40" rx="150" ry="110" fill="${T.violet}" opacity="0.24">
      <animateTransform attributeName="transform" type="translate"
        values="0 0; -18 22; 0 0" dur="19s" repeatCount="indefinite"/>
    </ellipse>
  </g>
  <g clip-path="url(#hd-clip)">
    <rect x="0" y="0" width="${T.w}" height="3" fill="url(#hd-accent)"/>
    <rect x="0" y="0" width="${T.w}" height="3" fill="url(#hd-sheen)"/>
  </g>

  <text x="${T.pad}" y="60" font-family="${SANS}" font-size="11.5" font-weight="700"
        letter-spacing="2.2" fill="${T.dim2}">BUILDING IN PUBLIC FROM SRI LANKA</text>

  <text x="${T.pad}" y="108" font-family="${SANS}" font-size="43" font-weight="700"
        letter-spacing="-0.6" fill="#FFFFFF">Induwara Ashinsana</text>

  <text x="${T.pad}" y="137" font-family="${SANS}" font-size="16.5" fill="${T.dim}">I build tools that ship themselves.</text>
  ${chipSvg}

  <!-- Monogram. The ring is fully drawn at rest; only its rotation animates. -->
  <g>
    <circle cx="762" cy="104" r="63" fill="none" stroke="${T.line}" stroke-width="1.5"
            stroke-dasharray="5 9" opacity="0.9">
      <animateTransform attributeName="transform" type="rotate"
        values="0 762 104; 360 762 104" dur="44s" repeatCount="indefinite"/>
    </circle>
    <rect x="714" y="56" width="96" height="96" rx="26" fill="#0B1322"
          stroke="url(#hd-mono)" stroke-width="2"/>
    <text x="762" y="119" text-anchor="middle" font-family="${SANS}" font-size="40"
          font-weight="700" fill="url(#hd-mono)">IA</text>
  </g>
</svg>
`;
}

/* ------------------------------------------------------------- 2. tagline */

function buildTagline(site, mode) {
  const w = 720;
  const h = 44;
  const accent = mode === "dark" ? "#3FB950" : "#1A7F37";
  const body = mode === "dark" ? "#79C0FF" : "#0A58CA";
  const line = `${group(site.tools_live)} free tools · no signup · shipped by an autonomous pipeline`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"
     role="img" aria-label="${esc(line)}">
  <title>${esc(line)}</title>
  <text x="${w / 2}" y="28" text-anchor="middle" font-family="${MONO}" font-size="15" font-weight="600">
    <tspan fill="${accent}">&gt;</tspan><tspan fill="${body}" dx="8">${esc(line)}</tspan><tspan fill="${accent}" dx="4">&#9612;<animate
      attributeName="opacity" values="1;1;0;0;1" keyTimes="0;0.49;0.5;0.99;1"
      dur="1.2s" calcMode="discrete" repeatCount="indefinite"/></tspan>
  </text>
</svg>
`;
}

/* --------------------------------------------------------- 3. stats card */

function buildStats(d) {
  const h = 168;
  const tiles = [
    [group(d.publicRepos), "public repos"],
    [group(d.totalContributions), "contributions / year"],
    [group(d.followers), "followers"],
    [group(d.stars), d.stars === 1 ? "star" : "stars"],
  ];
  const slot = (T.w - T.pad * 2) / 4;

  const body = tiles
    .map(([value, label], i) =>
      statTile({
        cx: T.pad + slot * (i + 0.5),
        y: 104,
        value,
        label,
        idp: "st",
        i,
        gradient: "st-accent",
      })
    )
    .join("");

  const rules = [1, 2, 3]
    .map(
      (i) =>
        `<line x1="${r1(T.pad + slot * i)}" y1="62" x2="${r1(T.pad + slot * i)}" y2="130"
               stroke="${T.lineSoft}" stroke-width="1"/>`
    )
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${T.w}" height="${h}" viewBox="0 0 ${T.w} ${h}"
     role="img" aria-label="GitHub: ${d.publicRepos} public repos, ${d.totalContributions} contributions in the last year, ${d.followers} followers, ${d.stars} stars">
  <title>GitHub — @${esc(d.login)}</title>
  ${chrome(h, "st")}
  ${eyebrow(`GitHub — @${d.login}`, `regenerated ${prettyDate(d.generatedAt)}`)}
  ${rules}
  ${body}
  <text x="${T.pad}" y="152" font-family="${SANS}" font-size="11.5" fill="${T.dim2}">Counted straight from the GitHub REST and GraphQL APIs by scripts/generate-assets.mjs — no third-party widget, no estimate.</text>
</svg>
`;
}

/* ----------------------------------------------------- 4. language mix */

function buildLanguages(d) {
  const h = 208;
  const total = d.languages.reduce((a, [, n]) => a + n, 0) || 1;
  const top = d.languages.slice(0, 6);
  const rest = d.languages.slice(6).reduce((a, [, n]) => a + n, 0);
  const rows = rest > 0 ? [...top, ["Other", rest]] : top;

  const barX = T.pad;
  const barY = 58;
  const barW = T.w - T.pad * 2;
  const barH = 20;

  // Widths are FINAL in the base attributes — the proportions are the data.
  let cursor = barX;
  const segs = rows
    .map(([name, n], i) => {
      const w = (n / total) * barW;
      const s = `<rect x="${r1(cursor)}" y="${barY}" width="${r1(Math.max(w, 1))}" height="${barH}"
                       fill="${T.langColors[i % T.langColors.length]}"><title>${esc(name)} ${r1((n / total) * 100)}%</title></rect>`;
      cursor += w;
      return s;
    })
    .join("");

  // Legend: 2 rows x 3 columns (7th item wraps onto the second row's last slot).
  const colX = [T.pad, T.pad + 268, T.pad + 536];
  const rowY = [118, 154];
  const legend = rows
    .map(([name, n], i) => {
      const x = colX[i % 3];
      const y = rowY[Math.floor(i / 3)];
      const pct = `${((n / total) * 100).toFixed(1)}%`;
      return `
    <rect x="${x}" y="${y - 12}" width="11" height="11" rx="3" fill="${T.langColors[i % T.langColors.length]}"/>
    <text x="${x + 20}" y="${y - 2}" font-family="${SANS}" font-size="13.5" fill="${T.text}">${esc(name)}</text>
    <text x="${x + 236}" y="${y - 2}" text-anchor="end" font-family="${SANS}" font-size="13.5"
          fill="${T.dim}" style="font-variant-numeric:tabular-nums">${pct}</text>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${T.w}" height="${h}" viewBox="0 0 ${T.w} ${h}"
     role="img" aria-label="Language mix across ${d.ownRepoCount} own public repositories">
  <title>Language mix — ${d.ownRepoCount} own public repos</title>
  ${chrome(h, "lg")}
  ${eyebrow("Language mix — own public repos", `${d.ownRepoCount} repos · forks excluded`)}
  <defs>
    <clipPath id="lg-bar"><rect x="${barX}" y="${barY}" width="${barW}" height="${barH}" rx="10"/></clipPath>
    <linearGradient id="lg-gloss" x1="0" y1="0" x2="1" y2="0" gradientTransform="translate(-1 0)">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0"/>
      <stop offset="0.5" stop-color="#FFFFFF" stop-opacity="0.32"/>
      <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
      <animateTransform attributeName="gradientTransform" type="translate"
        values="-1 0; 1 0" dur="5.2s" begin="0.6s" repeatCount="indefinite"/>
    </linearGradient>
  </defs>
  <g clip-path="url(#lg-bar)">
    ${segs}
    <rect x="${barX}" y="${barY}" width="${barW}" height="${barH}" fill="url(#lg-gloss)"/>
  </g>
  ${legend}
  <text x="${T.pad}" y="${h - 16}" font-family="${SANS}" font-size="11.5" fill="${T.dim2}">Byte counts from the GitHub languages API, including older coursework repos — day-to-day work is the TypeScript slice.</text>
</svg>
`;
}

/* ------------------------------------------------- 5. contribution graph */

function buildActivity(d) {
  const weeks = d.weeks.slice(-WEEKS);
  const days = weeks.flatMap((w) => w.contributionDays);
  const counts = days.map((x) => x.contributionCount);
  const active = counts.filter((c) => c > 0).length;
  const busiest = Math.max(0, ...counts);

  // Heat thresholds from this window's own non-zero days, so the ramp always
  // uses its full range instead of collapsing to one shade.
  const nz = counts.filter((c) => c > 0).sort((a, b) => a - b);
  const q = (p) => (nz.length ? nz[Math.min(nz.length - 1, Math.floor(nz.length * p))] : 1);
  const t1 = q(0.35);
  const t2 = q(0.7);
  const t3 = q(0.9);
  const level = (c) => (c === 0 ? 0 : c <= t1 ? 1 : c <= t2 ? 2 : c <= t3 ? 3 : 4);

  const gridX = 62;
  const gridY = 76;
  const pitch = 29;
  const cell = 25;
  const gridW = WEEKS * pitch - (pitch - cell);
  const gridH = 7 * pitch - (pitch - cell);
  const h = gridY + gridH + 62;

  let cells = "";
  let months = "";
  let seenMonth = -1;
  let lastLabelX = -Infinity;
  let peak = null;

  weeks.forEach((week, wi) => {
    const x = gridX + wi * pitch;
    const m = Number(week.firstDay.split("-")[1]);
    // One label per month. The first column is usually the tail of the previous
    // month, so it is never labelled; and no two labels are allowed to crowd.
    if (m !== seenMonth) {
      seenMonth = m;
      if (wi > 0 && wi < WEEKS - 1 && x - lastLabelX >= pitch * 2.5) {
        lastLabelX = x;
        months += `<text x="${x}" y="66" font-family="${SANS}" font-size="11.5" fill="${T.dim2}">${MONTHS[m - 1]}</text>`;
      }
    }
    for (const day of week.contributionDays) {
      const y = gridY + day.weekday * pitch;
      const lv = level(day.contributionCount);
      if (day.contributionCount === busiest && busiest > 0 && !peak) peak = { x, y };
      cells += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="7" fill="${T.heat[lv]}"><title>${day.date}: ${day.contributionCount}</title></rect>`;
    }
  });

  // Decorative: a soft diagonal sheen crossing the grid, parked off-canvas at
  // rest, plus one quiet halo on the busiest day.
  const halo = peak
    ? `<rect x="${peak.x - 3}" y="${peak.y - 3}" width="${cell + 6}" height="${cell + 6}" rx="10"
             fill="none" stroke="${T.green}" stroke-width="2" opacity="0">
         <animate attributeName="opacity" values="0;0.85;0" dur="3.4s" begin="1s" repeatCount="indefinite"/>
       </rect>`
    : "";

  const dayLabels = [
    [1, "Mon"],
    [3, "Wed"],
    [5, "Fri"],
  ]
    .map(
      ([row, name]) =>
        `<text x="${T.pad}" y="${gridY + row * pitch + 17}" font-family="${SANS}" font-size="11"
               fill="${T.dim2}">${name}</text>`
    )
    .join("");

  const swatchX = T.w - T.pad - 5 * 16 - 74;
  const legend =
    `<text x="${swatchX - 8}" y="${h - 26}" text-anchor="end" font-family="${SANS}" font-size="11.5" fill="${T.dim2}">Less</text>` +
    T.heat
      .map(
        (c, i) =>
          `<rect x="${swatchX + i * 16}" y="${h - 36}" width="12" height="12" rx="3.5" fill="${c}"/>`
      )
      .join("") +
    `<text x="${swatchX + 5 * 16 + 2}" y="${h - 26}" font-family="${SANS}" font-size="11.5" fill="${T.dim2}">More</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${T.w}" height="${h}" viewBox="0 0 ${T.w} ${h}"
     role="img" aria-label="Contribution activity for the last ${WEEKS} weeks: ${active} active days, busiest day ${busiest} contributions">
  <title>Contributions — last ${WEEKS} weeks</title>
  ${chrome(h, "ac")}
  ${eyebrow(`Contributions — last ${WEEKS} weeks`, `${group(d.totalContributions)} in the last year`)}
  <defs>
    <clipPath id="ac-grid"><rect x="${gridX}" y="${gridY}" width="${gridW}" height="${gridH}" rx="8"/></clipPath>
    <linearGradient id="ac-sheen" x1="0" y1="0" x2="1" y2="0.55" gradientTransform="translate(-1 0)">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0"/>
      <stop offset="0.5" stop-color="#FFFFFF" stop-opacity="0.16"/>
      <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
      <animateTransform attributeName="gradientTransform" type="translate"
        values="-1 0; 1 0" dur="6s" begin="0.8s" repeatCount="indefinite"/>
    </linearGradient>
  </defs>
  ${months}
  ${dayLabels}
  ${cells}
  ${halo}
  <g clip-path="url(#ac-grid)"><rect x="${gridX}" y="${gridY}" width="${gridW}" height="${gridH}" fill="url(#ac-sheen)"/></g>
  <text x="${T.pad}" y="${h - 26}" font-family="${SANS}" font-size="12" fill="${T.dim}">${active} active days out of ${days.length} · busiest day ${busiest} contributions</text>
  ${legend}
</svg>
`;
}

/* ------------------------------------------------------ 6. the site card */

function buildSiteCard(site) {
  const h = 288;
  const slot = (T.w - T.pad * 2) / 4;
  const tiles = [
    [group(site.tools_live), "live tools"],
    [group(site.articles), "articles"],
    [compactDown(site.clicks_28d), `Google clicks / ${site.window_days}d`],
    [compactDown(site.impressions_28d), `impressions / ${site.window_days}d`],
  ];
  const stats = tiles
    .map(([value, label], i) =>
      statTile({ cx: T.pad + slot * (i + 0.5), y: 96, value, label, idp: "sc", i, gradient: "sc-accent" })
    )
    .join("");

  // --- one bar per day of real Google clicks, linear scale, spike and all ---
  // Bars rather than an area chart: one day went viral, and on a line the other
  // 27 days flatten into nothing. Heights are the data, in the base attributes.
  const series = site.daily_clicks;
  const px = T.pad + 4;
  const pw = T.w - T.pad * 2 - 8;
  const py = 156;
  const ph = 92;
  const max = Math.max(...series);
  const pitch = pw / series.length;
  const bw = pitch - 8;
  const barH = (v) => Math.max(3, (v / max) * ph);
  const barX = (i) => px + i * pitch + 4;

  const peakI = series.indexOf(max);
  const medY = py + ph - (site.median_daily_clicks / max) * ph;

  const dayISO = (i) => {
    const t = new Date(`${site.window_start}T00:00:00Z`);
    t.setUTCDate(t.getUTCDate() + i);
    return t.toISOString().slice(0, 10);
  };

  const bars = (fill, extra = "") =>
    series
      .map((v, i) => {
        const bh = barH(v);
        return `<rect x="${r1(barX(i))}" y="${r1(py + ph - bh)}" width="${r1(bw)}" height="${r1(bh)}" rx="4" fill="${fill}"${extra}><title>${dayISO(i)}: ${group(v)} clicks</title></rect>`;
      })
      .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${T.w}" height="${h}" viewBox="0 0 ${T.w} ${h}"
     role="img" aria-label="induwara.lk: ${group(site.tools_live)} live tools, ${group(site.articles)} articles, ${compactDown(site.clicks_28d)} Google clicks and ${compactDown(site.impressions_28d)} impressions in ${site.window_days} days">
  <title>induwara.lk — free tools for Sri Lanka</title>
  ${chrome(h, "sc")}
  ${eyebrow("induwara.lk — free tools for Sri Lanka", `figures as of ${prettyDate(site.as_of)}`)}
  <defs>
    <linearGradient id="sc-bars" x1="${px}" y1="0" x2="${r1(px + pw)}" y2="0" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${T.green}"/>
      <stop offset="0.55" stop-color="${T.blue}"/>
      <stop offset="1" stop-color="${T.violet}"/>
    </linearGradient>
    <!-- Scan highlight. Parked off the left edge at rest, so a frozen frame
         shows the bars exactly as the data draws them. -->
    <clipPath id="sc-scan">
      <rect x="${r1(px - 120)}" y="${py - 4}" width="110" height="${ph + 8}">
        <animate attributeName="x" values="${r1(px - 120)};${r1(px + pw)}" dur="3.8s"
                 begin="0.5s" repeatCount="indefinite"/>
      </rect>
    </clipPath>
  </defs>
  ${stats}
  <line x1="${T.pad}" y1="132" x2="${T.w - T.pad}" y2="132" stroke="${T.lineSoft}"/>

  ${bars("url(#sc-bars)")}
  <g clip-path="url(#sc-scan)">${bars("#FFFFFF", ' opacity="0.3"')}</g>
  <line x1="${px}" y1="${r1(medY)}" x2="${r1(px + pw)}" y2="${r1(medY)}" stroke="${T.dim2}"
        stroke-width="1" stroke-dasharray="3 5"/>
  <line x1="${px}" y1="${py + ph}" x2="${r1(px + pw)}" y2="${py + ph}" stroke="${T.lineSoft}"/>

  <line x1="${r1(barX(peakI) + bw / 2)}" y1="${py + 4}" x2="${r1(barX(peakI) + bw / 2)}" y2="${py - 2}" stroke="${T.dim2}"/>
  <text x="${r1(barX(peakI) + bw + 10)}" y="${py + 10}" font-family="${SANS}" font-size="11.5"
        fill="${T.dim}">peak ${group(max)} clicks in one day</text>
  <line x1="${r1(px + pw - 152)}" y1="${py + 6}" x2="${r1(px + pw - 138)}" y2="${py + 6}"
        stroke="${T.dim2}" stroke-width="1" stroke-dasharray="3 5"/>
  <text x="${r1(px + pw)}" y="${py + 10}" text-anchor="end" font-family="${SANS}" font-size="11.5"
        fill="${T.dim2}">median ${group(site.median_daily_clicks)} clicks/day</text>

  <text x="${T.pad}" y="${h - 18}" font-family="${SANS}" font-size="11.5" fill="${T.dim2}">Organic Google clicks per day, ${prettyDate(site.window_start)} to ${prettyDate(site.window_end)} · Search Console · ${group(site.pages_with_impressions_28d)} pages drew impressions · avg position ${r1(site.avg_position)}.</text>
</svg>
`;
}

/* ------------------------------------------------------------- 7. footer */

function buildFooter(site) {
  const h = 96;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${T.w}" height="${h}" viewBox="0 0 ${T.w} ${h}"
     role="img" aria-label="Built in Sri Lanka — free tools, no signup, no paywall — induwara.lk">
  <title>Built in Sri Lanka — induwara.lk</title>
  ${chrome(h, "ft")}
  <text x="${T.w / 2}" y="46" text-anchor="middle" font-family="${SANS}" font-size="16.5"
        font-weight="600" fill="${T.text}">Built in Sri Lanka — free tools, no signup, no paywall.</text>
  <text x="${T.w / 2}" y="70" text-anchor="middle" font-family="${MONO}" font-size="13"
        fill="${T.dim}">induwara.lk</text>
  <rect x="0" y="${h - 3}" width="${T.w}" height="3" fill="url(#ft-accent)"/>
  <rect x="0" y="${h - 3}" width="${T.w}" height="3" fill="url(#ft-sheen)"/>
</svg>
`;
}

/* --------------------------------------------------------------- driver */

async function main() {
  if (!TOKEN) {
    console.error("GITHUB_TOKEN is not set. Refusing to run against the unauthenticated rate limit.");
    process.exit(1);
  }

  const statsPath = join(ROOT, "data", "site-stats.json");
  let site;
  try {
    site = JSON.parse(await readFile(statsPath, "utf8"));
  } catch (err) {
    console.error(`Could not read ${statsPath}: ${err.message}`);
    process.exit(1);
  }

  let d;
  try {
    d = await collect();
  } catch (err) {
    console.error(`GitHub API failed, nothing written: ${err.message}`);
    process.exit(1);
  }

  // Build everything in memory first — a half-built profile is worse than none.
  const files = {
    "header.svg": buildHeader(d, site),
    "tagline-dark.svg": buildTagline(site, "dark"),
    "tagline-light.svg": buildTagline(site, "light"),
    "stats.svg": buildStats(d),
    "languages.svg": buildLanguages(d),
    "activity.svg": buildActivity(d),
    "induwara-lk.svg": buildSiteCard(site),
    "footer.svg": buildFooter(site),
  };

  for (const [name, body] of Object.entries(files)) {
    if (!body || body.length < 200) throw new Error(`${name} came out empty — aborting`);
  }

  await mkdir(ASSETS, { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    await writeFile(join(ASSETS, name), body, "utf8");
    console.log(`wrote assets/${name} (${body.length} bytes)`);
  }

  console.log(
    `\n@${d.login}: ${d.publicRepos} public repos · ${d.totalContributions} contributions/yr · ` +
      `${d.followers} followers · ${d.stars} stars · ${d.forks} forks`
  );
  console.log(
    `induwara.lk (as of ${site.as_of}): ${group(site.tools_live)} tools · ${group(site.articles)} articles · ` +
      `${compactDown(site.clicks_28d)} clicks / ${compactDown(site.impressions_28d)} impressions in ${site.window_days}d`
  );
}

main().catch((err) => {
  console.error(err.stack || String(err));
  process.exit(1);
});
