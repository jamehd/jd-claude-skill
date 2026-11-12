export interface SpawnOpts {
  cwd: string
  shell?: boolean
  windowsVerbatimArguments?: boolean
  promptArgIndex?: number
}

export interface SpawnPlan {
  command: string
  args: string[]
  options: SpawnOpts
  stdinPayload?: string
}

const SAFE_TOKEN = /^[A-Za-z0-9_.:=/-]+$/
const SAFE_SESSION_ID = /^[A-Za-z0-9_-]+$/
const UNQUOTABLE_BIN = /["%&|<>^\r\n]/

function windowsBin(bin: string): string {
  if (UNQUOTABLE_BIN.test(bin)) throw new Error(`unsafe executable path for Windows shell: ${bin}`)
  return /\s/.test(bin) ? `"${bin}"` : bin
}

// On Windows the shell parses the command line, so only fixed tokens go on it; the prompt travels over stdin.
export function planSpawn(bin: string, args: string[], opts: SpawnOpts, platform: NodeJS.Platform): SpawnPlan {
  if (!opts.shell || platform !== 'win32') return { command: bin, args, options: opts }
  const promptAt = opts.promptArgIndex
  const hasPrompt = promptAt !== undefined && promptAt >= 0 && promptAt < args.length
  const tokens = hasPrompt ? args.filter((_, i) => i !== promptAt) : args
  tokens.forEach((token, i) => {
    if (!SAFE_TOKEN.test(token)) throw new Error(`unsafe argument for Windows shell: ${token}`)
    if (tokens[i - 1] === '--resume' && !SAFE_SESSION_ID.test(token)) throw new Error(`invalid session id: ${token}`)
  })
  return {
    command: [windowsBin(bin), ...tokens].join(' '),
    args: [],
    options: opts,
    stdinPayload: hasPrompt ? args[promptAt] : undefined,
  }
}

export interface GateCommand {
  bin: string
  args: string[]
  opts: { windowsVerbatimArguments?: boolean }
}

export function gateCommand(cmd: string, platform: NodeJS.Platform, testShell?: string): GateCommand {
  if (platform === 'win32' && testShell !== 'bash') {
    return { bin: 'cmd', args: ['/d', '/s', '/c', `"${cmd}"`], opts: { windowsVerbatimArguments: true } }
  }
  return { bin: 'bash', args: ['-lc', cmd], opts: {} }
}
