import type { Address } from 'viem'
import firewallModuleAbiJson from '../abis/FirewallModule.json'

export const firewallModuleAbi = firewallModuleAbiJson

export function getFirewallModuleConfig(walletAddress: Address) {
  return { address: walletAddress, abi: firewallModuleAbi } as const
}
