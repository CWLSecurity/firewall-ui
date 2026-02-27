import { parseEventLogs, type Address, type Hash } from 'viem'
import factoryAbiJson from '../abis/FirewallFactory.json'
import { FACTORY_ADDRESS } from '../addresses/base'

export const firewallFactoryAbi = factoryAbiJson
export const firewallFactoryAddress = FACTORY_ADDRESS
export const firewallFactoryConfig = {
  address: firewallFactoryAddress,
  abi: firewallFactoryAbi,
} as const

function isAddressLike(value: unknown): value is Address {
  return (
    typeof value === 'string' &&
    value.startsWith('0x') &&
    /^0x[a-fA-F0-9]{40}$/.test(value)
  )
}

export function extractCreatedWalletAddressFromReceipt(params: {
  logs: readonly {
    address: Address
    topics: readonly `0x${string}`[]
    data: `0x${string}`
  }[]
}): Address | null {
  const factoryLogs = params.logs.filter(
    (log) => log.address.toLowerCase() === firewallFactoryAddress.toLowerCase(),
  )

  if (factoryLogs.length === 0) {
    return null
  }

  const parsedLogs = parseEventLogs({
    abi: firewallFactoryAbi,
    logs: factoryLogs as unknown as never[],
    strict: false,
  })

  for (const parsedLog of parsedLogs as Array<{
    topics: readonly Hash[]
    args?: Record<string, unknown>
  }>) {
    const _topic0: Hash | undefined = parsedLog.topics[0]
    void _topic0

    if (!parsedLog.args || typeof parsedLog.args !== 'object') {
      continue
    }

    for (const [key, value] of Object.entries(parsedLog.args)) {
      const keyLower = key.toLowerCase()
      if ((keyLower.includes('wallet') || keyLower.includes('account')) && isAddressLike(value)) {
        return value
      }
    }
  }

  return null
}
