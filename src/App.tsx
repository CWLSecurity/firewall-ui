import './App.css'
import { useMemo, useState } from 'react'
import { useAccount, useChainId } from 'wagmi'
import { ConnectPanel } from './features/connect/ConnectPanel'
import { CreateWalletPanel } from './features/createWallet/CreateWalletPanel'
import { DashboardPanel } from './features/dashboard/DashboardPanel'
import { DiagnosticsPanel } from './features/diagnostics/DiagnosticsPanel'
import { ImportWalletPanel } from './features/importWallet/ImportWalletPanel'
import { NetworkGuard } from './features/connect/NetworkGuard'
import { DelayedQueuePanel } from './features/queue/DelayedQueuePanel'
import { SendEthPanel } from './features/send/SendEthPanel'
import { BASE_CHAIN_ID } from './lib/chains/base'
import { loadPersistedWallet } from './state/persist'

function App() {
  const { isConnected } = useAccount()
  const chainId = useChainId()
  const [persistVersion, setPersistVersion] = useState(0)
  const isBaseReady = isConnected && chainId === BASE_CHAIN_ID
  const hasFirewallWallet = useMemo(
    () => Boolean(loadPersistedWallet().walletAddress),
    [persistVersion],
  )

  return (
    <main>
      <h1>Firewall UI</h1>
      <DiagnosticsPanel />
      <NetworkGuard />
      <ConnectPanel />
      <CreateWalletPanel onWalletStateChange={() => setPersistVersion((v) => v + 1)} />
      {isBaseReady ? (
        <ImportWalletPanel onWalletStateChange={() => setPersistVersion((v) => v + 1)} />
      ) : null}
      {isBaseReady && hasFirewallWallet ? <DashboardPanel /> : null}
      {isBaseReady && hasFirewallWallet ? <SendEthPanel /> : null}
      {isBaseReady && hasFirewallWallet ? <DelayedQueuePanel /> : null}
      <p>MVP Complete</p>
    </main>
  )
}

export default App
