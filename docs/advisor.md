# GrowthKit Live (the Advisor) — the live product (Claude-powered)

> Part of the GrowthKit AI docs set. Read [`CLAUDE.md`](../CLAUDE.md) first. This file is the single home for the Advisor — the site's **first server-side code and first API secret**. **Update it whenever the function, prompt, model, or limits change.**

## What it is

The product, branded **GrowthKit Live** (working name — the *naming* is a branding call for Avi/Cowork). A founder describes their product + competitors + recent moves, and the engine **streams** an operator-grade growth read from Claude (Opus 4.8) — positioning, three competitor gaps, four growth plays, "what the full teardown adds" — then **parsed and rendered as a designed deliverable** (positioning panel, competitor-gap cards, play cards with badges + why-now / first-move / kill-criteria), not raw chat text.

> **As of 2026-06-12 the tool lives BEHIND LOGIN at `/four`** (see [`docs/auth.md`](auth.md)). It is no longer embedded on the homepage and the public `/advisor` page is retired (redirects to `/four`). `advisor.css`/`advisor.js` are now loaded only by `four.html`. Signed-in users get their reads **saved to their account** (Supabase `reads` table); `advisor.js` attaches the Supabase token to `/api/advise` and the endpoint **requires a valid token when `SUPABASE_URL`+`SUPABASE_ANON_KEY` env vars are set** on the server. The homepage now shows a "create a free account / log in" CTA where the tool used to be.

**Two surfaces, one engine:** the standalone page **`/advisor`** (full experience, share-link autorun, Save-as-PDF) and an **embedded live section on the homepage** (`index.html`, `#live`, right after the hero — the prominent "try it now") that shows "Open the full read ↗" instead of PDF. Both reuse the same `/api/advise` endpoint and the shared `advisor.css` + `advisor.js`.

**Ease-of-use:** one-click **example presets** fill the form (HVAC SaaS / AI notetaker / freelancer bookkeeping); after a read, **Copy read** + **Copy share link** (a `/advisor?p=…&c=…&m=…` URL that re-runs the same inputs for the recipient) + **Save as PDF** (print stylesheet, full page only).

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
- **`advisor.html`** — standard page chrome, GrowthKit Live product framing, full light "Studio" + dark "neon console". Markup is the shared **advisor.js contract** (`[data-gk-advisor]` root with `data-gk-full="1"`).
- **Shared `advisor.css` + `advisor.js`** (loaded by both `advisor.html` and `index.html`) — the only component CSS/JS shared beyond `theme.*`, justified because the same complex tool runs on two pages. `advisor.js` streams into a terminal `<pre>` (live feel), then on completion **parses the plain-text read into sections and renders the designed cards** (`gk-pos` / `gk-gaps`+`gk-gap` / `gk-plays`+`gk-play` / `gk-addon`), staged-revealed; if parsing ever fails it keeps the raw streamed text rather than erroring. Auto-inits every `[data-gk-advisor]` on the page.
- **⚠ Parsing gotcha (fixed 2026-06-12):** the read is parsed with regexes that match the model's fixed skeleton (`01 / …`, `Play NN — …`, `— Why now:` etc.). **Never embed raw em/en-dash bytes in a string-built `new RegExp(...)`** — they're unreliable through tooling/encoding (a literal `/…/` matched, the string-built copy silently didn't). All dash classes use the escaped-unicode `DASH` constant (`—–‒―\-`), and field labels are matched directly (no required leading dash). If you change the system-prompt output format, update the parser in `advisor.js` to match.

## Setup — REQUIRED before it works (one-time, in the Vercel dashboard)

1. Vercel → project `growthkit-ai` → Settings → Environment Variables → add **`ANTHROPIC_API_KEY`** (Production + Preview), value = an Anthropic API key from console.anthropic.com.
2. Redeploy (push or "Redeploy" in the dashboard) so the function picks up the env var.
3. **Never put the key in the repo** — every file here is public. It lives only as a Vercel env var. `.env`/`.env.*` are gitignored for local `vercel dev` use.

Until the key is set, `/advisor` loads fine but every run returns "The advisor is not configured yet."

**Status (2026-07-03): the key is set on the WRONG Vercel project — production is still unconfigured.** Diagnosis of the live "API error": `POST https://growthkitai.com/api/advise` → 307 to `www.growthkitai.com` → **503 `"The advisor is not configured yet — no API key set on the server."`**. There are **two Vercel projects named `growthkit-ai` on two different accounts**:

| | Serves growthkitai.com? | Has `ANTHROPIC_API_KEY`? |
|---|---|---|
| **Original** — `prj_q14WI5uJEqAJQzg63ZVEbaPHovzQ` on org `team_wbjFESk88zLTz0UjMUI3SlRz` (the GitHub-connected project that auto-deploys on push) | **YES** (holds the domains) | **NO** ← the bug |
| **Duplicate** — `prj_rS1BidALX24zStAipzNYnHSXFQS4` on `avi-aggarwal14s-projects` (`team_xOX0K5nPR32wWQGoox2F1GIv`), auto-created ~2026-06-24 when the CLI (`vercel link`, logged in as `avi-aggarwal14`) couldn't see the original team | NO (zero deployments, zero domains) | Yes (Production + Development — wasted there) |

The local `.vercel/project.json` and the Vercel CLI/MCP connection both point at the **duplicate**; the `avi-aggarwal14` login cannot see the original team at all, so agents **cannot fix this from the repo**. **Fix (Avi, ~2 min, in the dashboard of the account that owns the original project):** ① Settings → Environment Variables → add `ANTHROPIC_API_KEY` for Production (+ Preview if wanted); the value is in console.anthropic.com, or copyable from the duplicate project's env settings. ② Redeploy (env vars only apply to new deployments). ③ While there, Domains: make `growthkitai.com` the primary and `www` the redirect — it's currently backwards (apex 307s to www, contradicting every canonical URL).

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
