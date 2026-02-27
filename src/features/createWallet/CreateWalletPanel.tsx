import { useEffect, useMemo, useState } from 'react'
import { useAccount, useWaitForTransactionReceipt, useWriteContract } from 'wagmi'
import type { Address } from 'viem'
import { CopyButton } from '../../components/CopyButton'
import { shortHash, txUrl } from '../../lib/explorer/base'
import {
  extractCreatedWalletAddressFromReceipt,
  firewallFactoryAbi,
  firewallFactoryConfig,
} from '../../lib/contracts/firewallFactory'
import {
  clearPersistedWallet,
  loadPersistedWallet,
  persistWallet,
} from '../../state/persist'

const CREATE_FUNCTION_CANDIDATES = ['createwallet', 'createaccount', 'deploywallet']

type CreateWalletPanelProps = {
  onWalletStateChange?: () => void
}

function getFactoryFunctionResolution() {
  const functionNames: string[] = []

  for (const entry of firewallFactoryAbi as readonly unknown[]) {
    if (
      typeof entry === 'object' &&
      entry !== null &&
      'type' in entry &&
      entry.type === 'function' &&
      'name' in entry &&
      typeof entry.name === 'string'
    ) {
      functionNames.push(entry.name)
    }
  }

  const candidates = functionNames.filter((name) =>
    CREATE_FUNCTION_CANDIDATES.includes(name.toLowerCase()),
  )

  if (candidates.length === 1) {
    return {
      functionName: candidates[0],
      note: null as string | null,
      functionNames,
    }
  }

  if (candidates.length > 1) {
    return {
      functionName: null,
      note: `Ambiguous create function. Candidates: ${candidates.join(', ')}. ABI functions: ${functionNames.join(', ')}`,
      functionNames,
    }
  }

  return {
    functionName: null,
    note: `No supported create function found. ABI functions: ${functionNames.join(', ')}`,
    functionNames,
  }
}

export function CreateWalletPanel({ onWalletStateChange }: CreateWalletPanelProps) {
  const { address, isConnected } = useAccount()
  const [preset, setPreset] = useState<0 | 1>(0)
  const [createdWalletAddress, setCreatedWalletAddress] = useState<Address | null>(null)
  const [persisted, setPersisted] = useState(() => loadPersistedWallet())

  const { functionName, note: abiResolutionNote } = useMemo(
    () => getFactoryFunctionResolution(),
    [],
  )

  const {
    writeContract,
    data: txHash,
    isPending: isSending,
    error: writeError,
  } = useWriteContract()

  const {
    data: receipt,
    isLoading: isConfirming,
    error: receiptError,
  } = useWaitForTransactionReceipt({
    hash: txHash,
  })

  useEffect(() => {
    if (!receipt) {
      return
    }

    const walletAddress = extractCreatedWalletAddressFromReceipt({
      logs: receipt.logs.map((log) => ({
        address: log.address,
        topics: log.topics,
        data: log.data,
      })),
    })

    if (!walletAddress) {
      return
    }

    setCreatedWalletAddress(walletAddress)
    persistWallet({ walletAddress, preset })
    setPersisted(loadPersistedWallet())
    onWalletStateChange?.()
  }, [onWalletStateChange, receipt, preset])

  const status = useMemo(() => {
    if (abiResolutionNote || writeError || receiptError) {
      return 'error'
    }
    if (isSending) {
      return 'sending'
    }
    if (txHash && isConfirming) {
      return 'confirming'
    }
    if (createdWalletAddress) {
      return 'done'
    }
    return 'idle'
  }, [
    abiResolutionNote,
    writeError,
    receiptError,
    isSending,
    txHash,
    isConfirming,
    createdWalletAddress,
  ])

  return (
    <section>
      <h2>Create Firewall Wallet</h2>

      {persisted.walletAddress ? (
        <div>
          <p>Existing Firewall wallet: {persisted.walletAddress}</p>
          <p>Preset: {persisted.preset ?? 'N/A'}</p>
          <button
            type="button"
            onClick={() => {
              clearPersistedWallet()
              setPersisted(loadPersistedWallet())
              setCreatedWalletAddress(null)
              onWalletStateChange?.()
            }}
          >
            Reset
          </button>
        </div>
      ) : null}

      <fieldset>
        <legend>Preset</legend>
        <label>
          <input
            type="radio"
            name="preset"
            checked={preset === 0}
            onChange={() => setPreset(0)}
          />
          0 Conservative
        </label>
        <label>
          <input
            type="radio"
            name="preset"
            checked={preset === 1}
            onChange={() => setPreset(1)}
          />
          1 DeFi Trader
        </label>
      </fieldset>

      <button
        type="button"
        disabled={!isConnected || !address || !functionName || isSending}
        onClick={() => {
          if (!address || !functionName) {
            return
          }

          writeContract({
            ...firewallFactoryConfig,
            functionName,
            args: [address, address, preset],
          })
        }}
      >
        Create Firewall Wallet
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
        {createdWalletAddress ? (
          <p>
            Created wallet: {createdWalletAddress} <CopyButton value={createdWalletAddress} />
          </p>
        ) : null}
        {abiResolutionNote ? <p>{abiResolutionNote}</p> : null}
        {writeError ? <p>{writeError.message}</p> : null}
        {receiptError ? <p>{receiptError.message}</p> : null}
      </div>
    </section>
  )
}
