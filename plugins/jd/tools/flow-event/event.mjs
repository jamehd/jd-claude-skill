#!/usr/bin/env node
// Appends one timestamped feature-flow event to <paths.data>/flow-events.jsonl for the flow-view pane.
// Usage: node event.mjs --feature <ID> --phase <phase> --event <event> [--step <text>] [--note <text>] [--repo <path>]
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProjectConfig } from '../../shared/project-config.mjs';

export const PHASES = ['idea', 'brief', 'build', 'verify', 'acceptance', 'rework', 'done', 'stopped'];
export const EVENTS = ['start', 'pass', 'fail', 'wait', 'resume', 'stop', 'done'];
const OPTIONS = ['repo', 'feature', 'phase', 'step', 'event', 'note'];

export function localIso(date = new Date()) {
  const p = (n) => String(Math.abs(Math.trunc(n))).padStart(2, '0');
  const off = -date.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}${sign}${p(off / 60)}:${p(off % 60)}`;
}

export function parseArgs(argv) {
  const o = { repo: process.cwd() };
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i].replace(/^--/, '');
    const v = argv[i + 1];
    if (!OPTIONS.includes(k)) throw new Error(`unknown option --${k}`);
    if (v === undefined) throw new Error(`missing value for --${k}`);
    o[k] = v;
  }
  for (const k of ['feature', 'phase', 'event']) if (!o[k]) throw new Error(`--${k} is required`);
  if (!PHASES.includes(o.phase)) throw new Error(`--phase must be one of ${PHASES.join(', ')}`);
  if (!EVENTS.includes(o.event)) throw new Error(`--event must be one of ${EVENTS.join(', ')}`);
  o.repo = resolve(o.repo);
  return o;
}

export function eventsFile(repo, config) {
  return join(repo, config.paths?.data || 'project-board/data', 'flow-events.jsonl');
}

export function buildEvent(o, now = new Date()) {
  const ev = { ts: localIso(now), feature: o.feature, phase: o.phase, event: o.event };
  if (o.step) ev.step = o.step;
  if (o.note) ev.note = o.note;
  return ev;
}

export function appendEvent(repo, config, ev) {
  const file = eventsFile(repo, config);
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${JSON.stringify(ev)}\n`);
  return file;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const o = parseArgs(process.argv.slice(2));
    const { config } = loadProjectConfig(o.repo);
    const ev = buildEvent(o);
    appendEvent(o.repo, config, ev);
    console.log(JSON.stringify(ev));
  } catch (e) {
    console.error(`flow-event: ${e.message}`);
    process.exit(1);
  }
}
