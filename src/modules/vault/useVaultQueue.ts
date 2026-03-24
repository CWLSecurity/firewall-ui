import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Address } from 'viem'
import { usePublicClient } from 'wagmi'
import { getFirewallModuleConfig } from '../../lib/contracts/firewallModule'
import { readQueueTxIds } from '../../contracts/moduleViews'

export type QueueItemView = {
  txId: `0x${string}`
  to: Address
  value: bigint
  unlockTime: bigint
  exists: boolean
  executed: boolean
  dataHash: `0x${string}`
  ready: boolean
  reason: string
}

type EvaluateIntent = (params: { to: Address; value: bigint; data?: `0x${string}` }) => Promise<{
  decision: 'allow' | 'delay' | 'revert' | 'unknown'
  delaySeconds: bigint | null
  reasons: string[]
}>

export function useVaultQueue(walletAddress: Address | null, evaluateIntent: EvaluateIntent | null) {
  const publicClient = usePublicClient()
  const [items, setItems] = useState<QueueItemView[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshNonce, setRefreshNonce] = useState(0)

  const refresh = useCallback(() => {
    setRefreshNonce((value) => value + 1)
  }, [])

  useEffect(() => {
    if (!walletAddress || !publicClient) {
      setItems([])
      setIsLoading(false)
      setError(null)
      return
    }

    const client = publicClient
    const vaultAddress = walletAddress

    let cancelled = false

    async function run() {
      setIsLoading(true)
      setError(null)

      try {
        const txIds = await readQueueTxIds({
          publicClient: client,
          walletAddress: vaultAddress,
        })

        const scheduledRows = await Promise.all(
          txIds.map(async (txId) => {
            const scheduledRaw = await client.readContract({
              ...getFirewallModuleConfig(vaultAddress),
              functionName: 'getScheduled',
              args: [txId],
            })

            if (!Array.isArray(scheduledRaw) || scheduledRaw.length < 6) {
              return null
            }

            const scheduledTuple = scheduledRaw as readonly unknown[]
            if (scheduledTuple.length < 6) {
              return null
            }

            const existsRaw = scheduledTuple[0]
            const executedRaw = scheduledTuple[1]
            const toRaw = scheduledTuple[2]
            const valueRaw = scheduledTuple[3]
            const unlockRaw = scheduledTuple[4]
            const dataHashRaw = scheduledTuple[5]

            if (typeof toRaw !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(toRaw)) {
              return null
            }

            if (typeof valueRaw !== 'bigint' || typeof unlockRaw !== 'bigint') {
              return null
            }

            if (typeof dataHashRaw !== 'string' || !/^0x[a-fA-F0-9]{64}$/.test(dataHashRaw)) {
              return null
            }

            const nowSec = BigInt(Math.floor(Date.now() / 1000))
            const exists = Boolean(existsRaw)
            const executed = Boolean(executedRaw)

            let reason = 'Delayed by active protection rules.'
            if (evaluateIntent && exists && !executed) {
              try {
                const evaluation = await evaluateIntent({
                  to: toRaw as Address,
                  value: valueRaw,
                  data: '0x',
                })

                if (evaluation.reasons.length > 0) {
                  reason = evaluation.reasons.join(' ')
                }
              } catch {
                reason = 'Delayed by active protection rules.'
              }
            }

            return {
              txId,
              to: toRaw as Address,
              value: valueRaw,
              unlockTime: unlockRaw,
              exists,
              executed,
              dataHash: dataHashRaw as `0x${string}`,
              ready: exists && !executed && unlockRaw <= nowSec,
              reason,
            } satisfies QueueItemView
          }),
        )

        const nextItems = scheduledRows
          .filter((item): item is QueueItemView => Boolean(item))
          .filter((item) => item.exists && !item.executed)
          .sort((left, right) => {
            if (left.unlockTime === right.unlockTime) return 0
            return left.unlockTime < right.unlockTime ? -1 : 1
          })

        if (!cancelled) {
          setItems(nextItems)
        }
      } catch (queueError) {
        if (!cancelled) {
          setItems([])
          setError(queueError instanceof Error ? queueError.message : 'Could not load Vault queue from chain.')
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [evaluateIntent, publicClient, refreshNonce, walletAddress])

  const summary = useMemo(() => {
    const pendingCount = items.length
    const nextUnlock = items.length > 0 ? items[0].unlockTime : null

    return {
      pendingCount,
      nextUnlock,
    }
  }, [items])

  return {
    items,
    summary,
    isLoading,
    error,
    refresh,
  }
}
