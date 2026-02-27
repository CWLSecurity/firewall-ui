import type { ReactNode } from 'react'
import { useAccount, useChainId, useSwitchChain } from 'wagmi'
import { BASE_CHAIN_ID } from '../../lib/chains/base'

type NetworkGuardProps = {
  children: ReactNode
}

export function NetworkGuard({ children }: NetworkGuardProps) {
  const { isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()

  if (isConnected && chainId !== BASE_CHAIN_ID) {
    return (
      <section>
        <h2>Wrong network</h2>
        {switchChain ? (
          <button
            type="button"
            onClick={() => switchChain({ chainId: BASE_CHAIN_ID })}
          >
            Switch to Base
          </button>
        ) : (
          <p>Please switch your wallet network to Base (chainId 8453).</p>
        )}
      </section>
    )
  }

  return <>{children}</>
}
