import { describe, expect, it } from 'vitest'
import { shouldBlockAutoAdoptDetectedVault } from './useGlobalSiteStatus'

describe('shouldBlockAutoAdoptDetectedVault', () => {
  const owner = '0x1111111111111111111111111111111111111111'
  const anotherOwner = '0x2222222222222222222222222222222222222222'

  it('blocks auto-adopt when vault was disconnected for the same owner', () => {
    const result = shouldBlockAutoAdoptDetectedVault({
      walletSource: 'chain',
      ownerAddress: owner,
      vaultDisconnectedByOwner: owner.toUpperCase() as `0x${string}`,
      createSessionAutoAdoptBlocked: false,
      createModalOpen: false,
      txHashReceived: null,
    })

    expect(result).toBe(true)
  })

  it('does not block on disconnect marker from another owner', () => {
    const result = shouldBlockAutoAdoptDetectedVault({
      walletSource: 'chain',
      ownerAddress: owner,
      vaultDisconnectedByOwner: anotherOwner,
      createSessionAutoAdoptBlocked: false,
      createModalOpen: false,
      txHashReceived: null,
    })

    expect(result).toBe(false)
  })

  it('blocks when source is manual and disconnect marker is set for the same owner', () => {
    const result = shouldBlockAutoAdoptDetectedVault({
      walletSource: 'manual',
      ownerAddress: owner,
      vaultDisconnectedByOwner: owner,
      createSessionAutoAdoptBlocked: false,
      createModalOpen: false,
      txHashReceived: null,
    })

    expect(result).toBe(true)
  })

  it('does not block when wallet source is empty', () => {
    const result = shouldBlockAutoAdoptDetectedVault({
      walletSource: null,
      ownerAddress: owner,
      vaultDisconnectedByOwner: owner,
      createSessionAutoAdoptBlocked: false,
      createModalOpen: false,
      txHashReceived: null,
    })

    expect(result).toBe(false)
  })
})
