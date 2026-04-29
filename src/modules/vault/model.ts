import { formatEther, type Address } from 'viem'
import {
  BASE_PACK_CONSERVATIVE_ID,
  BASE_PACK_DEFI_ID,
} from '../../contracts/addresses/base'
import type { PolicyRuntimeDetails } from '../../contracts/policies'

export type SecurityLineId = 'vault-safe' | 'defi-trader'
export type AddonId = 'new-receiver-24h-delay' | 'large-transfer-24h-delay'

export type SecurityLineDefinition = {
  id: SecurityLineId
  basePackId: number
  title: string
  shortDescription: string
  details: string[]
  includedProtectionPreview: string[]
}

export type AddonDefinition = {
  id: AddonId
  packId: number
  title: string
  shortDescription: string
  details: string[]
}

export type PolicySourceContext = 'base' | 'addon' | 'unspecified'

export type PolicyBusinessMetadata = {
  displayName: string
  shortSummary: string
  businessDescription: string
  whyItMatters: string
  uiContextNote: string
  sourceLabel: string
  packContextLabel: string
  learnMoreHint: string
  metadataExtras?: Record<string, string>
}

export type PolicyView = {
  policyAddress: Address
  title: string
  summary: string
  why: string
  parameterSummary: string[]
  details: string[]
  metadata: PolicyBusinessMetadata
  technical: {
    policyName: string | null
    policyKey: `0x${string}` | null
    policyConfigVersion: number | null
  }
}

const MAX_UINT256 = (1n << 256n) - 1n

const DEFAULT_SOURCE_LABEL = 'Protection source is active.'
const DEFAULT_PACK_CONTEXT_LABEL = 'Rule context is unavailable.'

export const SECURITY_LINES: SecurityLineDefinition[] = [
  {
    id: 'vault-safe',
    basePackId: BASE_PACK_CONSERVATIVE_ID,
    title: 'Vault',
    shortDescription: 'Vault-focused line: simple defaults for rare outflows.',
    details: [
      'Designed for long-term storage and occasional withdrawals.',
      'First transfers to new receivers are delayed by 1 hour.',
      'Transfers above the large-transfer threshold are delayed by 1 hour.',
    ],
    includedProtectionPreview: [
      'Large transfers over 10 ETH are delayed',
      'First transfer to a new receiver is delayed',
    ],
  },
  {
    id: 'defi-trader',
    basePackId: BASE_PACK_DEFI_ID,
    title: 'DeFi Trader',
    shortDescription: 'More DeFi-compatible line with active delay protections.',
    details: [
      'Built for active protocol usage while keeping delay protections in place.',
      'Approval behavior follows the on-chain DeFi policy configuration.',
      'Includes additional first-time spender and recipient friction for DeFi flows.',
    ],
    includedProtectionPreview: [
      'Approval policy follows DeFi mode configuration',
      'First-time risky approvals can be delayed or blocked',
      'Large transfers are delayed',
      'First transfer to a new receiver can be delayed',
    ],
  },
]

export const ADDON_DEFINITIONS: AddonDefinition[] = [
  {
    id: 'new-receiver-24h-delay',
    packId: 2,
    title: '24-Hour New Receiver Delay',
    shortDescription: 'Extends first new-receiver delay from 1 hour to 24 hours.',
    details: [
      'Adds extra review time before funds can leave to a new destination.',
      'Once a receiver becomes known, future transfers are not delayed by this rule.',
    ],
  },
  {
    id: 'large-transfer-24h-delay',
    packId: 3,
    title: '24-Hour Large Transfer Delay',
    shortDescription: 'Extends large-transfer delay from 1 hour to 24 hours.',
    details: [
      'Uses the same large-transfer threshold as Vault defaults.',
      'Threshold and timing are enforced on-chain by the active policy contract.',
    ],
  },
]

export function lineByBasePackId(basePackId: number | null): SecurityLineDefinition | null {
  if (basePackId === null) {
    return null
  }

  return SECURITY_LINES.find((line) => line.basePackId === basePackId) ?? null
}

export function addonByPackId(packId: number): AddonDefinition | null {
  return ADDON_DEFINITIONS.find((addon) => addon.packId === packId) ?? null
}

export function formatDelay(delaySeconds: bigint | null): string {
  if (delaySeconds === null) {
    return 'details temporarily unavailable'
  }

  const value = Number(delaySeconds)
  if (!Number.isFinite(value)) {
    return `${delaySeconds.toString()} seconds`
  }

  if (value % 86_400 === 0) {
    const days = value / 86_400
    return `${days} day${days === 1 ? '' : 's'}`
  }

  if (value % 3_600 === 0) {
    const hours = value / 3_600
    return `${hours} hour${hours === 1 ? '' : 's'}`
  }

  if (value % 60 === 0) {
    const minutes = value / 60
    return `${minutes} minute${minutes === 1 ? '' : 's'}`
  }

  return `${delaySeconds.toString()} seconds`
}

function formatThresholdEth(valueWei: bigint | null): string {
  if (valueWei === null) {
    return 'details temporarily unavailable'
  }

  return `${formatEther(valueWei)} ETH`
}

function formatLegacyApprovalLimit(value: bigint | null): string {
  if (value === null) {
    return 'details temporarily unavailable'
  }

  if (value === MAX_UINT256) {
    return 'max uint256'
  }

  return value.toString()
}

function humanizePolicyName(name: string): string {
  const cleaned = name.replace(/Policy$/u, '')
  const withSpaces = cleaned.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  return withSpaces.trim() || 'Protection'
}

function policyTitleFromName(name: string | null, fallback: string): string {
  if (!name) {
    return fallback
  }

  if (name === 'InfiniteApprovalPolicy') return 'Approval Safety'
  if (name === 'DeFiApprovalPolicy') return 'DeFi Approval Mode'
  if (name === 'LargeTransferDelayPolicy') return 'Large Transfer Delay'
  if (name === 'NewReceiverDelayPolicy') return 'New Receiver Delay'
  if (name === 'NewEOAReceiverDelayPolicy') return 'New Receiver Delay'
  if (name === 'ApprovalToNewSpenderDelayPolicy') return 'New Spender Approval Delay'
  if (name === 'Erc20FirstNewRecipientDelayPolicy') return 'New Token Recipient Delay'

  return humanizePolicyName(name)
}

function createBusinessMetadata(params: {
  displayName: string
  shortSummary: string
  businessDescription: string
  whyItMatters: string
  uiContextNote: string
  learnMoreHint: string
  sourceLabel?: string
  packContextLabel?: string
  metadataExtras?: Record<string, string>
}): PolicyBusinessMetadata {
  return {
    displayName: params.displayName,
    shortSummary: params.shortSummary,
    businessDescription: params.businessDescription,
    whyItMatters: params.whyItMatters,
    uiContextNote: params.uiContextNote,
    sourceLabel: params.sourceLabel ?? DEFAULT_SOURCE_LABEL,
    packContextLabel: params.packContextLabel ?? DEFAULT_PACK_CONTEXT_LABEL,
    learnMoreHint: params.learnMoreHint,
    metadataExtras: params.metadataExtras,
  }
}

function toPolicyView(params: {
  policyAddress: Address
  metadata: PolicyBusinessMetadata
  parameterSummary: string[]
  technical: {
    policyName: string | null
    policyKey: `0x${string}` | null
    policyConfigVersion: number | null
  }
}): PolicyView {
  const details = [
    params.metadata.businessDescription,
    params.metadata.whyItMatters,
    params.metadata.uiContextNote,
    ...params.parameterSummary,
  ]

  return {
    policyAddress: params.policyAddress,
    title: params.metadata.displayName,
    summary: params.metadata.shortSummary,
    why: params.metadata.whyItMatters,
    parameterSummary: params.parameterSummary,
    details: Array.from(new Set(details.filter((line) => line.trim().length > 0))),
    metadata: params.metadata,
    technical: params.technical,
  }
}

function sourceLabels(sourceContext: PolicySourceContext, addonTitle: string | null): Pick<PolicyBusinessMetadata, 'sourceLabel' | 'packContextLabel'> {
  if (sourceContext === 'base') {
    return {
      sourceLabel: 'Included in Base Protection',
      packContextLabel: 'Part of your base protection set.',
    }
  }

  if (sourceContext === 'addon') {
    return {
      sourceLabel: 'Enabled as Add-on',
      packContextLabel: addonTitle ? `Provided by add-on: ${addonTitle}.` : 'Provided by an enabled add-on.',
    }
  }

  return {
    sourceLabel: DEFAULT_SOURCE_LABEL,
    packContextLabel: DEFAULT_PACK_CONTEXT_LABEL,
  }
}

function knownScopeLabel(value: string | null): string {
  if (value === 'vault_token_spender') {
    return 'Known spender state is tracked per Vault, token, and spender.'
  }

  if (value === 'vault_token_rcpt') {
    return 'Known recipient state is tracked per Vault, token, and recipient.'
  }

  return 'Known-state scope details are temporarily unavailable.'
}

export function policyTooltipLines(view: PolicyView): string[] {
  const lines = [
    `Summary: ${view.metadata.shortSummary}`,
    `What it does: ${view.metadata.businessDescription}`,
    `Why it matters: ${view.metadata.whyItMatters}`,
    `Context: ${view.metadata.uiContextNote}`,
    ...view.parameterSummary.map((line) => `Active setting: ${line}`),
    `Learn more: ${view.metadata.learnMoreHint}`,
  ]

  return Array.from(new Set(lines.filter((line) => line.trim().length > 0)))
}

export function policyCompactTooltipLines(view: PolicyView): string[] {
  const lines: string[] = [`Summary: ${view.metadata.shortSummary}`]
  const parameterLines = view.parameterSummary.filter((line) => !line.toLowerCase().includes('temporarily unavailable'))
  const thresholdLine = parameterLines.find((line) => line.toLowerCase().includes('threshold'))
  const delayLine = parameterLines.find((line) => line.toLowerCase().includes('delay'))

  const selected: string[] = []
  if (thresholdLine) {
    selected.push(thresholdLine)
  }
  if (delayLine && delayLine !== thresholdLine) {
    selected.push(delayLine)
  }
  if (selected.length === 0 && parameterLines.length > 0) {
    selected.push(parameterLines[0])
  }

  return Array.from(new Set([...lines, ...selected].filter((line) => line.trim().length > 0)))
}

function normalizePolicyReasonLine(line: string): string {
  const cleaned = line
    .replace(/^summary:\s*/i, '')
    .replace(/^active setting:\s*/i, '')
    .trim()

  if (cleaned.length === 0) {
    return ''
  }

  return /[.!?]$/.test(cleaned) ? cleaned : `${cleaned}.`
}

function isUsablePolicyReasonLine(line: string): boolean {
  const lowered = line.toLowerCase()

  if (lowered.includes('temporarily unavailable')) {
    return false
  }

  if (lowered === 'protection is active.') {
    return false
  }

  if (lowered.startsWith('config version:')) {
    return false
  }

  return true
}

function policyDecisionLabel(view: PolicyView): string {
  const raw = view.metadata.displayName.trim()
  if (raw.length > 0 && raw.toLowerCase() !== 'protection') {
    return raw
  }

  const title = view.title.trim()
  if (title.length > 0 && title.toLowerCase() !== 'protection') {
    return title
  }

  return `Policy ${view.policyAddress.slice(0, 10)}`
}

export function policyDecisionReason(params: {
  view: PolicyView
  decision: 'delay' | 'revert'
}): string {
  const action = params.decision === 'delay' ? 'Delayed' : 'Blocked'
  const label = policyDecisionLabel(params.view)

  const normalizedParameterLines = params.view.parameterSummary
    .map((line) => normalizePolicyReasonLine(line))
    .filter((line) => line.length > 0 && isUsablePolicyReasonLine(line))

  if (params.decision === 'delay') {
    const delayLine = normalizedParameterLines.find((line) => line.toLowerCase().includes('delay'))
    const thresholdLine = normalizedParameterLines.find((line) => line.toLowerCase().includes('threshold'))
    const detailLines = [delayLine, thresholdLine]
      .filter((line): line is string => Boolean(line))
      .filter((line, index, array) => array.indexOf(line) === index)

    if (detailLines.length > 0) {
      return `${action} by ${label}. ${detailLines.join(' ')}`
    }
  }

  const fallbackDetail = [
    ...policyCompactTooltipLines(params.view),
    ...params.view.parameterSummary,
    params.view.metadata.shortSummary,
    params.view.metadata.businessDescription,
    params.view.metadata.whyItMatters,
  ]
    .map((line) => normalizePolicyReasonLine(line))
    .find((line) => line.length > 0 && isUsablePolicyReasonLine(line))

  if (fallbackDetail) {
    return `${action} by ${label}. ${fallbackDetail}`
  }

  return `${action} by ${label}.`
}

export function packAccessLabel(accessMode: 'free' | 'entitled' | null): string {
  if (accessMode === 'free') {
    return 'Free'
  }

  if (accessMode === 'entitled') {
    return 'Requires access'
  }

  return 'Access details unavailable'
}

export function packTitleFromSlug(params: {
  packId: number
  slug: string | null
  fallbackTitle: string
}): string {
  const normalizedSlug = params.slug?.trim().toLowerCase() ?? ''

  if (normalizedSlug === 'addon-new-receiver-24h-delay') return '24-Hour New Receiver Delay'
  if (normalizedSlug === 'addon-large-transfer-24h-delay') return '24-Hour Large Transfer Delay'
  if (normalizedSlug === 'base-conservative') return 'Vault'
  if (normalizedSlug === 'base-defi') return 'DeFi Trader'

  if (params.fallbackTitle.trim().length > 0) {
    return params.fallbackTitle
  }

  return `Pack ${params.packId}`
}

export function packTooltipLines(params: {
  accessLabel: string
  statusLabel: string
  policyViews: PolicyView[]
  fallbackDescription: string
}): string[] {
  const lines: string[] = [`Summary: ${params.fallbackDescription}`, `Status: ${params.statusLabel}`]

  if (params.policyViews.length === 0) {
    return Array.from(new Set(lines.filter((line) => line.trim().length > 0)))
  }

  const includedPolicies = params.policyViews
    .map((view) => view.metadata.displayName.trim())
    .filter((value) => value.length > 0)

  if (includedPolicies.length > 0) {
    lines.push(`Includes: ${includedPolicies.join(', ')}.`)
  }

  const keySettings = params.policyViews
    .flatMap((view) =>
      policyCompactTooltipLines(view).filter((line) => {
        const lowered = line.toLowerCase()
        return !lowered.startsWith('summary:') && !lowered.includes('temporarily unavailable')
      }),
    )
    .slice(0, 2)

  for (const setting of keySettings) {
    lines.push(`Key setting: ${setting}`)
  }

  return Array.from(new Set(lines.filter((line) => line.trim().length > 0)))
}

export function buildPolicyView(
  policyAddress: Address,
  details: PolicyRuntimeDetails,
  options?: {
    sourceContext?: PolicySourceContext
    addonTitle?: string | null
  },
): PolicyView {
  const technical = {
    policyName: details.policyName,
    policyKey: details.policyKey,
    policyConfigVersion: details.policyConfigVersion,
  }
  const sourceContext = options?.sourceContext ?? 'unspecified'
  const contextLabels = sourceLabels(sourceContext, options?.addonTitle ?? null)

  if (details.kind === 'infinite-approval') {
    const parameterSummary = [
      details.allowPermit === true
        ? 'Permit-based approvals are allowed by this configuration.'
        : details.allowPermit === false
          ? 'Permit-based approvals are blocked by this configuration.'
          : 'Permit-based approval behavior is temporarily unavailable.',
      details.strictNonZeroMode === true
        ? 'Strict non-zero approval mode is enabled.'
        : details.strictNonZeroMode === false
          ? 'Strict non-zero approval mode is disabled.'
          : 'Strict non-zero approval behavior is temporarily unavailable.',
      details.approvalLimitFunctional === true
        ? `Effective approval limit is ${formatLegacyApprovalLimit(details.legacyApprovalLimit)}.`
        : details.approvalLimitFunctional === false
          ? `Effective approval limit behavior is governed by the deployed policy configuration; legacy approval_limit ${formatLegacyApprovalLimit(details.legacyApprovalLimit)} is informational.`
          : 'Effective approval limit behavior is temporarily unavailable.',
    ]

    return toPolicyView({
      policyAddress,
      metadata: createBusinessMetadata({
        displayName: sourceContext === 'addon'
          ? 'Approval Safety (Code-Level Primitive)'
          : 'Approval Safety',
        shortSummary: 'Approval hardening primitive; behavior is read from on-chain config when deployed.',
        businessDescription:
          'This protection prevents apps and smart contracts from receiving unlimited access to your tokens. Depending on configuration, you can still approve only the amount you need.',
        whyItMatters:
          'Many DeFi losses happen because a wallet once granted overly broad token permissions. This protection reduces that risk before funds are moved.',
        uiContextNote:
          'On-chain config determines whether this approval-hardening primitive is active and how it behaves.',
        learnMoreHint: 'Review token approvals regularly and remove stale permissions.',
        ...contextLabels,
        metadataExtras: {
          policyFamily: 'approval-safety',
        },
      }),
      parameterSummary,
      technical,
    })
  }

  if (details.kind === 'defi-approval') {
    const parameterSummary = [
      details.allowMaxApproval === true
        ? 'Max approval amounts are allowed in this mode.'
        : details.allowMaxApproval === false
          ? 'Max approval amounts are blocked in this mode.'
          : 'Max approval behavior is temporarily unavailable.',
      details.allowPermit === true
        ? 'Permit-based approvals are allowed.'
        : details.allowPermit === false
          ? 'Permit-based approvals are blocked.'
          : 'Permit behavior is temporarily unavailable.',
      details.blockSetApprovalForAllTrue === true
        ? 'Operator-wide approvals are blocked.'
        : details.blockSetApprovalForAllTrue === false
          ? 'Operator-wide approvals are allowed.'
          : 'Operator-wide approval behavior is temporarily unavailable.',
    ]

    return toPolicyView({
      policyAddress,
      metadata: createBusinessMetadata({
        displayName: 'DeFi Approval Mode',
        shortSummary: 'Allows practical DeFi approvals while blocking the riskiest approval pattern.',
        businessDescription:
          'This protection is designed for active DeFi use. It allows common approval workflows while blocking the most dangerous approval pattern.',
        whyItMatters:
          'It gives more flexibility for DeFi users without fully removing approval safety controls.',
        uiContextNote: 'Exact approval rules shown below are read from on-chain policy introspection.',
        learnMoreHint: 'Use this mode when you need frequent DeFi approvals but still want guardrails.',
        ...contextLabels,
        metadataExtras: {
          policyFamily: 'defi-approval',
        },
      }),
      parameterSummary,
      technical,
    })
  }

  if (details.kind === 'large-transfer-delay') {
    const delay = formatDelay(details.delaySeconds)
    const erc20Threshold = details.erc20ThresholdUnits !== null
      ? details.erc20ThresholdUnits.toString()
      : 'details temporarily unavailable'
    const comparatorLine = details.comparatorMode === 'gte'
      ? 'Trigger condition: transfer amount at or above the configured threshold.'
      : 'Trigger condition details are temporarily unavailable.'
    const scopeLine = details.selectorScope === 'eth+erc20xfers'
      ? 'Scope: native ETH transfers and ERC-20 transfer/transferFrom transfers.'
      : 'Scope: transfer coverage details are temporarily unavailable.'

    const parameterSummary = [
      `Native transfer threshold: ${formatThresholdEth(details.ethThresholdWei)}.`,
      `ERC-20 transfer threshold: ${erc20Threshold} token units (raw on-chain units).`,
      `Delay before execution: ${delay}.`,
      comparatorLine,
      scopeLine,
    ]

    return toPolicyView({
      policyAddress,
      metadata: createBusinessMetadata({
        displayName: sourceContext === 'addon' ? '24-Hour Large Transfer Delay' : 'Large Transfer Delay',
        shortSummary:
          sourceContext === 'addon'
            ? 'Adds a 24-hour delay for large transfers.'
            : 'Large transfers are delayed before they can be completed.',
        businessDescription:
          'Transfers above the configured threshold are not sent immediately. They are placed in a queue and can be executed later or canceled.',
        whyItMatters:
          'This gives you time to stop a suspicious or mistaken large transfer before funds leave permanently.',
        uiContextNote:
          'Exact native and ERC-20 thresholds and delay are shown below from on-chain config.',
        learnMoreHint: 'Use queue review and cancellation if a delayed transfer looks suspicious.',
        ...contextLabels,
        metadataExtras: {
          policyFamily: 'transfer-delay',
        },
      }),
      parameterSummary,
      technical,
    })
  }

  if (details.kind === 'new-receiver-delay') {
    const delay = formatDelay(details.delaySeconds)
    const scopeLine = details.eoaOnly === true
      ? 'Scope: first transfer to a new wallet address only.'
      : details.eoaOnly === false
        ? 'Scope: first transfer to any new address, including contracts.'
        : 'Scope details are temporarily unavailable.'

    const parameterSummary = [
      `Delay before first transfer: ${delay}.`,
      scopeLine,
      'Known receiver state is tracked per Vault, so later transfers to known addresses are not delayed by this rule.',
    ]

    return toPolicyView({
      policyAddress,
      metadata: createBusinessMetadata({
        displayName: sourceContext === 'addon' ? '24-Hour New Receiver Delay' : 'New Receiver Delay',
        shortSummary:
          sourceContext === 'addon'
            ? 'Adds a 24-hour delay for first transfers to new addresses.'
            : 'First transfers to new addresses are delayed.',
        businessDescription:
          'The first transfer to an address your Vault has not sent to before is delayed. Once that address becomes known to the Vault, later transfers are not delayed by this rule.',
        whyItMatters:
          'This reduces the chance of sending funds quickly to a malicious or mistaken address.',
        uiContextNote: 'Exact delay and address scope are shown below from on-chain config.',
        learnMoreHint: 'Confirm new recipient addresses carefully before first transfer execution.',
        ...contextLabels,
        metadataExtras: {
          policyFamily: 'new-receiver-delay',
        },
      }),
      parameterSummary,
      technical,
    })
  }

  if (details.kind === 'approval-to-new-spender-delay') {
    const delay = formatDelay(details.delaySeconds)
    const eoaActionLine = details.eoaNonZeroAction === 'revert'
      ? 'Non-zero approvals to wallet-address spenders are blocked.'
      : 'Wallet-address spender behavior is temporarily unavailable.'
    const newContractLine = details.newContractAction === 'delay'
      ? 'First non-zero approval to a new contract spender is delayed.'
      : 'New contract spender behavior is temporarily unavailable.'

    const parameterSummary = [
      `Delay before first non-zero approval to a new contract spender: ${delay}.`,
      knownScopeLabel(details.knownScope),
      eoaActionLine,
      newContractLine,
    ]

    return toPolicyView({
      policyAddress,
      metadata: createBusinessMetadata({
        displayName: 'New Spender Approval Delay',
        shortSummary: 'New token approval targets are delayed.',
        businessDescription:
          'The first approval to a new token spender is delayed before it can take effect.',
        whyItMatters:
          'This helps prevent sudden approval-based token theft through a new malicious contract.',
        uiContextNote: 'Exact delay and spender-scope behavior are shown below from on-chain config.',
        learnMoreHint: 'Treat first-time spender approvals as high-risk actions.',
        ...contextLabels,
        metadataExtras: {
          policyFamily: 'approval-delay',
        },
      }),
      parameterSummary,
      technical,
    })
  }

  if (details.kind === 'erc20-first-new-recipient-delay') {
    const delay = formatDelay(details.delaySeconds)
    const selectorScopeLine = details.selectorScope === 'transfer+from'
      ? 'Scope: ERC-20 transfer and transferFrom to a new recipient.'
      : 'Transfer selector scope is temporarily unavailable.'
    const firstRecipientActionLine = details.firstRecipientAction === 'delay'
      ? 'First transfer to a new token recipient is delayed.'
      : 'First-recipient action details are temporarily unavailable.'

    const parameterSummary = [
      `Delay before first transfer to a new token recipient: ${delay}.`,
      selectorScopeLine,
      knownScopeLabel(details.knownScope),
      firstRecipientActionLine,
    ]

    return toPolicyView({
      policyAddress,
      metadata: createBusinessMetadata({
        displayName: 'New Token Recipient Delay',
        shortSummary: 'First token transfers to a new recipient are delayed.',
        businessDescription:
          'The first ERC-20 transfer to a new recipient is delayed before it can complete.',
        whyItMatters:
          'This helps prevent accidental or malicious first-time token transfers.',
        uiContextNote: 'Exact delay and ERC-20 transfer scope are shown below from on-chain config.',
        learnMoreHint: 'Validate new token recipient addresses before releasing delayed transfers.',
        ...contextLabels,
        metadataExtras: {
          policyFamily: 'token-recipient-delay',
        },
      }),
      parameterSummary,
      technical,
    })
  }

  const parameterSummary = [
    details.policyConfigVersion !== null
      ? `Config version: ${details.policyConfigVersion}.`
      : 'Config version details are temporarily unavailable.',
  ]

  return toPolicyView({
    policyAddress,
    metadata: createBusinessMetadata({
      displayName: policyTitleFromName(details.policyName, 'Protection'),
      shortSummary: 'Protection is active.',
      businessDescription: details.policyDescription ?? 'Details are temporarily unavailable.',
      whyItMatters: 'This protection still affects whether a Vault action is allowed, delayed, or blocked.',
      uiContextNote: 'Policy details are temporarily unavailable.',
      learnMoreHint: 'Try refreshing to load full policy details.',
      ...contextLabels,
      metadataExtras: {
        policyFamily: 'unknown',
      },
    }),
    parameterSummary,
    technical,
  })
}
