import { describe, expect, it } from 'vitest'
import { parseScheduledRow } from './useVaultQueue'

describe('parseScheduledRow', () => {
  it('parses getScheduled tuple when unlockTime is returned as number', () => {
    const result = parseScheduledRow([
      true,
      false,
      '0x2e81EF12024C4fADB0E6b74a7eE1271436e4a4B3',
      1n,
      1774440237,
      `0x${'1'.repeat(64)}`,
    ])

    expect(result).toEqual({
      exists: true,
      executed: false,
      to: '0x2e81EF12024C4fADB0E6b74a7eE1271436e4a4B3',
      value: 1n,
      unlockTime: 1774440237n,
      dataHash: `0x${'1'.repeat(64)}`,
    })
  })

  it('returns null for malformed tuple', () => {
    expect(parseScheduledRow(['bad'])).toBeNull()
  })
})
