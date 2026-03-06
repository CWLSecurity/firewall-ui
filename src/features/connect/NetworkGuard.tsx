import { useAccount, useChainId, useSwitchChain } from 'wagmi'
import { BASE_CHAIN_ID } from '../../lib/chains/base'

type ConnectionState = 'disconnected' | 'connected_wrong_network' | 'connected_base_ready'

export function NetworkGuard() {
  const { isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChain, isPending } = useSwitchChain()

  const state: ConnectionState = !isConnected
    ? 'disconnected'
    : chainId === BASE_CHAIN_ID
      ? 'connected_base_ready'
      : 'connected_wrong_network'

  if (state !== 'connected_wrong_network') {
    return (
      <section>
        <p>Network state: {state}</p>
      </section>
    )
  }

  return (
    <section>
      <h2>Wrong network</h2>
      <p>Network state: {state}</p>
      <p>Connected chain: {chainId}</p>
      <p>Required chain: Base (8453)</p>
      {switchChain ? (
        <button
          type="button"
          disabled={isPending}
          onClick={() => switchChain({ chainId: BASE_CHAIN_ID })}
        >
          {isPending ? 'Switching...' : 'Switch to Base'}
        </button>
      ) : (
        <p>Please switch your wallet network to Base (chainId 8453).</p>
      )}
    </section>
  )
}
