# Deploying the contracts to Tron (TVM)

CAN-633. Tron runs the EVM contracts **unchanged** — no port, no re-audit. `HTLC`,
`MultiBalanceChecker` and `FeeVault` are all TVM-compatible as-is.

## Why they reuse as-is

- **HTLC** — `lock` / `claim` / `retake` are plain Solidity. `claim` hashes with
  `sha256(preImage)` and timelocks on `block.timestamp` (unix), byte-identical to the EVM
  and Canton legs, so the same pre-image / hashLock settles all three. `lockWithPermit2`
  (Permit2) and `lockWithPermit` (EIP-2612) are dead-but-harmless on Tron (no canonical
  Permit2, TRC-20 has no EIP-2612); the backend uses the plain `lock()` path only.
- **MultiBalanceChecker** — a `view` batch reader (`IERC20.balanceOf` / native `.balance`
  = TRX). No state, no owner, no constructor.
- **FeeVault** — `ECDSA.recover` uses the `ecrecover` precompile (Tron supports it);
  `Ownable2Step` / `Pausable` / `SafeERC20` are standard. Zero-arg constructor, deployer =
  owner. On Nile (`--owner` gate is mainnet-only) leaving the deployer as owner is fine.
  > ⚠ **EIP-712 chainId.** The domain separator is built from `block.chainid`. The backend
  > must sign `FeeClaim` vouchers with the Tron chainId (**Nile `3448148188`**) and the
  > deployed vault address — otherwise `redeem` reverts `InvalidSigner`. If a correct signer
  > still fails, Tron's `block.chainid` is the first suspect.

## Build

TVM lacks the Shanghai+ opcodes solc emits by default (`PUSH0`, `MCOPY`, transient storage),
so the Tron build pins `evmVersion: "paris"`. This lives in a **separate**
`hardhat.tron.config.ts` writing to `artifacts-tron/` — the default EVM build and its
`bytecode:check` / `gas:check` references stay untouched.

```bash
npm run compile:tron   # hardhat compile --config hardhat.tron.config.ts -> artifacts-tron/
```

## Deploy

One generic TronWeb deployer (`scripts/deploy/deployTron.ts`, `TRON_CONTRACT=<name>`) — not
ethers, since Tron txns use a protobuf format Hardhat cannot broadcast. The `nile` network
in the Tron config exposes the EVM-compat JSON-RPC (`https://nile.trongrid.io/jsonrpc`,
chainId `3448148188`) for reads / the indexer only. All three constructors take no args.

Env (`.env`):

| Var | Purpose | Default |
|-----|---------|---------|
| `TRON_PRIVATE_KEY` | Deployer key — **becomes `owner` (HTLC, FeeVault)**, use the ops key | (required) |
| `TRON_FULL_HOST` | TronWeb node (full HTTP API, not `/jsonrpc`) | `https://nile.trongrid.io` |
| `TRON_FEE_LIMIT_SUN` | Max energy burn for the deploy tx | `5000000000` (5000 TRX) |
| `TRON_JSONRPC_URL` | EVM-compat read endpoint for the `nile` hardhat network | `https://nile.trongrid.io/jsonrpc` |

```bash
npm run deploy:tron:htlc       # HTLC
npm run deploy:tron:mbc        # MultiBalanceChecker
npm run deploy:tron:feevault   # FeeVault
```

Each prints the deployed `base58` + `hex` address. The deployer needs Nile TRX + energy
(faucet: <https://nileex.io/join/getJoinPage>).

## Deployed — Nile testnet

| Contract | base58 | hex |
|----------|--------|-----|
| HTLC | `TSSUEMbs4debLa9KXyZEDAezjFdv1S8iRi` | `0xb4a9f4cd0be60114346c52ca794864762d01b569` |
| MultiBalanceChecker | `TYbSumvgenG5E17hMF2nUpjof1pNm1X2Gt` | `0xf82d5a39342fd3a5a91388cd95f5f102d162a24d` |
| FeeVault | `TKRwqH5wAucAFooAWtH7Qw2g38HjR4TWsE` | `0x67c7b36d139b84ef4d826ea53cc08e722ce8fef5` |

Deployer / owner (HTLC + FeeVault): `TDsnUF1kEnhywLpcBMNG75b4jpgmJdGNpb`. Transfer FeeVault
ownership to a multisig before enabling fees on mainnet.

Post-deploy, wire the HTLC (and MultiBalanceChecker) addresses into:

- frontend `src/config/contracts.ts` (Phase 4),
- backend network config (Phase 2 leg) + indexer (Phase 3).

FeeVault is only needed once fees are enabled: `setFeeRecipient` → FeeVault, `setFeeRate`,
`setFeeVaultSigner`, then hand ownership to a multisig.
