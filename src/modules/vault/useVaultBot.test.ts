import { afterEach, describe, expect, it } from 'vitest'
import { buildBotMutationHeaders, normalizeVaultBotStatusResponse } from './useVaultBot'

const VAULT = '0x16fAd5f43b22d89DFDfCa96ba9435A33c9ba1298'
const RELAYER = '0x2e81EF12024C4fADB0E6b74a7eE1271436e4a4B3'
const originalWindow = (globalThis as { window?: unknown }).window

afterEach(() => {
  if (originalWindow === undefined) {
    delete (globalThis as { window?: unknown }).window
    return
  }
  ;(globalThis as { window?: unknown }).window = originalWindow
})

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

  it.each([
    ['null payload', null],
    ['string payload', 'bad'],
    ['number payload', 7],
    ['empty object', {}],
    ['missing ok', { vaultAddress: VAULT, runtime: {}, vault: {} }],
    ['ok false', { ok: false, vaultAddress: VAULT, runtime: {}, vault: {} }],
    ['missing vault', { ok: true, vaultAddress: VAULT, runtime: {} }],
    ['missing runtime', { ok: true, vaultAddress: VAULT, vault: {} }],
    ['runtime null', { ok: true, vaultAddress: VAULT, runtime: null, vault: {} }],
    ['vault null', { ok: true, vaultAddress: VAULT, runtime: {}, vault: null }],
  ])('returns null for invalid structure: %s', (_, response) => {
    const normalized = normalizeVaultBotStatusResponse({
      walletAddress: VAULT,
      response,
    })
    expect(normalized).toBeNull()
  })

  it.each([
    ['runCount', 'runCount'],
    ['successCount', 'successCount'],
    ['failureCount', 'failureCount'],
  ] as const)('falls back numeric counters to 0 when non-finite: %s', (_, fieldName) => {
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
          lastOutput: null,
          [fieldName]: Number.NaN,
        },
      },
    })

    expect(normalized).not.toBeNull()
    if (!normalized) return
    expect(normalized[fieldName]).toBe(0)
  })

  it.each([
    ['lastRunAt invalid', 'not-a-time', '2026-03-25T15:59:55.000Z', null, true],
    ['lastSuccessAt invalid', '2026-03-25T16:00:00.000Z', 'bad-time', true, null],
    ['both invalid', 'bad-time-a', 'bad-time-b', null, null],
  ])(
    'normalizes timestamps: %s',
    (_, lastRunAt, lastSuccessAt, expectRunFinite, expectSuccessFinite) => {
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
            enabled: false,
            running: false,
            runCount: 0,
            successCount: 0,
            failureCount: 0,
            lastRunAt,
            lastSuccessAt,
            lastError: null,
            lastOutput: null,
          },
        },
      })

      expect(normalized).not.toBeNull()
      if (!normalized) return

      if (expectRunFinite === null) {
        expect(normalized.lastRunAtMs).toBeNull()
      } else {
        expect(normalized.lastRunAtMs).toBeGreaterThan(0)
      }

      if (expectSuccessFinite === null) {
        expect(normalized.lastSuccessAtMs).toBeNull()
      } else {
        expect(normalized.lastSuccessAtMs).toBeGreaterThan(0)
      }
    },
  )

  it.each([
    ['empty error string -> null', '', null],
    ['non-empty error kept', 'rpc timeout', 'rpc timeout'],
    ['empty output string -> null', '', null],
    ['non-empty output kept', 'executed 2', 'executed 2'],
  ])('normalizes string fields: %s', (_, value, expected) => {
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
          running: true,
          runCount: 1,
          successCount: 1,
          failureCount: 0,
          lastRunAt: null,
          lastSuccessAt: null,
          lastError: value,
          lastOutput: value,
        },
      },
    })

    expect(normalized).not.toBeNull()
    if (!normalized) return
    expect(normalized.lastError).toBe(expected)
    expect(normalized.lastOutput).toBe(expected)
  })

  it.each([
    ['invalid relayer', 'not-address', null],
    ['null relayer', null, null],
    ['valid relayer', RELAYER, RELAYER],
  ])('normalizes relayer variants: %s', (_, relayerAddress, expected) => {
    const normalized = normalizeVaultBotStatusResponse({
      walletAddress: VAULT,
      response: {
        ok: true,
        vaultAddress: VAULT,
        relayerAddress,
        runtime: {
          hasBaseRpc: true,
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
          lastError: null,
          lastOutput: null,
        },
      },
    })

    expect(normalized).not.toBeNull()
    expect(normalized?.relayerAddress).toBe(expected)
  })

  it.each([
    ['runtime truthy coercion', 1, 'x', true, true],
    ['runtime falsy coercion', 0, '', false, false],
    ['vault booleans coercion', 1, 0, true, false],
  ])('coerces booleans consistently: %s', (_, hasBaseRpc, hasRelayerKey, expectedRpc, expectedKey) => {
    const normalized = normalizeVaultBotStatusResponse({
      walletAddress: VAULT,
      response: {
        ok: true,
        vaultAddress: VAULT,
        relayerAddress: RELAYER,
        runtime: {
          hasBaseRpc,
          hasRelayerKey,
        },
        vault: {
          enabled: 1,
          running: 0,
          runCount: 0,
          successCount: 0,
          failureCount: 0,
          lastRunAt: null,
          lastSuccessAt: null,
          lastError: null,
          lastOutput: null,
        },
      },
    })

    expect(normalized).not.toBeNull()
    if (!normalized) return
    expect(normalized.hasBaseRpc).toBe(expectedRpc)
    expect(normalized.hasRelayerKey).toBe(expectedKey)
    expect(normalized.serverEnabled).toBe(true)
    expect(normalized.running).toBe(false)
    expect(normalized.onchainExecutorEnabled).toBeNull()
  })
})

describe('buildBotMutationHeaders', () => {
  it('returns default headers when no token is configured', () => {
    delete (globalThis as { window?: unknown }).window

    const headers = buildBotMutationHeaders()
    expect(headers.Accept).toBe('application/json')
    expect(headers['Content-Type']).toBe('application/json')
    expect(headers['x-firewall-bot-token']).toBeUndefined()
  })

  it('uses session storage token before local storage token', () => {
    ;(globalThis as { window?: unknown }).window = {
      sessionStorage: {
        getItem: (key: string) => (key === 'firewall.botApiToken' ? 'session-token' : null),
      },
      localStorage: {
        getItem: (key: string) => (key === 'firewall.botApiToken' ? 'local-token' : null),
      },
    }

    const headers = buildBotMutationHeaders()
    expect(headers['x-firewall-bot-token']).toBe('session-token')
  })

  it('falls back to local storage token when session token is empty', () => {
    ;(globalThis as { window?: unknown }).window = {
      sessionStorage: {
        getItem: () => '',
      },
      localStorage: {
        getItem: (key: string) => (key === 'FIREWALL_BOT_API_TOKEN' ? 'local-fallback-token' : null),
      },
    }

    const headers = buildBotMutationHeaders()
    expect(headers['x-firewall-bot-token']).toBe('local-fallback-token')
  })
})
