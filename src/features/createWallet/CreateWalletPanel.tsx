import { useEffect, useMemo, useState } from 'react'
import {
  useAccount,
  useChainId,
  useConnect,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi'
import type { Address } from 'viem'
import { CopyButton } from '../../components/CopyButton'
import { BASE_CHAIN_ID } from '../../lib/chains/base'
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
type ConnectionState = 'disconnected' | 'connected_wrong_network' | 'connected_base_ready'

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
  const chainId = useChainId()
  const [preset, setPreset] = useState<0 | 1>(0)
  const [createdWalletAddress, setCreatedWalletAddress] = useState<Address | null>(null)
  const [persisted, setPersisted] = useState(() => loadPersistedWallet())
  const [flowHint, setFlowHint] = useState<string | null>(null)
  const [createIntentActive, setCreateIntentActive] = useState(false)

  const { functionName, note: abiResolutionNote } = useMemo(
    () => getFactoryFunctionResolution(),
    [],
  )
  const connectionState: ConnectionState = !isConnected
    ? 'disconnected'
    : chainId === BASE_CHAIN_ID
      ? 'connected_base_ready'
      : 'connected_wrong_network'
  const {
    connectAsync,
    connectors,
    isPending: isConnectPending,
    error: connectError,
  } = useConnect()
  const {
    switchChainAsync,
    isPending: isSwitching,
    error: switchError,
  } = useSwitchChain()
  const injectedConnector =
    connectors.find((connector) => connector.id === 'injected') ?? connectors[0]

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
    setCreateIntentActive(false)
    setFlowHint('Firewall Wallet created successfully.')
    persistWallet({ walletAddress, preset })
    setPersisted(loadPersistedWallet())
    onWalletStateChange?.()
  }, [onWalletStateChange, receipt, preset])

  useEffect(() => {
    if (!createIntentActive) {
      return
    }
    if (connectionState === 'disconnected') {
      return
    }
    if (connectionState === 'connected_wrong_network') {
      setFlowHint('Step 1 complete: Wallet connected. Step 2 required: Switch to Base.')
      return
    }
    setFlowHint(
      'Step 1 complete: Wallet connected on Base. Step 2 required: Confirm Create Firewall Wallet.',
    )
  }, [connectionState, createIntentActive])

  useEffect(() => {
    if (!txHash) {
      return
    }
    setCreateIntentActive(false)
    setFlowHint('Transaction submitted. Waiting for confirmation...')
  }, [txHash])

  const status = useMemo(() => {
    if (abiResolutionNote) {
      return 'Error: create function not found in ABI.'
    }
    if (isConnectPending && connectionState === 'disconnected') {
      return 'Connecting wallet...'
    }
    if (connectionState === 'connected_wrong_network') {
      return 'Wrong network. Switch to Base.'
    }
    if (isSending) {
      return 'Creating Firewall Wallet...'
    }
    if (txHash && isConfirming) {
      return 'Waiting for confirmation...'
    }
    if (createdWalletAddress) {
      return `Firewall Wallet created: ${createdWalletAddress}`
    }
    if (connectionState === 'connected_base_ready') {
      if (createIntentActive) {
        return 'Ready for confirmation: Confirm Create Firewall Wallet'
      }
      return 'Ready to create Firewall Wallet'
    }
    return 'Connect wallet to create Firewall Wallet'
  }, [
    connectionState,
    abiResolutionNote,
    isConnectPending,
    isSending,
    txHash,
    isConfirming,
    createdWalletAddress,
  ])
  const actionError = writeError ?? receiptError ?? connectError ?? switchError

  async function handleCreateClick() {
    if (!functionName) {
      return
    }

    if (connectionState === 'disconnected') {
      if (!injectedConnector) {
        setFlowHint('No injected wallet connector found.')
        return
      }
      setCreateIntentActive(true)
      setFlowHint('Connecting wallet...')
      try {
        await connectAsync({ connector: injectedConnector, chainId: BASE_CHAIN_ID })
      } catch {
        setCreateIntentActive(false)
        setFlowHint('Wallet connection was rejected. Click Create Firewall Wallet to try again.')
      }
      return
    }

    if (connectionState === 'connected_wrong_network') {
      setCreateIntentActive(true)
      setFlowHint('Wrong network. Switch to Base.')
      return
    }

    if (!address) {
      return
    }

    setCreateIntentActive(true)
    setFlowHint('Creating Firewall Wallet...')
    writeContract({
      ...firewallFactoryConfig,
      functionName,
      args: [address, address, preset],
    })
  }

  async function handleSwitchToBase() {
    if (!switchChainAsync) {
      setFlowHint('Switch to Base (chainId 8453) in your wallet and continue.')
      return
    }
    setCreateIntentActive(true)
    setFlowHint('Switching wallet network to Base...')
    try {
      await switchChainAsync({ chainId: BASE_CHAIN_ID })
      setFlowHint('Base network ready. Confirm Create Firewall Wallet.')
    } catch {
      setFlowHint('Network switch was rejected. Click Switch to Base to continue.')
      return
    }
  }

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
        disabled={
          !functionName ||
          isSending ||
          isConfirming ||
          connectionState === 'connected_wrong_network' ||
          isSwitching ||
          (connectionState === 'disconnected' && (!injectedConnector || isConnectPending))
        }
        onClick={() => {
          void handleCreateClick()
        }}
      >
        {isConnectPending && connectionState === 'disconnected'
          ? 'Connecting wallet...'
          : isSending
            ? 'Creating Firewall Wallet...'
            : createIntentActive && connectionState === 'connected_base_ready'
              ? 'Confirm Create Firewall Wallet'
              : 'Create Firewall Wallet'}
      </button>
      {connectionState === 'connected_wrong_network' ? (
        <p>
          <button type="button" disabled={isSwitching} onClick={() => void handleSwitchToBase()}>
            {isSwitching ? 'Switching...' : 'Switch to Base'}
          </button>
        </p>
      ) : null}

      <div>
        <p>Status: {status}</p>
        <p>Connection state: {connectionState}</p>
        {createIntentActive && connectionState === 'connected_base_ready' ? (
          <p>Step 1 complete: Wallet connected on Base. Step 2 required: Confirm Create Firewall Wallet.</p>
        ) : null}
        {flowHint ? <p>{flowHint}</p> : null}
        {txHash ? <p>Transaction submitted: {shortHash(txHash)}</p> : null}
        {txHash && isConfirming ? <p>Waiting for confirmation...</p> : null}
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
            Firewall Wallet created: {createdWalletAddress}{' '}
            <CopyButton value={createdWalletAddress} />
          </p>
        ) : null}
        {createdWalletAddress ? <p>Preset: {preset}</p> : null}
        {abiResolutionNote ? <p>{abiResolutionNote}</p> : null}
        {actionError ? <p>{actionError.message}</p> : null}
      </div>
    </section>
  )
}
