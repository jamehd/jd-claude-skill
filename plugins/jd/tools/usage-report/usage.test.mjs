import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeProjectDir, parseArgs, scanTranscript, stepOf } from './usage.mjs';

test('encodes a Windows repo path like Claude Code does', () => {
  assert.equal(encodeProjectDir('D:\\XStation\\SourceCode\\netbarbox_platform'), 'D--XStation-SourceCode-netbarbox-platform');
});

test('maps agent descriptions to steps', () => {
  assert.equal(stepOf(undefined), 'Coordinator');
  assert.equal(stepOf('Implement T-030 security hardening'), 'Plan and implement');
  assert.equal(stepOf('Security review FND-2 branch'), 'Reviews and audits');
  assert.equal(stepOf('FND-2 soak fix'), 'Verification and fixes');
  assert.equal(stepOf('Write the changelog'), 'Other agents');
});

test('counts each assistant message once and only inside the window', () => {
  const msg = (id, ts, out) => JSON.stringify({
    type: 'assistant', timestamp: ts,
    message: { id, usage: { input_tokens: 1, cache_read_input_tokens: 100, cache_creation_input_tokens: 10, output_tokens: out } },
  });
  const text = [
    msg('a', '2026-01-01T00:00:00Z', 5),
    msg('b', '2026-01-02T00:00:00Z', 7),
    msg('b', '2026-01-02T00:00:01Z', 7),
    'not json',
  ].join('\n');
  const r = scanTranscript(text, Date.parse('2026-01-01T12:00:00Z'), null);
  assert.deepEqual([r.calls, r.cacheRead, r.output], [1, 100, 7]);
});

test('rejects unknown options', () => {
  assert.throws(() => parseArgs(['--nope', 'x']), /unknown option/);
});
