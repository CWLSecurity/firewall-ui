import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Address } from 'viem'
import { usePublicClient } from 'wagmi'
import { findLatestWalletByOwner, type WalletRecord } from '../../contracts/factory'
import { verifyImportedFirewallWallet } from '../../contracts/walletVerification'
import { logCreateFlowDebug } from '../debug/createFlowDebug'

type ManualWallet = {
  walletAddress: Address
  basePackId: number | null
} | null

type UseFirewallWalletStateParams = {
  ownerAddress: Address | null
  isBaseReady: boolean
  manualWallet: ManualWallet
  lookbackBlocks?: bigint
}

export type FirewallWalletState = {
  walletAddress: Address | null
  basePackId: number | null
  source: 'chain' | 'manual' | null
  walletRecord: WalletRecord | null
  isLoading: boolean
  hasInitialDetectionCompleted: boolean
  error: string | null
  refresh: () => void
}

export function resolveWalletRecordAfterDetection(params: {
  previousRecord: WalletRecord | null
  nextRecord: WalletRecord | null
  scopeChanged: boolean
  forceClear: boolean
}): WalletRecord | null {
  if (params.forceClear) {
    return null
  }

  if (params.nextRecord) {
    return params.nextRecord
  }

  if (params.scopeChanged) {
    return null
  }

  return params.previousRecord
}

export function shouldForceClearRejectedDetectedRecord(params: {
  hasPreviousRecordInScope: boolean
}): boolean {
  // Preserve already-confirmed vault record for same owner scope when a new
  // detection pass is temporarily inconclusive.
  return !params.hasPreviousRecordInScope
}

function normalizeHistoryError(error: unknown): string {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase()

  if (
    message.includes('503') ||
    message.includes('no backend is currently healthy') ||
    message.includes('temporarily unavailable') ||
    message.includes('gateway') ||
    message.includes('timeout')
  ) {
    return 'Wallet history sync is temporarily unavailable on Base RPC. You can continue using the dashboard and retry later.'
  }

  return 'Wallet history sync failed. You can continue using the dashboard and retry later.'
}

export function useFirewallWalletState(params: UseFirewallWalletStateParams): FirewallWalletState {
  const publicClient = usePublicClient()
  const [walletRecord, setWalletRecord] = useState<WalletRecord | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [hasInitialDetectionCompleted, setHasInitialDetectionCompleted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshNonce, setRefreshNonce] = useState(0)
  const prevWalletRecordRef = useRef<WalletRecord | null>(null)
  const prevIsLoadingRef = useRef(false)
  const prevHasInitialDetectionCompletedRef = useRef(false)
  const prevErrorRef = useRef<string | null>(null)
  const detectionScopeKeyRef = useRef<string | null>(null)

  const refresh = useCallback(() => {
    logCreateFlowDebug('handler_run', {
      handler: 'wallet_detection_refresh',
      trigger: 'walletState.refresh',
      source: 'src/modules/wallet/useFirewallWalletState.ts::refresh',
    })
    setRefreshNonce((value) => value + 1)
  }, [])

  useEffect(() => {
    const previous = prevWalletRecordRef.current
    if (previous === walletRecord) {
      return
    }

    logCreateFlowDebug('state_transition', {
      key: 'walletDetection.walletRecord',
      previous,
      next: walletRecord,
      trigger: 'vault_detection_state_update',
      source: 'src/modules/wallet/useFirewallWalletState.ts::useEffect[walletRecord]',
    })
    prevWalletRecordRef.current = walletRecord
  }, [walletRecord])

  useEffect(() => {
    const previous = prevIsLoadingRef.current
    if (previous === isLoading) {
      return
    }

    logCreateFlowDebug('state_transition', {
      key: 'walletDetection.isLoading',
      previous,
      next: isLoading,
      trigger: 'vault_detection_state_update',
      source: 'src/modules/wallet/useFirewallWalletState.ts::useEffect[isLoading]',
    })
    prevIsLoadingRef.current = isLoading
  }, [isLoading])

  useEffect(() => {
    const previous = prevHasInitialDetectionCompletedRef.current
    if (previous === hasInitialDetectionCompleted) {
      return
    }

    logCreateFlowDebug('state_transition', {
      key: 'walletDetection.hasInitialDetectionCompleted',
      previous,
      next: hasInitialDetectionCompleted,
      trigger: 'vault_detection_state_update',
      source: 'src/modules/wallet/useFirewallWalletState.ts::useEffect[hasInitialDetectionCompleted]',
    })
    prevHasInitialDetectionCompletedRef.current = hasInitialDetectionCompleted
  }, [hasInitialDetectionCompleted])

  useEffect(() => {
    const previous = prevErrorRef.current
    if (previous === error) {
      return
    }

    logCreateFlowDebug('state_transition', {
      key: 'walletDetection.error',
      previous,
      next: error,
      trigger: 'vault_detection_state_update',
      source: 'src/modules/wallet/useFirewallWalletState.ts::useEffect[error]',
    })
    prevErrorRef.current = error
  }, [error])

  useEffect(() => {
    if (!params.ownerAddress || !publicClient) {
      logCreateFlowDebug('handler_run', {
        handler: 'vault_detection_skipped',
        trigger: 'missing_owner_or_client',
        source: 'src/modules/wallet/useFirewallWalletState.ts::useEffect',
        ownerAddress: params.ownerAddress,
        isBaseReady: params.isBaseReady,
        hasPublicClient: Boolean(publicClient),
      })
      setError(null)
      setIsLoading(false)
      return
    }

    if (!params.isBaseReady) {
      logCreateFlowDebug('handler_run', {
        handler: 'vault_detection_skipped',
        trigger: 'wrong_network_or_temporarily_unready',
        source: 'src/modules/wallet/useFirewallWalletState.ts::useEffect',
        ownerAddress: params.ownerAddress,
        isBaseReady: params.isBaseReady,
        hasPublicClient: Boolean(publicClient),
      })
      setError(null)
      setIsLoading(false)
      return
    }
    const client = publicClient
    const owner = params.ownerAddress
    const scopeKey = owner.toLowerCase()
    const scopeChanged = detectionScopeKeyRef.current !== scopeKey
    if (scopeChanged) {
      detectionScopeKeyRef.current = scopeKey
      setWalletRecord(null)
      setError(null)
      setHasInitialDetectionCompleted(false)
      logCreateFlowDebug('handler_run', {
        handler: 'vault_detection_scope_reset',
        trigger: 'owner_context_changed',
        source: 'src/modules/wallet/useFirewallWalletState.ts::useEffect',
        scopeKey,
      })
    }

    let cancelled = false

    async function run() {
      logCreateFlowDebug('handler_run', {
        handler: 'vault_detection_started',
        trigger: 'effect_run',
        source: 'src/modules/wallet/useFirewallWalletState.ts::run',
        owner,
        lookbackBlocks: params.lookbackBlocks?.toString() ?? null,
      })
      setIsLoading(true)
      setError(null)

      try {
        const record = await findLatestWalletByOwner({
          publicClient: client,
          owner,
          lookbackBlocks: params.lookbackBlocks,
        })
        if (!cancelled) {
          let nextRecord: WalletRecord | null = record
          let forceClearRecord = false

          if (record) {
            try {
              const verification = await verifyImportedFirewallWallet({
                publicClient: client,
                ownerAddress: owner,
                walletAddress: record.walletAddress,
              })

              if (!verification.ok) {
                logCreateFlowDebug('handler_run', {
                  handler: 'on_vault_detection_complete',
                  trigger: 'wallet_detection_record_rejected',
                  source: 'src/modules/wallet/useFirewallWalletState.ts::run',
                  owner,
                  walletAddress: record.walletAddress,
                  reason: verification.reason,
                })
                nextRecord = null
                forceClearRecord = shouldForceClearRejectedDetectedRecord({
                  hasPreviousRecordInScope: Boolean(prevWalletRecordRef.current),
                })
              } else if (verification.basePackId !== null) {
                nextRecord = {
                  ...record,
                  basePackId: verification.basePackId,
                }
              }
            } catch (verificationError) {
              logCreateFlowDebug('handler_run', {
                handler: 'on_vault_detection_complete',
                trigger: 'wallet_detection_record_verification_error',
                source: 'src/modules/wallet/useFirewallWalletState.ts::run',
                owner,
                walletAddress: record.walletAddress,
                error: verificationError instanceof Error ? verificationError.message : String(verificationError),
              })
              // Preserve the detected record when verification endpoint is flaky.
              nextRecord = record
            }
          }

          logCreateFlowDebug('handler_run', {
            handler: 'on_vault_detection_complete',
            trigger: 'wallet_detection_success',
            source: 'src/modules/wallet/useFirewallWalletState.ts::run',
            owner,
            record: nextRecord,
          })
          setWalletRecord((previous) =>
            resolveWalletRecordAfterDetection({
              previousRecord: previous,
              nextRecord,
              scopeChanged,
              forceClear: forceClearRecord,
            }),
          )
        }
      } catch (walletError) {
        if (!cancelled) {
          const normalizedError = normalizeHistoryError(walletError)
          logCreateFlowDebug('handler_run', {
            handler: 'on_vault_detection_complete',
            trigger: 'wallet_detection_error',
            source: 'src/modules/wallet/useFirewallWalletState.ts::run',
            owner,
            error: normalizedError,
          })
          setError(normalizedError)
        }
      } finally {
        if (!cancelled) {
          logCreateFlowDebug('handler_run', {
            handler: 'on_vault_detection_complete',
            trigger: 'wallet_detection_finally',
            source: 'src/modules/wallet/useFirewallWalletState.ts::run',
            owner,
          })
          setIsLoading(false)
          setHasInitialDetectionCompleted((previous) => (previous ? previous : true))
        }
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [params.ownerAddress, params.isBaseReady, params.lookbackBlocks, publicClient, refreshNonce])

  return useMemo(() => {
    if (params.manualWallet) {
      return {
        walletAddress: params.manualWallet.walletAddress,
        basePackId: params.manualWallet.basePackId,
        source: 'manual' as const,
        walletRecord: null,
        isLoading,
        hasInitialDetectionCompleted,
        error,
        refresh,
      }
    }

    if (walletRecord) {
      return {
        walletAddress: walletRecord.walletAddress,
        basePackId: walletRecord.basePackId,
        source: 'chain' as const,
        walletRecord,
        isLoading,
        hasInitialDetectionCompleted,
        error,
        refresh,
      }
    }

    return {
      walletAddress: null,
      basePackId: null,
      source: null,
      walletRecord: null,
      isLoading,
      hasInitialDetectionCompleted,
      error,
      refresh,
    }
  }, [walletRecord, params.manualWallet, isLoading, hasInitialDetectionCompleted, error, refresh])
}
