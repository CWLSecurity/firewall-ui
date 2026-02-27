import { useState } from 'react'
import { usePublicClient } from 'wagmi'
import type { Address } from 'viem'
import { firewallModuleAbi } from '../../lib/contracts/firewallModule'
import { probeFirewallModule } from '../../lib/contracts/probeFirewallModule'
import { isHexAddress } from '../../lib/validation/address'
import {
  clearPersistedWallet,
  loadPersistedWallet,
  persistWallet,
} from '../../state/persist'

type ImportWalletPanelProps = {
  onWalletStateChange?: () => void
}

export function ImportWalletPanel({ onWalletStateChange }: ImportWalletPanelProps) {
  const publicClient = usePublicClient()
  const [walletInput, setWalletInput] = useState('')
  const [status, setStatus] = useState<'idle' | 'checking' | 'imported' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [persisted, setPersisted] = useState(() => loadPersistedWallet())

  const handleImport = async () => {
    setError(null)
    setWarning(null)
    if (!isHexAddress(walletInput)) {
      setStatus('error')
      setError('Invalid address format.')
      return
    }

    if (!publicClient) {
      setStatus('error')
      setError('Public client unavailable.')
      return
    }

    setStatus('checking')
    const probe = await probeFirewallModule({
      publicClient: publicClient as unknown as {
        readContract?: Function
        getBytecode?: Function
        getCode?: Function
      },
      walletAddress: walletInput as Address,
      abi: firewallModuleAbi,
    })

    if (!probe.ok) {
      setStatus('error')
      setError(probe.reason ?? 'Wallet probe failed.')
      return
    }

    if (probe.reason) {
      setWarning(probe.reason)
    } else if (probe.note) {
      setWarning(probe.note)
    }

    persistWallet({ walletAddress: walletInput as Address, preset: null })
    setPersisted(loadPersistedWallet())
    setStatus('imported')
    onWalletStateChange?.()
  }

  return (
    <section>
      <h2>Import Firewall Wallet</h2>

      {persisted.walletAddress ? (
        <div>
          <p>Persisted wallet: {persisted.walletAddress}</p>
          <button
            type="button"
            onClick={() => {
              clearPersistedWallet()
              setPersisted(loadPersistedWallet())
              setStatus('idle')
              setError(null)
              setWarning(null)
              onWalletStateChange?.()
            }}
          >
            Clear
          </button>
          <p>Clear existing wallet to import another.</p>
        </div>
      ) : (
        <div>
          <label>
            Existing firewall wallet address
            <input
              type="text"
              value={walletInput}
              onChange={(event) => setWalletInput(event.target.value.trim())}
              placeholder="0x..."
            />
          </label>
          <button type="button" onClick={() => void handleImport()}>
            Import
          </button>
        </div>
      )}

      <p>Status: {status}</p>
      {error ? <p>{error}</p> : null}
      {warning ? <p>{warning}</p> : null}
    </section>
  )
}
