import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { statusDates, postMergeFixes, findBranch, mentionsId, parseApprovedAt, summarize, renderMarkdown } from './metrics.mjs';

let hasGit = true;
try { execFileSync('git', ['--version'], { stdio: 'ignore' }); } catch { hasGit = false; }
const gitTest = hasGit ? test : test.skip;

function git(repo, args, date) {
  const env = { ...process.env };
  if (date) { env.GIT_COMMITTER_DATE = date; env.GIT_AUTHOR_DATE = date; }
  return execFileSync('git', ['-C', repo, ...args], { env, encoding: 'utf8' });
}

function newRepo() {
  const repo = mkdtempSync(join(tmpdir(), 'flow-metrics-'));
  git(repo, ['init', '-q', '-b', 'main']);
  git(repo, ['config', 'user.email', 't@example.com']);
  git(repo, ['config', 'user.name', 't']);
  git(repo, ['config', 'commit.gpgsign', 'false']);
  return repo;
}

function commit(repo, file, content, message, date) {
  mkdirSync(join(repo, file, '..'), { recursive: true });
  writeFileSync(join(repo, file), content);
  git(repo, ['add', file]);
  git(repo, ['commit', '-q', '-m', message], date);
}

gitTest('finds acceptance and done dates', () => {
  const repo = newRepo();
  const f = 'features/FND-9/feature.md';
  commit(repo, f, '---\nstatus: building\n---\n', 'start', '2026-01-01T10:00:00+00:00');
  commit(repo, f, '---\nstatus: acceptance\n---\n', 'accept', '2026-01-02T11:00:00+00:00');
  commit(repo, f, '---\nstatus: done\n---\n', 'done', '2026-01-03T12:00:00+00:00');
  assert.deepEqual(statusDates(repo, f), {
    acceptanceAt: '2026-01-02T11:00:00Z',
    doneAt: '2026-01-03T12:00:00Z',
  });
});

gitTest('returns nulls when a status was never reached', () => {
  const repo = newRepo();
  const f = 'features/FND-9/feature.md';
  commit(repo, f, '---\nstatus: building\n---\n', 'start', '2026-01-01T10:00:00+00:00');
  assert.deepEqual(statusDates(repo, f), { acceptanceAt: null, doneAt: null });
});

gitTest('counts fix commits after merge', () => {
  const repo = newRepo();
  commit(repo, 'a.txt', '1', 'fix(x): FND-9 early', '2026-01-01T00:00:00+00:00');
  commit(repo, 'a.txt', '2', 'feat: FND-9 merge', '2026-01-02T00:00:00+00:00');
  commit(repo, 'a.txt', '3', 'fix(x): FND-9 thing', '2026-01-03T00:00:00+00:00');
  commit(repo, 'a.txt', '4', 'fix(x): FND-8 other', '2026-01-04T00:00:00+00:00');
  assert.equal(postMergeFixes(repo, 'main', 'FND-9', '2026-01-02T00:00:00+00:00'), 1);
  assert.equal(postMergeFixes(repo, 'main', 'FND-9', null), 0);
});

test('summarizes per version', () => {
  const row = (id, pluginVersion, hours, extra = {}) => ({
    id, pluginVersion, hoursToAcceptance: hours,
    briefRevisions: [{}], reworks: [{}, {}], stops: [], postMergeFixes: 1, ...extra,
  });
  const out = summarize([row('A', '0.39.0', 10), row('B', '0.39.0', 30), row('C', 'before-0.39', null)]);
  const v = out.find((s) => s.pluginVersion === '0.39.0');
  assert.equal(v.features, 2);
  assert.equal(v.medianHoursToAcceptance, 20);
  assert.equal(v.briefRevisions, 2);
  assert.equal(v.reworks, 4);
  assert.equal(v.postMergeFixes, 2);
  assert.equal(out.find((s) => s.pluginVersion === 'before-0.39').medianHoursToAcceptance, null);
});

test('renders both tables', () => {
  const rows = [{
    id: 'FND-9', title: 'T', status: 'done', pluginVersion: '0.39.0', tier: 'low',
    hoursToAcceptance: 5, briefRevisions: [], reworks: [], stops: [], postMergeFixes: 0,
    featureFixAttempts: 0, usage: null,
  }];
  const md = renderMarkdown({ rows, summary: summarize(rows) });
  assert.match(md, /\| FND-9 \|/);
  assert.match(md, /\| 0\.39\.0 \|/);
});

gitTest('does not match a longer id in post-merge fixes', () => {
  const repo = newRepo();
  commit(repo, 'a.txt', '1', 'feat: merge', '2026-01-01T00:00:00+00:00');
  commit(repo, 'a.txt', '2', 'fix: FND-10 other', '2026-01-02T00:00:00+00:00');
  assert.equal(postMergeFixes(repo, 'main', 'FND-1', '2026-01-01T00:00:00+00:00'), 0);
  assert.equal(mentionsId('fix(x): FND-1 thing', 'FND-1'), true);
});

gitTest('picks the exact feature branch', () => {
  const repo = newRepo();
  commit(repo, 'a.txt', '1', 'init', '2026-01-01T00:00:00+00:00');
  git(repo, ['branch', 'feat/FND-10-y']);
  git(repo, ['branch', 'feat/FND-1-x']);
  assert.equal(findBranch(repo, 'FND-1'), 'feat/FND-1-x');
  assert.equal(findBranch(repo, 'FND-2'), null);
});

test('treats a date-only approvedAt as local midnight', () => {
  assert.equal(parseApprovedAt('2026-11-13'), new Date(2026, 10, 13).getTime());
});
