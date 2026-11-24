export type FlowEvent = { ts: string; feature?: string; phase?: string; step?: string; event?: string; note?: string }

export type FlowFeature = {
  id: string
  title: string
  status: string
  order: number
  created?: string
  approvedAt?: string
  fixAttempts?: number
  fixLimit?: number
  reworkRound?: number
}

export type FlowSnapshot = {
  found: boolean
  root?: string
  reworkLimit?: number
  error?: string
  activeId?: string
  currentStep?: string
  next?: string
  updated?: string
  waiting: { item: string; who: string; what: string }[]
  log: { date: string; event: string }[]
  features: FlowFeature[]
  events: FlowEvent[]
}

declare module 'claude-code' {
  interface PluginState {
    jd: { flowSnapshot: Shaped<FlowSnapshot>; flowRoot: string; flowFrame: number }
  }
}
