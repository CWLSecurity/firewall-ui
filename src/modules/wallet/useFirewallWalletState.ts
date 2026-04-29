import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Address } from 'viem'
import { usePublicClient } from 'wagmi'
import { findLatestWalletByOwner, type WalletRecord } from '../../contracts/factory'
import { verifyImportedFirewallWallet } from '../../contracts/walletVerification'

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
  const walletRecordRef = useRef<WalletRecord | null>(null)
  const detectionScopeKeyRef = useRef<string | null>(null)

  const refresh = useCallback(() => {
    setRefreshNonce((value) => value + 1)
  }, [])

  useEffect(() => {
    walletRecordRef.current = walletRecord
  }, [walletRecord])

  useEffect(() => {
    if (!params.ownerAddress || !publicClient) {
      queueMicrotask(() => {
        setError(null)
        setIsLoading(false)
      })
      return
    }

    if (!params.isBaseReady) {
      queueMicrotask(() => {
        setError(null)
        setIsLoading(false)
      })
      return
    }
    const client = publicClient
    const owner = params.ownerAddress
    const scopeKey = owner.toLowerCase()
    const scopeChanged = detectionScopeKeyRef.current !== scopeKey
    if (scopeChanged) {
      detectionScopeKeyRef.current = scopeKey
      queueMicrotask(() => {
        setWalletRecord(null)
        setError(null)
        setHasInitialDetectionCompleted(false)
      })
    }

    let cancelled = false

    async function run() {
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
                nextRecord = null
                forceClearRecord = shouldForceClearRejectedDetectedRecord({
                  hasPreviousRecordInScope: Boolean(walletRecordRef.current),
                })
              } else if (verification.basePackId !== null) {
                nextRecord = {
                  ...record,
                  basePackId: verification.basePackId,
                }
              }
            } catch (verificationError) {
              void verificationError
              // Preserve the detected record when verification endpoint is flaky.
              nextRecord = record
            }
          }

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
          setError(normalizedError)
        }
      } finally {
        if (!cancelled) {
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
