// Shared accept/reject rules. Used by step.mjs (local climb) and score.mjs --check (CI).
export function evaluateGates(best, cand, margin = 0) {
  const reasons = [];
  if (cand.score < best.score + margin) {
    reasons.push(`score ${cand.score} is not >= best ${best.score} + margin ${margin}`);
  }
  if (cand.stepFailures > best.stepFailures) {
    reasons.push(`scenario steps broke (${best.stepFailures} -> ${cand.stepFailures}); a button/tab the scenarios click is gone or renamed`);
  }
  if (cand.axeSeriousPlus > best.axeSeriousPlus) {
    reasons.push(`more critical/serious accessibility violations (${best.axeSeriousPlus} -> ${cand.axeSeriousPlus})`);
  }
  return reasons;
}
