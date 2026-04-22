import { describe, expect, it } from 'vitest'
import {
  assertMutationAuthStartupAllowed,
  isAuthorizedMutation,
  isLoopbackHost,
  resolveMutationAuthMode,
} from './queue-bot-server.mjs'

describe('queue-bot-server auth model', () => {
  it('detects loopback hosts correctly', () => {
    expect(isLoopbackHost('127.0.0.1')).toBe(true)
    expect(isLoopbackHost('::1')).toBe(true)
    expect(isLoopbackHost('localhost')).toBe(true)
    expect(isLoopbackHost('0.0.0.0')).toBe(false)
    expect(isLoopbackHost('bot.firewall-wallet.com')).toBe(false)
  })

  it('resolves mutation auth modes from runtime config', () => {
    expect(resolveMutationAuthMode({ apiToken: '', allowUnsafeRemote: false })).toBe('local-only')
    expect(resolveMutationAuthMode({ apiToken: 'token', allowUnsafeRemote: false })).toBe('token')
    expect(resolveMutationAuthMode({ apiToken: '', allowUnsafeRemote: true })).toBe('unsafe-remote')
  })

  it('blocks startup on non-loopback host without token', () => {
    expect(() => {
      assertMutationAuthStartupAllowed({
        host: '0.0.0.0',
        apiToken: '',
        allowUnsafeRemote: false,
      })
    }).toThrow(/without BOT_API_TOKEN/i)
  })

  it('allows startup on non-loopback host with token', () => {
    const mode = assertMutationAuthStartupAllowed({
      host: '0.0.0.0',
      apiToken: 'bot-token',
      allowUnsafeRemote: false,
    })
    expect(mode).toBe('token')
  })

  it('allows startup with unsafe mode when explicitly enabled', () => {
    const mode = assertMutationAuthStartupAllowed({
      host: '0.0.0.0',
      apiToken: '',
      allowUnsafeRemote: true,
    })
    expect(mode).toBe('unsafe-remote')
  })

  it('authorizes localhost mutation in local-only mode', () => {
    const authorized = isAuthorizedMutation({
      req: {
        socket: { remoteAddress: '127.0.0.1' },
        headers: {},
      },
      apiToken: '',
      allowUnsafeRemote: false,
    })

    expect(authorized).toBe(true)
  })

  it('rejects remote mutation in local-only mode', () => {
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
})
