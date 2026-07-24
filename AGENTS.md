# GrowthKit AI — agent instructions

Read **`CLAUDE.md`** (rules, mandates, conventions + the index of the `docs/` topic files) and **`memory.md`** (change log, gotchas, open items) at the repo root before doing anything. Deep reference material lives in **`docs/`** (pages, design-system, infrastructure, forms-and-data, deliverable-pipeline) — open the relevant file before working in its area, update it after.

This file is intentionally just a pointer. Do not duplicate content here — duplicated context files drift out of date independently (this one already did once). If you learn something durable, update `memory.md` (and `CLAUDE.md` if it changes a core convention), not this file.

**Commit after every single file you finish** — one finished file = one commit, immediately, never batched at the end of the task. Add by explicit path (`git add <file>`), never `git add -A`. Don't push unless Avi asks. Full protocol: the "COMMIT AFTER EVERY SINGLE FILE" mandate at the top of `CLAUDE.md`.

Before pushing, run the consistency checker: `node scripts/check-site.mjs`.
