import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildEvent, localIso, parseArgs } from './event.mjs';

const CLI = fileURLToPath(new URL('./event.mjs', import.meta.url));

test('localIso keeps local wall time and offset', () => {
  assert.match(localIso(new Date()), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  const d = new Date('2026-11-24T09:12:03Z');
  assert.equal(Date.parse(localIso(d)), d.getTime());
});

test('parseArgs requires feature, phase and event and checks their values', () => {
  assert.throws(() => parseArgs(['--feature', 'F-1', '--phase', 'build']), /--event is required/);
  assert.throws(() => parseArgs(['--feature', 'F-1', '--phase', 'coding', '--event', 'start']), /--phase must be/);
  assert.throws(() => parseArgs(['--feature', 'F-1', '--phase', 'build', '--event', 'ok']), /--event must be/);
  assert.throws(() => parseArgs(['--colour', 'red']), /unknown option --colour/);
  assert.throws(() => parseArgs(['--feature']), /missing value for --feature/);
});

test('buildEvent omits empty optional fields', () => {
  const ev = buildEvent({ feature: 'F-1', phase: 'build', event: 'start' }, new Date(0));
  assert.deepEqual(Object.keys(ev), ['ts', 'feature', 'phase', 'event']);
  const full = buildEvent({ feature: 'F-1', phase: 'build', event: 'fail', step: 'build 7', note: 'gate red' });
  assert.equal(full.step, 'build 7');
  assert.equal(full.note, 'gate red');
});

test('the CLI appends one line per call under paths.data', () => {
  const repo = mkdtempSync(join(tmpdir(), 'flow-event-'));
  mkdirSync(join(repo, 'project-board'), { recursive: true });
  writeFileSync(join(repo, 'project-board', 'project.yaml'), 'paths:\n  data: board-data\n');
  const run = (...args) => execFileSync(process.execPath, [CLI, '--repo', repo, ...args], { encoding: 'utf8' });
  run('--feature', 'F-1', '--phase', 'brief', '--event', 'start');
  run('--feature', 'F-1', '--phase', 'build', '--event', 'start', '--step', 'build 1');
  const lines = readFileSync(join(repo, 'board-data', 'flow-events.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(lines.length, 2);
  assert.equal(lines[1].step, 'build 1');
});

test('the CLI defaults to project-board/data without project.yaml', () => {
  const repo = mkdtempSync(join(tmpdir(), 'flow-event-'));
  execFileSync(process.execPath, [CLI, '--repo', repo, '--feature', 'F-2', '--phase', 'done', '--event', 'done']);
  const text = readFileSync(join(repo, 'project-board', 'data', 'flow-events.jsonl'), 'utf8');
  assert.match(text, /"feature":"F-2"/);
});
