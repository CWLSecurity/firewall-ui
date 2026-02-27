import { useEffect, useState } from 'react'
import { useAccount, useChainId, usePublicClient } from 'wagmi'
import { loadPersistedWallet } from '../../state/persist'

function shortError(message: string) {
  return message.length > 120 ? `${message.slice(0, 120)}...` : message
}

export function DiagnosticsPanel() {
  const { isConnected, address } = useAccount()
  const chainId = useChainId()
  const publicClient = usePublicClient()
  const { walletAddress, preset } = loadPersistedWallet()
  const [latestBlock, setLatestBlock] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshNonce, setRefreshNonce] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function run() {
      if (!publicClient) {
        setLatestBlock(null)
        setError('Public client unavailable')
        return
      }
      try {
        const block = await publicClient.getBlockNumber()
        if (!cancelled) {
          setLatestBlock(block.toString())
          setError(null)
        }
      } catch (fetchError) {
        if (!cancelled) {
          setLatestBlock(null)
          setError(fetchError instanceof Error ? shortError(fetchError.message) : 'RPC error')
        }
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [publicClient, refreshNonce])

  return (
    <section>
      <h2>Diagnostics</h2>
      <p>isConnected: {String(isConnected)}</p>
      <p>EOA address: {address ?? 'N/A'}</p>
      <p>chainId: {chainId}</p>
      <p>latest block: {latestBlock ?? 'N/A'}</p>
      <p>persisted firewall wallet: {walletAddress ?? 'N/A'}</p>
      <p>persisted preset: {preset === null ? 'Unknown' : preset}</p>
      <p>RPC status: {error ? `Error (${error})` : latestBlock ? 'OK' : 'Error'}</p>
      <button type="button" onClick={() => setRefreshNonce((x) => x + 1)}>
        Refresh
      </button>
    </section>
  )
}
