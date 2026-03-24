import { describe, expect, it } from 'vitest'
import {
  createFallbackActiveProtectionRules,
  createIncludedProtectionRows,
  createLineBehaviorNotes,
  formatCompactEth,
  normalizeActivePolicyLabel,
  normalizeIncludedPolicyLabel,
  resolveActivePolicyTooltipLines,
  resolveIncludedPolicyTooltipLines,
} from './helpers'

describe('createIncludedProtectionRows', () => {
  it('returns 3 base policies for vault-safe', () => {
    const rows = createIncludedProtectionRows('vault-safe')

    expect(rows).toHaveLength(3)
    expect(rows.map((row) => row.label)).toEqual([
      'Approval Safety',
      'Large Transfer Delay',
      'New Receiver Delay',
    ])
  })

  it('returns 5 base policies for defi-trader', () => {
    const rows = createIncludedProtectionRows('defi-trader')

    expect(rows).toHaveLength(5)
    expect(rows.map((row) => row.label)).toEqual([
      'DeFi Approval Mode',
      'New Spender Approval Delay',
      'New Token Recipient Delay',
      'Large Transfer Delay',
      'New Receiver Delay',
    ])
  })
})

describe('formatCompactEth', () => {
  it('rounds to 5 fraction digits by default', () => {
    expect(formatCompactEth('1.23456789')).toBe('1.23457')
  })

  it('removes trailing zeros after rounding', () => {
    expect(formatCompactEth('12.340000')).toBe('12.34')
  })

  it('returns original value when parsing fails', () => {
    expect(formatCompactEth('not-a-number')).toBe('not-a-number')
  })
})

describe('createLineBehaviorNotes', () => {
  it('returns behavior notes for vault-safe', () => {
    const notes = createLineBehaviorNotes('vault-safe')

    expect(notes.summary).toContain('daily transfers')
    expect(notes.bullets).toEqual([
      'Risky approvals are restricted by default.',
      'Large or first-time transfers are delayed for review.',
    ])
  })

  it('returns behavior notes for defi-trader', () => {
    const notes = createLineBehaviorNotes('defi-trader')

    expect(notes.summary).toContain('active protocol usage')
    expect(notes.bullets).toEqual([
      'DeFi approvals are more flexible for common flows.',
      'High-risk actions can still be delayed before execution.',
    ])
  })
})

describe('normalizeIncludedPolicyLabel', () => {
  it('keeps non-generic chain labels', () => {
    const label = normalizeIncludedPolicyLabel({
      lineId: 'defi-trader',
      index: 0,
      chainLabel: 'DeFi Approval Mode',
    })

    expect(label).toBe('DeFi Approval Mode')
  })

  it('replaces generic protection label with line-specific fallback', () => {
    const safeLabel = normalizeIncludedPolicyLabel({
      lineId: 'vault-safe',
      index: 0,
      chainLabel: 'Protection',
    })
    const defiLabel = normalizeIncludedPolicyLabel({
      lineId: 'defi-trader',
      index: 1,
      chainLabel: 'Protection',
    })

    expect(safeLabel).toBe('Approval Safety')
    expect(defiLabel).toBe('New Spender Approval Delay')
  })

  it('falls back to numbered policy label when index is out of range', () => {
    const label = normalizeIncludedPolicyLabel({
      lineId: 'vault-safe',
      index: 99,
      chainLabel: '',
    })

    expect(label).toBe('Policy 100')
  })
})

describe('normalizeActivePolicyLabel', () => {
  it('keeps non-generic label from chain metadata', () => {
    const label = normalizeActivePolicyLabel({
      lineId: 'defi-trader',
      source: 'line',
      basePolicyIndex: 0,
      chainLabel: 'DeFi Approval Mode',
      kind: 'defi-approval',
      policyName: 'DeFiApprovalPolicy',
    })

    expect(label).toBe('DeFi Approval Mode')
  })

  it('maps generic label by policy kind', () => {
    const label = normalizeActivePolicyLabel({
      lineId: 'defi-trader',
      source: 'line',
      basePolicyIndex: 2,
      chainLabel: 'Protection',
      kind: 'erc20-first-new-recipient-delay',
      policyName: null,
    })

    expect(label).toBe('New Token Recipient Delay')
  })

  it('falls back to base line policy order when kind is unknown', () => {
    const label = normalizeActivePolicyLabel({
      lineId: 'defi-trader',
      source: 'line',
      basePolicyIndex: 1,
      chainLabel: '',
      kind: 'unknown',
      policyName: null,
    })

    expect(label).toBe('New Spender Approval Delay')
  })

  it('falls back to humanized policy name when line mapping is unavailable', () => {
    const label = normalizeActivePolicyLabel({
      lineId: null,
      source: 'addon',
      basePolicyIndex: 0,
      chainLabel: 'Policy',
      kind: 'unknown',
      policyName: 'SomeGuardPolicy',
    })

    expect(label).toBe('Some Guard')
  })
})

describe('createFallbackActiveProtectionRules', () => {
  it('returns 3 fallback rules for vault-safe with base context', () => {
    const rules = createFallbackActiveProtectionRules({
      lineId: 'vault-safe',
      lineTitle: 'Vault Safe',
    })

    expect(rules).toHaveLength(3)
    expect(rules.map((rule) => rule.label)).toEqual([
      'Approval Safety',
      'Large Transfer Delay',
      'New Receiver Delay',
    ])
    expect(rules.every((rule) => rule.contextLabel === 'Included in Base Protection')).toBe(true)
  })

  it('returns 5 fallback rules for defi-trader', () => {
    const rules = createFallbackActiveProtectionRules({
      lineId: 'defi-trader',
      lineTitle: 'DeFi Trader',
    })

    expect(rules).toHaveLength(5)
    expect(rules.map((rule) => rule.label)).toEqual([
      'DeFi Approval Mode',
      'New Spender Approval Delay',
      'New Token Recipient Delay',
      'Large Transfer Delay',
      'New Receiver Delay',
    ])
  })
})

describe('resolveIncludedPolicyTooltipLines', () => {
  it('uses fallback tooltip lines for unknown policy kind', () => {
    const lines = resolveIncludedPolicyTooltipLines({
      lineId: 'vault-safe',
      index: 1,
      policyKind: 'unknown',
      chainTooltipLines: ['Summary: Protection is active.'],
    })

    expect(lines).toEqual([
      'Threshold: 0.05 ETH',
      'Delay: 1 hour',
      'Behavior: transfer is queued until unlock time.',
    ])
  })

  it('uses fallback when chain tooltip is only generic summary', () => {
    const lines = resolveIncludedPolicyTooltipLines({
      lineId: 'defi-trader',
      index: 0,
      policyKind: 'defi-approval',
      chainTooltipLines: ['Summary: Protection is active.'],
    })

    expect(lines).toEqual([
      'Policy behavior: allows practical DeFi approvals with guardrails.',
      'Permit-based approvals can be allowed in this line.',
    ])
  })

  it('keeps chain tooltip lines when they are informative', () => {
    const lines = resolveIncludedPolicyTooltipLines({
      lineId: 'defi-trader',
      index: 2,
      policyKind: 'erc20-first-new-recipient-delay',
      chainTooltipLines: [
        'Summary: First token transfers to a new recipient are delayed.',
        'Delay before first transfer to a new token recipient: 30 minutes.',
      ],
    })

    expect(lines).toEqual([
      'Summary: First token transfers to a new recipient are delayed.',
      'Delay before first transfer to a new token recipient: 30 minutes.',
    ])
  })
})

describe('resolveActivePolicyTooltipLines', () => {
  it('uses line fallback when chain tooltip has summary only', () => {
    const lines = resolveActivePolicyTooltipLines({
      lineId: 'vault-safe',
      source: 'line',
      basePolicyIndex: 1,
      policyKind: 'large-transfer-delay',
      chainTooltipLines: ['Summary: Large transfers are delayed before they can be completed.'],
    })

    expect(lines).toEqual([
      'Threshold: 0.05 ETH',
      'Delay: 1 hour',
      'Behavior: transfer is queued until unlock time.',
    ])
  })

  it('keeps informative chain tooltip lines for active rules', () => {
    const lines = resolveActivePolicyTooltipLines({
      lineId: 'defi-trader',
      source: 'line',
      basePolicyIndex: 2,
      policyKind: 'erc20-first-new-recipient-delay',
      chainTooltipLines: [
        'Summary: First token transfers to a new recipient are delayed.',
        'Delay before first transfer to a new token recipient: 30 minutes.',
      ],
    })

    expect(lines).toEqual([
      'Summary: First token transfers to a new recipient are delayed.',
      'Delay before first transfer to a new token recipient: 30 minutes.',
    ])
  })

  it('uses add-on fallback tooltip when metadata is generic', () => {
    const lines = resolveActivePolicyTooltipLines({
      lineId: null,
      source: 'addon',
      basePolicyIndex: 0,
      policyKind: 'new-receiver-delay',
      chainTooltipLines: ['Summary: Protection is active.'],
    })

    expect(lines).toEqual([
      'Delay: 24 hours',
      'Scope: first transfer to a new address.',
    ])
  })
})
