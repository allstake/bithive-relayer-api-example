# BitHive Relayer API Examples

Stake and unstake BTC with BitHive Relayer API.

Find more details about BitHive Bitcoin staking protocol in the [docs](https://docs.bithive.fi/introduction/bitcoin-staking).

## Install

```bash
pnpm install
```

## Run Examples

### Prerequisites

Add your Bitcoin private key to the `.env` file with `BITCOIN_WIF_PRIVATE_KEY` variable. Use `.env.example` as a reference.

The default network is `testnet4`. You can change it to any other network supported by BitHive (e.g. `signet` and `testnet`).

```bash
cp .env.example .env
```

### Stake 0.00005 BTC

Example code: [stake.ts](./src/example/stake.ts)

```bash
pnpm start stake
```

### Stake and Unstake 0.00005 BTC

Example code: [unstake.ts](./src/example/unstake.ts)

```bash
pnpm start unstake
```

### Stake and unstake 0.00005 BTC with a custom fee

Example code: [fee.ts](./src/example/fee.ts)

```bash
pnpm start fee
```

### Stake and unstake 0.00005 BTC with more readable code

Example code: [staker.ts](./src/example/staker.ts)

```bash
pnpm start staker
```
