import { useCallback, useEffect, useRef, useState } from 'react'
import type { Address, Hash } from 'viem'
import { numberArrayEquals } from './helpers'
import type { CreateLineId, WalletSelection } from './types'

export function useAppShellState() {
  const [manualWalletByOwner, setManualWalletByOwner] = useState<WalletSelection | null>(null)
  const [vaultDisconnectedByOwner, setVaultDisconnectedByOwner] = useState<Address | null>(null)
  const [showImportPanel, setShowImportPanel] = useState(false)
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [createSessionAutoAdoptBlocked, setCreateSessionAutoAdoptBlocked] = useState(false)
  const [selectedProfileDraft, setSelectedProfileDraft] = useState<CreateLineId>('vault-safe')
  const [selectedAddOnsDraft, setSelectedAddOnsDraft] = useState<number[]>([])
  const [createIntentStarted, setCreateIntentStarted] = useState(false)
  const [txRequestStarted, setTxRequestStarted] = useState(false)
  const [txHashReceived, setTxHashReceived] = useState<Hash | null>(null)
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false)
  const [isProtectionModalOpen, setIsProtectionModalOpen] = useState(false)
  const [isQueueModalOpen, setIsQueueModalOpen] = useState(false)
  const [isReceiveModalOpen, setIsReceiveModalOpen] = useState(false)
  const [isSendModalOpen, setIsSendModalOpen] = useState(false)

  const txHashReceivedRef = useRef<Hash | null>(txHashReceived)

  useEffect(() => {
    txHashReceivedRef.current = txHashReceived
  }, [txHashReceived])

  const updateManualWalletByOwner = useCallback((next: WalletSelection | null, trigger: string) => {
    void trigger
    setManualWalletByOwner((previous) => (previous === next ? previous : next))
  }, [])

  const updateVaultDisconnectedByOwner = useCallback((next: Address | null, trigger: string) => {
    void trigger
    setVaultDisconnectedByOwner((previous) => (previous === next ? previous : next))
  }, [])

  const updateShowImportPanel = useCallback((next: boolean, trigger: string) => {
    void trigger
    setShowImportPanel((previous) => (previous === next ? previous : next))
  }, [])

  const updateCreateModalOpen = useCallback((next: boolean, trigger: string) => {
    void trigger
    setCreateModalOpen((previous) => (previous === next ? previous : next))
  }, [])

  const updateCreateSessionAutoAdoptBlocked = useCallback((next: boolean, trigger: string) => {
    void trigger
    setCreateSessionAutoAdoptBlocked((previous) => (previous === next ? previous : next))
  }, [])

  const updateSelectedProfileDraft = useCallback((next: CreateLineId, trigger: string) => {
    void trigger
    setSelectedProfileDraft((previous) => (previous === next ? previous : next))
  }, [])

  const updateSelectedAddOnsDraft = useCallback((next: number[], trigger: string) => {
    void trigger
    setSelectedAddOnsDraft((previous) => (numberArrayEquals(previous, next) ? previous : next))
  }, [])

  const updateCreateIntentStarted = useCallback((next: boolean, trigger: string) => {
    void trigger
    setCreateIntentStarted((previous) => (previous === next ? previous : next))
  }, [])

  const updateTxRequestStarted = useCallback((next: boolean, trigger: string) => {
    void trigger
    setTxRequestStarted((previous) => (previous === next ? previous : next))
  }, [])

  const updateTxHashReceived = useCallback((next: Hash | null, trigger: string) => {
    void trigger
    setTxHashReceived((previous) => (previous === next ? previous : next))
  }, [])

  const updateAwaitingConfirmation = useCallback((next: boolean, trigger: string) => {
    void trigger
    setAwaitingConfirmation((previous) => (previous === next ? previous : next))
  }, [])

  const resetCreateFlowToDraftState = useCallback((trigger: string) => {
    updateSelectedProfileDraft('vault-safe', trigger)
    updateSelectedAddOnsDraft([], trigger)
    updateCreateIntentStarted(false, trigger)
    updateTxRequestStarted(false, trigger)
    updateTxHashReceived(null, trigger)
    updateAwaitingConfirmation(false, trigger)
  }, [
    updateAwaitingConfirmation,
    updateCreateIntentStarted,
    updateSelectedAddOnsDraft,
    updateSelectedProfileDraft,
    updateTxHashReceived,
    updateTxRequestStarted,
  ])

  const closeCreateModal = useCallback((params?: { preserveSubmissionState?: boolean; trigger?: string }) => {
    const trigger = params?.trigger ?? 'modal_close'

    updateCreateModalOpen(false, trigger)
    updateCreateSessionAutoAdoptBlocked(false, trigger)
    if (!params?.preserveSubmissionState && !txHashReceivedRef.current) {
      resetCreateFlowToDraftState(`${trigger}_without_tx_hash`)
    }
  }, [resetCreateFlowToDraftState, updateCreateModalOpen, updateCreateSessionAutoAdoptBlocked])

  const markCreateFlowFailed = useCallback((trigger: string) => {
    updateCreateIntentStarted(false, trigger)
    updateTxRequestStarted(false, trigger)
    updateTxHashReceived(null, trigger)
    updateAwaitingConfirmation(false, trigger)
  }, [updateAwaitingConfirmation, updateCreateIntentStarted, updateTxHashReceived, updateTxRequestStarted])

  return {
    manualWalletByOwner,
    vaultDisconnectedByOwner,
    showImportPanel,
    createModalOpen,
    createSessionAutoAdoptBlocked,
    selectedProfileDraft,
    selectedAddOnsDraft,
    createIntentStarted,
    txRequestStarted,
    txHashReceived,
    awaitingConfirmation,
    isProtectionModalOpen,
    isQueueModalOpen,
    isReceiveModalOpen,
    isSendModalOpen,
    txHashReceivedRef,
    updateManualWalletByOwner,
    updateVaultDisconnectedByOwner,
    updateShowImportPanel,
    updateCreateModalOpen,
    updateCreateSessionAutoAdoptBlocked,
    updateSelectedProfileDraft,
    updateSelectedAddOnsDraft,
    updateCreateIntentStarted,
    updateTxRequestStarted,
    updateTxHashReceived,
    updateAwaitingConfirmation,
    setIsProtectionModalOpen,
    setIsQueueModalOpen,
    setIsReceiveModalOpen,
    setIsSendModalOpen,
    resetCreateFlowToDraftState,
    closeCreateModal,
    markCreateFlowFailed,
  }
}
