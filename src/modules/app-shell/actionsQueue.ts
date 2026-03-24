import { parseEther, type Address } from 'viem'
import { isHexAddress } from '../../lib/validation/address'

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const DEFAULT_CHAIN_ID = 8453

export type SendValidationResult =
  | {
      ok: true
      to: Address
      valueWei: bigint
    }
  | {
      ok: false
      message: string
    }

export function validateSendInput(params: {
  recipient: string
  amountEth: string
  walletAddress: Address
  availableBalanceWei: bigint | null
}): SendValidationResult {
  if (!isHexAddress(params.recipient)) {
    return {
      ok: false,
      message: 'Recipient address is invalid.',
    }
  }

  const normalizedRecipient = params.recipient.toLowerCase()
  if (normalizedRecipient === ZERO_ADDRESS) {
    return {
      ok: false,
      message: 'Recipient cannot be the zero address.',
    }
  }

  if (normalizedRecipient === params.walletAddress.toLowerCase()) {
    return {
      ok: false,
      message: 'Recipient cannot be your current Vault address.',
    }
  }

  let valueWei: bigint
  try {
    valueWei = parseEther(params.amountEth)
  } catch {
    return {
      ok: false,
      message: 'Amount is invalid.',
    }
  }

  if (valueWei <= 0n) {
    return {
      ok: false,
      message: 'Amount must be greater than zero.',
    }
  }

  if (params.availableBalanceWei !== null && valueWei > params.availableBalanceWei) {
    return {
      ok: false,
      message: 'Amount exceeds current Vault balance.',
    }
  }

  return {
    ok: true,
    to: params.recipient as Address,
    valueWei,
  }
}

export type ReceiveAmountValidationResult =
  | {
      ok: true
      amountWei: bigint | null
    }
  | {
      ok: false
      message: string
    }

export function validateReceiveAmountInput(amountEth: string): ReceiveAmountValidationResult {
  const normalized = amountEth.trim()
  if (normalized.length === 0) {
    return {
      ok: true,
      amountWei: null,
    }
  }

  let amountWei: bigint
  try {
    amountWei = parseEther(normalized)
  } catch {
    return {
      ok: false,
      message: 'Requested amount is invalid.',
    }
  }

  if (amountWei <= 0n) {
    return {
      ok: false,
      message: 'Requested amount must be greater than zero.',
    }
  }

  return {
    ok: true,
    amountWei,
  }
}

export type ReceiveTransferValidationResult =
  | {
      ok: true
      amountWei: bigint
    }
  | {
      ok: false
      message: string
    }

export function validateReceiveTransferInput(params: {
  amountEth: string
  availableBalanceWei: bigint | null
}): ReceiveTransferValidationResult {
  const amountValidation = validateReceiveAmountInput(params.amountEth)
  if (!amountValidation.ok) {
    return amountValidation
  }

  if (amountValidation.amountWei === null) {
    return {
      ok: false,
      message: 'Enter amount in ETH to send from connected wallet.',
    }
  }

  if (params.availableBalanceWei !== null && amountValidation.amountWei > params.availableBalanceWei) {
    return {
      ok: false,
      message: 'Amount exceeds connected wallet balance.',
    }
  }

  return {
    ok: true,
    amountWei: amountValidation.amountWei,
  }
}

export type ReceiveFeeAffordabilityResult =
  | {
      ok: true
    }
  | {
      ok: false
      maxTransferWei: bigint
    }

export function validateReceiveWithEstimatedFee(params: {
  amountWei: bigint
  balanceWei: bigint
  estimatedFeeWei: bigint | null
}): ReceiveFeeAffordabilityResult {
  if (params.estimatedFeeWei === null) {
    return { ok: true }
  }

  if (params.amountWei + params.estimatedFeeWei > params.balanceWei) {
    const maxTransferWei = params.balanceWei > params.estimatedFeeWei
      ? params.balanceWei - params.estimatedFeeWei
      : 0n

    return {
      ok: false,
      maxTransferWei,
    }
  }

  return { ok: true }
}

export function buildReceiveRequestUri(params: {
  walletAddress: Address
  amountWei: bigint | null
  chainId?: number
}): string {
  const chainId = params.chainId ?? DEFAULT_CHAIN_ID
  const base = `ethereum:${params.walletAddress}@${chainId}`
  if (params.amountWei === null) {
    return base
  }

  return `${base}?value=${params.amountWei.toString()}`
}

export function buildMetaMaskReceiveLink(params: {
  walletAddress: Address
  amountWei: bigint | null
  chainId?: number
}): string {
  const chainId = params.chainId ?? DEFAULT_CHAIN_ID
  const amountQuery = params.amountWei === null ? '' : `?value=${params.amountWei.toString()}`
  return `https://metamask.app.link/send/${params.walletAddress}@${chainId}${amountQuery}`
}

function formatEta(seconds: bigint): string {
  if (seconds <= 0n) {
    return 'now'
  }

  if (seconds < 60n) {
    return `${seconds.toString()}s`
  }

  if (seconds < 3600n) {
    return `${(seconds / 60n).toString()}m`
  }

  if (seconds < 86400n) {
    return `${(seconds / 3600n).toString()}h`
  }

  return `${(seconds / 86400n).toString()}d`
}

export function describeQueueReadiness(params: {
  unlockTime: bigint
  nowSec?: bigint
}): {
  ready: boolean
  status: string
} {
  const nowSec = params.nowSec ?? BigInt(Math.floor(Date.now() / 1000))
  if (params.unlockTime <= nowSec) {
    return {
      ready: true,
      status: 'Ready to execute now.',
    }
  }

  const remaining = params.unlockTime - nowSec
  return {
    ready: false,
    status: `Not unlocked yet. Estimated remaining: ${formatEta(remaining)}.`,
  }
}
