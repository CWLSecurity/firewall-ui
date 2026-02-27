import { useMemo, useState } from 'react'
import { parseEther, type Address } from 'viem'
import { useAccount, useWaitForTransactionReceipt, useWriteContract } from 'wagmi'
import { CopyButton } from '../../components/CopyButton'
import { shortHash, txUrl } from '../../lib/explorer/base'
import { getFirewallModuleConfig } from '../../lib/contracts/firewallModule'
import { loadPersistedWallet } from '../../state/persist'

const EXECUTE_NOW_FUNCTION_NAME = 'executeNow'

function isBasicAddress(value: string): value is Address {
  return /^0x[a-fA-F0-9]{40}$/.test(value)
}

export function SendEthPanel() {
  const { isConnected } = useAccount()
  const { walletAddress } = loadPersistedWallet()
  const [recipient, setRecipient] = useState('')
  const [amountEth, setAmountEth] = useState('')
  const [formError, setFormError] = useState<string | null>(null)

  const {
    writeContract,
    data: txHash,
    isPending: isSending,
    error: writeError,
  } = useWriteContract()
  const { isLoading: isConfirming, isSuccess, error: receiptError } =
    useWaitForTransactionReceipt({ hash: txHash })

  const status = useMemo(() => {
    if (formError || writeError || receiptError) {
      return 'error'
    }
    if (isSending) {
      return 'sending'
    }
    if (txHash && isConfirming) {
      return 'confirming'
    }
    if (isSuccess) {
      return 'done'
    }
    return 'idle'
  }, [formError, isConfirming, isSending, isSuccess, receiptError, txHash, writeError])

  if (!walletAddress || !isConnected) {
    return null
  }

  return (
    <section>
      <h2>Send ETH</h2>

      <label>
        Recipient
        <input
          type="text"
          value={recipient}
          onChange={(event) => setRecipient(event.target.value)}
          placeholder="0x..."
        />
      </label>
      {recipient ? <CopyButton value={recipient} label="Copy Recipient" /> : null}

      <label>
        Amount (ETH)
        <input
          type="text"
          value={amountEth}
          onChange={(event) => setAmountEth(event.target.value)}
          placeholder="0.00001"
        />
      </label>

      <button
        type="button"
        disabled={isSending}
        onClick={() => {
          setFormError(null)

          if (!isBasicAddress(recipient)) {
            setFormError('Invalid recipient address.')
            return
          }

          let value: bigint
          try {
            value = parseEther(amountEth)
          } catch {
            setFormError('Invalid ETH amount.')
            return
          }

          if (value <= 0n) {
            setFormError('Amount must be greater than 0.')
            return
          }

          writeContract({
            ...getFirewallModuleConfig(walletAddress),
            functionName: EXECUTE_NOW_FUNCTION_NAME,
            args: [recipient, value, '0x'],
          })
        }}
      >
        Send ETH
      </button>

      <div>
        <p>Status: {status}</p>
        {txHash ? (
          <p>
            Tx hash:{' '}
            <a href={txUrl(txHash)} target="_blank" rel="noreferrer">
              {shortHash(txHash)}
            </a>{' '}
            <CopyButton value={txHash} />
          </p>
        ) : null}
        {formError ? <p>{formError}</p> : null}
        {writeError ? <p>{writeError.message}</p> : null}
        {receiptError ? <p>{receiptError.message}</p> : null}
      </div>
    </section>
  )
}
