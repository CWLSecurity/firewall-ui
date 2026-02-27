import { useAccount } from 'wagmi'
import { CopyButton } from '../../components/CopyButton'
import { ROUTER_ADDRESS } from '../../lib/addresses/base'
import { useEthBalance } from '../balance/useEthBalance'
import { addressUrl, shortAddress } from '../../lib/explorer/base'
import { loadPersistedWallet } from '../../state/persist'

export function DashboardPanel() {
  const { address, isConnected } = useAccount()
  const { walletAddress, preset } = loadPersistedWallet()
  const eoaBalance = useEthBalance(address ?? null)
  const walletBalance = useEthBalance(walletAddress)

  if (!walletAddress) {
    return (
      <section>
        <h2>Dashboard</h2>
        <p>No Firewall wallet yet.</p>
      </section>
    )
  }

  return (
    <section>
      <h2>Dashboard</h2>
      {!isConnected ? <p>Read-only mode: connect wallet to transact.</p> : null}
      <p>
        Connected EOA:{' '}
        {address ? (
          <>
            <a href={addressUrl(address)} target="_blank" rel="noreferrer">
              {shortAddress(address)}
            </a>{' '}
            <CopyButton value={address} />
          </>
        ) : (
          'N/A'
        )}
      </p>
      <p>EOA balance: {eoaBalance.balanceEth ?? (eoaBalance.isLoading ? 'Loading...' : 'N/A')} ETH</p>
      <p>
        Firewall wallet:{' '}
        <a href={addressUrl(walletAddress)} target="_blank" rel="noreferrer">
          {shortAddress(walletAddress)}
        </a>{' '}
        <CopyButton value={walletAddress} />
      </p>
      <p>
        Firewall balance: {walletBalance.balanceEth ?? (walletBalance.isLoading ? 'Loading...' : 'N/A')} ETH
      </p>
      <p>Preset: {preset === null ? 'Unknown (imported)' : preset}</p>
      <p>
        Router:{' '}
        <a href={addressUrl(ROUTER_ADDRESS)} target="_blank" rel="noreferrer">
          {shortAddress(ROUTER_ADDRESS)}
        </a>{' '}
        <CopyButton value={ROUTER_ADDRESS} />
      </p>
      {eoaBalance.error ? <p>{eoaBalance.error}</p> : null}
      {walletBalance.error ? <p>{walletBalance.error}</p> : null}
    </section>
  )
}
