import { describe, expect, it } from 'vitest'
import { isProviderNotFoundError, orderConnectorsByProviderPriority } from './modules/wallet/connectors'

describe('orderConnectorsByProviderPriority', () => {
  it('prefers specific injected connectors over generic injected id', () => {
    const ordered = orderConnectorsByProviderPriority([
      { id: 'injected' },
      { id: 'io.metamask' },
      { id: 'com.brave' },
    ])

    expect(ordered.map((item) => item.id)).toEqual(['io.metamask', 'com.brave', 'injected'])
  })
})

describe('isProviderNotFoundError', () => {
  it('detects ProviderNotFoundError by name', () => {
    expect(isProviderNotFoundError({ name: 'ProviderNotFoundError' })).toBe(true)
  })

  it('detects provider-not-found by message text', () => {
    expect(isProviderNotFoundError({ message: 'Provider not found.' })).toBe(true)
    expect(isProviderNotFoundError({ shortMessage: 'Provider not found.' })).toBe(true)
  })

  it('does not match unrelated errors', () => {
    expect(isProviderNotFoundError({ message: 'User rejected request' })).toBe(false)
    expect(isProviderNotFoundError(null)).toBe(false)
  })
})
