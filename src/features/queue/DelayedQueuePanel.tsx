import { useEffect, useMemo, useState } from 'react'
import type { Address } from 'viem'
import { useAccount, useReadContract, useWaitForTransactionReceipt, useWriteContract } from 'wagmi'
import { CopyButton } from '../../components/CopyButton'
import { shortHash, txUrl } from '../../lib/explorer/base'
import { getFirewallModuleConfig } from '../../lib/contracts/firewallModule'
import { formatEth, type ScheduledTx } from '../../lib/contracts/scheduled'
import { loadPersistedWallet } from '../../state/persist'
import { useScheduledTxIds } from './useScheduledTxIds'

type DelayedQueueItemProps = {
  walletAddress: Address
  txId: `0x${string}`
  onActionSuccess: () => void
  refreshNonce: number
  isConnected: boolean
}

function DelayedQueueItem({
  walletAddress,
  txId,
  onActionSuccess,
  refreshNonce,
  isConnected,
}: DelayedQueueItemProps) {
  const [itemError, setItemError] = useState<string | null>(null)
  const { data, isLoading, error, refetch } = useReadContract({
    ...getFirewallModuleConfig(walletAddress),
    functionName: 'getScheduled',
    args: [txId],
  })
  const {
    writeContract,
    data: actionHash,
    isPending: isActionPending,
    error: actionError,
  } = useWriteContract()
  const { isSuccess: isActionSuccess } = useWaitForTransactionReceipt({ hash: actionHash })

  useEffect(() => {
    void refetch()
  }, [refetch, refreshNonce])

  useEffect(() => {
    if (isActionSuccess) {
      onActionSuccess()
      void refetch()
    }
  }, [isActionSuccess, onActionSuccess, refetch])

  const scheduled = useMemo(() => {
    if (!data) {
      return null
    }

    const [exists, executed, to, value, unlockTime, dataHash] = data as readonly [
      boolean,
      boolean,
      Address,
      bigint,
      bigint,
      `0x${string}`,
    ]

    const item: ScheduledTx = {
      txId,
      exists,
      executed,
      to,
      value,
      unlockTime,
      dataHash,
    }
    return item
  }, [data, txId])

  if (isLoading) {
    return <li>Loading {shortHash(txId)}...</li>
  }

  if (error || !scheduled) {
    return <li>{shortHash(txId)} - {error?.message ?? 'Failed to read scheduled tx'}</li>
  }

  const nowSec = BigInt(Math.floor(Date.now() / 1000))
  const ready = scheduled.exists && !scheduled.executed && scheduled.unlockTime <= nowSec
  const unlockTimeMs = Number(scheduled.unlockTime) * 1000
  const unlockTimeLabel = Number.isFinite(unlockTimeMs)
    ? new Date(unlockTimeMs).toLocaleString()
    : scheduled.unlockTime.toString()

  return (
    <li>
      <p>
        txId: {shortHash(txId)} <CopyButton value={txId} />
      </p>
      <p>
        to: {scheduled.to} <CopyButton value={scheduled.to} />
      </p>
      <p>value: {formatEth(scheduled.value)} ETH</p>
      <p>exists: {String(scheduled.exists)}</p>
      <p>executed: {String(scheduled.executed)}</p>
      <p>Ready: {ready ? 'Yes' : 'No'}</p>
      <p>unlockTime: {unlockTimeLabel}</p>
      <button
        type="button"
        title={isConnected ? undefined : 'Connect wallet to execute/cancel'}
        disabled={!isConnected || isActionPending || !ready || scheduled.executed || !scheduled.exists}
        onClick={() => {
          setItemError(null)
          writeContract({
            ...getFirewallModuleConfig(walletAddress),
            functionName: 'executeScheduled',
            args: [txId],
          })
        }}
      >
        Execute
      </button>
      <button
        type="button"
        title={isConnected ? undefined : 'Connect wallet to execute/cancel'}
        disabled={!isConnected || isActionPending || scheduled.executed || !scheduled.exists}
        onClick={() => {
          setItemError(null)
          writeContract({
            ...getFirewallModuleConfig(walletAddress),
            functionName: 'cancelScheduled',
            args: [txId],
          })
        }}
      >
        Cancel
      </button>
      {actionHash ? (
        <p>
          action tx:{' '}
          <a href={txUrl(actionHash)} target="_blank" rel="noreferrer">
            {shortHash(actionHash)}
          </a>{' '}
          <CopyButton value={actionHash} />
        </p>
      ) : null}
      {itemError ? <p>{itemError}</p> : null}
      {actionError ? <p>{actionError.message}</p> : null}
    </li>
  )
}

export function DelayedQueuePanel() {
  const { isConnected } = useAccount()
  const { walletAddress } = loadPersistedWallet()
  const { txIds, isLoading, error, refresh } = useScheduledTxIds(walletAddress)
  const [refreshNonce, setRefreshNonce] = useState(0)

  if (!walletAddress) {
    return null
  }

  const handleRefresh = () => {
    refresh()
    setRefreshNonce((value) => value + 1)
  }

  return (
    <section>
      <h2>Delayed Queue</h2>
      <button type="button" onClick={handleRefresh}>
        Refresh
      </button>
      {!isConnected ? <p>Connect wallet to execute/cancel.</p> : null}

      {isLoading ? <p>Loading queue...</p> : null}
      {error ? <p>{error}</p> : null}
      {!isLoading && !error && txIds.length === 0 ? <p>No delayed transactions found</p> : null}

      {txIds.length > 0 ? (
        <ul>
          {txIds.map((txId) => (
            <DelayedQueueItem
              key={txId}
              walletAddress={walletAddress}
              txId={txId}
              onActionSuccess={handleRefresh}
              refreshNonce={refreshNonce}
              isConnected={isConnected}
            />
          ))}
        </ul>
      ) : null}
    </section>
  )
}
