import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readResult, compareResults, renderComparison } from './compare.mjs';

const sample = JSON.parse(readFileSync(new URL('./fixtures/aggregate-result.sample.json', import.meta.url), 'utf8'));
const clone = (x) => JSON.parse(JSON.stringify(x));

function build(cases, top = {}) {
  const r = clone(sample);
  const template = r.cases[0];
  r.cases = cases.map(({ name, runs, error }) => ({
    ...clone(template),
    name,
    arms: {
      with: runs.map((passedByGrader, i) => ({
        ...clone(template.arms.with[0]),
        error: error && i === 0 ? 'boom' : null,
        graders: Object.entries(passedByGrader).map(([gname, passed]) => ({ name: gname, passed, scored: true })),
      })),
    },
  }));
  return Object.assign(r, top);
}

const three = (passes, grader = 'g') => [0, 1, 2].map((i) => ({ [grader]: i < passes }));

test('reads the real sample', () => {
  const r = readResult(sample);
  const c = r.cases.smoke;
  assert.ok(c);
  assert.ok(c.score >= 0 && c.score <= 1);
  assert.equal(r.partial, false);
  assert.equal(c.error, false);
});

test('throws when there are no cases', () => {
  assert.throws(() => readResult({ ...clone(sample), cases: [] }), /no cases/);
});

test('a drop of one run in three is same but lists the lost grader', () => {
  const o = readResult(build([{ name: 'a', runs: three(3) }]));
  const n = readResult(build([{ name: 'a', runs: three(2) }]));
  const [row] = compareResults(o, n);
  assert.equal(row.verdict, 'same');
  assert.deepEqual(row.lost, ['g']);
  assert.deepEqual(row.gained, []);
});

test('flags a drop of two runs in three as worse', () => {
  const o = readResult(build([{ name: 'a', runs: three(3) }]));
  const n = readResult(build([{ name: 'a', runs: three(1) }]));
  assert.equal(compareResults(o, n)[0].verdict, 'worse');
});

test('flags a rise of two runs in three as better', () => {
  const o = readResult(build([{ name: 'a', runs: three(1) }]));
  const n = readResult(build([{ name: 'a', runs: three(3) }]));
  const [row] = compareResults(o, n);
  assert.equal(row.verdict, 'better');
  assert.deepEqual(row.gained, ['g']);
});

test('noise graders are never listed as gained or lost', () => {
  const o = readResult(build([{ name: 'a', runs: [0, 1, 2].map(() => ({ g: true, 'noise-1': true })) }]));
  const n = readResult(build([{ name: 'a', runs: [0, 1, 2].map(() => ({ g: true, 'noise-1': false })) }]));
  const [row] = compareResults(o, n);
  assert.deepEqual([row.gained, row.lost], [[], []]);
  assert.equal(row.newNoise, 0);
});

test('same within the margin', () => {
  const o = readResult(build([{ name: 'a', runs: three(2) }]));
  const ten = Array.from({ length: 10 }, (_, i) => ({ g: i < 9 }));
  const n = readResult(build([{ name: 'a', runs: ten }]));
  assert.equal(compareResults(o, n, { expectedRuns: 3 })[0].verdict, 'same');
});

test('a partial result still compares cases that finished every run', () => {
  const o = readResult(build([{ name: 'a', runs: three(3) }, { name: 'b', runs: three(3) }]));
  const n = readResult(build([{ name: 'a', runs: three(1) }, { name: 'b', runs: three(1).slice(0, 1) }], { partial: true }));
  const rows = compareResults(o, n, { expectedRuns: 3 });
  assert.equal(rows.find((r) => r.case === 'a').verdict, 'worse');
  assert.equal(rows.find((r) => r.case === 'b').verdict, 'incomplete');
});

test('expected runs default to the most runs any case has', () => {
  const o = readResult(build([{ name: 'a', runs: three(3) }, { name: 'b', runs: three(3) }]));
  const n = readResult(build([{ name: 'a', runs: three(3) }, { name: 'b', runs: three(3).slice(0, 2) }], { partial: true }));
  const rows = compareResults(o, n);
  assert.equal(rows.find((r) => r.case === 'a').verdict, 'same');
  assert.equal(rows.find((r) => r.case === 'b').verdict, 'incomplete');
});

test('a case missing from a partial side is incomplete, not new or removed', () => {
  const full = readResult(build([{ name: 'a', runs: three(3) }, { name: 'b', runs: three(3) }]));
  const cut = readResult(build([{ name: 'a', runs: three(3) }], { partial: true }));
  assert.equal(compareResults(full, cut).find((r) => r.case === 'b').verdict, 'incomplete');
  assert.equal(compareResults(cut, full).find((r) => r.case === 'b').verdict, 'incomplete');
});

test('an expected case that ran on neither side is listed as incomplete', () => {
  const o = readResult(build([{ name: 'a', runs: three(3) }], { partial: true }));
  const n = readResult(build([{ name: 'a', runs: three(3) }], { partial: true }));
  const rows = compareResults(o, n, { expectedCases: ['a', 'z'] });
  assert.deepEqual(rows.map((r) => [r.case, r.verdict]), [['a', 'same'], ['z', 'incomplete']]);
});

test('a case with fewer runs than expected is incomplete on either side', () => {
  const o = readResult(build([{ name: 'a', runs: three(3).slice(0, 1) }], { partial: true }));
  const n = readResult(build([{ name: 'a', runs: three(0) }]));
  assert.equal(compareResults(o, n, { expectedRuns: 3 })[0].verdict, 'incomplete');
  assert.equal(compareResults(n, o, { expectedRuns: 3 })[0].verdict, 'incomplete');
});

test('a run error makes the case incomplete', () => {
  const o = readResult(build([{ name: 'a', runs: three(3) }]));
  const n = readResult(build([{ name: 'a', runs: three(0), error: true }]));
  assert.equal(n.cases.a.error, true);
  assert.equal(compareResults(o, n)[0].verdict, 'incomplete');
});

test('a case with no scored graders is incomplete', () => {
  const o = readResult(build([{ name: 'a', runs: three(3) }]));
  const n = readResult(build([{ name: 'a', runs: three(3, 'noise-1') }]));
  assert.equal(n.cases.a.score, null);
  assert.equal(compareResults(o, n)[0].verdict, 'incomplete');
});

test('added and removed cases', () => {
  const o = readResult(build([{ name: 'a', runs: three(3) }, { name: 'gone', runs: three(3) }]));
  const n = readResult(build([{ name: 'a', runs: three(3) }, { name: 'fresh', runs: three(3) }]));
  const byCase = Object.fromEntries(compareResults(o, n).map((r) => [r.case, r.verdict]));
  assert.deepEqual(byCase, { a: 'same', fresh: 'new', gone: 'removed' });
});

test('noise does not change the score', () => {
  const runs = [0, 1, 2].map(() => ({ g: true, 'noise-1': false }));
  const c = readResult(build([{ name: 'a', runs }])).cases.a;
  assert.equal(c.score, 1);
  assert.equal(c.noise, 0);
});

test('renders a table and summary', () => {
  const o = readResult(build([{ name: 'a', runs: three(3) }]));
  const n = readResult(build([{ name: 'a', runs: three(1) }]));
  const md = renderComparison(compareResults(o, n), { oldLabel: '0.38.0', newLabel: '0.39.0', oldCost: 1, newCost: 2, oldDuration: 10, newDuration: 20 });
  assert.match(md, /0\.38\.0/);
  assert.match(md, /\| Case \| Old \| New \| Verdict \| Gained \| Lost \| Noise old→new \|/);
  assert.match(md, /\| a \| 1\.00 \| 0\.33 \| worse \|/);
  assert.match(md, /1 worse, 0 better/);
});

test('summary counts incomplete, new and removed', () => {
  const o = readResult(build([{ name: 'a', runs: three(3) }, { name: 'gone', runs: three(3) }, { name: 'b', runs: three(3), error: true }]));
  const n = readResult(build([{ name: 'a', runs: three(3) }, { name: 'fresh', runs: three(3) }, { name: 'b', runs: three(3) }]));
  const md = renderComparison(compareResults(o, n), { oldLabel: 'o', newLabel: 'n' });
  assert.match(md, /0 worse, 0 better, 1 incomplete, 1 new, 1 removed/);
});

test('score is the weighted mean of scored graders', () => {
  const r = clone(sample);
  const template = r.cases[0];
  r.cases = [{
    ...clone(template),
    name: 'w',
    arms: { with: [{ ...clone(template.arms.with[0]), error: null, graders: [
      { name: 'heavy', passed: true, scored: true, weight: 2 },
      { name: 'light', passed: false, scored: true, weight: 1 },
      { name: 'noise-x', passed: false, scored: true, weight: 5 },
    ] }] },
  }];
  assert.ok(Math.abs(readResult(r).cases.w.score - 2 / 3) < 1e-9);
});
