import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { toWslPath, findSuperpowers, stage, cleanup } from './stage.mjs';

const tmp = (p) => mkdtempSync(join(tmpdir(), p));
const write = (file, text) => { mkdirSync(join(file, '..'), { recursive: true }); writeFileSync(file, text); };

function fixture() {
  const repo = tmp('fe-repo-');
  write(join(repo, 'plugins/jd/.claude-plugin/plugin.json'), JSON.stringify({ name: 'jd', version: '9.9.9' }));
  write(join(repo, 'plugins/jd/skills/x/SKILL.md'), 'x');
  const cases = tmp('fe-cases-');
  write(join(cases, 'case-a/prompt.md'), 'do it');
  write(join(cases, 'case-b/prompt.md'), 'do more');
  write(join(cases, 'case-b/case.yaml'), 'name: b\nplugins:\n  - /abs/path\nruns: 3\n');
  const sp = tmp('fe-sp-');
  write(join(sp, '.claude-plugin/plugin.json'), '{"name":"superpowers"}');
  return { repo, cases, sp, out: tmp('fe-out-') };
}

test('converts paths with spaces', () => {
  assert.equal(toWslPath('D:'+String.fromCharCode(92)+'SourceCode'+String.fromCharCode(92)+'JD Claude Skill'+String.fromCharCode(92)+'x'), '/mnt/d/SourceCode/JD Claude Skill/x');
});

test('fails clearly without superpowers', () => {
  const file = join(tmp('fe-ip-'), 'installed_plugins.json');
  writeFileSync(file, JSON.stringify({ plugins: { 'other@x': [{ installPath: '/o', version: '1' }] } }));
  assert.throws(() => findSuperpowers(file), (e) => e.message.includes(file) && /not installed/.test(e.message));
});

test('finds superpowers, preferring the user scope', () => {
  const file = join(tmp('fe-ip-'), 'installed_plugins.json');
  writeFileSync(file, JSON.stringify({ plugins: { 'superpowers@claude-plugins-official': [
    { scope: 'project', installPath: '/p', version: '1' },
    { scope: 'user', installPath: '/u', version: '7.0.2' },
  ] } }));
  assert.deepEqual(findSuperpowers(file), { path: '/u', version: '7.0.2' });
});

test('stages the working copy with cases', () => {
  const f = fixture();
  const r = stage({ pluginRepo: f.repo, ref: 'WORKTREE', casesDir: f.cases, superpowers: { path: f.sp, version: '7' }, outDir: f.out });
  assert.equal(r.pluginVersion, '9.9.9');
  assert.ok(r.dir.startsWith(f.out));
  assert.ok(existsSync(join(r.dir, 'evals/case-a/prompt.md')));
  assert.ok(existsSync(join(r.dir, 'skills/x/SKILL.md')));
  assert.ok(existsSync(join(r.dir, '.eval-deps/superpowers/.claude-plugin/plugin.json')));
  const a = readFileSync(join(r.dir, 'evals/case-a/case.yaml'), 'utf8');
  assert.match(a, /plugins:\n {2}- "\.\.\/\.\."\n {2}- "\.\.\/\.\.\/\.eval-deps\/superpowers"/);
  const b = readFileSync(join(r.dir, 'evals/case-b/case.yaml'), 'utf8');
  assert.ok(!b.includes('/abs/path'));
  assert.match(b, /name: b/);
  assert.match(b, /runs: 3/);
  assert.equal((b.match(/plugins:/g) || []).length, 1);
  cleanup(r.dir);
  assert.ok(!existsSync(r.dir));
});

test('stages a git ref via archive', () => {
  const f = fixture();
  const git = (...a) => execFileSync('git', ['-C', f.repo, ...a], { stdio: 'pipe' });
  git('init', '-q'); git('add', '.');
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'init');
  write(join(f.repo, 'plugins/jd/.claude-plugin/plugin.json'), JSON.stringify({ version: '1.2.3' }));
  const r = stage({ pluginRepo: f.repo, ref: 'HEAD', casesDir: f.cases, superpowers: { path: f.sp, version: '7' }, outDir: f.out });
  assert.equal(r.pluginVersion, '9.9.9');
  assert.ok(existsSync(join(r.dir, 'skills/x/SKILL.md')));
  assert.ok(existsSync(join(r.dir, 'evals/case-a/prompt.md')));
});

test('same cases give the same hash; an edited case changes it', () => {
  const f = fixture();
  const run = () => stage({ pluginRepo: f.repo, ref: 'WORKTREE', casesDir: f.cases, superpowers: { path: f.sp, version: '7' }, outDir: tmp('fe-out-') }).casesHash;
  const h1 = run();
  assert.equal(run(), h1);
  writeFileSync(join(f.cases, 'case-a/prompt.md'), 'changed');
  assert.notEqual(run(), h1);
});

test('cleanup removes only its own staging folder', () => {
  const f = fixture();
  write(join(f.out, 'unrelated.txt'), 'keep');
  const r = stage({ pluginRepo: f.repo, ref: 'WORKTREE', casesDir: f.cases, superpowers: { path: f.sp, version: '7' }, outDir: f.out });
  cleanup(r.dir);
  assert.ok(!existsSync(r.dir));
  assert.ok(existsSync(join(f.out, 'unrelated.txt')));
  assert.throws(() => cleanup(join(f.out, 'jd')), /refusing/);
});

test('stage-only CLI refuses an --out inside the plugin repo', () => {
  const f = fixture();
  assert.throws(() => execFileSync('node', [fileURLToPath(new URL('./stage.mjs', import.meta.url)), '--repo', f.repo, '--cases', f.cases, '--out', join(f.repo, 'staged')], { stdio: 'pipe' }), /must not be inside/);
});

test('skips the results and sources folders of the evals directory', () => {
  const f = fixture();
  write(join(f.cases, 'results/0.38.0/x/aggregate-result.json'), '{}');
  write(join(f.cases, 'sources/notes.md'), 'n');
  write(join(f.cases, 'history.json'), '[]');
  const sp = { path: f.sp, version: '1' };
  const a = stage({ pluginRepo: f.repo, ref: 'WORKTREE', casesDir: f.cases, superpowers: sp, outDir: f.out });
  assert.deepEqual(readdirSync(join(a.dir, 'evals')).sort(), ['case-a', 'case-b']);
  write(join(f.cases, 'results/0.39.0/y/aggregate-result.json'), '{"more":1}');
  write(join(f.cases, 'history.json'), '[1]');
  const b = stage({ pluginRepo: f.repo, ref: 'WORKTREE', casesDir: f.cases, superpowers: sp, outDir: f.out });
  assert.equal(a.casesHash, b.casesHash);
  cleanup(a.dir); cleanup(b.dir);
});
