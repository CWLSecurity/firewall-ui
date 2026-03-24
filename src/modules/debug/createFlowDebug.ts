const debugEnv = import.meta.env.VITE_DEBUG_CREATE_FLOW

export const CREATE_FLOW_DEBUG_ENABLED = debugEnv === '1' || (import.meta.env.DEV && debugEnv !== '0')

export type CreateFlowDebugDetails = Record<string, unknown>

export function logCreateFlowDebug(event: string, details: CreateFlowDebugDetails): void {
  if (!CREATE_FLOW_DEBUG_ENABLED) {
    return
  }

  console.debug(`[create-flow-debug] ${event}`, {
    ...details,
    at: new Date().toISOString(),
  })
}
