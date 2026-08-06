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

TVM lacks the Shanghai+ opcodes solc emits by default (`PUSH0`, `MCOPY`, transient storage),
so the Tron build pins `evmVersion: "paris"`. This lives in a **separate**
`hardhat.tron.config.ts` writing to `artifacts-tron/` — the default EVM build and its
`bytecode:check` / `gas:check` references stay untouched.

```bash
npm run compile:tron   # hardhat compile --config hardhat.tron.config.ts -> artifacts-tron/
```

## Deploy

Deploy is via **TronWeb** (`scripts/deploy/deployHTLCTron.ts`), not ethers — Tron
transactions use a protobuf format, not Ethereum RLP, so Hardhat/ethers cannot broadcast
them. The `nile` network in the Tron config exposes the EVM-compat JSON-RPC
(`https://nile.trongrid.io/jsonrpc`, chainId `3448148188`) for reads / the indexer only.

Env (`.env`):

| Var | Purpose | Default |
|-----|---------|---------|
| `TRON_PRIVATE_KEY` | Deployer key — **becomes HTLC `owner` + `feeRecipient`**, use the ops key | (required) |
| `TRON_FULL_HOST` | TronWeb node (full HTTP API, not `/jsonrpc`) | `https://nile.trongrid.io` |
| `TRON_FEE_LIMIT_SUN` | Max energy burn for the deploy tx | `5000000000` (5000 TRX) |
| `TRON_JSONRPC_URL` | EVM-compat read endpoint for the `nile` hardhat network | `https://nile.trongrid.io/jsonrpc` |

```bash
npm run deploy:tron:nile   # compiles (paris) + deploys HTLC via TronWeb, prints base58 + hex
```

The deployer needs Nile TRX + energy (faucet: <https://nileex.io/join/getJoinPage>).
`HTLC()` takes no constructor args.

Post-deploy, wire the printed HTLC address into:

- frontend `src/config/contracts.ts` (Phase 4),
- backend network config (Phase 2 leg) + indexer (Phase 3).

Then mirror the EVM fee setup if fees are enabled: `setFeeRecipient` → FeeVault, `setFeeRate`.
