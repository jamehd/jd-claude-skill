#!/usr/bin/env node
// Builds a throwaway copy of one jd plugin version plus a project's private eval cases,
// with the installed superpowers beside it, ready for `claude plugin eval`.
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync, existsSync, renameSync, rmSync, statSync } from 'node:fs';
import { join, resolve, relative, dirname, basename, isAbsolute } from 'node:path';
import { tmpdir, homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const STAGE_PREFIX = 'jd-stage-';
const SUPERPOWERS_KEY = 'superpowers@claude-plugins-official';
const NON_CASE_DIRS = new Set(['results', 'sources']);
const PLUGIN_LINES = ['plugins:', '  - "../.."', '  - "../../.eval-deps/superpowers"'];

export function toWslPath(winPath) {
  const m = /^([A-Za-z]):[\\/]*(.*)$/.exec(winPath);
  if (!m) return winPath.split('\\').join('/');
  return `/mnt/${m[1].toLowerCase()}/${m[2].split('\\').join('/')}`;
}

export function findSuperpowers(installedPluginsFile = join(homedir(), '.claude', 'plugins', 'installed_plugins.json')) {
  let entries;
  try {
    entries = JSON.parse(readFileSync(installedPluginsFile, 'utf8')).plugins?.[SUPERPOWERS_KEY];
  } catch { entries = undefined; }
  if (!Array.isArray(entries) || !entries.length) {
    throw new Error(`superpowers is not installed (looked in ${installedPluginsFile})`);
  }
  const e = entries.find((x) => x.scope === 'user') || entries[0];
  return { path: e.installPath, version: e.version };
}

function listFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listFiles(p));
    else out.push(p);
  }
  return out;
}

function caseFolders(casesDir) {
  return readdirSync(casesDir).filter((n) => !NON_CASE_DIRS.has(n) && statSync(join(casesDir, n)).isDirectory());
}

function hashCases(casesDir) {
  const h = createHash('sha256');
  const files = caseFolders(casesDir)
    .flatMap((n) => listFiles(join(casesDir, n)))
    .map((p) => relative(casesDir, p).split('\\').join('/'))
    .sort();
  for (const rel of files) {
    h.update(rel);
    h.update('\0');
    h.update(readFileSync(join(casesDir, rel)));
    h.update('\0');
  }
  return h.digest('hex');
}

function withPlugins(yaml) {
  const lines = yaml.split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^plugins\s*:/.test(lines[i])) {
      while (i + 1 < lines.length && /^(\s+|-\s)/.test(lines[i + 1]) && lines[i + 1].trim() !== '') i++;
      continue;
    }
    out.push(lines[i]);
  }
  while (out.length && out[out.length - 1].trim() === '') out.pop();
  return [...out, ...PLUGIN_LINES].join('\n') + '\n';
}

function extractRef(pluginRepo, ref, dest) {
  const tmp = mkdtempSync(join(tmpdir(), 'flow-eval-archive-'));
  try {
    const tar = execFileSync('git', ['-C', pluginRepo, 'archive', '--format=tar', ref, 'plugins/jd'], { maxBuffer: 1 << 30 });
    execFileSync('tar', ['-x'], { input: tar, cwd: tmp });
    renameSync(join(tmp, 'plugins', 'jd'), dest);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

export function stage({ pluginRepo, ref, casesDir, superpowers, outDir }) {
  const base = resolve(outDir ?? tmpdir());
  mkdirSync(base, { recursive: true });
  const dir = join(mkdtempSync(join(base, STAGE_PREFIX)), 'jd');
  if (ref === 'WORKTREE') cpSync(join(pluginRepo, 'plugins', 'jd'), dir, { recursive: true });
  else extractRef(pluginRepo, ref, dir);

  const pluginVersion = JSON.parse(readFileSync(join(dir, '.claude-plugin', 'plugin.json'), 'utf8')).version;

  cpSync(superpowers.path, join(dir, '.eval-deps', 'superpowers'), { recursive: true });

  const evals = join(dir, 'evals');
  mkdirSync(evals, { recursive: true });
  const cases = [];
  for (const name of caseFolders(casesDir)) {
    const src = join(casesDir, name);
    const dst = join(evals, name);
    cpSync(src, dst, { recursive: true });
    const yamlFile = join(dst, 'case.yaml');
    const current = existsSync(yamlFile) ? readFileSync(yamlFile, 'utf8') : '';
    writeFileSync(yamlFile, withPlugins(current));
    cases.push(current.match(/^name:\s*["']?([^"'\r\n]+?)["']?\s*$/m)?.[1] ?? name);
  }

  return { dir, pluginVersion, casesHash: hashCases(casesDir), cases };
}

export function cleanup(dir) {
  const holder = dirname(resolve(dir));
  if (!basename(holder).startsWith(STAGE_PREFIX)) throw new Error(`refusing to clean ${holder}: not a flow-eval staging folder`);
  rmSync(holder, { recursive: true, force: true });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const a = process.argv.slice(2);
    const opt = (k) => { const i = a.indexOf(`--${k}`); return i < 0 ? undefined : a[i + 1]; };
    const repo = opt('repo');
    const casesDir = opt('cases');
    if (!repo || !casesDir) throw new Error('usage: stage.mjs --repo <plugin repo> --cases <dir> [--ref <git ref|WORKTREE>] [--out <dir>]');
    const out = opt('out') ? resolve(opt('out')) : undefined;
    if (out) {
      const rel = relative(resolve(repo), out);
      if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) throw new Error('--out must not be inside --repo; private cases must never land in the plugin repo');
    }
    console.log(JSON.stringify(stage({ pluginRepo: resolve(repo), ref: opt('ref') || 'WORKTREE', casesDir: resolve(casesDir), superpowers: findSuperpowers(), outDir: out }), null, 2));
  } catch (e) {
    console.error(`flow-eval stage: ${e.message}`);
    process.exit(1);
  }
}
