#!/usr/bin/env node
/**
 * GrowthKit AI — deliverable generator (Phase 4, Step 1 + Step 4 tooling).
 *
 * Turns a client JSON file + deliverables/template.html into a finished,
 * self-contained deliverable at an unguessable URL:
 *
 *     node scripts/make-deliverable.mjs clients/<client>.json
 *     node scripts/make-deliverable.mjs clients/demo.json --force
 *
 * What it does:
 *   1. Validates the JSON (every required field, with exact dotted paths in
 *      the error report — all problems at once, not one at a time).
 *   2. HTML-escapes every injected string (client data is untrusted input).
 *   3. Renders the list sections (segments, competitors, gaps, matrix, plays…)
 *      — this script is the single source of truth for row markup, so the
 *      template and generated documents can never drift apart.
 *   4. Mints an unguessable URL token on first run (crypto-random base58,
 *      22 chars) and writes it back into the client JSON so the client's URL
 *      stays stable across monthly refreshes.
 *   5. Writes  d/<token>/<slug>-<period>.html  (refuses to overwrite without
 *      --force). A monthly refresh = bump "period"/"periodLabel" in the JSON,
 *      re-run, commit — the new file lands next to last month's.
 *
 * Deployment reality check (printed on every run):
 *   - Files under d/ only go live when committed + pushed (Vercel deploys git).
 *   - d/ is noindex (X-Robots-Tag header), robots-disallowed, and excluded
 *     from the sitemap — but THE GITHUB REPO IS THE REAL EXPOSURE: while the
 *     repo is public, anything committed under d/ or clients/ is readable by
 *     anyone on GitHub. clients/ and d/ are gitignored except the demo.
 *     >>> Make the repo private before committing a real client file:
 *     >>>   gh repo edit growthkitsai-coder/GrowthKit-AI --visibility private --accept-visibility-change-consequences
 *
 * Zero dependencies. Node 18+.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TEMPLATE = join(ROOT, 'deliverables', 'template.html');
const OUT_ROOT = join(ROOT, 'd');

// ── CLI ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const force = args.includes('--force');
const jsonArg = args.find((a) => !a.startsWith('--'));
if (!jsonArg) {
  console.error('Usage: node scripts/make-deliverable.mjs <clients/client.json> [--force]');
  process.exit(1);
}
const jsonPath = resolve(process.cwd(), jsonArg);
if (!existsSync(jsonPath)) {
  console.error(`✗ No such file: ${jsonPath}`);
  process.exit(1);
}

// ── Load + validate ──────────────────────────────────────────────────────────
let data;
try {
  data = JSON.parse(readFileSync(jsonPath, 'utf8'));
} catch (e) {
  console.error(`✗ ${jsonArg} is not valid JSON: ${e.message}`);
  process.exit(1);
}

const problems = [];
const need = (path, test, why) => {
  const val = path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), data);
  if (!test(val)) problems.push(`  • ${path} — ${why}`);
  return val;
};
const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const isArr = (n) => (v) => Array.isArray(v) && v.length === n;
const isArrMin = (n) => (v) => Array.isArray(v) && v.length >= n;

need('client', isStr, 'client display name (string)');
need('slug', (v) => isStr(v) && /^[a-z0-9-]+$/.test(v), 'url-safe slug, lowercase letters/digits/hyphens only');
need('period', (v) => isStr(v) && /^\d{4}-\d{2}$/.test(v), 'refresh period as YYYY-MM');
need('periodLabel', isStr, 'human period label, e.g. "June 2026"');
need('refreshNumber', (v) => Number.isInteger(v) && v >= 1, 'integer refresh counter, starts at 1');
need('dateIssued', isStr, 'issue date, e.g. "10 June 2026"');
need('nextRefresh', isStr, 'next refresh date, e.g. "8 July 2026"');
need('preparedFor', isStr, 'who receives this (name, role)');
need('preparedBy', isStr, 'who prepared it');
need('tldr.verdict', isStr, 'the one-paragraph verdict');
need('tldr.moves', (v) => Array.isArray(v) && v.length === 3 && v.every(isStr), 'exactly 3 move strings');
need('market.intro', isStr, 'analyst note for the market section');
need('market.tam', isStr, 'TAM figure');
need('market.sam', isStr, 'SAM figure');
need('market.som', isStr, 'SOM figure');
need('market.signals', isStr, 'demand-signal count, e.g. "~1,240"');
need('market.signalsNote', isStr, 'one line on signal sources');
const segments = need('market.segments', isArrMin(3), 'at least 3 segment objects');
(segments || []).forEach((s, i) => {
  for (const k of ['name', 'definition', 'size', 'urgency']) {
    if (!isStr(s?.[k])) problems.push(`  • market.segments[${i}].${k} — required string`);
  }
  if (!(Number.isFinite(s?.score) && s.score >= 0 && s.score <= 100)) {
    problems.push(`  • market.segments[${i}].score — number 0–100`);
  }
});
const competitors = need('competitors', isArrMin(3), 'at least 3 competitor objects (5 is the product promise)');
(competitors || []).forEach((c, i) => {
  for (const k of ['name', 'oneLiner', 'positioning', 'pricing', 'channels', 'cadence', 'complaints', 'soft']) {
    if (!isStr(c?.[k])) problems.push(`  • competitors[${i}].${k} — required string`);
  }
});
need('gaps.intro', isStr, 'analyst note for the gaps section');
need('gaps.wedge', isStr, 'the wedge thesis');
const gapItems = need('gaps.items', isArrMin(3), 'at least 3 gap objects (5–8 is the product promise)');
(gapItems || []).forEach((g, i) => {
  for (const k of ['title', 'evidence']) {
    if (!isStr(g?.[k])) problems.push(`  • gaps.items[${i}].${k} — required string`);
  }
  if (!['high', 'medium', 'low'].includes(g?.urgency)) {
    problems.push(`  • gaps.items[${i}].urgency — "high" | "medium" | "low"`);
  }
});
const matrixRows = need('gaps.matrix', isArrMin(3), 'at least 3 matrix rows');
(matrixRows || []).forEach((r, i) => {
  if (!isStr(r?.dimension)) problems.push(`  • gaps.matrix[${i}].dimension — required string`);
  const ok = (v) => ['yes', 'part', 'no'].includes(v);
  if (!ok(r?.you)) problems.push(`  • gaps.matrix[${i}].you — "yes" | "part" | "no"`);
  if (!Array.isArray(r?.rivals) || r.rivals.length !== (competitors?.length || 0) || !r.rivals.every(ok)) {
    problems.push(`  • gaps.matrix[${i}].rivals — array of ${competitors?.length || '?'} × "yes"|"part"|"no" (one per competitor, same order)`);
  }
});
need('plan.intro', isStr, 'note on how the plays are sequenced');
need('plan.review', (v) => Array.isArray(v) && v.length >= 3 && v.every(isStr), 'at least 3 weekly-review agenda strings');
const months = need('plan.months', isArr(3), 'exactly 3 month objects (Days 0–30 / 31–60 / 61–90)');
let playCount = 0;
(months || []).forEach((m, i) => {
  if (!isStr(m?.label)) problems.push(`  • plan.months[${i}].label — required string`);
  if (!Array.isArray(m?.plays) || m.plays.length < 1) {
    problems.push(`  • plan.months[${i}].plays — non-empty array`);
    return;
  }
  m.plays.forEach((p, j) => {
    playCount++;
    for (const k of ['title', 'channel', 'what', 'kill', 'metric']) {
      if (!isStr(p?.[k])) problems.push(`  • plan.months[${i}].plays[${j}].${k} — required string`);
    }
  });
});

if (problems.length) {
  console.error(`✗ ${jsonArg} failed validation (${problems.length} problem${problems.length === 1 ? '' : 's'}):\n`);
  console.error(problems.join('\n'));
  process.exit(1);
}
if (playCount !== 14) {
  console.warn(`⚠ plan has ${playCount} plays — the product promise is ~14. Proceeding anyway.`);
}

// ── Escaping ─────────────────────────────────────────────────────────────────
const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// ── Token (stable per client, minted once) ───────────────────────────────────
function mintToken() {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'; // base58
  const bytes = randomBytes(22);
  let out = '';
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out;
}
let token = data.token;
let mintedNow = false;
if (!isStr(token)) {
  token = mintToken();
  data.token = token;
  writeFileSync(jsonPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
  mintedNow = true;
}

// ── Section renderers — the single source of truth for row markup ───────────
const renderMoves = () =>
  data.tldr.moves
    .map((m, i) => `<li><span class="n">0${i + 1}</span><span>${esc(m)}</span></li>`)
    .join('\n            ');

const renderSegments = () =>
  data.market.segments
    .map(
      (s, i) => `<div class="seg">
          <div class="rank">${['i.', 'ii.', 'iii.', 'iv.', 'v.', 'vi.'][i] || i + 1 + '.'}</div>
          <div class="name">${esc(s.name)}<small>${esc(s.definition)}</small></div>
          <div class="facts">${esc(s.size)}<br><span class="dim">urgency —</span> ${esc(s.urgency)}</div>
          <div class="scorebox">
            <div class="score">${Math.round(s.score)} / 100</div>
            <div class="bar"><i style="--w: ${Math.round(s.score)}%"></i></div>
          </div>
        </div>`
    )
    .join('\n        ');

const renderCompetitors = () =>
  data.competitors
    .map(
      (c, i) => `<article class="comp">
          <div class="comp-head">
            <h3>${esc(c.name)}</h3>
            <span class="comp-num">rival 0${i + 1}</span>
          </div>
          <p class="one-liner">${esc(c.oneLiner)}</p>
          <dl>
            <div><dt>Positioning</dt><dd>${esc(c.positioning)}</dd></div>
            <div><dt>Pricing</dt><dd>${esc(c.pricing)}</dd></div>
            <div><dt>Channels</dt><dd>${esc(c.channels)}</dd></div>
            <div><dt>Content cadence</dt><dd>${esc(c.cadence)}</dd></div>
            <div><dt>Complaint themes</dt><dd>${esc(c.complaints)}</dd></div>
          </dl>
          <div class="soft"><b>Where they're soft</b>${esc(c.soft)}</div>
        </article>`
    )
    .join('\n        ');

const urgencyChip = (u) =>
  u === 'high'
    ? '<span class="pillb hi">high</span>'
    : u === 'medium'
      ? '<span class="pillb md">medium</span>'
      : '<span class="pillb">low</span>';

const renderGaps = () =>
  data.gaps.items
    .map(
      (g, i) => `<div class="gap">
          <div class="gnum">${String(i + 1).padStart(2, '0')}</div>
          <div>
            <h3>${esc(g.title)}</h3>
            <p>${esc(g.evidence)}</p>
          </div>
          <div class="urgency">${urgencyChip(g.urgency)}</div>
        </div>`
    )
    .join('\n        ');

const mark = (v) => (v === 'yes' ? '<span class="y">✓</span>' : v === 'part' ? '<span class="p">◐</span>' : '<span class="n">—</span>');
const renderMatrix = () => {
  const head = `<thead><tr><th style="text-align:left">Dimension</th><th class="you">You</th>${data.competitors
    .map((c) => `<th>${esc(c.name)}</th>`)
    .join('')}</tr></thead>`;
  const rows = data.gaps.matrix
    .map(
      (r) =>
        `<tr><td class="dim">${esc(r.dimension)}</td><td class="you">${mark(r.you)}</td>${r.rivals
          .map((v) => `<td>${mark(v)}</td>`)
          .join('')}</tr>`
    )
    .join('\n            ');
  return `${head}\n          <tbody>\n            ${rows}\n          </tbody>`;
};

const renderMonths = () => {
  let n = 0;
  return data.plan.months
    .map(
      (m) => `<div class="month">
        <div class="month-head">
          <span class="m-label">${esc(m.label)}</span>
          <span class="rule" aria-hidden="true"></span>
        </div>
        <div class="plays">
          ${m.plays
            .map((p) => {
              n++;
              return `<article class="play">
            <div class="pnum">${String(n).padStart(2, '0')}</div>
            <div>
              <div class="p-head">
                <h3>${esc(p.title)}</h3>
                <span class="pillb">${esc(p.channel)}</span>
              </div>
              <p class="what">${esc(p.what)}</p>
              <div class="meta">
                <span><b>kill if</b>${esc(p.kill)}</span>
                <span><b>success</b>${esc(p.metric)}</span>
              </div>
            </div>
          </article>`;
            })
            .join('\n          ')}
        </div>
      </div>`
    )
    .join('\n\n      ');
};

const renderReview = () => data.plan.review.map((r) => `<li>${esc(r)}</li>`).join('\n          ');

// ── Fill the template ────────────────────────────────────────────────────────
let html = readFileSync(TEMPLATE, 'utf8');

// Strip the template-maintenance comment at the top of the file.
html = html.replace(/<!--\n  GrowthKit AI — deliverable template[\s\S]*?-->\n/, '');

// <title> is RCDATA — no comment markers possible there, replace it whole.
html = html.replace(
  /<title>[\s\S]*?<\/title>/,
  `<title>${esc(data.client)} — Market intelligence · ${esc(data.periodLabel)} · GrowthKit AI</title>`
);

const fields = {
  client: data.client,
  periodLabel: data.periodLabel,
  refreshNumber: String(data.refreshNumber).padStart(2, '0'),
  preparedFor: data.preparedFor,
  preparedBy: data.preparedBy,
  dateIssued: data.dateIssued,
  nextRefresh: data.nextRefresh,
  tldrVerdict: data.tldr.verdict,
  marketIntro: data.market.intro,
  tam: data.market.tam,
  sam: data.market.sam,
  som: data.market.som,
  signals: data.market.signals,
  signalsNote: data.market.signalsNote,
  gapsIntro: data.gaps.intro,
  wedge: data.gaps.wedge,
  planIntro: data.plan.intro,
};
for (const [key, value] of Object.entries(fields)) {
  const re = new RegExp(`<!--GK:F:${key}-->[\\s\\S]*?<!--/GK:F:${key}-->`, 'g');
  if (!re.test(html)) {
    console.error(`✗ Template is missing slot GK:F:${key} — template and generator have drifted.`);
    process.exit(1);
  }
  html = html.replace(re, esc(value));
}

const sections = {
  moves: renderMoves(),
  segments: renderSegments(),
  competitors: renderCompetitors(),
  gaps: renderGaps(),
  matrix: renderMatrix(),
  months: renderMonths(),
  review: renderReview(),
};
for (const [key, value] of Object.entries(sections)) {
  const re = new RegExp(`<!--GK:S:${key}-->[\\s\\S]*?<!--/GK:S:${key}-->`, 'g');
  if (!re.test(html)) {
    console.error(`✗ Template is missing slot GK:S:${key} — template and generator have drifted.`);
    process.exit(1);
  }
  html = html.replace(re, value);
}

// Lint: no GK markers may survive into a client document.
const leftover = html.match(/GK:[FS]:[a-zA-Z]+/);
if (leftover) {
  console.error(`✗ Unfilled slot survived rendering: ${leftover[0]} — refusing to write.`);
  process.exit(1);
}

// ── Write ────────────────────────────────────────────────────────────────────
const outDir = join(OUT_ROOT, token);
const outFile = join(outDir, `${data.slug}-${data.period}.html`);
if (existsSync(outFile) && !force) {
  console.error(`✗ ${outFile.replace(ROOT, '.')} already exists. Re-run with --force to overwrite.`);
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, html, 'utf8');

const rel = outFile.replace(ROOT, '').replace(/\\/g, '/');
console.log(`✓ Wrote ${rel}`);
if (mintedNow) console.log(`✓ Minted token ${token} and saved it into ${jsonArg} — the client's URL is now stable.`);
console.log(`\n  Local preview:  file://${outFile.replace(/\\/g, '/')}`);
console.log(`  Live URL:       https://growthkitai.com${rel}   (once committed + pushed)`);
console.log(`\n  Reminders:`);
console.log(`  • d/ is noindex + robots-disallowed + out of the sitemap — but the URL is the only secret. Share it privately.`);
console.log(`  • clients/ and d/ are gitignored except the demo. To deploy a real client file you must`);
console.log(`    force-add it (git add -f) — and the repo is currently PUBLIC on GitHub, so make it`);
console.log(`    private first: gh repo edit growthkitsai-coder/GrowthKit-AI --visibility private --accept-visibility-change-consequences`);
console.log(`  • Monthly refresh: bump "period", "periodLabel", "refreshNumber", "nextRefresh" in the JSON and re-run.`);
