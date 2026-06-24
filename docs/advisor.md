# Growth Advisor — the live product (Claude-powered)

> Part of the GrowthKit AI docs set. Read [`CLAUDE.md`](../CLAUDE.md) first. This file is the single home for the Advisor — the site's **first server-side code and first API secret**. **Update it whenever the function, prompt, model, or limits change.**

## What it is

A free, ungated lead-magnet tool at **`/advisor`**: a founder describes their product + competitors + recent competitor moves, and the page streams back an operator-grade growth read from Claude (Opus 4.8) — positioning, three competitor gaps, four growth plays, and an honest note on what the paid monthly deliverable adds. It ends with a CTA to the waitlist / pricing / specimen. It's the public taste of the engine the paid product runs at depth.

## Architecture — first backend in the repo

```
advisor.html  (static page, neon-console UI, form + streaming console panel)
   |  POST /api/advise  { product, competitors, moves, company_url(honeypot), t }
   v
api/advise.js  (Vercel serverless function — the ONLY server code, the ONLY secret reader)
   |  ANTHROPIC_API_KEY (Vercel env var; NEVER in git — repo is public)
   v
Anthropic Messages API  (model: claude-opus-4-8, stream: true, effort: high)
   |  SSE text deltas forwarded as a plain-text stream
   v
browser appends tokens into the phosphor readout panel
```

- **`api/advise.js`** — zero npm dependencies (raw `fetch`, parses Anthropic SSE by hand), CommonJS (`module.exports`), so Vercel runs it with no `package.json` / build step — consistent with the rest of the repo. Reads `process.env.ANTHROPIC_API_KEY`; without it, returns a friendly 503 "not configured" (the page shows it as an error, mirroring the waitlist's "not configured" pattern).
- **`advisor.html`** — standard page chrome (identical head/topbar/footer), full light "Studio" + dark "neon console" treatment. The output panel is a `<pre>` phosphor readout that streams tokens with a blinking caret; a pulsing LED + "analyzing your market_" status shows until the first token; on completion the result CTA block reveals.

## Setup — REQUIRED before it works (one-time, in the Vercel dashboard)

1. Vercel → project `growthkit-ai` → Settings → Environment Variables → add **`ANTHROPIC_API_KEY`** (Production + Preview), value = an Anthropic API key from console.anthropic.com.
2. Redeploy (push or "Redeploy" in the dashboard) so the function picks up the env var.
3. **Never put the key in the repo** — every file here is public. It lives only as a Vercel env var. `.env`/`.env.*` are gitignored for local `vercel dev` use.

Until the key is set, `/advisor` loads fine but every run returns "The advisor is not configured yet."

## Model & prompt

- **Model: `claude-opus-4-8`**, `output_config: { effort: "high" }`, no extended thinking (keeps latency predictable under the 60s function ceiling; the system prompt forbids leaked reasoning / preamble). `max_tokens: 4000`.
- **System prompt** (in `api/advise.js`) makes Claude the GrowthKit engine: operator-grade voice, specific to the founder's named competitors, no generic startup advice, honest about being a fast read vs. the full monthly deliverable. Fixed output skeleton: `01 / POSITIONING READ`, `02 / COMPETITOR GAPS`, `03 / GROWTH PLAYS` (4 plays, each with why-now / first-move / kill-criteria), `04 / WHAT THE FULL TEARDOWN ADDS`. Plain-text terminal style — renders natively in the phosphor panel, no markdown parser needed.

## Limits, cost & abuse protection

- **`maxDuration: 60`** set in `vercel.json` `functions` (Hobby ceiling; Pro allows up to 300). The scoped prompt + capped `max_tokens` finish well inside it; streaming keeps the wait tolerable.
- **Every run costs Opus tokens** — real money. Inputs are capped at 2000 chars/field server-side; `max_tokens` bounds the output.
- **Abuse protection (best-effort):** hidden `company_url` honeypot (silent drop), `t` minimum-fill-time (2.5s, silent drop), and an **in-memory per-IP rate limit** (6 runs / 10 min). ⚠ The rate limit is per warm instance — it resets on cold start and isn't shared across instances. **For durable limiting, add Vercel KV / Upstash** keyed by IP; this is the main hardening follow-up before heavy promotion.
- The function sets `Cache-Control: no-store`.

## Analytics events

`advisor_run` (on submit, flags whether competitors/moves were filled), `advisor_complete` (chars returned), `advisor_error` (message). Same `window.va` system as the rest of the site — Pro/Enterprise-only recording (see [`docs/infrastructure.md`](infrastructure.md)).

## Privacy note (open follow-up)

The Advisor sends the founder's typed market description to **Anthropic's API** — a new third-party data flow the static site never had. The page states this inline ("sent to Anthropic's API to generate your read — we don't store it") and nothing is persisted server-side. **`privacy.html` should be updated to name Anthropic as a sub-processor** and `security.html`'s data-inventory/architecture section should mention the Advisor endpoint — flagged as a copy task (legal wording → Cowork) so the honest-by-design legal pages stay accurate.

## Local dev

`vercel dev` runs the function locally; put `ANTHROPIC_API_KEY=...` in a local `.env` (gitignored). Opening `advisor.html` as a plain file won't reach `/api/advise` — you need `vercel dev` for the function route.
