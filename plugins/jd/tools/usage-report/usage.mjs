#!/usr/bin/env node
// Summarises wall time and token use of Claude Code sessions for one repository and time window,
// from the transcripts under ~/.claude/projects/<encoded repo path>/ (subagents included).
// Usage: node usage.mjs [--repo <path>] [--since <ISO time | git rev>] [--until <ISO time | git rev>]
//                       [--projects-dir <path>] [--format md|json]
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const STEPS = [
  ['Reviews and audits', /review|audit/i],
  ['Plan and implement', /implement|plan|investigat|explore/i],
  ['Verification and fixes', /\bqa\b|verif|soak|load|fix|regression/i],
];

export function parseArgs(argv) {
  const o = { repo: process.cwd(), format: 'md', projectsDir: join(homedir(), '.claude', 'projects') };
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i].replace(/^--/, '');
    const v = argv[i + 1];
    if (v === undefined) throw new Error(`missing value for --${k}`);
    if (k === 'projects-dir') o.projectsDir = v;
    else if (['repo', 'since', 'until', 'format'].includes(k)) o[k] = v;
    else throw new Error(`unknown option --${k}`);
  }
  o.repo = resolve(o.repo);
  return o;
}

export function encodeProjectDir(repo) {
  return repo.replace(/[^A-Za-z0-9]/g, '-');
}

function toTime(value, repo) {
  if (!value) return null;
  const t = Date.parse(value);
  if (!Number.isNaN(t) && /\d{4}-\d{2}-\d{2}/.test(value)) return t;
  const iso = execFileSync('git', ['-C', repo, 'log', '-1', '--format=%cI', value], { encoding: 'utf8' }).trim();
  return Date.parse(iso);
}

export function stepOf(description) {
  if (!description) return 'Coordinator';
  for (const [name, re] of STEPS) if (re.test(description)) return name;
  return 'Other agents';
}

export function scanTranscript(text, since, until) {
  const seen = new Set();
  const r = { calls: 0, cacheRead: 0, cacheWrite: 0, input: 0, output: 0, first: null, last: null };
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let d;
    try { d = JSON.parse(line); } catch { continue; }
    const t = d.timestamp ? Date.parse(d.timestamp) : NaN;
    if (Number.isNaN(t) || (since && t < since) || (until && t > until)) continue;
    r.first = r.first === null ? t : Math.min(r.first, t);
    r.last = r.last === null ? t : Math.max(r.last, t);
    const m = d.message;
    if (d.type !== 'assistant' || !m?.usage || !m.id || seen.has(m.id)) continue;
    seen.add(m.id);
    r.calls++;
    r.input += m.usage.input_tokens ?? 0;
    r.cacheRead += m.usage.cache_read_input_tokens ?? 0;
    r.cacheWrite += m.usage.cache_creation_input_tokens ?? 0;
    r.output += m.usage.output_tokens ?? 0;
  }
  return r;
}

function listJsonl(dir) {
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.jsonl')).map((f) => join(dir, f)) : [];
}

export function collect(o) {
  const dir = join(o.projectsDir, encodeProjectDir(o.repo));
  if (!existsSync(dir)) throw new Error(`no transcripts at ${dir}`);
  const since = toTime(o.since, o.repo);
  const until = toTime(o.until, o.repo);
  const rows = [];
  for (const main of listJsonl(dir)) {
    const sid = main.slice(0, -'.jsonl'.length);
    const files = [[main, null, null]];
    for (const sub of listJsonl(join(sid, 'subagents'))) {
      let meta = {};
      const metaPath = sub.slice(0, -'.jsonl'.length) + '.meta.json';
      if (existsSync(metaPath)) try { meta = JSON.parse(readFileSync(metaPath, 'utf8')); } catch { /* keep empty */ }
      files.push([sub, meta.description || meta.agentType || 'agent', meta.agentType || null]);
    }
    for (const [file, description, agentType] of files) {
      if (since && statSync(file).mtimeMs < since) continue;
      const r = scanTranscript(readFileSync(file, 'utf8'), since, until);
      if (!r.calls) continue;
      rows.push({ ...r, description: description ?? 'Coordinator (main session)', agentType, step: stepOf(description) });
    }
  }
  return { since, until, rows };
}

const M = (n) => (n / 1e6).toFixed(1) + 'M';
const H = (ms) => (ms / 3.6e6).toFixed(1) + ' h';

export function render({ since, rows }) {
  const steps = new Map();
  for (const r of rows) {
    const s = steps.get(r.step) ?? { agents: 0, ms: 0, cacheRead: 0, fresh: 0, output: 0, calls: 0 };
    s.agents++; s.ms += r.last - r.first; s.calls += r.calls;
    s.cacheRead += r.cacheRead; s.fresh += r.input + r.cacheWrite; s.output += r.output;
    steps.set(r.step, s);
  }
  const first = Math.min(...rows.map((r) => r.first));
  const last = Math.max(...rows.map((r) => r.last));
  const tot = [...steps.values()].reduce((a, s) => ({
    agents: a.agents + s.agents, ms: a.ms + s.ms, calls: a.calls + s.calls,
    cacheRead: a.cacheRead + s.cacheRead, fresh: a.fresh + s.fresh, output: a.output + s.output,
  }), { agents: 0, ms: 0, calls: 0, cacheRead: 0, fresh: 0, output: 0 });
  const out = [];
  out.push(`Window: ${new Date(since ?? first).toISOString()} to ${new Date(last).toISOString()} (wall ${H(last - (since ?? first))})`, '');
  out.push('| Step | Agents | Agent time | Calls | Tokens in (cache read) | Tokens in (fresh + cache write) | Tokens out |');
  out.push('|---|---|---|---|---|---|---|');
  for (const [name, s] of [...steps].sort((a, b) => b[1].cacheRead - a[1].cacheRead)) {
    out.push(`| ${name} | ${s.agents} | ${H(s.ms)} | ${s.calls} | ${M(s.cacheRead)} | ${M(s.fresh)} | ${M(s.output)} |`);
  }
  out.push(`| Total | ${tot.agents} | ${H(tot.ms)} | ${tot.calls} | ${M(tot.cacheRead)} | ${M(tot.fresh)} | ${M(tot.output)} |`, '');
  out.push('Largest agents:', '', '| Agent | Step | Time | Calls | Avg context | Tokens out |', '|---|---|---|---|---|---|');
  for (const r of [...rows].sort((a, b) => b.cacheRead - a.cacheRead).slice(0, 10)) {
    const ctx = (r.cacheRead + r.cacheWrite + r.input) / r.calls;
    out.push(`| ${r.description} | ${r.step} | ${H(r.last - r.first)} | ${r.calls} | ${(ctx / 1e3).toFixed(0)}k | ${M(r.output)} |`);
  }
  return out.join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const o = parseArgs(process.argv.slice(2));
    const data = collect(o);
    if (!data.rows.length) { console.log('No Claude Code activity in this window.'); process.exit(0); }
    console.log(o.format === 'json' ? JSON.stringify(data, null, 2) : render(data));
  } catch (e) {
    console.error(`usage-report: ${e.message}`);
    process.exit(1);
  }
}
