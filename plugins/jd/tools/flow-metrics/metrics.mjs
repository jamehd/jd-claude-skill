#!/usr/bin/env node
// Per-feature and per-version flow metrics from feature folders, git history and Claude Code transcripts.
// Usage: node metrics.mjs --repo <path> [--out <dir>] [--projects-dir <path>]
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseFeature } from './parse.mjs';
import { collect } from '../usage-report/usage.mjs';
import { loadProjectConfig, resolveMainBranch } from '../../shared/project-config.mjs';

function git(repo, args) {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
}

function earliestCommit(repo, file, needle) {
  try {
    const first = git(repo, ['log', '--reverse', '--format=%cI', `-S${needle}`, '--', file]).split('\n')[0].trim();
    return first || null;
  } catch { return null; }
}

export function statusDates(repo, featureFile) {
  return {
    acceptanceAt: earliestCommit(repo, featureFile, 'status: acceptance'),
    doneAt: earliestCommit(repo, featureFile, 'status: done'),
  };
}

export function mentionsId(text, id) {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Za-z0-9])${escaped}($|[^A-Za-z0-9])`, 'i').test(text);
}

export function parseApprovedAt(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? '').trim());
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime() : Date.parse(value);
}

export function postMergeFixes(repo, main, id, doneAt) {
  if (!doneAt) return 0;
  const after = Date.parse(doneAt);
  let out;
  try { out = git(repo, ['log', main, `--since=${doneAt}`, '--format=%cI%x09%s']); } catch { return 0; }
  return out.split('\n').filter(Boolean).filter((line) => {
    const [when, ...rest] = line.split('\t');
    const subject = rest.join('\t');
    return Date.parse(when) > after && /^fix/i.test(subject) && mentionsId(subject, id);
  }).length;
}

function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function summarize(rows) {
  const byVersion = new Map();
  for (const r of rows) {
    if (!byVersion.has(r.pluginVersion)) byVersion.set(r.pluginVersion, []);
    byVersion.get(r.pluginVersion).push(r);
  }
  const sum = (list, f) => list.reduce((a, r) => a + f(r), 0);
  return [...byVersion].map(([pluginVersion, list]) => ({
    pluginVersion,
    features: list.length,
    medianHoursToAcceptance: median(list.map((r) => r.hoursToAcceptance).filter((h) => typeof h === 'number')),
    briefRevisions: sum(list, (r) => r.briefRevisions.length),
    reworks: sum(list, (r) => r.reworks.length),
    stops: sum(list, (r) => r.stops.length),
    postMergeFixes: sum(list, (r) => r.postMergeFixes),
  }));
}

const cell = (v) => (v === null || v === undefined ? '' : String(v));
const hours = (h) => (typeof h === 'number' ? h.toFixed(1) : '');
const mtok = (n) => (n ? (n / 1e6).toFixed(1) + 'M' : '');

export function renderMarkdown({ rows, summary }) {
  const out = ['## Per feature', '',
    '| Feature | Title | Status | Plugin | Tier | Hours to acceptance | Brief revisions | Reworks | Stops | Fix attempts | Post-merge fixes | Tokens in | Tokens out |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const r of rows) {
    out.push(`| ${r.id} | ${cell(r.title).replace(/\|/g, '\\|')} | ${cell(r.status)} | ${r.pluginVersion} | ${cell(r.tier)} | ${hours(r.hoursToAcceptance)} | ${r.briefRevisions.length} | ${r.reworks.length} | ${r.stops.length} | ${r.featureFixAttempts} | ${r.postMergeFixes} | ${mtok(r.usage?.tokensIn)} | ${mtok(r.usage?.tokensOut)} |`);
  }
  out.push('', '## Per plugin version', '',
    '| Plugin | Features | Median hours to acceptance | Brief revisions | Reworks | Stops | Post-merge fixes |',
    '|---|---|---|---|---|---|---|');
  for (const s of summary) {
    out.push(`| ${s.pluginVersion} | ${s.features} | ${hours(s.medianHoursToAcceptance)} | ${s.briefRevisions} | ${s.reworks} | ${s.stops} | ${s.postMergeFixes} |`);
  }
  return out.join('\n') + '\n';
}

function readIfExists(file) {
  return existsSync(file) ? readFileSync(file, 'utf8') : undefined;
}

export function findBranch(repo, id) {
  try {
    const refs = git(repo, ['for-each-ref', '--format=%(refname)', 'refs/heads', 'refs/remotes']).split('
').map((r) => r.trim()).filter(Boolean);
    const matches = (prefix) => refs.filter((r) => r.startsWith(prefix) && !r.endsWith('/HEAD')).map((r) => r.slice(prefix.length)).filter((n) => mentionsId(n, id)).sort();
    const local = matches('refs/heads/');
    if (local.length) return local[0];
    const remote = matches('refs/remotes/');
    return remote.length ? remote[0] : null;
  } catch { return null; }
}

function featureUsage(repo, main, id, projectsDir) {
  const branch = findBranch(repo, id);
  if (!branch) return null;
  let since;
  try { since = git(repo, ['log', `${main}..${branch}`, '--reverse', '--format=%cI']).split('\n')[0].trim(); } catch { return null; }
  if (!since) return null;
  try {
    const { rows } = collect({ repo, since, until: new Date().toISOString(), projectsDir });
    return {
      tokensIn: rows.reduce((a, r) => a + r.input + r.cacheRead, 0),
      tokensOut: rows.reduce((a, r) => a + r.output, 0),
    };
  } catch { return null; }
}

export function buildRows(repo, config, projectsDir) {
  const featuresDir = resolve(repo, config.paths.features);
  if (!existsSync(featuresDir)) return [];
  const main = resolveMainBranch(repo, config);
  const rows = [];
  for (const id of readdirSync(featuresDir).sort()) {
    const dir = join(featuresDir, id);
    const feature = readIfExists(join(dir, 'feature.md'));
    if (feature === undefined) continue;
    const row = parseFeature({ feature, brief: readIfExists(join(dir, 'brief.md')), report: readIfExists(join(dir, 'report.md')) });
    if (!row.id) row.id = id;
    const rel = `${config.paths.features}/${id}/feature.md`.replace(/\\/g, '/');
    const { acceptanceAt, doneAt } = statusDates(repo, rel);
    const approved = parseApprovedAt(row.approvedAt);
    row.acceptanceAt = acceptanceAt;
    row.doneAt = doneAt;
    row.hoursToAcceptance = acceptanceAt && !Number.isNaN(approved) ? (Date.parse(acceptanceAt) - approved) / 3.6e6 : null;
    row.postMergeFixes = postMergeFixes(repo, main, row.id, doneAt);
    row.usage = featureUsage(repo, main, row.id, projectsDir);
    rows.push(row);
  }
  return rows;
}

export function parseArgs(argv) {
  const o = { repo: process.cwd(), projectsDir: join(homedir(), '.claude', 'projects') };
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i].replace(/^--/, '');
    const v = argv[i + 1];
    if (v === undefined) throw new Error(`missing value for --${k}`);
    if (k === 'projects-dir') o.projectsDir = v;
    else if (['repo', 'out'].includes(k)) o[k] = v;
    else throw new Error(`unknown option --${k}`);
  }
  o.repo = resolve(o.repo);
  return o;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const o = parseArgs(process.argv.slice(2));
    const { config } = loadProjectConfig(o.repo);
    const rows = buildRows(o.repo, config, o.projectsDir);
    const summary = summarize(rows);
    const dir = resolve(o.out ?? join(o.repo, config.paths.data, 'metrics'));
    mkdirSync(dir, { recursive: true });
    const md = renderMarkdown({ rows, summary });
    writeFileSync(join(dir, 'metrics.json'), JSON.stringify({ rows, summary }, null, 2));
    writeFileSync(join(dir, 'metrics.md'), md);
    console.log(md);
    console.log(`Wrote ${dir}`);
  } catch (e) {
    console.error(`flow-metrics: ${e.message}`);
    process.exit(1);
  }
}
