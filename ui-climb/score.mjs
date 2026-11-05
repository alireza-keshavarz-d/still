#!/usr/bin/env node
// FROZEN EVALUATOR for the UI hill climb. The candidate generator must never edit this file.
//   node ui-climb/score.mjs [--out dir] [--no-build] [--check] [--summary]
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, appendFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, preview } from 'vite';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import { evaluateGates } from './gates.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
process.chdir(root);

const args = process.argv.slice(2);
const has = (n) => args.includes(`--${n}`);
const val = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : d; };

const config = JSON.parse(readFileSync(join(here, 'config.json'), 'utf8'));
const T = config.thresholds;
const outDir = resolve(root, val('out', 'ui-climb/out/current'));
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

if (!has('no-build')) await build({ logLevel: 'warn' });
const server = await preview({ logLevel: 'warn', preview: { port: 4173, strictPort: false, open: false } });
const baseUrl = server.resolvedUrls?.local?.[0] ?? 'http://localhost:4173/';

const IMPACT = { critical: 8, serious: 5, moderate: 2, minor: 1 };

async function runSteps(page, steps) {
  let failures = 0;
  for (const s of steps) {
    try {
      if (s.click) await page.locator(s.click).first().click({ timeout: 3000 });
      else if (s.fill) await page.locator(s.fill[0]).first().fill(s.fill[1], { timeout: 3000 });
      else if (s.wait) await page.waitForTimeout(s.wait);
    } catch {
      failures++;
    }
  }
  return failures;
}

const browser = await chromium.launch();
const scenarios = [];
const issues = [];

for (const vp of config.viewports) {
  for (const scheme of config.colorSchemes) {
    for (const state of config.states) {
      const id = `${vp.name}-${scheme}-${state.name}`;
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        colorScheme: scheme,
        reducedMotion: 'reduce',
        serviceWorkers: 'block'
      });
      const page = await ctx.newPage();
      const errors = [];
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      page.on('pageerror', (e) => errors.push(String(e)));

      await page.goto(baseUrl, { waitUntil: 'networkidle' });
      await page.waitForTimeout(300);
      const stepFailures = await runSteps(page, state.steps);
      await page.waitForTimeout(200);

      const axe = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
        .analyze();

      const minTap = vp.width <= 768 ? T.minTapTargetTouch : T.minTapTargetPointer;
      const m = await page.evaluate(({ minTap, minFont }) => {
        const vis = (el) => {
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0;
        };
        const de = document.documentElement;
        const overflow = de.scrollWidth > de.clientWidth + 1;
        const taps = [...document.querySelectorAll('button, a[href], input, select, textarea, [role=button], [role=tab], [role=switch]')]
          .filter((el) => vis(el) && !(el.tagName === 'A' && el.closest('p, li')))
          .filter((el) => { const r = el.getBoundingClientRect(); return Math.min(r.width, r.height) < minTap; })
          .map((el) => (el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 30));
        const sizes = new Set();
        const tiny = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const n = walker.currentNode;
          const txt = (n.nodeValue || '').trim();
          const el = n.parentElement;
          if (!txt || !el || !vis(el) || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName)) continue;
          const fs = parseFloat(getComputedStyle(el).fontSize);
          sizes.add(fs);
          if (fs < minFont) tiny.push(txt.slice(0, 30));
        }
        return { overflow, taps, tiny, fontSizes: [...sizes].sort((a, b) => a - b) };
      }, { minTap, minFont: T.minFontPx });

      const pen = {
        axe: 0,
        overflow: m.overflow ? 10 : 0,
        tapTargets: Math.min(m.taps.length, 10),
        tinyText: Math.min(m.tiny.length, 5),
        errors: Math.min(errors.length, 5) * 5,
        typeScale: Math.max(0, m.fontSizes.length - T.maxDistinctFontSizes) * 1.5
      };
      let axeSeriousPlus = 0;
      for (const v of axe.violations) {
        pen.axe += IMPACT[v.impact] ?? 1;
        if (v.impact === 'critical' || v.impact === 'serious') axeSeriousPlus++;
        issues.push({ scenario: id, penalty: IMPACT[v.impact] ?? 1, text: `a11y (${v.impact}) ${v.id}: ${v.help} [${v.nodes.length} node(s), e.g. ${v.nodes[0]?.target?.join(' ')}]` });
      }
      if (m.overflow) issues.push({ scenario: id, penalty: 10, text: 'horizontal overflow: page is wider than the viewport' });
      if (m.taps.length) issues.push({ scenario: id, penalty: pen.tapTargets, text: `${m.taps.length} tap target(s) under ${minTap}px: ${m.taps.slice(0, 5).join(' | ')}` });
      if (m.tiny.length) issues.push({ scenario: id, penalty: pen.tinyText, text: `${m.tiny.length} text node(s) under ${T.minFontPx}px: ${m.tiny.slice(0, 3).join(' | ')}` });
      if (errors.length) issues.push({ scenario: id, penalty: pen.errors, text: `console/page errors: ${errors.slice(0, 2).join(' | ')}` });
      if (pen.typeScale) issues.push({ scenario: id, penalty: pen.typeScale, text: `too many font sizes (${m.fontSizes.length}): ${m.fontSizes.join(', ')}px; consolidate to a type scale` });
      if (stepFailures) issues.push({ scenario: id, penalty: 0, text: `${stepFailures} scenario step(s) failed; check selectors in ui-climb/config.json` });

      const total = Object.values(pen).reduce((a, b) => a + b, 0);
      scenarios.push({ id, score: Math.max(0, 100 - total), penalties: pen, stepFailures, axeSeriousPlus, fontSizes: m.fontSizes });
      await page.screenshot({ path: join(outDir, `${id}.png`), fullPage: true });
      await ctx.close();
    }
  }
}

await browser.close();
await new Promise((r) => server.httpServer.close(r));

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const result = {
  score: Math.round(mean(scenarios.map((s) => s.score)) * 100) / 100,
  stepFailures: scenarios.reduce((a, s) => a + s.stepFailures, 0),
  axeSeriousPlus: scenarios.reduce((a, s) => a + s.axeSeriousPlus, 0),
  scenarios,
  issues: issues.sort((a, b) => b.penalty - a.penalty)
};
writeFileSync(join(outDir, 'result.json'), JSON.stringify(result, null, 2));

// ---- critique.md: paste this (plus screenshots) into any chat LLM ----
const FOCUS = [
  'visual hierarchy: make the primary action (start/pause/stop) and the live timer unmistakable',
  'spacing rhythm: use one consistent spacing scale; fix cramped or floating elements',
  'typography: a clear, small type scale; tabular numerals for the clock; comfortable line length',
  'color restraint: fewer accent colors, consistent surfaces/borders, calm contrast',
  'mobile ergonomics: thumb-reachable controls, safe-area insets, no tiny targets',
  'empty/idle/paused states: make each state feel intentional and distinct'
];
const logPath = join(here, 'log.tsv');
const iter = existsSync(logPath) ? readFileSync(logPath, 'utf8').split('\n').filter(Boolean).length : 0;
const top = result.issues.filter((i) => i.penalty > 0).slice(0, 8);
const critique = `# UI critique (score ${result.score}/100)

## Top measured issues
${top.length ? top.map((i, n) => `${n + 1}. [${i.scenario}] ${i.text}`).join('\n') : 'None. All objective checks pass.'}

## Focus for this iteration${top.length ? ' (only if the issues above are fixed)' : ''}
${FOCUS[iter % FOCUS.length]}

## Prompt to paste into a chat LLM (attach the 2-3 most relevant PNGs from this folder)
You are improving the UI of "Still", a minimal offline-first study-time tracker (React + Vite + TypeScript, dark theme).
Make exactly ONE small, targeted change that fixes the first issue above (or the focus area if none remain).
Rules: only change files under src/, public/ or index.html. Do not change behavior, data logic, tests, or any text that the
tests or scenarios click on (buttons named Start, Pause, History, Settings). Do not add dependencies.
Return the full contents of every file you change, and one sentence describing the change.
`;
writeFileSync(join(outDir, 'critique.md'), critique);

console.log(`\nUI score: ${result.score}/100  (step failures: ${result.stepFailures}, serious+ a11y: ${result.axeSeriousPlus})`);
for (const s of scenarios) console.log(`  ${s.id.padEnd(28)} ${String(s.score).padStart(6)}`);
console.log(`Output: ${outDir}`);

if (has('summary') && process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    `## UI score: ${result.score}/100\n\n| Scenario | Score |\n|---|---|\n${scenarios.map((s) => `| ${s.id} | ${s.score} |`).join('\n')}\n\n### Top issues\n${top.map((i) => `- [${i.scenario}] ${i.text}`).join('\n') || 'None'}\n`);
}

if (has('check')) {
  const bestPath = join(here, 'best.json');
  if (!existsSync(bestPath)) { console.error('No ui-climb/best.json. Run: npm run climb:init'); process.exit(1); }
  const best = JSON.parse(readFileSync(bestPath, 'utf8'));
  const reasons = evaluateGates(best, result, 0);
  if (reasons.length) {
    console.error(`\nREGRESSION vs best (${best.score}):\n - ${reasons.join('\n - ')}`);
    process.exit(1);
  }
  console.log(`OK: no regression vs best (${best.score}).`);
}
process.exit(0);
