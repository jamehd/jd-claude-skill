import { describe, it, expect } from 'vitest'
import { planSpawn, gateCommand } from './jobs/spawn-plan.js'

const prompt = 'Fix "it" & run %PATH%\nsecond line | more ^ <x>'
const base = ['-p', prompt, '--dangerously-skip-permissions', '--output-format', 'stream-json', '--verbose']

describe('planSpawn', () => {
  it('keeps argv and no stdin on linux', () => {
    const plan = planSpawn('claude', base, { cwd: '/w', shell: false, promptArgIndex: 1 }, 'linux')
    expect(plan).toEqual({ command: 'claude', args: base, options: { cwd: '/w', shell: false, promptArgIndex: 1 } })
  })

  it('sends the prompt over stdin on win32 and never on the command line', () => {
    const plan = planSpawn('claude', base, { cwd: 'C:\\w', shell: true, promptArgIndex: 1 }, 'win32')
    expect(plan.stdinPayload).toBe(prompt)
    expect(plan.args).toEqual([])
    expect(plan.command).toBe('claude -p --dangerously-skip-permissions --output-format stream-json --verbose')
    for (const bad of ['"', '&', '%', '\n', '|', '^', '<']) expect(plan.command).not.toContain(bad)
  })

  it('appends a valid resume id', () => {
    const plan = planSpawn('claude', [...base, '--resume', 'sess-1_a'], { cwd: 'c', shell: true, promptArgIndex: 1 }, 'win32')
    expect(plan.command.endsWith('--resume sess-1_a')).toBe(true)
  })

  it.each(['abc & calc', 'a"b', '%PATH%', 'x y', ''])('rejects resume id %j', (id) => {
    expect(() => planSpawn('claude', [...base, '--resume', id], { cwd: 'c', shell: true, promptArgIndex: 1 }, 'win32')).toThrow()
  })

  it('quotes an executable path with spaces and rejects dangerous ones', () => {
    expect(planSpawn('C:\\Program Files\\claude.cmd', base, { cwd: 'c', shell: true, promptArgIndex: 1 }, 'win32').command)
      .toMatch(/^"C:\\Program Files\\claude\.cmd" -p /)
    expect(() => planSpawn('claude & calc', base, { cwd: 'c', shell: true, promptArgIndex: 1 }, 'win32')).toThrow(/unsafe/)
  })
})

describe('prompt position is structural', () => {
  it.each(['--help', '--model x', '-p'])('delivers %j as the prompt, not as a flag', (text) => {
    const args = ['-p', text, '--verbose', '--resume', 'sess-1']
    const win = planSpawn('claude', args, { cwd: 'c', shell: true, promptArgIndex: 1 }, 'win32')
    expect(win.stdinPayload).toBe(text)
    expect(win.command).toBe('claude -p --verbose --resume sess-1')
    const linux = planSpawn('claude', args, { cwd: 'c', shell: false, promptArgIndex: 1 }, 'linux')
    expect(linux.args).toEqual(args)
    expect(linux.stdinPayload).toBeUndefined()
  })
})

describe('gateCommand', () => {
  it('uses cmd with verbatim args on win32 so quotes survive', () => {
    const g = gateCommand('cd "a b" && npm test', 'win32')
    expect(g.bin).toBe('cmd')
    expect(g.args).toEqual(['/d', '/s', '/c', '"cd "a b" && npm test"'])
    expect(g.opts.windowsVerbatimArguments).toBe(true)
  })

  it('uses bash -lc on linux and when testShell=bash', () => {
    expect(gateCommand('x', 'linux')).toMatchObject({ bin: 'bash', args: ['-lc', 'x'] })
    expect(gateCommand('x', 'win32', 'bash')).toMatchObject({ bin: 'bash', args: ['-lc', 'x'] })
  })
})
