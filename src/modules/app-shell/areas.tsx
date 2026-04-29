import type { Address } from 'viem'
import { CopyButton } from '../../components/CopyButton'
import {
  BASE_CHAIN_ID,
  FACTORY_ADDRESS,
  POLICY_PACK_REGISTRY_ADDRESS,
  SIMPLE_ENTITLEMENT_MANAGER_ADDRESS,
} from '../../contracts/addresses/base'
import { addressUrl, shortAddress } from '../../lib/explorer/base'
import { Button } from '../../ui/Button'
import { InfoTooltip } from '../../ui/InfoTooltip'
import {
  BASE_NETWORK_NAME,
  CONTRACTS_REPO_URL,
  DOCS_URL,
  POLICY_CATALOG_URL,
  UI_REPO_URL,
  VERIFY_URL,
} from './helpers'
import type { ProtectionRuleView } from './types'

function activeRuleSourceLabel(contextLabel: ProtectionRuleView['contextLabel']): string {
  if (contextLabel === 'Included in Base Protection') {
    return 'Source: Base line (always active)'
  }

  return 'Source: Enabled add-on'
}

export function TrustArea() {
  return (
    <section className="card">
      <header className="card-header">
        <h2>Trust & Verification</h2>
      </header>
      <div className="card-body compact-stack">
        <p className="muted">
          Firewall Vault is non-custodial. Protection rules run directly on Base contracts.
        </p>
        <div className="trust-links">
          <a href={DOCS_URL} target="_blank" rel="noreferrer">
            Documentation
          </a>
          <a href={UI_REPO_URL} target="_blank" rel="noreferrer">
            UI GitHub
          </a>
          <a href={CONTRACTS_REPO_URL} target="_blank" rel="noreferrer">
            Contracts GitHub
          </a>
          <a href={VERIFY_URL} target="_blank" rel="noreferrer">
            How to verify deployments
          </a>
        </div>
        <details className="advanced-block">
          <summary>Verified contract addresses</summary>
          <div className="compact-stack">
            <p>
              Factory:{' '}
              <a href={addressUrl(FACTORY_ADDRESS)} target="_blank" rel="noreferrer">
                {shortAddress(FACTORY_ADDRESS)}
              </a>
            </p>
            <p>
              Registry:{' '}
              <a href={addressUrl(POLICY_PACK_REGISTRY_ADDRESS)} target="_blank" rel="noreferrer">
                {shortAddress(POLICY_PACK_REGISTRY_ADDRESS)}
              </a>
            </p>
            <p>
              Entitlement:{' '}
              <a href={addressUrl(SIMPLE_ENTITLEMENT_MANAGER_ADDRESS)} target="_blank" rel="noreferrer">
                {shortAddress(SIMPLE_ENTITLEMENT_MANAGER_ADDRESS)}
              </a>
            </p>
          </div>
        </details>
        <p className="muted">
          Verify by comparing open-source code with verified deployments on Base.
        </p>
      </div>
    </section>
  )
}

export function NewsArea() {
  return (
    <section className="card">
      <header className="card-header">
        <h2>Getting Started</h2>
      </header>
      <div className="card-body compact-stack">
        <ul className="compact-list muted">
          <li>Connect a wallet you already control.</li>
          <li>Create a new Vault or import one you already use.</li>
          <li>Choose a protection mode based on how often you move funds.</li>
          <li>Fund the Vault, then use it for sends and receives on Base.</li>
        </ul>
        <p>
          <a href={DOCS_URL}>Open setup guide &rarr;</a>
        </p>
      </div>
    </section>
  )
}

type GetStartedAreaProps = {
  isConnected: boolean
  isBaseReady: boolean
  hasSelectedVault: boolean
  onConnect: () => void
  connectDisabled: boolean
  connectPending: boolean
  connectError: string | null
  onSwitchToBase: (() => void) | null
  switchPending: boolean
}

export function GetStartedArea({
  isConnected,
  isBaseReady,
  hasSelectedVault,
  onConnect,
  connectDisabled,
  connectPending,
  connectError,
  onSwitchToBase,
  switchPending,
}: GetStartedAreaProps) {
  return (
    <section className="card card-primary">
      <header className="card-header">
        <h2>Get Started</h2>
      </header>
      <div className="card-body compact-stack">
        {!isConnected ? (
          <>
            <p>Connect your wallet to create a Vault or import one you already use.</p>
            <p className="muted">Your wallet is used for access and signatures. Your assets stay in the Vault.</p>
            <div className="row">
              <Button type="button" variant="primary" disabled={connectDisabled} onClick={onConnect}>
                {connectPending ? 'Connecting...' : 'Connect wallet'}
              </Button>
            </div>
            {connectError ? <p className="status-warning">{connectError}</p> : null}
          </>
        ) : (
          <>
            <p>{hasSelectedVault ? 'Vault connected. You can now receive, send, and review delayed actions below.' : 'Wallet connected. Next step: create a new Vault or import an existing one.'}</p>
            {!isBaseReady ? <p className="status-warning">Switch to Base Mainnet to continue.</p> : null}
            {!isBaseReady && onSwitchToBase ? (
              <div className="row">
                <Button type="button" variant="primary" disabled={switchPending} onClick={onSwitchToBase}>
                  {switchPending ? 'Switching...' : 'Switch to Base'}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  )
}

type VaultOverviewProps = {
  walletAddress: Address
  chainId: number | undefined
  vaultBalanceEth: string | null
  isBalanceLoading: boolean
  lineTitle: string
  rules: ProtectionRuleView[]
  isProtectionLoading: boolean
  protectionError: string | null
  onManageProtection: () => void
  onDisconnectVault: () => void
}

export function VaultOverview({
  walletAddress,
  chainId,
  vaultBalanceEth,
  isBalanceLoading,
  lineTitle,
  rules,
  isProtectionLoading,
  protectionError,
  onManageProtection,
  onDisconnectVault,
}: VaultOverviewProps) {
  const visibleRules = rules.slice(0, 3)
  const hiddenRulesCount = rules.length > visibleRules.length ? rules.length - visibleRules.length : 0

  return (
    <section className="card card-vault">
      <header className="card-header row-between">
        <h2>Protected Vault</h2>
        <div className="row">
          <Button type="button" onClick={onDisconnectVault}>
            Disconnect Vault
          </Button>
          <Button type="button" variant="primary" onClick={onManageProtection}>
            Manage Protection
          </Button>
        </div>
      </header>
      <div className="card-body vault-summary-grid">
        <div className="compact-stack">
          <p>
            Vault:{' '}
            <a href={addressUrl(walletAddress)} target="_blank" rel="noreferrer">
              {shortAddress(walletAddress)}
            </a>{' '}
            <CopyButton value={walletAddress} />
          </p>
          <p>
            <strong>Protection mode:</strong> {lineTitle}
          </p>
          <p>Balance: {vaultBalanceEth ?? (isBalanceLoading ? 'Loading...' : 'N/A')} ETH</p>
          <p className="muted">Network: {chainId === BASE_CHAIN_ID ? BASE_NETWORK_NAME : `Chain ${chainId ?? 'N/A'}`}</p>
        </div>

        <div className="compact-stack">
          <p>
            <strong>Active protections ({rules.length})</strong>
          </p>
          <p className="muted">These rules decide whether a Vault action is allowed immediately, delayed, or blocked.</p>
          <div className="vault-protection-panel">
            {visibleRules.length > 0 ? (
              <ul className="vault-protection-list">
                {visibleRules.map((rule) => (
                  <li key={`vault-${rule.key}`} className="vault-protection-item">
                    <div className="vault-protection-main">
                      <span className="vault-protection-name">{rule.label}</span>
                      <span className="vault-protection-source-text">
                        {activeRuleSourceLabel(rule.contextLabel)}
                      </span>
                    </div>
                    <InfoTooltip label={`${rule.label} details`}>
                      <div className="tooltip-stack">
                        {rule.tooltipLines.map((line) => (
                          <p key={`vault-${rule.key}-${line}`}>{line}</p>
                        ))}
                        <a className="tooltip-link" href={POLICY_CATALOG_URL} target="_blank" rel="noreferrer">
                          Full policy details and metadata
                        </a>
                      </div>
                    </InfoTooltip>
                  </li>
                ))}
              </ul>
            ) : isProtectionLoading ? (
              <p className="muted">Loading active protections...</p>
            ) : (
              <p className="muted">No active rules.</p>
            )}

            {hiddenRulesCount > 0 ? (
              <div className="vault-protection-more">
                <span className="muted">+{hiddenRulesCount} more protections.</span>
                <Button type="button" variant="ghost" onClick={onManageProtection}>
                  Open full list
                </Button>
              </div>
            ) : null}
          </div>
          {isProtectionLoading && visibleRules.length > 0 ? <p className="muted">Refreshing protection state...</p> : null}
          {protectionError ? <p className="status-warning">{protectionError}</p> : null}
        </div>
      </div>
    </section>
  )
}
