import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const MARGIN = 0.34;
const EPS = 0.01;

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const isNoise = (name) => name.startsWith('noise-');

export function readResult(json) {
  const cases = json.cases;
  if (!Array.isArray(cases) || cases.length === 0) throw new Error('eval result has no cases');
  const out = {};
  for (const c of cases) {
    const runs = c.arms?.with ?? [];
    const tally = new Map();
    for (const run of runs) {
      for (const g of run.graders ?? []) {
        const t = tally.get(g.name) ?? { passed: 0, unscored: false };
        if (g.passed) t.passed += 1;
        if (g.scored === false) t.unscored = true;
        tally.set(g.name, t);
      }
    }
    const graders = {};
    const scoredShares = [];
    const noiseShares = [];
    for (const [name, t] of tally) {
      const share = t.passed / runs.length;
      graders[name] = share;
      if (isNoise(name)) noiseShares.push(share);
      else if (!t.unscored) scoredShares.push(share);
    }
    out[c.name] = {
      score: mean(scoredShares),
      error: runs.length === 0 || runs.some((r) => r.error != null),
      graders,
      noise: mean(noiseShares),
    };
  }
  return { partial: json.partial === true, costUsd: json.costUsd, durationSeconds: json.durationSeconds, cases: out };
}

function shift(oldC, newC, sign) {
  return Object.keys(newC.graders)
    .filter((g) => g in oldC.graders && sign * (newC.graders[g] - oldC.graders[g]) >= MARGIN - EPS)
    .sort();
}

export function compareResults(oldR, newR) {
  const names = [...new Set([...Object.keys(oldR.cases), ...Object.keys(newR.cases)])];
  return names.map((name) => {
    const o = oldR.cases[name];
    const n = newR.cases[name];
    const row = { case: name, old: o?.score ?? null, new: n?.score ?? null, oldNoise: o?.noise ?? null, newNoise: n?.noise ?? null, verdict: 'same', gained: [], lost: [] };
    if (!o) return { ...row, verdict: 'new' };
    if (!n) return { ...row, verdict: 'removed' };
    if (oldR.partial || newR.partial || o.error || n.error || o.score == null || n.score == null) return { ...row, verdict: 'incomplete' };
    const diff = n.score - o.score;
    row.verdict = -diff >= MARGIN - EPS ? 'worse' : diff >= MARGIN - EPS ? 'better' : 'same';
    row.gained = shift(o, n, 1);
    row.lost = shift(o, n, -1);
    return row;
  });
}

const fmt = (v) => (v == null ? '-' : v.toFixed(2));
const list = (xs) => (xs.length ? xs.join(', ') : '-');

export function renderComparison(rows, meta) {
  const lines = [
    `# Eval comparison: ${meta.oldLabel} → ${meta.newLabel}`,
    '',
    `Cost: $${Number(meta.oldCost ?? 0).toFixed(2)} → $${Number(meta.newCost ?? 0).toFixed(2)} | Duration: ${meta.oldDuration ?? 0}s → ${meta.newDuration ?? 0}s`,
    '',
    '| Case | Old | New | Verdict | Gained | Lost | Noise old→new |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...rows.map((r) => `| ${r.case} | ${fmt(r.old)} | ${fmt(r.new)} | ${r.verdict} | ${list(r.gained)} | ${list(r.lost)} | ${fmt(r.oldNoise)}→${fmt(r.newNoise)} |`),
    '',
    ['worse', 'better', 'incomplete', 'new', 'removed'].map((v) => `${rows.filter((r) => r.verdict === v).length} ${v}`).join(', '),
  ];
  return lines.join('\n') + '\n';
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const a = process.argv.slice(2);
    const opt = (k) => { const i = a.indexOf(`--${k}`); return i < 0 ? undefined : a[i + 1]; };
    if (!opt('old') || !opt('new')) throw new Error('usage: compare.mjs --old <aggregate-result.json> --new <aggregate-result.json>');
    const oldR = readResult(JSON.parse(readFileSync(opt('old'), 'utf8')));
    const newR = readResult(JSON.parse(readFileSync(opt('new'), 'utf8')));
    process.stdout.write(renderComparison(compareResults(oldR, newR), {
      oldLabel: opt('old'), newLabel: opt('new'),
      oldCost: oldR.costUsd, newCost: newR.costUsd, oldDuration: oldR.durationSeconds, newDuration: newR.durationSeconds,
    }));
  } catch (e) {
    console.error(`flow-eval compare: ${e.message}`);
    process.exit(1);
  }
}
