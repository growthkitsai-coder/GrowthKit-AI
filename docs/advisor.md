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

**Status (2026-06-12):** `ANTHROPIC_API_KEY` is **set** for Production + Development via the Vercel CLI (`vercel env add`, value piped from local `.env`). **Preview is NOT set** — the CLI plugin wrapper refused the non-interactive preview add; set it in the dashboard if PR preview deployments need the Advisor working. The repo is now CLI-linked to `avi-aggarwal14s-projects/growthkit-ai` (`.vercel/` created, gitignored).

## Model & prompt

- **Model: `claude-opus-4-8`**, `output_config: { effort: "high" }`, no extended thinking (keeps latency predictable under the 60s function ceiling; the system prompt forbids leaked reasoning / preamble). `max_tokens: 4000`.
- **System prompt** (in `api/advise.js`) makes Claude the GrowthKit engine: operator-grade voice, specific to the founder's named competitors, no generic startup advice, honest about being a fast read vs. the full monthly deliverable. Fixed output skeleton: `01 / POSITIONING READ`, `02 / COMPETITOR GAPS`, `03 / GROWTH PLAYS` (4 plays, each with why-now / first-move / kill-criteria), `04 / WHAT THE FULL TEARDOWN ADDS`. Plain-text terminal style — renders natively in the phosphor panel, no markdown parser needed.

## Limits, cost & abuse protection

- **`maxDuration: 60`** set in `vercel.json` `functions` (Hobby ceiling; Pro allows up to 300). The scoped prompt + capped `max_tokens` finish well inside it; streaming keeps the wait tolerable.
- **Every run costs Opus tokens** — real money. Inputs are capped at 2000 chars/field server-side; `max_tokens` bounds the output.
- **Abuse protection:** hidden `company_url` honeypot (silent drop), `t` minimum-fill-time (2.5s, silent drop), and a **per-IP rate limit** (6 runs / 10 min). The limiter is **durable-capable**: if a KV store is connected (env vars `KV_REST_API_URL` + `KV_REST_API_TOKEN` from Vercel KV / the Vercel Marketplace Upstash integration, or `UPSTASH_REDIS_REST_URL` + `_TOKEN`), it uses a Redis fixed-window counter shared across all instances and surviving cold starts (one pipelined INCR+EXPIRE round trip). With **no** store connected it transparently falls back to an in-memory per-warm-instance counter. **To make it durable: add Upstash via the Vercel dashboard → Storage / Marketplace (2 clicks) — no code change needed**, the env vars appear automatically and the function picks them up. Until then it's best-effort in-memory (fine for launch traffic; upgrade before any hard promotion).
- The function sets `Cache-Control: no-store`.

## Analytics events

`advisor_run` (on submit, flags whether competitors/moves were filled), `advisor_complete` (chars returned), `advisor_error` (message). Same `window.va` system as the rest of the site — Pro/Enterprise-only recording (see [`docs/infrastructure.md`](infrastructure.md)).

## Privacy / legal disclosure

The Advisor sends the founder's typed market description to **Anthropic's API** — a third-party data flow the static site never had. The page states this inline ("sent to Anthropic's API to generate your read — we don't store it") and nothing is persisted server-side.

- **`privacy.html` (v1.1, 2026-06-12):** updated — §03 lists "Growth Advisor inputs"; §04 notes inputs are sent to the AI provider to generate the result; §06 names **Anthropic, PBC** as the AI sub-processor (not used to train their models per their commercial terms). No new anchors (woven into existing sections), so the checker stays green.
- **`terms.html` (2026-06-12):** updated — §08 "Your content & inputs" adds a Free Growth Advisor clause (inputs go to Anthropic; don't submit confidential info; we may rate-limit/withdraw it); §15 "Disclaimers" notes the free Advisor is an illustrative automated read, not the operator-reviewed paid deliverable.
- **Still open:** `security.html`'s data-inventory / architecture readout doesn't yet mention the `/api/advise` endpoint or the Anthropic flow — update it when next touching that page so the honest security posture stays accurate.

## Local dev

`vercel dev` runs the function locally; put `ANTHROPIC_API_KEY=...` in a local `.env` (gitignored). Opening `advisor.html` as a plain file won't reach `/api/advise` — you need `vercel dev` for the function route.
