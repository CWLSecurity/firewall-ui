import { describe, expect, it } from 'vitest'
import type { PolicyView } from './model'
import { packTooltipLines, policyCompactTooltipLines } from './model'

function mockView(parameterSummary: string[]): PolicyView {
  return {
    policyAddress: '0x1111111111111111111111111111111111111111',
    title: 'Mock Policy',
    summary: 'Mock summary',
    why: 'Mock why',
    parameterSummary,
    details: [],
    metadata: {
      displayName: 'Mock Policy',
      shortSummary: 'Delays large transfers before execution.',
      businessDescription: 'Mock description',
      whyItMatters: 'Mock why',
      uiContextNote: 'Mock context',
      sourceLabel: 'Included in Base Protection',
      packContextLabel: 'Base pack',
      learnMoreHint: 'Mock hint',
    },
    technical: {
      policyName: 'MockPolicy',
      policyKey: null,
      policyConfigVersion: 1,
    },
  }
}

describe('policyCompactTooltipLines', () => {
  it('keeps summary and only key numeric settings', () => {
    const lines = policyCompactTooltipLines(
      mockView([
        'Native transfer threshold: 0.25 ETH.',
        'Delay before execution: 30 minutes.',
        'Scope: native ETH transfers and ERC-20 transfer/transferFrom transfers.',
      ]),
    )

    expect(lines).toEqual([
      'Summary: Delays large transfers before execution.',
      'Native transfer threshold: 0.25 ETH.',
      'Delay before execution: 30 minutes.',
    ])
  })

  it('drops temporarily unavailable entries', () => {
    const lines = policyCompactTooltipLines(
      mockView([
        'Native transfer threshold: details temporarily unavailable.',
        'Delay before execution: details temporarily unavailable.',
      ]),
    )

    expect(lines).toEqual(['Summary: Delays large transfers before execution.'])
  })

  it('prefers delay over scope-only details when no threshold exists', () => {
    const lines = policyCompactTooltipLines(
      mockView([
        'Delay before first transfer to a new token recipient: 30 minutes.',
        'Scope: ERC-20 transfer and transferFrom to a new recipient.',
      ]),
    )

    expect(lines).toEqual([
      'Summary: Delays large transfers before execution.',
      'Delay before first transfer to a new token recipient: 30 minutes.',
    ])
  })
})

describe('packTooltipLines', () => {
  it('returns compact add-on tooltip with summary and key setting', () => {
    const lines = packTooltipLines({
      accessLabel: 'Free',
      statusLabel: 'Available',
      policyViews: [
        mockView([
          'Native transfer threshold: 0.25 ETH.',
          'Delay before execution: 24 hours.',
          'Scope: native ETH transfers and ERC-20 transfer/transferFrom transfers.',
        ]),
      ],
      fallbackDescription: 'Adds a 24-hour delay for larger transfers.',
    })

    expect(lines).toEqual([
      'Summary: Adds a 24-hour delay for larger transfers.',
      'Status: Available',
      'Includes: Mock Policy.',
      'Key setting: Native transfer threshold: 0.25 ETH.',
      'Key setting: Delay before execution: 24 hours.',
    ])
  })
})
