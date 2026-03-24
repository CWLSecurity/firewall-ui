import { describe, expect, it, vi } from 'vitest'
import {
  POLICY_INFINITE_APPROVAL_CONSERVATIVE_ADDRESS,
  POLICY_LARGE_TRANSFER_DELAY_DEFI_ADDRESS,
} from './addresses/base'
import { readPolicyRuntimeDetails } from './policies'

describe('readPolicyRuntimeDetails fallback by known policy address', () => {
  it('returns large-transfer-delay kind when introspection is unavailable for known large transfer address', async () => {
    const publicClient = {
      readContract: vi.fn(async (): Promise<unknown> => {
        throw new Error('execution reverted')
      }),
    }

    const details = await readPolicyRuntimeDetails({
      publicClient: publicClient as never,
      policyAddress: POLICY_LARGE_TRANSFER_DELAY_DEFI_ADDRESS,
    })

    expect(details.kind).toBe('large-transfer-delay')
    expect(details.readError).toBe('Policy details temporarily unavailable.')
    if (details.kind === 'large-transfer-delay') {
      expect(details.ethThresholdWei).toBeNull()
      expect(details.delaySeconds).toBeNull()
    }
  })

  it('returns infinite-approval kind when introspection is unavailable for known approval address', async () => {
    const publicClient = {
      readContract: vi.fn(async (): Promise<unknown> => {
        throw new Error('execution reverted')
      }),
    }

    const details = await readPolicyRuntimeDetails({
      publicClient: publicClient as never,
      policyAddress: POLICY_INFINITE_APPROVAL_CONSERVATIVE_ADDRESS,
    })

    expect(details.kind).toBe('infinite-approval')
    expect(details.readError).toBe('Policy details temporarily unavailable.')
  })

  it('keeps unknown kind for unknown addresses when introspection is unavailable', async () => {
    const publicClient = {
      readContract: vi.fn(async (): Promise<unknown> => {
        throw new Error('execution reverted')
      }),
    }

    const details = await readPolicyRuntimeDetails({
      publicClient: publicClient as never,
      policyAddress: '0x1111111111111111111111111111111111111111',
    })

    expect(details.kind).toBe('unknown')
    expect(details.readError).toBe('Policy details temporarily unavailable.')
  })

  it('keeps fallback kind support for legacy deployed addresses', async () => {
    const publicClient = {
      readContract: vi.fn(async (): Promise<unknown> => {
        throw new Error('execution reverted')
      }),
    }

    const details = await readPolicyRuntimeDetails({
      publicClient: publicClient as never,
      policyAddress: '0x5fd8f3d4c40d3c414351f048ba47264d98d29499',
    })

    expect(details.kind).toBe('infinite-approval')
    expect(details.readError).toBe('Policy details temporarily unavailable.')
  })
})
