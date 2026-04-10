import type { ActivePolicy } from '../vault/useVaultRuntime'
import type { CreateLineId, ImportValidationState, ProtectionRuleView } from './types'

export const DOCS_URL = 'https://github.com/CWLSecurity/firewall-ui#readme'
export const UI_REPO_URL = 'https://github.com/CWLSecurity/firewall-ui'
export const CONTRACTS_REPO_URL = 'https://github.com/CWLSecurity/firewall-wallet'
export const VERIFY_URL = 'https://github.com/CWLSecurity/firewall-wallet/blob/main/VERIFY_DEPLOYMENT.md'
export const NEWS_PAGE_URL = '/news.html'
export const POLICY_CATALOG_URL = '/policy-catalog.html'
export const BASE_NETWORK_NAME = 'Base Mainnet'

export function numberArrayEquals(a: number[], b: number[]): boolean {
  if (a.length !== b.length) {
    return false
  }

  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) {
      return false
    }
  }

  return true
}

export function formatCompactEth(value: string | null, maxFractionDigits = 5): string | null {
  if (value === null) {
    return null
  }

  const normalized = value.trim()
  if (normalized.length === 0) {
    return null
  }

  const parsed = Number(normalized)
  if (!Number.isFinite(parsed)) {
    return normalized
  }

  return parsed.toLocaleString('en-US', {
    useGrouping: false,
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFractionDigits,
  })
}

export function policySemanticKey(policy: ActivePolicy): string {
  if (!policy.details.policyKey || policy.details.policyConfig.length === 0) {
    return policy.policyAddress.toLowerCase()
  }

  const configSignature = policy.details.policyConfig
    .map((entry) => `${entry.key}:${entry.rawValue}`)
    .sort()
    .join('|')

  return `${policy.details.policyKey}|${configSignature}`
}

export function ruleContextLabel(source: ActivePolicy['source']): ProtectionRuleView['contextLabel'] {
  return source === 'line' ? 'Included in Base Protection' : 'Enabled as Add-on'
}

function compactCreateProtectionTooltip(
  lineId: CreateLineId,
  key:
    | 'approval-safety'
    | 'defi-approval'
    | 'approval-to-new-spender-delay'
    | 'erc20-first-new-recipient-delay'
    | 'large-transfer-delay'
    | 'new-receiver-delay',
): string[] {
  if (key === 'approval-safety') {
    return [
      'Policy behavior: blocks unlimited approvals.',
      'Permit approvals are blocked in this line.',
    ]
  }

  if (key === 'defi-approval') {
    return [
      'Policy behavior: allows practical DeFi approvals with guardrails.',
      'Permit-based approvals can be allowed in this line.',
    ]
  }

  if (key === 'approval-to-new-spender-delay') {
    return [
      'First non-zero approval to a new contract spender is delayed.',
      'Approvals to wallet-address spenders are blocked.',
    ]
  }

  if (key === 'erc20-first-new-recipient-delay') {
    return [
      'First ERC-20 transfer to a new recipient is delayed.',
      'Applies to transfer and transferFrom paths.',
    ]
  }

  if (key === 'large-transfer-delay') {
    const threshold = lineId === 'vault-safe' ? '0.05 ETH' : '0.25 ETH'
    const delay = lineId === 'vault-safe' ? '1 hour' : '30 minutes'
    return [`Threshold: ${threshold}`, `Delay: ${delay}`, 'Behavior: transfer is queued until unlock time.']
  }

  return [
    `Scope: ${lineId === 'vault-safe' ? 'new receivers' : 'new EOA receivers'}`,
    `Delay: ${lineId === 'vault-safe' ? '1 hour' : '30 minutes'}`,
  ]
}

export function createLineAudience(lineId: CreateLineId): string {
  if (lineId === 'vault-safe') {
    return 'for regular users / simple transfers'
  }

  return 'for active DeFi users'
}

export function createLineBehaviorNotes(lineId: CreateLineId): {
  summary: string
  bullets: string[]
} {
  if (lineId === 'vault-safe') {
    return {
      summary: 'Vault Safe is designed for daily transfers with stronger safeguards.',
      bullets: [
        'Risky approvals are restricted by default.',
        'Large or first-time transfers are delayed for review.',
      ],
    }
  }

  return {
    summary: 'DeFi Trader is tuned for active protocol usage with guardrails.',
    bullets: [
      'DeFi approvals are more flexible for common flows.',
      'High-risk actions can still be delayed before execution.',
    ],
  }
}

export function createIncludedProtectionRows(
  lineId: CreateLineId,
): Array<{ key: string; label: string; tooltipLines: string[] }> {
  if (lineId === 'defi-trader') {
    return [
      {
        key: 'defi-approval',
        label: 'DeFi Approval Mode',
        tooltipLines: compactCreateProtectionTooltip(lineId, 'defi-approval'),
      },
      {
        key: 'approval-to-new-spender-delay',
        label: 'New Spender Approval Delay',
        tooltipLines: compactCreateProtectionTooltip(lineId, 'approval-to-new-spender-delay'),
      },
      {
        key: 'erc20-first-new-recipient-delay',
        label: 'New Token Recipient Delay',
        tooltipLines: compactCreateProtectionTooltip(lineId, 'erc20-first-new-recipient-delay'),
      },
      {
        key: 'large-transfer-delay',
        label: 'Large Transfer Delay',
        tooltipLines: compactCreateProtectionTooltip(lineId, 'large-transfer-delay'),
      },
      {
        key: 'new-receiver-delay',
        label: 'New Receiver Delay',
        tooltipLines: compactCreateProtectionTooltip(lineId, 'new-receiver-delay'),
      },
    ]
  }

  return [
    {
      key: 'approval-safety',
      label: 'Approval Safety',
      tooltipLines: compactCreateProtectionTooltip(lineId, 'approval-safety'),
    },
    {
      key: 'large-transfer-delay',
      label: 'Large Transfer Delay',
      tooltipLines: compactCreateProtectionTooltip(lineId, 'large-transfer-delay'),
    },
    {
      key: 'new-receiver-delay',
      label: 'New Receiver Delay',
      tooltipLines: compactCreateProtectionTooltip(lineId, 'new-receiver-delay'),
    },
  ]
}

export function createFallbackActiveProtectionRules(params: {
  lineId: CreateLineId
  lineTitle: string
}): ProtectionRuleView[] {
  const sourceLine = `Included in Base Protection: ${params.lineTitle}.`

  return createIncludedProtectionRows(params.lineId).map((row, index) => ({
    key: `base-fallback:${params.lineId}:${row.key}:${index}`,
    label: row.label,
    contextLabel: 'Included in Base Protection',
    tooltipLines: Array.from(new Set([
      ...row.tooltipLines,
      'Source: Included in Base Protection.',
      sourceLine,
    ])),
  }))
}

export function normalizeIncludedPolicyLabel(params: {
  lineId: CreateLineId
  index: number
  chainLabel: string | null | undefined
}): string {
  const candidate = typeof params.chainLabel === 'string' ? params.chainLabel.trim() : ''
  const normalized = candidate.toLowerCase()
  const isGeneric = normalized.length === 0 || normalized === 'protection' || normalized === 'policy'

  if (!isGeneric) {
    return candidate
  }

  const fallback = createIncludedProtectionRows(params.lineId)[params.index]?.label
  if (fallback && fallback.trim().length > 0) {
    return fallback
  }

  return `Policy ${params.index + 1}`
}

export function resolveIncludedPolicyTooltipLines(params: {
  lineId: CreateLineId
  index: number
  policyKind: string
  chainTooltipLines: string[]
}): string[] {
  const fallbackLines = createIncludedProtectionRows(params.lineId)[params.index]?.tooltipLines ?? []
  const chainLines = params.chainTooltipLines.filter((line) => line.trim().length > 0)

  if (params.policyKind === 'unknown') {
    return fallbackLines.length > 0 ? fallbackLines : chainLines
  }

  if (chainLines.length === 0) {
    return fallbackLines.length > 0 ? fallbackLines : chainLines
  }

  const hasOnlyGenericSummary = chainLines.length === 1
    && chainLines[0].toLowerCase().includes('protection is active')

  if (hasOnlyGenericSummary && fallbackLines.length > 0) {
    return fallbackLines
  }

  return chainLines
}

function addonCompactFallbackTooltip(kind: ActivePolicy['details']['kind']): string[] {
  if (kind === 'infinite-approval') {
    return [
      'Policy behavior: blocks unlimited approvals.',
      'Permit approvals are blocked in this add-on.',
    ]
  }

  if (kind === 'large-transfer-delay') {
    return [
      'Delay: 24 hours',
      'Behavior: large transfer is queued until unlock time.',
    ]
  }

  if (kind === 'new-receiver-delay') {
    return [
      'Delay: 24 hours',
      'Scope: first transfer to a new address.',
    ]
  }

  return []
}

export function resolveActivePolicyTooltipLines(params: {
  lineId: CreateLineId | null
  source: ActivePolicy['source']
  basePolicyIndex: number
  policyKind: ActivePolicy['details']['kind']
  chainTooltipLines: string[]
}): string[] {
  const chainLines = params.chainTooltipLines.filter((line) => line.trim().length > 0)
  const isSummaryOnly = chainLines.length === 1 && chainLines[0].toLowerCase().startsWith('summary:')
  const hasMeaningfulNonSummaryLine = chainLines.some((line) => {
    const lowered = line.toLowerCase()
    if (lowered.startsWith('summary:')) {
      return false
    }
    return !lowered.includes('temporarily unavailable')
  })

  if (chainLines.length > 0 && !isSummaryOnly && hasMeaningfulNonSummaryLine) {
    return chainLines
  }

  let fallbackLines: string[] = []
  if (params.source === 'line' && params.lineId) {
    if (params.policyKind === 'infinite-approval') {
      fallbackLines = compactCreateProtectionTooltip(params.lineId, 'approval-safety')
    } else if (params.policyKind === 'defi-approval') {
      fallbackLines = compactCreateProtectionTooltip(params.lineId, 'defi-approval')
    } else if (params.policyKind === 'approval-to-new-spender-delay') {
      fallbackLines = compactCreateProtectionTooltip(params.lineId, 'approval-to-new-spender-delay')
    } else if (params.policyKind === 'erc20-first-new-recipient-delay') {
      fallbackLines = compactCreateProtectionTooltip(params.lineId, 'erc20-first-new-recipient-delay')
    } else if (params.policyKind === 'large-transfer-delay') {
      fallbackLines = compactCreateProtectionTooltip(params.lineId, 'large-transfer-delay')
    } else if (params.policyKind === 'new-receiver-delay') {
      fallbackLines = compactCreateProtectionTooltip(params.lineId, 'new-receiver-delay')
    } else {
      fallbackLines = createIncludedProtectionRows(params.lineId)[params.basePolicyIndex]?.tooltipLines ?? []
    }
  } else {
    fallbackLines = addonCompactFallbackTooltip(params.policyKind)
  }

  if (fallbackLines.length > 0) {
    return fallbackLines
  }

  return chainLines
}

function isGenericPolicyLabel(label: string | null | undefined): boolean {
  const candidate = typeof label === 'string' ? label.trim() : ''
  const normalized = candidate.toLowerCase()
  return normalized.length === 0 || normalized === 'protection' || normalized === 'policy'
}

function humanizePolicyName(name: string): string {
  const cleaned = name.replace(/Policy$/u, '')
  const withSpaces = cleaned.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  const normalized = withSpaces.trim()

  if (normalized.length > 0) {
    return normalized
  }

  return 'Protection'
}

function activeKindFallbackLabel(params: {
  kind: ActivePolicy['details']['kind']
  source: ActivePolicy['source']
}): string | null {
  if (params.kind === 'infinite-approval') {
    return params.source === 'addon' ? 'Approval Hardening' : 'Approval Safety'
  }

  if (params.kind === 'defi-approval') {
    return 'DeFi Approval Mode'
  }

  if (params.kind === 'approval-to-new-spender-delay') {
    return 'New Spender Approval Delay'
  }

  if (params.kind === 'erc20-first-new-recipient-delay') {
    return 'New Token Recipient Delay'
  }

  if (params.kind === 'large-transfer-delay') {
    return params.source === 'addon' ? '24-Hour Large Transfer Delay' : 'Large Transfer Delay'
  }

  if (params.kind === 'new-receiver-delay') {
    return params.source === 'addon' ? '24-Hour New Receiver Delay' : 'New Receiver Delay'
  }

  return null
}

export function normalizeActivePolicyLabel(params: {
  lineId: CreateLineId | null
  source: ActivePolicy['source']
  basePolicyIndex: number
  chainLabel: string | null | undefined
  kind: ActivePolicy['details']['kind']
  policyName: string | null
}): string {
  const chainLabel = typeof params.chainLabel === 'string' ? params.chainLabel.trim() : ''
  if (!isGenericPolicyLabel(chainLabel)) {
    return chainLabel
  }

  const kindFallback = activeKindFallbackLabel({
    kind: params.kind,
    source: params.source,
  })
  if (kindFallback) {
    return kindFallback
  }

  if (params.source === 'line' && params.lineId) {
    const lineFallback = createIncludedProtectionRows(params.lineId)[params.basePolicyIndex]?.label
    if (lineFallback && lineFallback.trim().length > 0) {
      return lineFallback
    }
  }

  if (typeof params.policyName === 'string' && params.policyName.trim().length > 0) {
    return humanizePolicyName(params.policyName.trim())
  }

  if (params.source === 'line') {
    return `Policy ${params.basePolicyIndex + 1}`
  }

  return 'Protection'
}

export function normalizeCreateError(error: unknown): string {
  if (!error) {
    return 'Could not create your Vault. Please try again.'
  }

  const message = error instanceof Error ? error.message : String(error)
  const lowered = message.toLowerCase()

  if (lowered.includes('rejected') || lowered.includes('denied') || lowered.includes('user cancelled')) {
    return 'The action was canceled in your wallet.'
  }

  if (lowered.includes('insufficient funds')) {
    return 'Insufficient funds to submit this transaction.'
  }

  if (lowered.includes('network') || lowered.includes('rpc') || lowered.includes('timeout')) {
    return 'Network issue while creating your Vault. Please try again.'
  }

  return 'Could not create your Vault. Please try again.'
}

export function normalizeEnableAddonError(error: unknown): string {
  if (!error) {
    return 'Could not enable this add-on.'
  }

  const message = error instanceof Error ? error.message : String(error)
  const lowered = message.toLowerCase()

  if (lowered.includes('router_notentitled') || lowered.includes('notentitled') || lowered.includes('not entitled')) {
    return 'This add-on requires access for the connected owner.'
  }

  if (lowered.includes('router_packalreadyenabled') || lowered.includes('already enabled')) {
    return 'This add-on is already enabled.'
  }

  if (lowered.includes('router_packnotactive') || lowered.includes('pack not active')) {
    return 'This add-on pack is currently inactive.'
  }

  if (lowered.includes('router_invalidaddonpack') || lowered.includes('invalid addon pack')) {
    return 'This add-on pack is invalid for the current router.'
  }

  if (lowered.includes('router_invalidpackaccessmode') || lowered.includes('invalid pack access mode')) {
    return 'This add-on pack has an invalid access mode configuration.'
  }

  if (lowered.includes('router_duplicatepolicy') || lowered.includes('duplicate policy')) {
    return 'This add-on overlaps with a policy that is already active.'
  }

  if (lowered.includes('rejected') || lowered.includes('denied') || lowered.includes('user cancelled')) {
    return 'Add-on enable was canceled in your wallet.'
  }

  return 'Could not enable this add-on.'
}

export function classifyImportFailure(reason: string): ImportValidationState {
  const lowered = reason.toLowerCase()

  if (
    lowered.includes('rpc')
    || lowered.includes('timeout')
    || lowered.includes('gateway')
    || lowered.includes('temporarily unavailable')
    || lowered.includes('failed to fetch')
    || lowered.includes('public client')
    || lowered.includes('unreadable')
    || lowered.includes('unsupported')
  ) {
    return {
      kind: 'unsupported',
      message: 'Address checks are temporarily unavailable. You can retry in a moment.',
    }
  }

  if (
    lowered.includes('firewall wallet owner mismatch')
    || lowered.includes('owner mismatch')
    || lowered.includes('not owned by connected address')
  ) {
    return {
      kind: 'not_firewall_vault',
      message: 'Not a Firewall Vault address for this connected wallet.',
    }
  }

  return {
    kind: 'not_firewall_vault',
    message: 'Not a Firewall Vault address for this connected wallet.',
  }
}

export function normalizeQueueActionError(error: unknown): string {
  if (!error) {
    return 'Queue action failed.'
  }

  const message = error instanceof Error ? error.message : String(error)
  const lowered = message.toLowerCase()

  if (lowered.includes('already executed')) {
    return 'This queue item is already executed.'
  }

  if (lowered.includes('already cancelled') || lowered.includes('already canceled')) {
    return 'This queue item is already canceled.'
  }

  if (lowered.includes('rejected') || lowered.includes('denied')) {
    return 'Action was canceled in your wallet.'
  }

  return 'Queue action failed. Please retry.'
}

export function normalizeVaultStateError(error: string): string {
  if (error.includes('Debug:')) {
    return error
  }

  const lowered = error.toLowerCase()

  if (
    lowered.includes('503')
    || lowered.includes('temporarily unavailable')
    || lowered.includes('gateway')
    || lowered.includes('timeout')
  ) {
    return 'Protection details are temporarily unavailable due to RPC issues.'
  }

  return 'Protection details are temporarily unavailable.'
}

export function normalizeQueueLoadError(error: string): string {
  const lowered = error.toLowerCase()
  const compact = error.replace(/\s+/g, ' ').trim()
  const detail = compact.length > 140 ? `${compact.slice(0, 137)}...` : compact

  if (
    lowered.includes('503')
    || lowered.includes('temporarily unavailable')
    || lowered.includes('gateway')
    || lowered.includes('timeout')
  ) {
    return `Queue data is temporarily unavailable due to RPC issues. (${detail})`
  }

  if (lowered.includes('dns') || lowered.includes('failed to lookup address information')) {
    return `Queue RPC DNS lookup failed. (${detail})`
  }

  return `Queue data is temporarily unavailable. (${detail})`
}

export function normalizeSendError(error: unknown): { kind: 'blocked' | 'failed'; message: string } {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase()

  if (message.includes('router_revert') || message.includes('blocked by active') || message.includes('blocked')) {
    return {
      kind: 'blocked',
      message: 'Transfer is blocked by active Vault protections.',
    }
  }

  if (message.includes('user rejected') || message.includes('denied') || message.includes('rejected')) {
    return {
      kind: 'failed',
      message: 'Transfer canceled in wallet.',
    }
  }

  return {
    kind: 'failed',
    message: 'Transfer failed. Please retry.',
  }
}

export function baseLineName(packId: number | null): string {
  if (packId === 0) {
    return 'Vault Safe'
  }

  if (packId === 1) {
    return 'DeFi Trader'
  }

  return 'Unknown line'
}

export function formatDateTime(seconds: bigint): string {
  const millis = Number(seconds) * 1000
  if (!Number.isFinite(millis)) {
    return `${seconds.toString()} sec`
  }

  return new Date(millis).toLocaleString()
}

export function isExpectedRouterDecision(value: string): value is 'allow' | 'delay' | 'revert' | 'unknown' {
  return value === 'allow' || value === 'delay' || value === 'revert' || value === 'unknown'
}
