import './App.css'
import { useMemo, useState } from 'react'
import { useAccount } from 'wagmi'
import { ConnectPanel } from './features/connect/ConnectPanel'
import { CreateWalletPanel } from './features/createWallet/CreateWalletPanel'
import { DashboardPanel } from './features/dashboard/DashboardPanel'
import { DiagnosticsPanel } from './features/diagnostics/DiagnosticsPanel'
import { ImportWalletPanel } from './features/importWallet/ImportWalletPanel'
import { NetworkGuard } from './features/connect/NetworkGuard'
import { DelayedQueuePanel } from './features/queue/DelayedQueuePanel'
import { SendEthPanel } from './features/send/SendEthPanel'
import { loadPersistedWallet } from './state/persist'

function App() {
  const { isConnected } = useAccount()
  const [persistVersion, setPersistVersion] = useState(0)
  const hasFirewallWallet = useMemo(
    () => Boolean(loadPersistedWallet().walletAddress),
    [persistVersion],
  )

  return (
    <NetworkGuard>
      <main>
        <h1>Firewall UI</h1>
        <DiagnosticsPanel />
        <ConnectPanel />
        {isConnected ? (
          <CreateWalletPanel onWalletStateChange={() => setPersistVersion((v) => v + 1)} />
        ) : null}
        {isConnected ? (
          <ImportWalletPanel onWalletStateChange={() => setPersistVersion((v) => v + 1)} />
        ) : null}
        {hasFirewallWallet ? <DashboardPanel /> : null}
        {isConnected && hasFirewallWallet ? <SendEthPanel /> : null}
        {hasFirewallWallet ? <DelayedQueuePanel /> : null}
        <p>MVP Complete</p>
      </main>
    </NetworkGuard>
  )
}

export default App
