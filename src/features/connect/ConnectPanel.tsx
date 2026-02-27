import { useAccount, useChainId, useConnect, useDisconnect } from 'wagmi'

function formatAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

export function ConnectPanel() {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const { connect, connectors, isPending } = useConnect()
  const { disconnect } = useDisconnect()

  const injectedConnector =
    connectors.find((connector) => connector.id === 'injected') ?? connectors[0]

  if (!isConnected) {
    return (
      <section>
        <button
          type="button"
          disabled={!injectedConnector || isPending}
          onClick={() => {
            if (injectedConnector) {
              connect({ connector: injectedConnector })
            }
          }}
        >
          {isPending ? 'Connecting...' : 'Connect Wallet'}
        </button>
      </section>
    )
  }

  return (
    <section>
      <p>Address: {address ? formatAddress(address) : 'N/A'}</p>
      <p>Chain ID: {chainId}</p>
      <button type="button" onClick={() => disconnect()}>
        Disconnect
      </button>
    </section>
  )
}
