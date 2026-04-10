import type { FirewallWalletState } from '../wallet/useFirewallWalletState'

export function shouldWaitForInitialVaultDetection(params: {
  isInitialDetectionPending: boolean
  isInitialDetectionTimedOut: boolean
}): boolean {
  return params.isInitialDetectionPending && !params.isInitialDetectionTimedOut
}

export function shouldClearInitialDetectionTimeout(params: {
  normalizedOwner: string | null
  timedOutDetectionOwner: string | null
  isInitialDetectionPending: boolean
}): boolean {
  return Boolean(
    params.normalizedOwner
    && params.timedOutDetectionOwner === params.normalizedOwner
    && !params.isInitialDetectionPending,
  )
}

export function toStatusWalletState(params: {
  walletState: FirewallWalletState
}): FirewallWalletState {
  return params.walletState
}
