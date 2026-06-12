# Deliverable pipeline — the first product code (Phase 4)

> Part of the GrowthKit AI docs set. Read [`CLAUDE.md`](../CLAUDE.md) first. This file is the single home for how client deliverables are produced and published. **Update it whenever the generator, template, or flow changes.**

## The flow

1. **Client brief arrives** via `/onboarding` (its own Apps Script + "GrowthKit Client Briefs" Sheet — see [`docs/forms-and-data.md`](forms-and-data.md)).
2. **Operator builds `clients/<client>.json`** — the generator's input (use `clients/demo.json` as the reference shape).
3. **Run `node scripts/make-deliverable.mjs clients/<client>.json`** — zero dependencies. It validates the JSON (reports all errors at once, dotted paths), HTML-escapes everything, renders the four deliverable sections (market map, teardown, gap analysis, 90-day plan) into `deliverables/template.html`, and writes `d/<token>/<slug>-<period>.html`.
4. **Token = stable client URL:** a 22-char base58 crypto-random token, minted once and written back into the client JSON so the URL never changes. **Monthly refresh** = bump `period`/`periodLabel`/`refreshNumber`/`nextRefresh` in the JSON and re-run (`--force` to overwrite).
5. **PDF export** = the template's print stylesheet — "Save as PDF" in the browser, or the masthead's print button.

## The files

- **`deliverables/template.html`** — master template: self-contained, light + neon-dark + print stylesheet, `noindex`. Slots marked `<!--GK:F:…-->` / `<!--GK:S:…-->` are filled by the generator. **The generator owns all row markup** — template slots are empty by design so template and generator can't drift. **Don't hand-edit generated client copies.**
- **`scripts/make-deliverable.mjs`** — the generator (see flow above).
- **`clients/`** — input JSONs. **Gitignored except `clients/demo.json`** (fictional "Acme Analytics").
- **`d/`** — generated output at unguessable token URLs. **Gitignored except `d/demo/`** (`acme-analytics-2026-06.html`, the living example — **regenerate it after any template/generator change**). Robots-disallowed + `X-Robots-Tag: noindex, nofollow` via vercel.json; never in the sitemap.

## ⚠ Security model — read before committing anything here

**THE REPO IS PUBLIC.** Unguessable URLs protect against URL guessing, **not** repo browsing — anything committed under `d/` or `clients/` is readable by anyone on GitHub. Both are gitignored except the demo. **Before committing a real client file, make the repo private:**

```
gh repo edit growthkitsai-coder/GrowthKit-AI --visibility private --accept-visibility-change-consequences
```

(Vercel keeps deploying fine after the flip.)

## Deliberately deferred

**Step 3 — a client portal in Next.js** — lives in a future separate private repo, and only gets built when tokenized URLs stop scaling (>10–15 active clients, or the first client needing team access/auth). Don't start it speculatively.
