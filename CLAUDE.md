EVM-контракты — Solidity смарт-контракты HTLC для атомарных свопов на EVM-совместимых блокчейнах.

## Команды

```bash
npm install
npx hardhat compile            # компиляция
npx hardhat test               # тесты (42 теста)
npm run deploy:sepolia         # деплой HTLC на Sepolia
npm run deploy:tokens          # деплой тестовых ERC20 токенов
npm run slither                # статический анализ безопасности
npm run security               # slither + тесты
```

## Контракты

- **HTLC.sol** — основной контракт: lock/claim/retake ERC20 токенов с hash-lock и timelock
  - Поддержка Permit2 (gasless approval) и EIP-2612 permit
  - Fee collection (basis points)
  - CEI pattern для reentrancy protection
  - Custom errors вместо require strings
- **FeeVault.sol** — хранит собранные комиссии и платит возвраты партнёрам по подписанным бэкендом EIP-712 ваучерам
  - Ставится как `HTLC.feeRecipient` → держит только комиссии, не principal свопов
  - `redeem(FeeClaim, sig)` — pull-модель: партнёр редимит сам и платит газ, бэкенд транзакций не шлёт
  - Домен `CancoreFeeVault/1`, тип `FeeClaim(address token,address to,uint256 amount,uint256 nonce,uint256 deadline)` — должен совпадать с бэкендом byte-for-byte
  - Защита от повтора: EIP-712 домен (сеть+vault) + одноразовый `usedNonces` + `deadline`; `setSigner(x,false)` — kill-switch на утёкший ключ
- **MultiBalanceChecker.sol** — batch-запрос балансов ERC20/native для массива адресов
- **TestToken.sol**, **TestTokenWithPermit.sol** — тестовые ERC20
- **MockPermit2.sol** — мок для тестов

## Сети

| Сеть | HTLC | MultiBalanceChecker |
|------|------|---------------------|
| Ethereum | 0xB3f8BD762fa2a895Ba8Cd35142b7b82b8b413F76 | 0xe025CcCDf82F4165633C6033B7F13690B16c8a84 |
| BNB | 0xB3f8BD762fa2a895Ba8Cd35142b7b82b8b413F76 | 0xe025CcCDf82F4165633C6033B7F13690B16c8a84 |
| Arbitrum | 0x1794fe17eB780619FAD46BAf80F7628F7495378b | 0x9ed2e0220e8d069C515972AE369C3FCE3bB29239 |
| Sepolia | 0xc705C735278AEeF773acb6d1028D8A241D8a9556 | 0x99182E3F18555CFB08e6443e68a11982eF686522 |
| BNB Testnet | 0x36D7BEBDB5f93b7b926D621E412132dF89628810 | 0x079bDc94B34EC0e905DcfDB516bdE2f292Efcef2 |
| Arbitrum Sepolia | 0x07a6ccF1f0113e2329Bb2460b28eC0d169f5080E | 0x555Bef5d2f89Fc81c77b930AB6c0D6734bDE569e |

## Hardhat tasks

```bash
npx hardhat setFeeRecipient --htlc <addr> --recipient <addr> --network <net>
npx hardhat setFeeRate --htlc <addr> --rate <bps> --network <net>
npx hardhat setPermit2 --htlc <addr> --permit2 <addr> --network <net>
npx hardhat deployMultiBalanceChecker --network <net>
npx hardhat deployFeeVault --network <net>
npx hardhat setFeeVaultSigner --vault <addr> --signer <addr> [--revoke] --network <net>
```

### Развёртывание FeeVault (порядок важен)

```bash
npx hardhat deployFeeVault --network <net>                                  # 1. деплой
npx hardhat setFeeRecipient --htlc <htlc> --recipient <vault> --network <net>  # 2. комиссии текут в vault
npx hardhat setFeeVaultSigner --vault <vault> --signer <backendKey> --network <net>  # 3. без этого redeem невозможен
```

Затем на бэкенде: `<NET>_FEE_VAULT_ADDRESS=<vault>` и приватный ключ подписанта в Vault
(`<NET>_FEE_VAULT_SIGNER_KEY`). Без этих двух рельс возврата выключен.

## Стек

Solidity 0.8.33, Hardhat, OpenZeppelin 4.8, TypeChain, Slither.
