import { describe, expect, it } from 'vitest'
import {
  buildMetaMaskReceiveLink,
  buildReceiveRequestUri,
  describeQueueReadiness,
  validateReceiveAmountInput,
  validateReceiveWithEstimatedFee,
  validateReceiveTransferInput,
  validateSendInput,
} from './actionsQueue'

const VAULT = '0x2222222222222222222222222222222222222222' as const

describe('validateSendInput', () => {
  it('rejects invalid recipient', () => {
    const result = validateSendInput({
      recipient: 'bad-address',
      amountEth: '0.1',
      walletAddress: VAULT,
      availableBalanceWei: 10n ** 18n,
    })

    expect(result).toEqual({
      ok: false,
      message: 'Recipient address is invalid.',
    })
  })

  it('rejects zero address recipient', () => {
    const result = validateSendInput({
      recipient: '0x0000000000000000000000000000000000000000',
      amountEth: '0.1',
      walletAddress: VAULT,
      availableBalanceWei: 10n ** 18n,
    })

    expect(result).toEqual({
      ok: false,
      message: 'Recipient cannot be the zero address.',
    })
  })

  it('rejects sending to vault itself', () => {
    const result = validateSendInput({
      recipient: VAULT,
      amountEth: '0.1',
      walletAddress: VAULT,
      availableBalanceWei: 10n ** 18n,
    })

    expect(result).toEqual({
      ok: false,
      message: 'Recipient cannot be your current Vault address.',
    })
  })

  it('rejects invalid amount', () => {
    const result = validateSendInput({
      recipient: '0x3333333333333333333333333333333333333333',
      amountEth: 'x',
      walletAddress: VAULT,
      availableBalanceWei: 10n ** 18n,
    })

    expect(result).toEqual({
      ok: false,
      message: 'Amount is invalid.',
    })
  })

  it('rejects amount above available balance', () => {
    const result = validateSendInput({
      recipient: '0x3333333333333333333333333333333333333333',
      amountEth: '2',
      walletAddress: VAULT,
      availableBalanceWei: 10n ** 18n,
    })

    expect(result).toEqual({
      ok: false,
      message: 'Amount exceeds current Vault balance.',
    })
  })

  it('accepts valid input', () => {
    const result = validateSendInput({
      recipient: '0x3333333333333333333333333333333333333333',
      amountEth: '1',
      walletAddress: VAULT,
      availableBalanceWei: 2n * 10n ** 18n,
    })

    expect(result).toEqual({
      ok: true,
      to: '0x3333333333333333333333333333333333333333',
      valueWei: 10n ** 18n,
    })
  })
})

describe('describeQueueReadiness', () => {
  it('returns ready when unlock time is reached', () => {
    const state = describeQueueReadiness({
      unlockTime: 100n,
      nowSec: 100n,
    })

    expect(state).toEqual({
      ready: true,
      status: 'Ready to execute now.',
    })
  })

  it('returns eta when unlock time is in the future', () => {
    const state = describeQueueReadiness({
      unlockTime: 220n,
      nowSec: 100n,
    })

    expect(state).toEqual({
      ready: false,
      status: 'Not unlocked yet. Estimated remaining: 2m.',
    })
  })
})

describe('validateReceiveAmountInput', () => {
  it('accepts empty amount as optional request', () => {
    const result = validateReceiveAmountInput('')

    expect(result).toEqual({
      ok: true,
      amountWei: null,
    })
  })

  it('rejects invalid amount', () => {
    const result = validateReceiveAmountInput('abc')

    expect(result).toEqual({
      ok: false,
      message: 'Requested amount is invalid.',
    })
  })

  it('rejects zero amount', () => {
    const result = validateReceiveAmountInput('0')

    expect(result).toEqual({
      ok: false,
      message: 'Requested amount must be greater than zero.',
    })
  })

  it('parses valid amount', () => {
    const result = validateReceiveAmountInput('0.015')

    expect(result).toEqual({
      ok: true,
      amountWei: 15000000000000000n,
    })
  })
})

describe('buildReceiveRequestUri', () => {
  it('returns base request for optional amount', () => {
    const uri = buildReceiveRequestUri({
      walletAddress: VAULT,
      amountWei: null,
    })

    expect(uri).toBe(`ethereum:${VAULT}@8453`)
  })

  it('returns request with wei amount', () => {
    const uri = buildReceiveRequestUri({
      walletAddress: VAULT,
      amountWei: 20000000000000000n,
    })

    expect(uri).toBe(`ethereum:${VAULT}@8453?value=20000000000000000`)
  })
})

describe('buildMetaMaskReceiveLink', () => {
  it('returns metamask deep link with amount', () => {
    const link = buildMetaMaskReceiveLink({
      walletAddress: VAULT,
      amountWei: 15000000000000000n,
    })

    expect(link).toBe(`https://metamask.app.link/send/${VAULT}@8453?value=15000000000000000`)
  })
})

describe('validateReceiveTransferInput', () => {
  it('requires amount for direct transfer', () => {
    const result = validateReceiveTransferInput({
      amountEth: '',
      availableBalanceWei: 10n ** 18n,
    })

    expect(result).toEqual({
      ok: false,
      message: 'Enter amount in ETH to send from connected wallet.',
    })
  })

  it('rejects amount above connected balance', () => {
    const result = validateReceiveTransferInput({
      amountEth: '2',
      availableBalanceWei: 10n ** 18n,
    })

    expect(result).toEqual({
      ok: false,
      message: 'Amount exceeds connected wallet balance.',
    })
  })

  it('accepts transfer within balance', () => {
    const result = validateReceiveTransferInput({
      amountEth: '0.5',
      availableBalanceWei: 10n ** 18n,
    })

    expect(result).toEqual({
      ok: true,
      amountWei: 500000000000000000n,
    })
  })
})

describe('validateReceiveWithEstimatedFee', () => {
  it('passes when fee is unknown', () => {
    const result = validateReceiveWithEstimatedFee({
      amountWei: 10n ** 18n,
      balanceWei: 10n ** 18n,
      estimatedFeeWei: null,
    })

    expect(result).toEqual({ ok: true })
  })

  it('fails when amount plus fee exceeds balance', () => {
    const result = validateReceiveWithEstimatedFee({
      amountWei: 10n ** 18n,
      balanceWei: 10n ** 18n,
      estimatedFeeWei: 21000000000000n,
    })

    expect(result).toEqual({
      ok: false,
      maxTransferWei: 999979000000000000n,
    })
  })

  it('passes when amount plus fee fits balance', () => {
    const result = validateReceiveWithEstimatedFee({
      amountWei: 900000000000000000n,
      balanceWei: 10n ** 18n,
      estimatedFeeWei: 21000000000000n,
    })

    expect(result).toEqual({ ok: true })
  })
})
