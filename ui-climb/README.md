# UI hill climb for Still (no LLM API needed)

A frozen, deterministic scorer + a git-based accept/reject step. The "propose a change" part is done by you,
optionally with any chat LLM (paste `critique.md` + screenshots) or GitHub Copilot.

## One-time setup
```bash
npm i -D playwright @axe-core/playwright
npx playwright install chromium
```
Add to `package.json` scripts:
```json
"climb:init":  "node ui-climb/step.mjs --init",
"climb:score": "node ui-climb/score.mjs",
"climb:step":  "node ui-climb/step.mjs",
"climb:check": "node ui-climb/score.mjs --check"
```
Add `ui-climb/out/` to `.gitignore`. Commit the harness, then:
```bash
npm run climb:init          # scores the current UI and commits it as the baseline
```
**Check `ui-climb/config.json` first:** the scenario selectors (Start, Pause, History, Settings) are guesses.
Run `npm run climb:score` and read any "scenario step(s) failed" lines; fix selectors until none appear.

## The loop
1. Open `ui-climb/out/best/critique.md` (or `out/candidate/` after a rejection). It lists the top measured issues
   and a ready-made prompt.
2. Paste the prompt + 2-3 screenshots into a chat LLM, or make the change yourself. One change per iteration.
3. Apply the change to `src/`.
4. `npm run climb:step -- "larger tap targets on mobile controls"`
   - Scores the candidate on 3 viewports x 5 app states.
   - Gates: score must beat best by the margin, no broken scenario steps, no new critical/serious a11y violations.
   - Then shows `out/compare.html` (best vs candidate) and asks you to confirm visually (skip with `--no-ask`).
   - Accept: commits with the score delta. Reject: stashes the candidate (`git stash list`) and restores the best.
5. Repeat until gains plateau. History is in `ui-climb/log.tsv`.

## What the score measures (0-100, mean over scenarios)
axe WCAG 2.2 AA violations, horizontal overflow, undersized tap targets (44px touch / 24px pointer), text under 12px,
console errors, and font-size sprawl (more than 7 distinct sizes). Once these hit 100 the objective score can't improve;
from then on the human check and the rotating "focus" in `critique.md` drive the climb.

## Guardrails
- `step.mjs` refuses to run if anything outside `src/`, `public/`, `index.html` changed, so the evaluator can't be gamed.
- CI (`.github/workflows/ui-score.yml`) fails PRs that score below `best.json` and uploads screenshots.
- Skim `out/compare.html` every few accepts: automated metrics don't catch a UI that is technically clean but ugly.
