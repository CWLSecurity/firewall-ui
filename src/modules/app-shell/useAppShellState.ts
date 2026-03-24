import { useCallback, useEffect, useRef, useState } from 'react'
import type { Address, Hash } from 'viem'
import { logCreateFlowDebug } from '../debug/createFlowDebug'
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

  const logTransition = useCallback((params: {
    key: string
    previous: unknown
    next: unknown
    trigger: string
    source: string
  }) => {
    logCreateFlowDebug('state_transition', params)
  }, [])

  const updateManualWalletByOwner = useCallback((next: WalletSelection | null, trigger: string) => {
    setManualWalletByOwner((previous) => {
      if (previous !== next) {
        logTransition({
          key: 'manualWalletByOwner',
          previous,
          next,
          trigger,
          source: 'src/modules/app-shell/useAppShellState.ts::updateManualWalletByOwner',
        })
      }
      return next
    })
  }, [logTransition])

  const updateVaultDisconnectedByOwner = useCallback((next: Address | null, trigger: string) => {
    setVaultDisconnectedByOwner((previous) => {
      if (previous !== next) {
        logTransition({
          key: 'vaultDisconnectedByOwner',
          previous,
          next,
          trigger,
          source: 'src/modules/app-shell/useAppShellState.ts::updateVaultDisconnectedByOwner',
        })
      }
      return next
    })
  }, [logTransition])

  const updateShowImportPanel = useCallback((next: boolean, trigger: string) => {
    setShowImportPanel((previous) => {
      if (previous !== next) {
        logTransition({
          key: 'showImportPanel',
          previous,
          next,
          trigger,
          source: 'src/modules/app-shell/useAppShellState.ts::updateShowImportPanel',
        })
      }
      return next
    })
  }, [logTransition])

  const updateCreateModalOpen = useCallback((next: boolean, trigger: string) => {
    setCreateModalOpen((previous) => {
      if (previous !== next) {
        logTransition({
          key: 'createModalOpen',
          previous,
          next,
          trigger,
          source: 'src/modules/app-shell/useAppShellState.ts::updateCreateModalOpen',
        })
      }
      return next
    })
  }, [logTransition])

  const updateCreateSessionAutoAdoptBlocked = useCallback((next: boolean, trigger: string) => {
    setCreateSessionAutoAdoptBlocked((previous) => {
      if (previous !== next) {
        logTransition({
          key: 'createSessionAutoAdoptBlocked',
          previous,
          next,
          trigger,
          source: 'src/modules/app-shell/useAppShellState.ts::updateCreateSessionAutoAdoptBlocked',
        })
      }
      return next
    })
  }, [logTransition])

  const updateSelectedProfileDraft = useCallback((next: CreateLineId, trigger: string) => {
    setSelectedProfileDraft((previous) => {
      if (previous !== next) {
        logTransition({
          key: 'selectedProfileDraft',
          previous,
          next,
          trigger,
          source: 'src/modules/app-shell/useAppShellState.ts::updateSelectedProfileDraft',
        })
      }
      return next
    })
  }, [logTransition])

  const updateSelectedAddOnsDraft = useCallback((next: number[], trigger: string) => {
    setSelectedAddOnsDraft((previous) => {
      if (!numberArrayEquals(previous, next)) {
        logTransition({
          key: 'selectedAddOnsDraft',
          previous,
          next,
          trigger,
          source: 'src/modules/app-shell/useAppShellState.ts::updateSelectedAddOnsDraft',
        })
      }
      return next
    })
  }, [logTransition])

  const updateCreateIntentStarted = useCallback((next: boolean, trigger: string) => {
    setCreateIntentStarted((previous) => {
      if (previous !== next) {
        logTransition({
          key: 'createIntentStarted',
          previous,
          next,
          trigger,
          source: 'src/modules/app-shell/useAppShellState.ts::updateCreateIntentStarted',
        })
      }
      return next
    })
  }, [logTransition])

  const updateTxRequestStarted = useCallback((next: boolean, trigger: string) => {
    setTxRequestStarted((previous) => {
      if (previous !== next) {
        logTransition({
          key: 'txRequestStarted',
          previous,
          next,
          trigger,
          source: 'src/modules/app-shell/useAppShellState.ts::updateTxRequestStarted',
        })
      }
      return next
    })
  }, [logTransition])

  const updateTxHashReceived = useCallback((next: Hash | null, trigger: string) => {
    setTxHashReceived((previous) => {
      if (previous !== next) {
        logTransition({
          key: 'txHashReceived',
          previous,
          next,
          trigger,
          source: 'src/modules/app-shell/useAppShellState.ts::updateTxHashReceived',
        })
      }
      return next
    })
  }, [logTransition])

  const updateAwaitingConfirmation = useCallback((next: boolean, trigger: string) => {
    setAwaitingConfirmation((previous) => {
      if (previous !== next) {
        logTransition({
          key: 'awaitingConfirmation',
          previous,
          next,
          trigger,
          source: 'src/modules/app-shell/useAppShellState.ts::updateAwaitingConfirmation',
        })
      }
      return next
    })
  }, [logTransition])

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

    logCreateFlowDebug('handler_run', {
      handler: 'on_modal_close',
      trigger: 'useAppShellState.closeCreateModal',
      source: 'src/modules/app-shell/useAppShellState.ts::closeCreateModal',
      preserveSubmissionState: params?.preserveSubmissionState ?? false,
      txHashReceivedAtClose: txHashReceivedRef.current,
    })

    updateCreateModalOpen(false, trigger)
    updateCreateSessionAutoAdoptBlocked(false, trigger)
    if (!params?.preserveSubmissionState && !txHashReceivedRef.current) {
      resetCreateFlowToDraftState(`${trigger}_without_tx_hash`)
    }
  }, [resetCreateFlowToDraftState, updateCreateModalOpen, updateCreateSessionAutoAdoptBlocked])

  const markCreateFlowFailed = useCallback((trigger: string) => {
    logCreateFlowDebug('handler_run', {
      handler: 'create_flow_failed',
      trigger,
      source: 'src/modules/app-shell/useAppShellState.ts::markCreateFlowFailed',
    })
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
