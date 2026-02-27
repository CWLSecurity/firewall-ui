import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Address } from 'viem'
import { usePublicClient } from 'wagmi'
import { firewallModuleAbi } from '../../lib/contracts/firewallModule'

const LOOKBACK_BLOCKS = 200_000n

type AbiEvent = {
  type: 'event'
  name: string
  inputs?: Array<{ name?: string; type?: string }>
}

function extractTxId(args: unknown): `0x${string}` | null {
  if (!args || typeof args !== 'object') {
    return null
  }

  for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
    if (
      key.toLowerCase().includes('txid') &&
      typeof value === 'string' &&
      /^0x[a-fA-F0-9]{64}$/.test(value)
    ) {
      return value as `0x${string}`
    }
  }

  for (const value of Object.values(args as Record<string, unknown>)) {
    if (typeof value === 'string' && /^0x[a-fA-F0-9]{64}$/.test(value)) {
      return value as `0x${string}`
    }
  }

  return null
}

function getScheduledEvents() {
  const allEvents = (firewallModuleAbi as readonly unknown[]).filter(
    (item): item is AbiEvent =>
      typeof item === 'object' &&
      item !== null &&
      'type' in item &&
      item.type === 'event' &&
      'name' in item &&
      typeof item.name === 'string',
  )

  const eventNames = allEvents.map((event) => event.name)
  const targetNames = new Set(['Scheduled', 'TransactionScheduled'])
  const events = allEvents.filter((event) => targetNames.has(event.name))

  return { events, eventNames }
}

export function useScheduledTxIds(firewallWalletAddress: Address | null) {
  const publicClient = usePublicClient()
  const [txIds, setTxIds] = useState<`0x${string}`[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshNonce, setRefreshNonce] = useState(0)

  const { events, eventNames } = useMemo(() => getScheduledEvents(), [])

  const refresh = useCallback(() => {
    setRefreshNonce((value) => value + 1)
  }, [])

  useEffect(() => {
    if (!firewallWalletAddress || !publicClient) {
      setTxIds([])
      return
    }

    if (events.length === 0) {
      setError(
        `No suitable scheduled event found. ABI events: ${eventNames.join(', ')}`,
      )
      setTxIds([])
      return
    }

    let cancelled = false
    const client = publicClient
    const moduleAddress = firewallWalletAddress

    async function run() {
      setIsLoading(true)
      setError(null)
      try {
        const latest = await client.getBlockNumber()
        const fromBlock = latest > LOOKBACK_BLOCKS ? latest - LOOKBACK_BLOCKS : 0n

        const allLogs = (await Promise.all(
          events.map((event) =>
            client.getLogs({
              address: moduleAddress,
              event: event as never,
              fromBlock,
              toBlock: 'latest',
            }) as Promise<Array<{ args?: unknown; blockNumber?: bigint | null }>>,
          ),
        )) as Array<Array<{ args?: unknown; blockNumber?: bigint | null }>>

        const txIdToBlock = new Map<`0x${string}`, bigint>()
        for (const logs of allLogs) {
          for (const log of logs) {
            const txId = extractTxId(log.args)
            if (!txId) {
              continue
            }
            const blockNumber = log.blockNumber ?? 0n
            const existing = txIdToBlock.get(txId) ?? 0n
            if (blockNumber > existing) {
              txIdToBlock.set(txId, blockNumber)
            }
          }
        }

        const sorted = Array.from(txIdToBlock.entries())
          .sort((a, b) => (a[1] === b[1] ? 0 : a[1] > b[1] ? -1 : 1))
          .map(([txId]) => txId)

        if (!cancelled) {
          setTxIds(sorted)
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : 'Failed to load scheduled tx ids')
          setTxIds([])
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
  }, [eventNames, events, firewallWalletAddress, publicClient, refreshNonce])

  return { txIds, isLoading, error, refresh, scheduledEventNames: events.map((event) => event.name) }
}
