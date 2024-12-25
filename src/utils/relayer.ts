import { createRelayerClient } from '@bithive/relayer-api';
import { config } from './config';
import { BitcoinProvider } from './signer';
import { sleep } from './helper';

// Create a relayer client
export const relayer = createRelayerClient({ url: config.relayerRpcUrl });

/**
 * Stake BTC to BitHive
 * @param provider BTC provider with `signPsbt` interface
 * @param publicKey User public key (compressed)
 * @param address User address. Supported Address Types:
 * - Native Segwit (P2WPKH)
 * - Nested Segwit (P2SH-P2WPKH)
 * - Taproot       (P2TR)
 * - Legacy        (P2PKH)
 * @param amount Bitcoin amount (in sats) that is within the valid scope. e.g. between 0.00005 and 0.01 BTC. 5000 means 0.00005 BTC
 * @param options Optional: specify the fee (in sats) or fee rate (in sat/vB) for the staking transaction. If not specified, the fee will be calculated automatically.
 * @returns Staking tx hash
 */
export async function stake(
  provider: BitcoinProvider,
  publicKey: string,
  address: string,
  amount: number,
  options?: {
    fee?: number;
    feeRate?: number;
  },
) {
  if (provider.signPsbt) {
    // 1. Build the PSBT that is ready for signing
    const { psbt: unsignedPsbt } = await relayer.deposit.buildUnsignedPsbt({
      publicKey,
      address,
      amount,
      ...options,
    });

    // 2. Sign and finalize the PSBT with wallet
    const signedPsbt = provider.signPsbt(unsignedPsbt);

    // 3. Submit the finalized PSBT for broadcasting and relaying
    const { txHash } = await relayer.deposit.submitFinalizedPsbt({
      psbt: signedPsbt,
      publicKey,
    });

    return txHash;
  } else {
    throw Error('signPsbt is not supported');
  }
}

/**
 * Unstake BTC from BitHive
 * @param provider BTC provider with `signMessage` interface
 * @param publicKey User public key (compressed)
 * @param depositTxHash Deposit tx hash
 * @returns Unstaking tx hash
 */
export async function unstake(
  provider: BitcoinProvider,
  publicKey: string,
  depositTxHash: string,
) {
  const { deposit } = await relayer.user.getDeposit({
    publicKey,
    txHash: depositTxHash,
  });
  if (!deposit) {
    throw Error(`The specified deposit (${depositTxHash}) is not found`);
  }
  if (
    !['DepositConfirmed', 'DepositConfirmedInvalid'].includes(deposit.status)
  ) {
    throw Error(
      `The specified deposit (${depositTxHash}) with status (${deposit.status}) is not ready to unstake`,
    );
  }

  if (provider.signMessage) {
    // 1. Build the unstaking message that is ready for signing
    const { message } = await relayer.unstake.buildUnsignedMessage({
      deposits: [
        {
          txHash: deposit.depositTxHash,
          vout: deposit.depositVout,
        },
      ],
      publicKey,
    });

    // 2. Sign the unstaking message with wallet
    const signature = provider.signMessage(message);

    // 3. Submit the unstaking signature and relay to BitHive contract on NEAR
    await relayer.unstake.submitSignature({
      deposits: [
        {
          txHash: deposit.depositTxHash,
          vout: deposit.depositVout,
        },
      ],
      publicKey,
      signature: Buffer.from(signature, 'base64').toString('hex'),
    });
  } else {
    throw Error('signMessage is not supported');
  }
}

/**
 * Withdraw BTC from BitHive
 * @param provider BTC provider with `signPsbt` interface
 * @param publicKey User public key (compressed)
 * @param address Recipient address (can be different with user address)
 * @param depositTxHash Deposit tx hash
 * @param options Optional: specify the fee (in sats) or fee rate (in sat/vB) for the withdrawal transaction. If not specified, the fee will be calculated automatically.
 * @returns Withdrawal tx hash
 */
export async function withdraw(
  provider: BitcoinProvider,
  publicKey: string,
  address: string,
  depositTxHash: string,
  options?: {
    fee?: number;
    feeRate?: number;
  },
) {
  // Get the deposit by public key and deposit tx hash
  const { deposit } = await relayer.user.getDeposit({
    publicKey,
    txHash: depositTxHash,
  });
  if (!deposit) {
    throw Error(`The specified deposit (${depositTxHash}) is not found`);
  }
  if (!['UnstakeConfirmed', 'ChainSignProcessing'].includes(deposit.status)) {
    throw Error(
      `The specified deposit (${depositTxHash}) with status (${deposit.status}) is not ready to withdraw`,
    );
  }
  const withdrawableDeposits = [deposit];

  // Get the account info by public key
  const { account } = await relayer.user.getAccount({
    publicKey,
  });

  let partiallySignedPsbt: string | undefined = undefined;
  if (account.pendingSignPsbt) {
    // If there's a pending PSBT for signing, user cannot request signing a new PSBT
    partiallySignedPsbt = account.pendingSignPsbt.psbt;
  } else if (provider.signPsbt) {
    // 1. Build the PSBT that is ready for signing
    const { psbt: unsignedPsbt } = await relayer.withdraw.buildUnsignedPsbt({
      deposits: withdrawableDeposits.map((withdrawableDeposit) => ({
        txHash: withdrawableDeposit.depositTxHash,
        vout: withdrawableDeposit.depositVout,
      })),
      recipientAddress: address,
      ...options,
    });

    // 2. Sign the PSBT with wallet. Don't finalize it.
    partiallySignedPsbt = provider.signPsbt(unsignedPsbt, {
      autoFinalized: false,
      toSignInputs: withdrawableDeposits.map((_, index) => ({
        index,
        publicKey,
      })),
    });
  } else {
    throw Error('signPsbt is not supported');
  }

  // 3. Sign the PSBT with NEAR Chain Signatures asynchronously
  const { id } = await relayer.withdraw.chainSignPsbtAsync({
    psbt: partiallySignedPsbt!,
  });

  // 4. Poll until the PSBT is signed by BitHive contract via NEAR Chain Signatures
  const { psbt: fullySignedPsbt } = await relayer.withdraw.pollChainSignedPsbt({
    id,
  });

  // 5. Submit the finalized PSBT for broadcasting and relaying
  const { txHash } = await relayer.withdraw.submitFinalizedPsbt({
    psbt: fullySignedPsbt,
  });

  return txHash;
}

/**
 * Wait until the deposit is staked
 * @param publicKey User public key (compressed)
 * @param depositTxHash Deposit tx hash
 */
export async function waitUntilStaked(
  publicKey: string,
  depositTxHash: string,
) {
  while (true) {
    // Get deposit by public key and deposit tx hash
    const { deposit } = await relayer.user.getDeposit({
      publicKey,
      txHash: depositTxHash,
    });
    const depositStatus = deposit.status;

    if (
      ['DepositConfirmed', 'DepositConfirmedInvalid'].includes(depositStatus)
    ) {
      console.log(`Deposit (${depositTxHash}) has been staked successfully`);
      break;
    } else if (['DepositProcessing'].includes(depositStatus)) {
      console.log(
        `Staking (${depositTxHash}) is under processing... Waiting for 2 minutes...`,
      );
      await sleep(2 * 60 * 1000);
    } else {
      throw Error(
        `Invalid status (${depositStatus}) for staking (${depositTxHash})`,
      );
    }
  }
}

/**
 * Wait until the deposit is unstaked
 * @param publicKey User public key (compressed)
 * @param depositTxHash Deposit tx hash
 */
export async function waitUntilUnstaked(
  publicKey: string,
  depositTxHash: string,
) {
  while (true) {
    // Get deposit by public key and deposit tx hash
    const { deposit } = await relayer.user.getDeposit({
      publicKey,
      txHash: depositTxHash,
    });
    const depositStatus = deposit.status;

    if (['UnstakeConfirmed', 'ChainSignProcessing'].includes(depositStatus)) {
      console.log(`Deposit (${depositTxHash}) has been unstaked successfully`);
      break;
    } else if (['UnstakeProcessing'].includes(depositStatus)) {
      console.log(
        `Unstaking (${depositTxHash}) is under processing... Waiting for 2 minutes...`,
      );
      await sleep(2 * 60 * 1000);
    } else {
      throw Error(
        `Invalid status (${depositStatus}) for unstaking (${depositTxHash})`,
      );
    }
  }
}

/**
 * Wait until the deposit is withdrawn
 * @param publicKey User public key (compressed)
 * @param depositTxHash Deposit tx hash
 */
export async function waitUntilWithdrawn(
  publicKey: string,
  depositTxHash: string,
) {
  while (true) {
    // Get deposit by public key and deposit tx hash
    const { deposit } = await relayer.user.getDeposit({
      publicKey,
      txHash: depositTxHash,
    });
    const depositStatus = deposit.status;

    if (['WithdrawConfirmed'].includes(depositStatus)) {
      console.log(`Deposit (${depositTxHash}) has been withdrawn successfully`);
      break;
    } else if (['WithdrawProcessing'].includes(depositStatus)) {
      console.log(
        `Withdrawal (${depositTxHash}) is under processing... Waiting for 2 minutes...`,
      );
      await sleep(2 * 60 * 1000);
    } else {
      throw Error(
        `Invalid status (${depositStatus}) for Withdrawal (${depositTxHash})`,
      );
    }
  }
}
