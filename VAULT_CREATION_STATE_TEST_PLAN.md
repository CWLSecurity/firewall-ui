# Vault Creation State Regression Checklist

Last updated: 2026-03-23

Purpose: verify no local create-flow interaction can simulate vault creation.

State ownership notes (current architecture):
- Create-flow local flags are owned by `useAppShellState`:
  - `createIntentStarted`
  - `txRequestStarted`
  - `txHashReceived`
  - `awaitingConfirmation`
- Vault readiness gating is derived in `useGlobalSiteStatus`.

## Preconditions
- Connect an EOA on Base Mainnet with no existing Firewall Vault in the current discovery window.
- Start from the default app state where "Create or Import Vault" is visible.

## Case 1: Profile Draft Change Without Create Action
1. Click `Create Vault`.
2. Switch profile draft (for example to DeFi Trader).
3. Do not click `Create Protected Vault (1 tx)`.
4. Close the modal.

Expected:
- App remains in pre-create state.
- No tx hash is shown in create/import card.
- `Protected Vault`, `Queue`, `Actions`, and active protections do not appear.

## Case 2: Open/Close Modal Without Any Create Intent
1. Click `Create Vault`.
2. Close the modal.

Expected:
- App remains in pre-create state.
- No create-pending message appears.
- No Vault-ready sections render.

## Case 3: Draft Field Edits Must Not Start Create Flow
1. Click `Create Vault`.
2. Edit recovery address and profile draft.
3. Keep interaction inside modal only; do not submit create action.
4. Close modal.

Expected:
- `createIntentStarted`, `txRequestStarted`, `txHashReceived`, and `awaitingConfirmation` stay effectively false/empty (no pending UI indicators).
- State remains not created.

## Case 4: Wallet Rejection Must Not Leave Pending/Create State
1. Click `Create Vault`.
2. Click `Create Protected Vault (1 tx)`.
3. Reject in wallet before submission (no tx hash created).

Expected:
- Error is shown.
- App returns to true pre-create state.
- No pending confirmation/detection state remains.
- No Vault-ready sections render.

## Case 5: Real Submission But Not Yet Runtime-Detected
1. Submit a real create transaction and let it confirm.
2. Return to main UI before runtime detection resolves.

Expected:
- Waiting/detection message may appear with tx hash.
- Vault-ready panels are still hidden.
- Create/import actions remain disabled until runtime detection resolves.

## Case 6: Only Runtime Confirmation Enables Vault-Ready
1. After Case 5, trigger refresh and wait for chain/manual detection.

Expected:
- Only after detected runtime vault exists: `Protected Vault`, active protections, queue, and actions render.

## Case 7: Disconnect Vault Must Not Auto-Reconnect
1. Start from a connected wallet with an active selected Vault.
2. Click `Disconnect Vault`.
3. Wait for background refresh cycle and trigger manual refresh.

Expected:
- Vault remains disconnected in UI.
- `Protected Vault` area does not reappear automatically.
- Vault can reappear only after explicit `Create Vault` or successful `Import Existing Vault`.
