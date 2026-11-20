import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFrontmatter, parseTable, parseFeature } from './parse.mjs';

const feature039 = `---
id: FND-3
title: "Wallet top-up"
status: done
approvedAt: 2026-11-01
featureFixAttempts: 2
pluginVersion: 0.39.0
---

Summary.

## Brief revisions

| Round | Date | Owner correction | Reason |
|---|---|---|---|
| 1 | 2026-11-02 | Add refund | missed-requirement |
| 2 | 2026-11-03 | Crash budget | quality-budget |

## Stops

| Date | Step | Reason | Counter |
|---|---|---|---|
| 2026-11-04 | build | environment | 1 |
`;

const brief = `| Field | Value |
|---|---|
| Risk tier | high — money |
`;

const report = `# Report

Rework history:

| Round | Date | Notes from owner | Reason | Change made |
|---|---|---|---|---|
| 1 | 2026-11-05 | Fix label | ux-wording | Reworded |
`;

test('parses a 0.39 feature', () => {
  const row = parseFeature({ feature: feature039, brief, report });
  assert.equal(row.id, 'FND-3');
  assert.equal(row.title, 'Wallet top-up');
  assert.equal(row.pluginVersion, '0.39.0');
  assert.equal(row.tier, 'high');
  assert.equal(row.featureFixAttempts, 2);
  assert.equal(row.briefRevisions.length, 2);
  assert.deepEqual(row.briefRevisions[0], { date: '2026-11-02', reason: 'missed-requirement' });
  assert.deepEqual(row.stops[0], { date: '2026-11-04', step: 'build', reason: 'environment' });
  assert.deepEqual(row.reworks[0], { round: '1', date: '2026-11-05', reason: 'ux-wording' });
});

test('tolerates a pre-0.39 feature', () => {
  const row = parseFeature({ feature: '---\nid: FND-1\ntitle: Old\nstatus: done\napprovedAt:\n---\nBody\n' });
  assert.equal(row.pluginVersion, 'before-0.39');
  assert.equal(row.tier, '');
  assert.equal(row.featureFixAttempts, 0);
  assert.deepEqual(row.briefRevisions, []);
  assert.deepEqual(row.reworks, []);
  assert.deepEqual(row.stops, []);
});

test('reads the rework table from the old template', () => {
  const old = 'Rework history:\n\n| Round | Date | Notes from owner | Change made |\n|---|---|---|---|\n| 1 | 2026-10-01 | Wrong colour | Fixed |\n';
  const row = parseFeature({ feature: '---\nid: X\n---\n', report: old });
  assert.deepEqual(row.reworks, [{ round: '1', date: '2026-10-01', reason: '' }]);
});

test('skips empty placeholder rows only', () => {
  const text = '## Stops\n\n| Date | Step | Reason | Counter |\n|---|---|---|---|\n|  |  |  |  |\n| 2026-01-01 | build | defect | 1 |\n';
  assert.equal(parseTable(text, 'Stops').length, 1);
});

test('parseFrontmatter strips quotes and parseTable returns [] when absent', () => {
  assert.equal(parseFrontmatter('---\ntitle: "A: b"\n---\n').title, 'A: b');
  assert.deepEqual(parseTable('nothing', 'Stops'), []);
});
