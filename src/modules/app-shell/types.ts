import type { Address, Hash } from 'viem'

export type WalletSelection = {
  ownerAddress: Address
  walletAddress: Address
  basePackId: number | null
}

export type ImportValidationState =
  | {
      kind: 'idle'
      message: string
    }
  | {
      kind: 'checking'
      message: string
    }
  | {
      kind: 'valid_firewall_vault'
      message: string
    }
  | {
      kind: 'not_firewall_vault'
      message: string
    }
  | {
      kind: 'unsupported'
      message: string
    }

export type SendOutcome =
  | {
      kind: 'idle'
      title: string
      body: string
      txHash: Hash | null
    }
  | {
      kind: 'sent_immediately' | 'delayed' | 'blocked' | 'failed'
      title: string
      body: string
      txHash: Hash | null
    }

export type ProtectionRuleView = {
  key: string
  label: string
  contextLabel: 'Included in Base Protection' | 'Enabled as Add-on'
  tooltipLines: string[]
}

export type CreateLineId = 'vault-safe' | 'defi-trader'

export type CreateFlowCompletion = {
  walletAddress: Address
  basePackId: number
  txHash: Hash
}
