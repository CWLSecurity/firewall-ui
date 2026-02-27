import { formatEther, type Address } from 'viem'

export type ScheduledTx = {
  txId: `0x${string}`
  exists: boolean
  executed: boolean
  to: Address
  value: bigint
  unlockTime: bigint
  dataHash: `0x${string}`
}

export function formatEth(valueWei: bigint): string {
  return formatEther(valueWei)
}
