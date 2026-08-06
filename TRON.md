# Deploying HTLC to Tron (TVM)

CAN-633. Tron runs the EVM `HTLC.sol` **unchanged** — no port, no re-audit.

## Why reuse HTLC.sol as-is

- `lock` / `claim` / `retake` are plain Solidity. `claim` hashes with `sha256(preImage)`
  and timelocks on `block.timestamp` (unix) — byte-identical to the EVM and Canton legs,
  so the same pre-image / hashLock settles all three. Atomicity is preserved.
- `lockWithPermit2` (Uniswap Permit2) and `lockWithPermit` (EIP-2612) are **dead on Tron**
  — there is no canonical Permit2 contract and TRC-20 has no EIP-2612 — but harmless: each
  reverts if called, and the Tron backend uses the plain `lock()` path only.

## Build

TVM does not implement the Shanghai `PUSH0` opcode, so compile with `evmVersion: "paris"`
(set `solidity.settings.evmVersion` in `hardhat.config.ts` for the Tron artifact, or use a
dedicated compile). The rest of the toolchain is unchanged.

## Deploy

Prereqs (operator-provided — the deploy cannot run without them):

- A funded **Nile testnet** account key. The deployer becomes the HTLC `owner` and initial
  `feeRecipient` (same as on EVM) — use the intended ops key, not a throwaway.
- A TronGrid / Nile `fullHost` (e.g. `https://nile.trongrid.io`).

Deploy the paris-compiled `HTLC` bytecode with TronBox or a `tronweb` script
(`tronWeb.contract().new({ abi, bytecode, feeLimit })`). No constructor args.

> TronBox ships its own solc fork; if it lacks 0.8.33, deploy the Hardhat-compiled (paris)
> artifact via `tronweb` instead — the bytecode stays TVM-compatible.

Post-deploy, wire the Nile HTLC address into:

- frontend `src/config/contracts.ts` (Phase 4),
- backend network config (Phase 2 leg) + indexer (Phase 3).

Then mirror the EVM fee setup if fees are enabled: `setFeeRecipient` → FeeVault, `setFeeRate`.
