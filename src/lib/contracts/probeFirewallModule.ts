import type { Address } from 'viem'

function hasViewFunction(abi: unknown, name: string) {
  if (!Array.isArray(abi)) {
    return false
  }

  return abi.some((item) => {
    if (typeof item !== 'object' || item === null) {
      return false
    }
    if (!('type' in item) || item.type !== 'function') {
      return false
    }
    if (!('name' in item) || item.name !== name) {
      return false
    }
    if (!('stateMutability' in item)) {
      return false
    }
    return item.stateMutability === 'view' || item.stateMutability === 'pure'
  })
}

function isAddressLike(value: unknown): value is Address {
  return typeof value === 'string' && value.startsWith('0x') && value.length === 42
}

export async function probeFirewallModule(params: {
  publicClient: { readContract?: Function; getBytecode?: Function; getCode?: Function }
  walletAddress: Address
  abi: any
}): Promise<{
  ok: boolean
  reason?: string
  note?: string
  router?: Address
  owner?: Address
}> {
  const { publicClient, walletAddress, abi } = params

  try {
    const getBytecode = publicClient.getBytecode ?? publicClient.getCode
    if (!getBytecode) {
      return { ok: true, reason: 'No bytecode probe available (non-blocking)' }
    }

    const code = (await getBytecode({ address: walletAddress })) as unknown
    if (!code || code === '0x') {
      return { ok: false, reason: 'No contract code at address' }
    }

    if (!publicClient.readContract) {
      return { ok: true, note: 'Contract code detected' }
    }

    if (hasViewFunction(abi, 'router')) {
      try {
        const router = (await publicClient.readContract({
          address: walletAddress,
          abi,
          functionName: 'router',
        })) as unknown

        if (isAddressLike(router) && router !== '0x0000000000000000000000000000000000000000') {
          return { ok: true, router, note: 'Contract code detected, interface probe: ok' }
        }
      } catch {
        return {
          ok: true,
          reason: 'Contract code detected, interface probe failed (non-blocking)',
        }
      }
    }

    if (hasViewFunction(abi, 'owner')) {
      try {
        const owner = (await publicClient.readContract({
          address: walletAddress,
          abi,
          functionName: 'owner',
        })) as unknown

        if (isAddressLike(owner) && owner !== '0x0000000000000000000000000000000000000000') {
          return { ok: true, owner, note: 'Contract code detected, interface probe: ok' }
        }
      } catch {
        return {
          ok: true,
          reason: 'Contract code detected, interface probe failed (non-blocking)',
        }
      }
    }

    if (hasViewFunction(abi, 'getScheduled')) {
      try {
        await publicClient.readContract({
          address: walletAddress,
          abi,
          functionName: 'getScheduled',
          args: ['0x0000000000000000000000000000000000000000000000000000000000000000'],
        })
        return { ok: true, note: 'Contract code detected, interface probe: ok' }
      } catch {
        return {
          ok: true,
          reason: 'Contract code detected, interface probe failed (non-blocking)',
        }
      }
    }

    return { ok: true, note: 'Contract code detected' }
  } catch {
    return { ok: true, reason: 'Contract code probe unavailable (non-blocking)' }
  }
}
