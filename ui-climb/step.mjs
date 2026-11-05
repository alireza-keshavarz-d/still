#!/usr/bin/env node
// One hill-climb step: score the working tree, accept (git commit) or reject (git stash).
//   node ui-climb/step.mjs --init            score current tree as the baseline
//   node ui-climb/step.mjs "what I changed"  evaluate the candidate in the working tree
//   flags: --no-ask  skip the human visual check
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, rmSync, cpSync, appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline/promises';
import { evaluateGates } from './gates.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const args = process.argv.slice(2);
const has = (n) => args.includes(`--${n}`);
const message = args.filter((a) => !a.startsWith('--')).join(' ') || 'ui change';
const config = JSON.parse(readFileSync(join(here, 'config.json'), 'utf8'));

const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();
const out = (...p) => join(here, 'out', ...p);
const bestPath = join(here, 'best.json');
const logPath = join(here, 'log.tsv');
const ALWAYS_OK = ['ui-climb/best.json', 'ui-climb/log.tsv'];

function scoreInto(label) {
  const r = spawnSync(process.execPath, [join(here, 'score.mjs'), '--out', `ui-climb/out/${label}`], { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) { console.error('Scoring failed.'); process.exit(1); }
  return JSON.parse(readFileSync(out(label, 'result.json'), 'utf8'));
}
const slim = (r) => ({ score: r.score, stepFailures: r.stepFailures, axeSeriousPlus: r.axeSeriousPlus, at: new Date().toISOString() });
const existing = (paths) => paths.filter((p) => existsSync(join(root, p)));
const log = (decision, before, after) => {
  if (!existsSync(logPath)) writeFileSync(logPath, '');
  appendFileSync(logPath, [new Date().toISOString(), decision, before ?? '', after, message].join('\t') + '\n');
};

function writeCompare(ids) {
  const hasBest = existsSync(out('best'));
  const rows = ids.map((id) => `<h3>${id}</h3><div class="row">${hasBest ? `<figure><figcaption>best</figcaption><img src="best/${id}.png"></figure>` : ''}<figure><figcaption>candidate</figcaption><img src="candidate/${id}.png"></figure></div>`).join('');
  writeFileSync(out('compare.html'), `<!doctype html><meta charset="utf-8"><title>compare</title><style>body{font:14px system-ui;background:#111;color:#ddd;padding:16px}.row{display:flex;gap:16px;align-items:flex-start}figure{margin:0;flex:1;min-width:0}img{max-width:100%;border:1px solid #333}</style>${rows}`);
}

if (has('init')) {
  const r = scoreInto('best');
  writeFileSync(bestPath, JSON.stringify(slim(r), null, 2));
  log('init', '', r.score);
  git('add', '-A', '--', 'ui-climb/best.json', 'ui-climb/log.tsv');
  git('commit', '-m', `ui-climb: baseline ${r.score}`);
  console.log(`Baseline committed: ${r.score}`);
  process.exit(0);
}

if (!existsSync(bestPath)) { console.error('No baseline yet. Run: npm run climb:init'); process.exit(1); }
const best = JSON.parse(readFileSync(bestPath, 'utf8'));

// Guard: the candidate may only touch editable paths (never the evaluator).
const changed = git('status', '--porcelain', '-uall').split('\n').filter(Boolean).map((l) => l.slice(3).replace(/^"|"$/g, ''));
if (!changed.length) { console.error('No changes in the working tree. Apply a candidate change first.'); process.exit(1); }
const illegal = changed.filter((p) => !ALWAYS_OK.includes(p) && !config.editablePaths.some((e) => p === e || p.startsWith(e + '/')));
if (illegal.length) {
  console.error(`Refusing: changes outside editablePaths (${config.editablePaths.join(', ')}):\n  ${illegal.join('\n  ')}\nCommit or revert them first (the evaluator must stay frozen).`);
  process.exit(1);
}

const cand = scoreInto('candidate');
const reasons = evaluateGates(best, cand, config.thresholds.improveMargin);

let humanOk = true;
if (!reasons.length && !has('no-ask') && process.stdin.isTTY) {
  writeCompare(cand.scenarios.map((s) => s.id));
  console.log(`\nMeasured improvement: ${best.score} -> ${cand.score}`);
  console.log(`Open ${out('compare.html')} and look at best vs candidate.`);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const a = (await rl.question('Is the candidate visually better, or at least not worse? [y/N] ')).trim().toLowerCase();
  rl.close();
  humanOk = a === 'y' || a === 'yes';
  if (!humanOk) reasons.push('rejected in the human visual check');
}

if (!reasons.length) {
  mkdirSync(out(), { recursive: true });
  rmSync(out('best'), { recursive: true, force: true });
  cpSync(out('candidate'), out('best'), { recursive: true });
  writeFileSync(bestPath, JSON.stringify(slim(cand), null, 2));
  log('accept', best.score, cand.score);
  git('add', '-A', '--', ...existing([...config.editablePaths, ...ALWAYS_OK]));
  git('commit', '-m', `ui-climb: ${message} (${best.score} -> ${cand.score})`);
  console.log(`\nACCEPTED  ${best.score} -> ${cand.score}`);
  console.log(`Next: open ui-climb/out/candidate/critique.md and repeat.`);
} else {
  log('reject', best.score, cand.score);
  git('stash', 'push', '-u', '-m', `ui-climb rejected: ${message}`, '--', ...existing(config.editablePaths));
  console.log(`\nREJECTED  (${best.score} -> ${cand.score})\n - ${reasons.join('\n - ')}`);
  console.log('Candidate saved in git stash (git stash list). Working tree is back at the best version.');
  console.log('Next: open ui-climb/out/candidate/critique.md (or out/best/critique.md) and try a different change.');
}
