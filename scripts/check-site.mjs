#!/usr/bin/env node
/**
 * GrowthKit AI — site consistency checker.
 *
 * Run locally:  node scripts/check-site.mjs
 * Runs in CI on every push (.github/workflows/site-checks.yml).
 *
 * No dependencies. Fails (exit 1) if any of these drift:
 *   1. Placeholder links — href="#" or href="/#" anywhere on a public page.
 *   2. sitemap.xml ↔ vercel.json parity — every sitemap URL needs a rewrite
 *      AND a .html→clean redirect, and vice versa; every public page must be
 *      in the sitemap.
 *   3. SEO head — every public page needs canonical (with the right URL),
 *      og:title/description/url/image, twitter:card, and JSON-LD.
 *      404.html must stay noindex.
 *   4. Footer consistency — the footer link grid (hrefs + labels) must be
 *      identical on every page that has a footer (index's "#engine" and other
 *      pages' "/#engine" are treated as the same link).
 *   5. logo.html is internal — it must not appear in the sitemap or be linked
 *      from any public page.
 *   6. Internal links resolve — every root-relative href/src must point at a
 *      clean URL, an existing file, or a real #anchor.
 *   7. SCRIPT_URL sync — waitlist.html and status.html must hold the same,
 *      non-empty Apps Script URL.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://growthkitai.com';
const INTERNAL_PAGES = ['logo.html', 'googlea9dc9b0133a60f51.html']; // never public, never in sitemap
const NO_FOOTER = ['waitlist.html', '404.html']; // footer intentionally absent
const NO_SITEMAP = ['404.html', 'onboarding.html']; // public but noindex

const failures = [];
const fail = (msg) => failures.push(msg);
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

const allPages = readdirSync(ROOT).filter((f) => f.endsWith('.html'));
const publicPages = allPages.filter((f) => !INTERNAL_PAGES.includes(f));
const html = Object.fromEntries(allPages.map((f) => [f, read(f)]));

const vercel = JSON.parse(read('vercel.json'));
const rewriteMap = new Map(vercel.rewrites.map((r) => [r.source, r.destination]));
const redirectMap = new Map(vercel.redirects.map((r) => [r.source, r.destination]));
const sitemap = read('sitemap.xml');
const sitemapPaths = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map((m) => m[1])
  .filter((u) => !u.includes('/logo-')) // image:loc entries
  .map((u) => u.replace(ORIGIN, '') || '/');

const cleanUrlOf = (page) => (page === 'index.html' ? '/' : '/' + page.replace(/\.html$/, ''));

// ── 1. Placeholder links ────────────────────────────────────────────────────
for (const page of publicPages) {
  if (/href="\/?#"/.test(html[page])) fail(`${page}: placeholder link href="#" or href="/#"`);
}

// ── 2. sitemap.xml ↔ vercel.json ↔ files on disk ───────────────────────────
for (const p of sitemapPaths) {
  if (p === '/') continue;
  if (rewriteMap.get(p) !== `${p}.html`) fail(`vercel.json: missing/wrong rewrite ${p} → ${p}.html (page is in sitemap)`);
  if (redirectMap.get(`${p}.html`) !== p) fail(`vercel.json: missing/wrong redirect ${p}.html → ${p} (page is in sitemap)`);
}
for (const [source, dest] of rewriteMap) {
  // noindex pages get a clean URL but stay out of the sitemap on purpose
  if (!sitemapPaths.includes(source) && !NO_SITEMAP.includes(dest.replace(/^\//, ''))) {
    fail(`sitemap.xml: missing ${source} (has a vercel.json rewrite)`);
  }
  if (!existsSync(join(ROOT, dest))) fail(`vercel.json: rewrite ${source} → ${dest}, but ${dest} does not exist`);
}
if (redirectMap.get('/index.html') !== '/') fail('vercel.json: missing redirect /index.html → /');
for (const page of publicPages) {
  if (NO_SITEMAP.includes(page)) continue;
  if (!sitemapPaths.includes(cleanUrlOf(page))) fail(`sitemap.xml: missing ${cleanUrlOf(page)} (${page} is a public page)`);
}

// ── 3. SEO head on every public page ────────────────────────────────────────
for (const page of publicPages) {
  const src = html[page];
  if (NO_SITEMAP.includes(page)) {
    if (!/<meta name="robots" content="noindex/.test(src)) fail(`${page}: must keep <meta name="robots" content="noindex …">`);
    continue;
  }
  const canonical = src.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
  const expected = ORIGIN + (page === 'index.html' ? '/' : cleanUrlOf(page));
  if (!canonical) fail(`${page}: missing <link rel="canonical">`);
  else if (canonical !== expected) fail(`${page}: canonical is ${canonical}, expected ${expected}`);
  for (const tag of ['og:title', 'og:description', 'og:url', 'og:image']) {
    if (!src.includes(`property="${tag}"`)) fail(`${page}: missing <meta property="${tag}">`);
  }
  if (!src.includes('name="twitter:card"')) fail(`${page}: missing <meta name="twitter:card">`);
  if (!src.includes('application/ld+json')) fail(`${page}: missing JSON-LD structured data`);
}

// ── 4. Footer consistency across pages ──────────────────────────────────────
const footerLinks = (page) => {
  const m = html[page].match(/<footer[\s\S]*?<\/footer>/);
  if (!m) return null;
  return [...m[0].matchAll(/<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map(([, href, text]) => {
    if (href.startsWith('#')) href = '/' + href; // index links #engine; other pages /#engine — same target
    return `${href} → ${text.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()}`;
  });
};
const footerPages = publicPages.filter((p) => !NO_FOOTER.includes(p));
const reference = footerLinks('index.html');
for (const page of footerPages) {
  const links = footerLinks(page);
  if (!links) { fail(`${page}: footer is missing (every public page except ${NO_FOOTER.join(', ')} must have one)`); continue; }
  if (page === 'index.html') continue;
  if (links.join('\n') !== reference.join('\n')) {
    const a = new Set(reference), b = new Set(links);
    const missing = reference.filter((l) => !b.has(l));
    const extra = links.filter((l) => !a.has(l));
    fail(`${page}: footer diverges from index.html` +
      (missing.length ? ` | missing: ${missing.join(' ; ')}` : '') +
      (extra.length ? ` | extra: ${extra.join(' ; ')}` : '') +
      (!missing.length && !extra.length ? ' | same links, different order' : ''));
  }
}

// ── 5. logo.html must stay internal ─────────────────────────────────────────
if (sitemap.includes('logo.html') || sitemapPaths.includes('/logo')) fail('sitemap.xml: logo.html is internal — remove it');
for (const page of publicPages) {
  if (/href="\/?logo(\.html)?"/.test(html[page])) fail(`${page}: links to logo.html — that page is internal`);
}

// ── 6. Internal links and assets resolve ────────────────────────────────────
const idsOf = (page) => new Set([...html[page].matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
const indexIds = idsOf('index.html');
for (const page of publicPages) {
  const ids = page === 'index.html' ? indexIds : idsOf(page);
  for (const [, attr, raw] of html[page].matchAll(/(href|src)="([^"]+)"/g)) {
    if (/^(https?:|mailto:|tel:|data:|\/\/|\/_vercel)/.test(raw)) continue;
    const [path, frag] = raw.split('#');
    if (path === '' && frag) { // same-page anchor
      if (!ids.has(frag)) fail(`${page}: ${attr}="${raw}" — no id="${frag}" on this page`);
    } else if (path === '/' || path === '') {
      if (frag && !indexIds.has(frag)) fail(`${page}: ${attr}="${raw}" — no id="${frag}" on index.html`);
    } else if (rewriteMap.has(path)) {
      // clean URL — already validated against files in check 2
    } else if (!existsSync(join(ROOT, path.replace(/^\//, '').split('?')[0]))) {
      fail(`${page}: ${attr}="${raw}" — target does not exist (not a clean URL, not a file)`);
    }
  }
}

// ── 7. SCRIPT_URL must match in waitlist.html and status.html ───────────────
const scriptUrl = (page) => html[page]?.match(/SCRIPT_URL\s*=\s*['"]([^'"]*)['"]/)?.[1];
const wl = scriptUrl('waitlist.html'), st = scriptUrl('status.html');
if (!wl) fail('waitlist.html: SCRIPT_URL is missing or empty');
if (!st) fail('status.html: SCRIPT_URL is missing or empty');
if (wl && st && wl !== st) fail('SCRIPT_URL differs between waitlist.html and status.html — update both when redeploying the Apps Script');

// ── Report ──────────────────────────────────────────────────────────────────
if (failures.length) {
  console.error(`✗ ${failures.length} consistency problem(s):\n`);
  for (const f of failures) console.error('  • ' + f);
  process.exit(1);
}
console.log(`✓ ${publicPages.length} public pages checked — placeholders, sitemap/vercel parity, SEO heads, footers, logo.html isolation, internal links, SCRIPT_URL sync all consistent.`);
