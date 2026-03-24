import { describe, expect, it } from 'vitest'
import { wagmiConfig } from './config'

describe('wagmiConfig privacy defaults', () => {
  it('disables browser persistence for connection state', () => {
    expect(wagmiConfig.storage).toBeNull()
  })
})
