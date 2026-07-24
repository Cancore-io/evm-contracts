# Cancore — EVM contract addresses

Registry of deployed contracts from the `evm-contracts` repository.  


**Solidity version (current in repo):** `0.8.33`  
**Optimizer:** enabled, `runs: 200`

---

## Networks (Hardhat)

| Hardhat name      | Chain ID | Network              |
|-------------------|----------|----------------------|
| `ethereum`        | 1        | Ethereum Mainnet     |
| `bnb`             | 56       | BNB Smart Chain      |
| `arbitrum`        | 42161    | Arbitrum One         |
| `sepolia`         | 11155111 | Ethereum Sepolia     |
| `bnbTestnet`      | 97       | BSC Testnet          |
| `arbitrumSepolia` | 421614   | Arbitrum Sepolia     |

---

## HTLC

Contract: `contracts/HTLC.sol`  

### Mainnet

| Network  | Chain ID | HTLC address | Verified | Notes / deployment |
|----------|----------|--------------|----------|--------------------|
| Ethereum | 1        | [`0xB3f8BD762fa2a895Ba8Cd35142b7b82b8b413F76`](https://etherscan.io/address/0xB3f8BD762fa2a895Ba8Cd35142b7b82b8b413F76) |          | Deployment block: `24699416` |
| BNB      | 56       | [`0xB3f8BD762fa2a895Ba8Cd35142b7b82b8b413F76`](https://bscscan.com/address/0xB3f8BD762fa2a895Ba8Cd35142b7b82b8b413F76) |          | Deployment block: `87710517` |
| Arbitrum | 42161    | [`0x1794fe17eB780619FAD46BAf80F7628F7495378b`](https://arbiscan.io/address/0x1794fe17eB780619FAD46BAf80F7628F7495378b) |          | Deployment block: `443810007` |

### Testnet

| Network          | Chain ID | HTLC address | Verified | Notes / deployment |
|------------------|----------|--------------|----------|--------------------|
| Sepolia          | 11155111 | [`0xc705C735278AEeF773acb6d1028D8A241D8a9556`](https://sepolia.etherscan.io/address/0xc705C735278AEeF773acb6d1028D8A241D8a9556) |          | Deployment block: `10334457` |
| BNB Testnet      | 97       | [`0x36D7BEBDB5f93b7b926D621E412132dF89628810`](https://testnet.bscscan.com/address/0x36D7BEBDB5f93b7b926D621E412132dF89628810) |          | Deployment block: `92435953` |
| Arbitrum Sepolia | 421614   | [`0x07a6ccF1f0113e2329Bb2460b28eC0d169f5080E`](https://sepolia.arbiscan.io/address/0x07a6ccF1f0113e2329Bb2460b28eC0d169f5080E) |          | Deployment block: `245190705` |

### Devnet

| Network          | Chain ID | HTLC address | Verified | Notes / deployment |
|------------------|----------|--------------|----------|--------------------|
| Sepolia          | 11155111 | [`0xc74469B26206A7b3Aee2781EC21F9F47a1552DD6`](https://sepolia.etherscan.io/address/0xc74469B26206A7b3Aee2781EC21F9F47a1552DD6) |          | Deployment block: `10469876` |
| BNB Testnet      | 97       | [`0xC649d578FD0122E2Ce3Bcf6b89E3ef2564d1a30D`](https://testnet.bscscan.com/address/0xC649d578FD0122E2Ce3Bcf6b89E3ef2564d1a30D) |          | Deployment block: `96439032` |
| Arbitrum Sepolia | 421614   | [`0xE23A046Df3542C4C548162adab4397956b136031`](https://sepolia.arbiscan.io/address/0xE23A046Df3542C4C548162adab4397956b136031) |          | Deployment block: `251260393` |

---

## MultiBalanceChecker

Contract: `contracts/utils/MultiBalanceChecker.sol`  

### Mainnet

| Network  | Chain ID | MultiBalanceChecker address | Verified | Notes / deployment |
|----------|----------|----------------------------|----------|--------------------|
| Ethereum | 1        | [`0xe025CcCDf82F4165633C6033B7F13690B16c8a84`](https://etherscan.io/address/0xe025CcCDf82F4165633C6033B7F13690B16c8a84) |          |                    |
| BNB      | 56       | [`0xe025CcCDf82F4165633C6033B7F13690B16c8a84`](https://bscscan.com/address/0xe025CcCDf82F4165633C6033B7F13690B16c8a84) |          |                    |
| Arbitrum | 42161    | [`0x9ed2e0220e8d069C515972AE369C3FCE3bB29239`](https://arbiscan.io/address/0x9ed2e0220e8d069C515972AE369C3FCE3bB29239) |          |                    |

### Testnet

| Network          | Chain ID | MultiBalanceChecker address | Verified | Notes / deployment |
|------------------|----------|----------------------------|----------|--------------------|
| Sepolia          | 11155111 | [`0x99182E3F18555CFB08e6443e68a11982eF686522`](https://sepolia.etherscan.io/address/0x99182E3F18555CFB08e6443e68a11982eF686522) |          |                    |
| BNB Testnet      | 97       | [`0x079bDc94B34EC0e905DcfDB516bdE2f292Efcef2`](https://testnet.bscscan.com/address/0x079bDc94B34EC0e905DcfDB516bdE2f292Efcef2) |          |                    |
| Arbitrum Sepolia | 421614   | [`0x555Bef5d2f89Fc81c77b930AB6c0D6734bDE569e`](https://sepolia.arbiscan.io/address/0x555Bef5d2f89Fc81c77b930AB6c0D6734bDE569e) |          |                    |

---

## FeeVault

Contract: `contracts/FeeVault.sol`  

Partner fee-refund voucher vault (`Ownable2Step`, `Pausable`, EIP-712). Owner-only: `setSigner` / `pause` / `cancelVoucher` / `sweep`. Wire it up by setting it as the HTLC `feeRecipient` (`npx hardhat setFeeRecipient`), then granting the backend voucher signer (`npx hardhat setFeeVaultSigner`).

### Mainnet

Deployed 2026-07-24. Ownership is 2-step: intended owner (`pendingOwner`) = `0x15bA460148eBc7c5E979f6877a442Ec2860a4fb8`; until it calls `acceptOwnership()`, the deployer `0x6A8FAA37e4c7d8211032b4a76cD10DC3E2E26DD6` remains owner.

| Network  | Chain ID | FeeVault address | Verified | Notes / deployment |
|----------|----------|------------------|----------|--------------------|
| Ethereum | 1        | [`0x122f2486EdC660858918E1b5408c47eB4784b6cb`](https://etherscan.io/address/0x122f2486EdC660858918E1b5408c47eB4784b6cb) |          | Deploy block: `25602415`. Pending owner `0x15bA46…4fb8` |
| BNB      | 56       | [`0x73e9b976CBDac8a6BFE1aa606603732243b32800`](https://bscscan.com/address/0x73e9b976CBDac8a6BFE1aa606603732243b32800) |          | Deploy block: `111854438`. Pending owner `0x15bA46…4fb8` |
| Arbitrum | 42161    | [`0x12268f8FA9B50cD0ae56556c1B60A5F1FD0dd3CF`](https://arbiscan.io/address/0x12268f8FA9B50cD0ae56556c1B60A5F1FD0dd3CF) |          | Pending owner `0x15bA46…4fb8` |

### Devnet

| Network          | Chain ID | FeeVault address | Verified | Notes / deployment |
|------------------|----------|------------------|----------|--------------------|
| Sepolia          | 11155111 | [`0xD5a7561bA04E53C86bec03503EccA25dcDeF6Ec4`](https://sepolia.etherscan.io/address/0xD5a7561bA04E53C86bec03503EccA25dcDeF6Ec4) |          | Owner: deployer `0xDED3d9C3Aa8c88a06ac13125ad2c0570354C798F` (2-step; hand to multisig before mainnet) |
| BNB Testnet      | 97       | [`0xF833A980ae858fe3cD14a79a9f610525AbB95BF9`](https://testnet.bscscan.com/address/0xF833A980ae858fe3cD14a79a9f610525AbB95BF9) |          | Owner: deployer `0xDED3d9C3Aa8c88a06ac13125ad2c0570354C798F` |
| Arbitrum Sepolia | 421614   | [`0xFC8ad2761Aa2aa072D608c676A6517296BeDd30d`](https://sepolia.arbiscan.io/address/0xFC8ad2761Aa2aa072D608c676A6517296BeDd30d) |          | Owner: deployer `0xDED3d9C3Aa8c88a06ac13125ad2c0570354C798F` |

---

## Reference: Permit2 (Uniswap)

| Network  | Chain ID | Permit2 (reference)                          |
|----------|----------|----------------------------------------------|
| Ethereum | 1        | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |
| BNB      | 56       | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |
| Arbitrum | 42161    | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |

---