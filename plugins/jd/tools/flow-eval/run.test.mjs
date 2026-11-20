import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { historyKey, findReusable, appendHistory, main, shQuote, wslBashArgs, buildEvalCommand, readEvalJson } from './run.mjs';

const sample = JSON.parse(readFileSync(new URL('./fixtures/aggregate-result.sample.json', import.meta.url), 'utf8'));
const clone = (x) => JSON.parse(JSON.stringify(x));
const tmp = (p) => mkdtempSync(join(tmpdir(), p));
const write = (file, text) => { mkdirSync(join(file, '..'), { recursive: true }); writeFileSync(file, text); };

const base = { pluginRef: 'v1', pluginVersion: '1.0.0', superpowersVersion: '7.0.2', casesHash: 'abc' };

test('reuses a complete old result with the same key', () => {
  const key = historyKey(base);
  const history = [{ key, partial: false, cases: {} }];
  assert.equal(findReusable(history, key), history[0]);
});

test('does not reuse a partial one', () => {
  const key = historyKey(base);
  assert.equal(findReusable([{ key, partial: true, cases: {} }], key), undefined);
});

test('a new superpowers version changes the key', () => {
  assert.notEqual(historyKey(base), historyKey({ ...base, superpowersVersion: '7.0.3' }));
});

test('appendHistory creates the file and appends', () => {
  const file = join(tmp('fe-h-'), 'nested', 'history.json');
  appendHistory(file, { key: 'a' });
  appendHistory(file, { key: 'b' });
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')).map((e) => e.key), ['a', 'b']);
});

function world() {
  const repo = tmp('fe-repo-');
  const git = (...a) => execFileSync('git', ['-C', repo, ...a], { stdio: 'pipe' });
  git('init', '-q', '-b', 'main');
  git('config', 'user.email', 't@t');
  git('config', 'user.name', 't');
  git('config', 'commit.gpgsign', 'false');
  write(join(repo, 'plugins/jd/.claude-plugin/plugin.json'), JSON.stringify({ name: 'jd', version: '1.0.0' }));
  write(join(repo, 'plugins/jd/skills/x/SKILL.md'), 'x');
  git('add', '-A');
  git('commit', '-q', '-m', 'one');
  git('tag', 'v1.0.0');
  write(join(repo, 'plugins/jd/.claude-plugin/plugin.json'), JSON.stringify({ name: 'jd', version: '1.1.0' }));
  const project = tmp('fe-proj-');
  write(join(project, 'project-board/evals/case-a/prompt.md'), 'do it');
  write(join(project, 'project-board/evals/sources/n.md'), 'n');
  const spDir = tmp('fe-sp-');
  write(join(spDir, '.claude-plugin/plugin.json'), '{"name":"superpowers"}');
  const installed = join(tmp('fe-ip-'), 'installed_plugins.json');
  writeFileSync(installed, JSON.stringify({ plugins: { 'superpowers@claude-plugins-official': [{ scope: 'user', installPath: spDir, version: '7.0.2' }] } }));
  return { repo, project, installed, stageDir: tmp('fe-stage-') };
}

function lowered(json) {
  const r = clone(json);
  for (const c of r.cases) for (const run of c.arms.with) for (const g of run.graders) g.passed = false;
  return r;
}

function deps(w, calls) {
  return {
    installedPluginsFile: w.installed,
    stageOutDir: w.stageDir,
    log: () => {},
    runEval: (dir) => {
      calls.push(dir);
      const version = JSON.parse(readFileSync(join(dir, '.claude-plugin/plugin.json'), 'utf8')).version;
      return version === '1.0.0' ? clone(sample) : lowered(sample);
    },
  };
}

test('end to end with a fake eval', async () => {
  const w = world();
  const calls = [];
  const code = await main(['--project', w.project, '--plugin-repo', w.repo, '--new', 'WORKTREE'], deps(w, calls));
  assert.equal(code, 1);
  assert.equal(calls.length, 2);
  const evals = join(w.project, 'project-board/evals');
  const history = JSON.parse(readFileSync(join(evals, 'history.json'), 'utf8'));
  assert.equal(history.length, 2);
  assert.deepEqual(history.map((h) => h.pluginVersion).sort(), ['1.0.0', '1.1.0']);
  assert.equal(history[0].superpowersVersion, '7.0.2');
  const [stamp] = readdirSync(join(evals, 'results', '1.1.0'));
  assert.match(stamp, /^\d{4}-\d{2}-\d{2}-\d{6}$/);
  assert.match(readFileSync(join(evals, 'results', '1.1.0', stamp, 'comparison.md'), 'utf8'), /worse/);
  assert.ok(existsSync(join(evals, 'results', '1.1.0', stamp, 'aggregate-result.json')));
  assert.deepEqual(readdirSync(w.stageDir), []);

  const again = [];
  const code2 = await main(['--project', w.project, '--plugin-repo', w.repo], deps(w, again));
  assert.equal(code2, 1);
  assert.equal(again.length, 1);
});

test('exits 0 when nothing is worse and cleans staging on failure', async () => {
  const w = world();
  const ok = { ...deps(w, []), runEval: () => clone(sample) };
  assert.equal(await main(['--project', w.project, '--plugin-repo', w.repo], ok), 0);
  const w2 = world();
  const boom = { ...deps(w2, []), runEval: () => { throw new Error('boom'); } };
  await assert.rejects(main(['--project', w2.project, '--plugin-repo', w2.repo], boom), /boom/);
  assert.deepEqual(readdirSync(w2.stageDir), []);
});

test('shQuote escapes spaces, single quotes and dollars for bash -lc', () => {
  const nasty = "/mnt/d/My Dir/it's $HOME";
  assert.equal(shQuote(nasty), "'/mnt/d/My Dir/it'\\''s $HOME'");
  const out = execFileSync('bash', ['-c', `printf %s ${shQuote(nasty)}`], { encoding: 'utf8' });
  assert.equal(out, nasty);
});

test('buildEvalCommand quotes every argument', () => {
  const cmd = buildEvalCommand('D:\\a b\\jd', 'D:\\o', { maxCostUsd: 15, runs: 3 });
  assert.match(cmd, /^'claude' 'plugin' 'eval' '\/mnt\/d\/a b\/jd' '--json'/);
  assert.match(cmd, /'--runs' '3'/);
});

test('readEvalJson reports a missing or unreadable result clearly', () => {
  const dir = tmp('fe-j-');
  assert.throws(() => readEvalJson(join(dir, 'x.json'), 'STAGED', 2), /claude plugin eval failed for STAGED \(exit 2\); no result JSON written/);
  write(join(dir, 'bad.json'), '{nope');
  assert.throws(() => readEvalJson(join(dir, 'bad.json'), 'STAGED', 0), /result JSON unreadable/);
});

test('argument validation', async () => {
  await assert.rejects(main(['--project'], {}), /missing value for --project/);
  await assert.rejects(main(['--project', 'p', '--runs', '0'], {}), /--runs must be a positive number/);
  await assert.rejects(main(['--project', 'p', '--max-cost-usd', 'abc'], {}), /--max-cost-usd must be a positive number/);
});

test('an old run with an errored case is recorded as partial and re-run next time', async () => {
  const w = world();
  const errored = clone(sample);
  errored.cases[0].arms.with[0].error = 'boom';
  const mk = (calls) => ({ ...deps(w, calls), runEval: (dir) => {
    calls.push(dir);
    return JSON.parse(readFileSync(join(dir, '.claude-plugin/plugin.json'), 'utf8')).version === '1.0.0' ? clone(errored) : clone(sample);
  } });
  const first = [];
  await main(['--project', w.project, '--plugin-repo', w.repo], mk(first));
  const history = JSON.parse(readFileSync(join(w.project, 'project-board/evals/history.json'), 'utf8'));
  assert.equal(history.find((h) => h.pluginVersion === '1.0.0').partial, true);
  const second = [];
  await main(['--project', w.project, '--plugin-repo', w.repo], mk(second));
  assert.equal(second.length, 2);
});

test('per-run artifacts are kept for both old and new', async () => {
  const w = world();
  const d = { ...deps(w, []), runEval: (dir, out) => {
    write(join(out, 'run-1', 'trace.txt'), 't');
    return JSON.parse(readFileSync(join(dir, '.claude-plugin/plugin.json'), 'utf8')).version === '1.0.0' ? clone(sample) : lowered(sample);
  } };
  await main(['--project', w.project, '--plugin-repo', w.repo], d);
  const results = join(w.project, 'project-board/evals/results');
  for (const v of ['1.0.0', '1.1.0']) {
    const [s] = readdirSync(join(results, v));
    assert.ok(existsSync(join(results, v, s, 'run-1', 'trace.txt')));
    assert.ok(existsSync(join(results, v, s, 'aggregate-result.json')));
  }
});

const hasWsl = (() => { try { execFileSync('wsl.exe', ['-d', 'Ubuntu-24.04', '--exec', 'true'], { stdio: 'ignore' }); return true; } catch { return false; } })();

test('arguments survive the real wsl.exe hop literally', { skip: !hasWsl }, () => {
  const nasty = ["/mnt/d/My Dir/it's", '$HOME', '`x`', 'say "hi"'];
  const command = ['printf', '[%s]|', ...nasty].map(shQuote).join(' ');
  const out = execFileSync('wsl.exe', wslBashArgs(command), { encoding: 'utf8' });
  assert.equal(out, nasty.map((a) => `[${a}]|`).join(''));
});
