# Forms & data — waitlist, onboarding, Apps Scripts, Sheets

> Part of the GrowthKit AI docs set. Read [`CLAUDE.md`](../CLAUDE.md) first. This file is the single home for the two form pipelines and where personal data lives. **Read carefully before touching — this is the easiest part of the site to silently break.**

## Where the data lives

All form submissions land in **Google Sheets owned by Avi personally** (his Google account — not a service account, not a shared workspace). The Sheets are the **system of record**; no copy exists on Vercel, in git, or anywhere else. Both .md files and this repo are public — never write submitted data, credentials, or PII into them.

## Pipeline 1 — Waitlist (`waitlist.html` → `waitlist-apps-script.gs`)

- The page POSTs FormData (`name`, `email`, `updates`, plus anti-spam fields `company` + `t`) to a Google Apps Script Web App via the `SCRIPT_URL` constant near the top of its inline `<script>`. The deployed URL is set in the file.
- The script's `doPost` appends `[Timestamp, Name, Email, Wants updates]` to the "GrowthKit Waitlist" Sheet (writes the header row on first signup). `doGet` returns the live signup count as JSON — which is what `status.html` calls as its health check.
- **`SCRIPT_URL` lives in TWO files:** `waitlist.html` (POST) and `status.html` (GET). If the deployment URL ever changes, **update both** — the checker verifies they match and are non-empty.

**Hardening (2026-06-10), all server-side in the .gs:**

- Validates name/email (the browser check is advisory — anyone can POST to the URL directly).
- **Honeypot:** hidden `company` field (`.hp-field`, parked off-screen on purpose — naive bots skip `display:none` fields). Filled → silently dropped with `{ok:true}` so bots don't learn.
- **Minimum fill time:** the form sends `t` = ms between page load and submit; under 2.5s → same silent drop.
- **Dedupe by email** (case-insensitive): re-signup updates the existing row's timestamp/name; consent only ever upgrades No → Yes, never downgrades. `LockService` wraps sheet writes.
- **Soft rate limit:** 60 accepted signups / 10 min, then a *visible* "try again in a few minutes" error — launch-day spikes fail loud rather than losing signups silently.
- **Confirmation email** to brand-new signups via MailApp (brand voice, reply-to `info@growthkitai.com`, quota-guarded, wrapped so mail failure never blocks the signup; consumer Gmail quota ≈ 100/day).

## Pipeline 2 — Onboarding (`onboarding.html` → `onboarding-apps-script.gs`)

- Structured client intake (deliverable pipeline Step 2): company, website, contact, work email, stage, market description, known competitors, ICP, notes. POSTs to its **own** Apps Script with its **own** Sheet ("GrowthKit Client Briefs").
- Same hardening pattern with different parameters: **honeypot field is `fax`** (NOT `company` — onboarding has a real company field), 20s minimum fill time, dedupe by email+company, rate limit 10/10 min, confirmation email.
- **⚠ OPEN ITEM: `onboarding.html`'s `SCRIPT_URL` is currently EMPTY** — the form shows "not configured yet" until `onboarding-apps-script.gs` is deployed (instructions in its header) and the URL pasted in.

## Apps Script deployment — the two rules that prevent breakage

1. **The repo .gs files are source, not the deployment.** Editing them in the repo does nothing by itself — paste the contents into the Apps Script editor (Sheet → Extensions → Apps Script) and redeploy.
2. **Always redeploy via "Manage deployments → pencil → New version".** Choosing "New deployment" issues a NEW URL and breaks the page(s) until every `SCRIPT_URL` copy is updated. (For the waitlist that means BOTH waitlist.html and status.html.)

**Failure modes to recognize:** empty `SCRIPT_URL` → "Form is not configured yet" on the page. Deployment deleted or access changed from "Anyone" → status page's waitlist row shows amber "unreachable" (that's the check working, not a status-page bug).

## Analytics events fired by the forms

`waitlist_signup` / `waitlist_error` (waitlist.html), `onboarding_submitted` / `onboarding_error` (onboarding.html) — see docs/infrastructure.md for the event system and the Vercel-plan caveat.
