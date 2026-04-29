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
      details?: string | null
    }
  | {
      kind: 'checking'
      message: string
      details?: string | null
    }
  | {
      kind: 'valid_firewall_vault'
      message: string
      details?: string | null
    }
  | {
      kind: 'not_firewall_vault'
      message: string
      details?: string | null
    }
  | {
      kind: 'unsupported'
      message: string
      details?: string | null
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
