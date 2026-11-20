#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { stage, cleanup, findSuperpowers, toWslPath } from './stage.mjs';
import { readResult, compareResults, renderComparison } from './compare.mjs';

const WSL_DISTRO = 'Ubuntu-24.04';
const EVAL_TIMEOUT_MS = 2 * 60 * 60 * 1000;
const HERE = fileURLToPath(import.meta.url);

export function historyKey({ pluginRef, pluginVersion, superpowersVersion, casesHash }) {
  return [pluginRef, pluginVersion, superpowersVersion, casesHash].join('|');
}

export function findReusable(history, key) {
  return history.find((e) => e.key === key && e.partial === false);
}

function loadHistory(file) {
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];
}

export function appendHistory(file, entry) {
  const history = loadHistory(file);
  history.push(entry);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, JSON.stringify(history, null, 2) + '\n');
}

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function latestTagOrMain(pluginRepo) {
  try {
    const tag = execFileSync('git', ['-C', pluginRepo, 'tag', '--sort=-v:refname'], { encoding: 'utf8' }).split(/\r?\n/).find(Boolean);
    return tag || 'main';
  } catch {
    return 'main';
  }
}

export function makeRunEval({ maxCostUsd, runs }) {
  return (stagedDir) => {
    const out = mkdtempSync(join(tmpdir(), 'flow-eval-out-'));
    try {
      const jsonFile = join(out, 'aggregate-result.json');
      const args = [
        '-d', WSL_DISTRO, '--', 'claude', 'plugin', 'eval', toWslPath(stagedDir),
        '--json', toWslPath(jsonFile), '--output-dir', toWslPath(join(out, 'run')),
        '--ablation', 'none', '--threshold', '0',
        '--max-cost-usd', String(maxCostUsd), '--runs', String(runs),
        '--trust-plugin', '--no-publish',
      ];
      try {
        execFileSync('wsl.exe', args, { timeout: EVAL_TIMEOUT_MS, stdio: ['ignore', 'inherit', 'inherit'] });
      } catch (e) {
        if (!existsSync(jsonFile)) throw e;
      }
      return JSON.parse(readFileSync(jsonFile, 'utf8'));
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  };
}

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith('--')) throw new Error(`unexpected argument ${argv[i]}`);
    o[argv[i].slice(2)] = argv[i + 1];
  }
  return o;
}

function entryFor(ref, staged, superpowers, result) {
  const base = { pluginRef: ref, pluginVersion: staged.pluginVersion, superpowersVersion: superpowers.version, casesHash: staged.casesHash };
  return { key: historyKey(base), ...base, date: new Date().toISOString(), ...result };
}

export async function main(argv, deps = {}) {
  const o = parseArgs(argv);
  if (!o.project) throw new Error('usage: run.mjs --project <repo> [--old <ref>] [--new WORKTREE] [--plugin-repo <path>] [--max-cost-usd 15] [--runs 3] [--cases <dir>]');
  const log = deps.log ?? ((m) => console.log(m));
  const project = resolve(o.project);
  const pluginRepo = resolve(o['plugin-repo'] ?? join(HERE, '..', '..', '..', '..', '..'));
  const evalsRoot = join(project, 'project-board', 'evals');
  const casesDir = resolve(o.cases ?? evalsRoot);
  const historyFile = join(evalsRoot, 'history.json');
  const oldRef = o.old ?? latestTagOrMain(pluginRepo);
  const newRef = o.new ?? 'WORKTREE';
  const runEval = deps.runEval ?? makeRunEval({ maxCostUsd: Number(o['max-cost-usd'] ?? 15), runs: Number(o.runs ?? 3) });
  const superpowers = findSuperpowers(deps.installedPluginsFile);

  const staged = [];
  const stageRef = (ref) => {
    const s = stage({ pluginRepo, ref, casesDir, superpowers, outDir: deps.stageOutDir });
    staged.push(s.dir);
    return s;
  };

  try {
    const oldStage = stageRef(oldRef);
    const oldKey = historyKey({ pluginRef: oldRef, pluginVersion: oldStage.pluginVersion, superpowersVersion: superpowers.version, casesHash: oldStage.casesHash });
    const reused = findReusable(loadHistory(historyFile), oldKey);
    let oldResult;
    if (reused) {
      log(`Reusing recorded result for ${oldRef} (${oldStage.pluginVersion})`);
      oldResult = reused;
    } else {
      log(`Running eval for ${oldRef} (${oldStage.pluginVersion})`);
      oldResult = readResult(runEval(oldStage.dir));
      appendHistory(historyFile, entryFor(oldRef, oldStage, superpowers, oldResult));
    }

    const newStage = stageRef(newRef);
    log(`Running eval for ${newRef} (${newStage.pluginVersion})`);
    const newJson = runEval(newStage.dir);
    const newResult = readResult(newJson);
    appendHistory(historyFile, entryFor(newRef, newStage, superpowers, newResult));

    const rows = compareResults(oldResult, newResult);
    const md = renderComparison(rows, {
      oldLabel: `${oldRef} (${oldStage.pluginVersion})`, newLabel: `${newRef} (${newStage.pluginVersion})`,
      oldCost: oldResult.costUsd, newCost: newResult.costUsd, oldDuration: oldResult.durationSeconds, newDuration: newResult.durationSeconds,
    });
    const resultsDir = join(evalsRoot, 'results', newStage.pluginVersion, stamp());
    mkdirSync(resultsDir, { recursive: true });
    writeFileSync(join(resultsDir, 'aggregate-result.json'), JSON.stringify(newJson, null, 2) + '\n');
    writeFileSync(join(resultsDir, 'comparison.md'), md);
    log(md);
    log(`Results: ${resultsDir}`);
    return rows.some((r) => r.verdict === 'worse') ? 1 : 0;
  } finally {
    for (const dir of staged) cleanup(dir);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === HERE) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => {
    console.error(`flow-eval run: ${e.message}`);
    process.exit(2);
  });
}
