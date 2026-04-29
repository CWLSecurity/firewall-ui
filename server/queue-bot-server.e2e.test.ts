import { describe, expect, it } from 'vitest'
import { privateKeyToAccount } from 'viem/accounts'
import {
  assertMutationAuthStartupAllowed,
  buildWalletMutationMessage,
  isAuthorizedMutation,
  isLoopbackHost,
  resolveMutationAuthMode,
  verifyWalletMutationAuth,
} from './queue-bot-server.mjs'

const OWNER_PRIVATE_KEY = `0x${'1'.padStart(64, '0')}`
const OWNER = privateKeyToAccount(OWNER_PRIVATE_KEY)
const VAULT = '0x22AEd5CCDE7cFc7a7DaeA2E02662B52db5C404fa'

describe('queue-bot-server auth model', () => {
  it('detects loopback hosts correctly', () => {
    expect(isLoopbackHost('127.0.0.1')).toBe(true)
    expect(isLoopbackHost('::1')).toBe(true)
    expect(isLoopbackHost('localhost')).toBe(true)
    expect(isLoopbackHost('0.0.0.0')).toBe(false)
    expect(isLoopbackHost('bot.firewall-wallet.com')).toBe(false)
  })

  it('resolves mutation auth modes from runtime config', () => {
    expect(resolveMutationAuthMode({ apiToken: '', allowUnsafeRemote: false })).toBe('wallet')
    expect(resolveMutationAuthMode({ apiToken: 'token', allowUnsafeRemote: false })).toBe('token+wallet')
    expect(resolveMutationAuthMode({ apiToken: '', allowUnsafeRemote: true })).toBe('unsafe-remote')
  })

  it('blocks startup without token or wallet auth RPC', () => {
    expect(() => {
      assertMutationAuthStartupAllowed({
        host: '0.0.0.0',
        apiToken: '',
        allowUnsafeRemote: false,
        baseRpcUrl: '',
      })
    }).toThrow(/without BOT_API_TOKEN or BASE_RPC_URL/i)
  })

  it('allows startup with token fallback', () => {
    const mode = assertMutationAuthStartupAllowed({
      host: '0.0.0.0',
      apiToken: 'bot-token',
      allowUnsafeRemote: false,
      baseRpcUrl: '',
    })
    expect(mode).toBe('token+wallet')
  })

  it('allows startup with wallet auth RPC and no shared token', () => {
    const mode = assertMutationAuthStartupAllowed({
      host: '0.0.0.0',
      apiToken: '',
      allowUnsafeRemote: false,
      baseRpcUrl: 'https://mainnet.base.org',
    })
    expect(mode).toBe('wallet')
  })

  it('allows startup with unsafe mode when explicitly enabled', () => {
    const mode = assertMutationAuthStartupAllowed({
      host: '0.0.0.0',
      apiToken: '',
      allowUnsafeRemote: true,
      baseRpcUrl: '',
    })
    expect(mode).toBe('unsafe-remote')
  })

  it('does not authorize localhost mutation without token', () => {
    const authorized = isAuthorizedMutation({
      req: {
        socket: { remoteAddress: '127.0.0.1' },
        headers: {},
      },
      apiToken: '',
      allowUnsafeRemote: false,
    })

    expect(authorized).toBe(false)
  })

  it('rejects remote mutation without token', () => {
    const authorized = isAuthorizedMutation({
      req: {
        socket: { remoteAddress: '203.0.113.11' },
        headers: {},
      },
      apiToken: '',
      allowUnsafeRemote: false,
    })

    expect(authorized).toBe(false)
  })

  it('requires exact token header in token mode', () => {
    const authorized = isAuthorizedMutation({
      req: {
        socket: { remoteAddress: '203.0.113.11' },
        headers: { 'x-firewall-bot-token': 'bot-token' },
      },
      apiToken: 'bot-token',
      allowUnsafeRemote: false,
    })

    const denied = isAuthorizedMutation({
      req: {
        socket: { remoteAddress: '127.0.0.1' },
        headers: { 'x-firewall-bot-token': 'wrong-token' },
      },
      apiToken: 'bot-token',
      allowUnsafeRemote: false,
    })

    expect(authorized).toBe(true)
    expect(denied).toBe(false)
  })

  it('allows remote mutation only when unsafe mode is explicitly enabled', () => {
    const authorized = isAuthorizedMutation({
      req: {
        socket: { remoteAddress: '203.0.113.11' },
        headers: {},
      },
      apiToken: '',
      allowUnsafeRemote: true,
    })

    expect(authorized).toBe(true)
  })

  it('verifies wallet mutation authorization for the vault owner', async () => {
    const issuedAt = '2026-04-29T10:00:00.000Z'
    const expiresAt = '2026-04-29T10:02:00.000Z'
    const message = buildWalletMutationMessage({
      vaultAddress: VAULT,
      ownerAddress: OWNER.address,
      action: 'enable',
      issuedAt,
      expiresAt,
    })
    const signature = await OWNER.signMessage({ message })

    const result = await verifyWalletMutationAuth({
      body: {
        auth: {
          scheme: 'wallet-v1',
          ownerAddress: OWNER.address,
          issuedAt,
          expiresAt,
          signature,
        },
      },
      runtime: { baseRpcUrl: 'https://example.invalid' },
      vaultAddress: VAULT,
      action: 'enable',
      nowMs: Date.parse('2026-04-29T10:01:00.000Z'),
      readVaultOwnerFn: async () => OWNER.address.toLowerCase(),
    })

    expect(result.ok).toBe(true)
  })

  it('rejects wallet mutation authorization from a non-owner signer', async () => {
    const issuedAt = '2026-04-29T10:00:00.000Z'
    const expiresAt = '2026-04-29T10:02:00.000Z'
    const message = buildWalletMutationMessage({
      vaultAddress: VAULT,
      ownerAddress: OWNER.address,
      action: 'disable',
      issuedAt,
      expiresAt,
    })
    const signature = await OWNER.signMessage({ message })

    const result = await verifyWalletMutationAuth({
      body: {
        auth: {
          scheme: 'wallet-v1',
          ownerAddress: OWNER.address,
          issuedAt,
          expiresAt,
          signature,
        },
      },
      runtime: { baseRpcUrl: 'https://example.invalid' },
      vaultAddress: VAULT,
      action: 'disable',
      nowMs: Date.parse('2026-04-29T10:01:00.000Z'),
      readVaultOwnerFn: async () => '0x0000000000000000000000000000000000000002',
    })

    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/not the Vault owner/i)
  })
})
