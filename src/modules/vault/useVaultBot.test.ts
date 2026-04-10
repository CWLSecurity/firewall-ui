import { describe, expect, it } from 'vitest'
import { normalizeVaultBotStatusResponse } from './useVaultBot'

const VAULT = '0x16fAd5f43b22d89DFDfCa96ba9435A33c9ba1298'
const RELAYER = '0x2e81EF12024C4fADB0E6b74a7eE1271436e4a4B3'

describe('normalizeVaultBotStatusResponse', () => {
  it('normalizes a valid status response', () => {
    const normalized = normalizeVaultBotStatusResponse({
      walletAddress: VAULT,
      response: {
        ok: true,
        vaultAddress: VAULT,
        relayerAddress: RELAYER,
        runtime: {
          hasBaseRpc: true,
          hasRelayerKey: true,
        },
        vault: {
          enabled: true,
          running: false,
          runCount: 3,
          successCount: 2,
          failureCount: 1,
          lastRunAt: '2026-03-25T16:00:00.000Z',
          lastSuccessAt: '2026-03-25T15:59:55.000Z',
          lastError: null,
          lastOutput: 'executedCount 1',
        },
      },
    })

    expect(normalized).not.toBeNull()
    expect(normalized?.vaultAddress).toBe(VAULT)
    expect(normalized?.relayerAddress).toBe(RELAYER)
    expect(normalized?.serverEnabled).toBe(true)
    expect(normalized?.runCount).toBe(3)
    expect(normalized?.lastRunAtMs).toBeGreaterThan(0)
    expect(normalized?.hasBaseRpc).toBe(true)
    expect(normalized?.hasRelayerKey).toBe(true)
  })

  it('returns null for invalid payload shape', () => {
    const normalized = normalizeVaultBotStatusResponse({
      walletAddress: VAULT,
      response: {
        ok: true,
      },
    })

    expect(normalized).toBeNull()
  })

  it('keeps null relayer when relayer address is invalid', () => {
    const normalized = normalizeVaultBotStatusResponse({
      walletAddress: VAULT,
      response: {
        ok: true,
        vaultAddress: VAULT,
        relayerAddress: 'bad-address',
        runtime: {
          hasBaseRpc: false,
          hasRelayerKey: true,
        },
        vault: {
          enabled: false,
          running: false,
          runCount: 0,
          successCount: 0,
          failureCount: 0,
          lastRunAt: null,
          lastSuccessAt: null,
          lastError: '',
          lastOutput: '',
        },
      },
    })

    expect(normalized?.relayerAddress).toBeNull()
    expect(normalized?.lastError).toBeNull()
    expect(normalized?.lastOutput).toBeNull()
  })
})
