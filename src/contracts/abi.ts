import { parseAbi, type Abi } from 'viem'

export const firewallFactoryAbi = parseAbi([
  'function createWallet(address owner, address recovery, uint256 basePackId) payable returns (address wallet)',
  'function latestWalletOfOwner(address owner) view returns (address)',
  'function policyPackRegistry() view returns (address)',
  'function entitlementManager() view returns (address)',
  'function BASE_PACK_CONSERVATIVE() view returns (uint256)',
  'function BASE_PACK_DEFI() view returns (uint256)',
  'event WalletCreated(address indexed owner, address indexed wallet, address indexed router, address recovery, uint256 basePackId)',
]) as Abi

export const policyPackRegistryAbi = parseAbi([
  'function isPackActive(uint256 packId) view returns (bool)',
  'function packTypeOf(uint256 packId) view returns (uint8)',
  'function packAccessModeOf(uint256 packId) view returns (uint8)',
  'function packCount() view returns (uint256)',
  'function packIdAt(uint256 index) view returns (uint256)',
  'function getPackMeta(uint256 packId) view returns (bool active, uint8 packType, uint8 packAccessMode, bytes32 metadata, string slug, uint16 version, uint256 policyCount)',
  'function metadataOf(uint256 packId) view returns (bytes32)',
  'function policyCountOf(uint256 packId) view returns (uint256)',
  'function getPackPolicies(uint256 packId) view returns (address[])',
]) as Abi

export const entitlementManagerAbi = parseAbi([
  'function isEntitled(address account, uint256 packId) view returns (bool)',
]) as Abi

export const infiniteApprovalPolicyAbi = parseAbi([
  'function approvalLimit() view returns (uint256)',
  'function allowPermit() view returns (bool)',
]) as Abi

export const largeTransferDelayPolicyAbi = parseAbi([
  'function THRESHOLD_WEI() view returns (uint256)',
  'function thresholdWei() view returns (uint256)',
  'function DELAY_SECONDS() view returns (uint48)',
  'function delaySeconds() view returns (uint48)',
  'function delay() view returns (uint48)',
]) as Abi

export const newReceiverDelayPolicyAbi = parseAbi([
  'function DELAY_SECONDS() view returns (uint48)',
  'function delaySeconds() view returns (uint48)',
  'function delay() view returns (uint48)',
  'function EOA_ONLY() view returns (bool)',
  'function eoaOnly() view returns (bool)',
]) as Abi

export const firewallPolicyAbi = parseAbi([
  'function evaluate(address vault, address to, uint256 value, bytes data) view returns (uint8 decision, uint48 delaySeconds)',
]) as Abi

export const policyIntrospectionAbi = parseAbi([
  'function policyKey() view returns (bytes32)',
  'function policyName() view returns (string)',
  'function policyDescription() view returns (string)',
  'function policyConfigVersion() view returns (uint16)',
  'function policyConfig() view returns ((bytes32 key, uint8 valueType, bytes32 value, bytes32 unit)[] entries)',
]) as Abi
