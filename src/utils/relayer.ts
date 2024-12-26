import { createRelayerClient } from '@bithive/relayer-api';
import { config } from './config';
import { BitcoinProvider } from './signer';
import { sleep } from './helper';

export type WaitOptions = {
  timeout?: number;
};

export type Deposit = {
  txHash: string;
  vout: number;
};

export type Deposits = Deposit[] | string | string[];

// Default wait interval and timeout
const DEFAULT_WAIT_INTERVAL = 2 * 60 * 1000; // 2 minutes
const DEFAULT_WAIT_TIMEOUT = 60 * 60 * 1000; // 1 hour

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
 * @param deposits A single deposit tx hash, or list of deposit tx hashes, or list of deposits with txHash and vout
 */
export async function unstake(
  provider: BitcoinProvider,
  publicKey: string,
  deposits: Deposits,
) {
  const _deposits = parseDepositsInput(deposits);
  const data = await queryDeposits(publicKey, _deposits);
  if (data.length === 0) {
    throw Error(`The deposits (${deposits}) are not found`);
  }
  const invalidDeposit = data.find(
    (deposit) =>
      !['DepositConfirmed', 'DepositConfirmedInvalid'].includes(deposit.status),
  );
  if (invalidDeposit) {
    throw Error(
      `The deposit (${invalidDeposit.depositTxHash}) with status (${invalidDeposit.status}) is not ready to unstake`,
    );
  }

  if (provider.signMessage) {
    // 1. Build the unstaking message that is ready for signing
    const { message } = await relayer.unstake.buildUnsignedMessage({
      deposits: _deposits,
      publicKey,
    });

    // 2. Sign the unstaking message with wallet
    const signature = provider.signMessage(message);

    // 3. Submit the unstaking signature and relay to BitHive contract on NEAR
    await relayer.unstake.submitSignature({
      deposits: _deposits,
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
 * @param deposits A single deposit tx hash, or list of deposit tx hashes, or list of deposits with txHash and vout
 * @param options Optional: specify the fee (in sats) or fee rate (in sat/vB) for the withdrawal transaction. If not specified, the fee will be calculated automatically.
 * @returns Withdrawal tx hash
 */
export async function withdraw(
  provider: BitcoinProvider,
  publicKey: string,
  address: string,
  deposits: Deposits,
  options?: {
    fee?: number;
    feeRate?: number;
  },
) {
  const _deposits = parseDepositsInput(deposits);
  const data = await queryDeposits(publicKey, _deposits);
  if (data.length === 0) {
    throw Error(`The deposits (${deposits}) are not found`);
  }
  const invalidDeposit = data.find(
    (deposit) =>
      !['UnstakeConfirmed', 'ChainSignProcessing'].includes(deposit.status),
  );
  if (invalidDeposit) {
    throw Error(
      `The deposit (${invalidDeposit.depositTxHash}) with status (${invalidDeposit.status}) is not ready to withdraw`,
    );
  }

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
      deposits: _deposits,
      recipientAddress: address,
      ...options,
    });

    // 2. Sign the PSBT with wallet. Don't finalize it.
    partiallySignedPsbt = provider.signPsbt(unsignedPsbt, {
      autoFinalized: false,
      toSignInputs: _deposits.map((_, index) => ({
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
 * @param deposits A single deposit tx hash, or list of deposit tx hashes, or list of deposits with txHash and vout
 */
export async function waitUntilStaked(
  publicKey: string,
  deposits: Deposits,
  { timeout = DEFAULT_WAIT_TIMEOUT }: WaitOptions = {},
) {
  let _deposits = parseDepositsInput(deposits);
  const data = await queryDeposits(publicKey, _deposits);
  if (data.length === 0) {
    throw Error(`The deposits (${deposits}) are not found`);
  }
  const invalidDeposit = data.find(
    (deposit) => deposit.status !== 'DepositProcessing',
  );
  if (invalidDeposit) {
    throw Error(
      `The deposit (${invalidDeposit.depositTxHash}) with status (${invalidDeposit.status}) has not been staked`,
    );
  }

  const count = {
    failure: 0,
    success: 0,
    invalid: 0,
  };
  const startTime = Date.now();
  while (true) {
    if (Date.now() - startTime > timeout) {
      throw Error(
        `Waiting timeout ${timeout} ms reached for staking (${deposits})`,
      );
    }

    const pendingDeposits: Deposit[] = [];
    for (const _deposit of _deposits) {
      // Get deposit by public key and deposit tx hash and vout
      const { deposit } = await relayer.user.getDeposit({
        publicKey,
        txHash: _deposit.txHash,
        vout: _deposit.vout,
      });
      const depositStatus = deposit.status;

      if (
        ['DepositConfirmed', 'DepositConfirmedInvalid'].includes(depositStatus)
      ) {
        console.log(
          `Deposit (${formatDeposits(_deposit)}) has been staked successfully`,
        );
        count.success++;
      } else if (['DepositProcessing'].includes(depositStatus)) {
        pendingDeposits.push(_deposit);
      } else if (['DepositFailed'].includes(depositStatus)) {
        console.error(
          `Deposit (${formatDeposits(_deposit)}) has failed to stake`,
        );
        count.failure++;
      } else {
        console.error(
          `Invalid status (${depositStatus}) for staking (${formatDeposits(_deposit)})`,
        );
        count.invalid++;
      }
    }
    if (pendingDeposits.length > 0) {
      console.log(
        `Staking (${formatDeposits(pendingDeposits)}) are under processing... Waiting for 2 minutes...`,
      );
      _deposits = pendingDeposits;
      await sleep(DEFAULT_WAIT_INTERVAL);
    } else {
      console.log(
        `All deposits staking have been processed. Success: ${count.success}, Failure: ${count.failure}, Invalid: ${count.invalid}`,
      );
      break;
    }
  }
}

/**
 * Wait until the deposit is unstaked
 * @param publicKey User public key (compressed)
 * @param deposits A single deposit tx hash, or list of deposit tx hashes, or list of deposits with txHash and vout
 */
export async function waitUntilUnstaked(
  publicKey: string,
  deposits: Deposits,
  { timeout = DEFAULT_WAIT_TIMEOUT }: WaitOptions = {},
) {
  let _deposits = parseDepositsInput(deposits);
  const data = await queryDeposits(publicKey, _deposits);
  if (data.length === 0) {
    throw Error(`The deposits (${deposits}) are not found`);
  }
  const invalidDeposit = data.find(
    (deposit) => deposit.status !== 'UnstakeProcessing',
  );
  if (invalidDeposit) {
    throw Error(
      `The deposit (${invalidDeposit.depositTxHash}) with status (${invalidDeposit.status}) has not been unstaked`,
    );
  }

  const count = {
    success: 0,
    invalid: 0,
  };
  const startTime = Date.now();
  while (true) {
    if (Date.now() - startTime > timeout) {
      throw Error(
        `Waiting timeout ${timeout} ms reached for unstaking deposit (${deposits})`,
      );
    }

    const pendingDeposits: Deposit[] = [];
    for (const _deposit of _deposits) {
      // Get deposit by public key and deposit tx hash and vout
      const { deposit } = await relayer.user.getDeposit({
        publicKey,
        txHash: _deposit.txHash,
        vout: _deposit.vout,
      });
      const depositStatus = deposit.status;

      if (['UnstakeConfirmed', 'ChainSignProcessing'].includes(depositStatus)) {
        console.log(
          `Deposit (${formatDeposits(_deposit)}) has been unstaked successfully`,
        );
        count.success++;
      } else if (['UnstakeProcessing'].includes(depositStatus)) {
        pendingDeposits.push(_deposit);
      } else {
        console.error(
          `Invalid status (${depositStatus}) for unstaking (${formatDeposits(_deposit)})`,
        );
        count.invalid++;
      }
    }
    if (pendingDeposits.length > 0) {
      console.log(
        `Unstaking (${formatDeposits(pendingDeposits)}) are under processing... Waiting for 2 minutes...`,
      );
      _deposits = pendingDeposits;
      await sleep(DEFAULT_WAIT_INTERVAL);
    } else {
      console.log(
        `All deposits unstaking have been processed: Success: ${count.success}, Invalid: ${count.invalid}`,
      );
      break;
    }
  }
}

/**
 * Wait until the deposit is withdrawn
 * @param publicKey User public key (compressed)
 * @param deposits A single deposit tx hash, or list of deposit tx hashes, or list of deposits with txHash and vout
 */
export async function waitUntilWithdrawn(
  publicKey: string,
  deposits: Deposits,
  { timeout = DEFAULT_WAIT_TIMEOUT }: WaitOptions = {},
) {
  let _deposits = parseDepositsInput(deposits);
  const data = await queryDeposits(publicKey, _deposits);
  if (data.length === 0) {
    throw Error(`The deposits (${deposits}) are not found`);
  }
  const invalidDeposit = data.find(
    (deposit) => deposit.status !== 'WithdrawProcessing',
  );
  if (invalidDeposit) {
    throw Error(
      `The deposit (${invalidDeposit.depositTxHash}) with status (${invalidDeposit.status}) has not been withdrawn`,
    );
  }

  const count = {
    failure: 0,
    success: 0,
    invalid: 0,
  };
  const startTime = Date.now();
  while (true) {
    if (Date.now() - startTime > timeout) {
      throw Error(
        `Waiting timeout ${timeout} ms reached for withdrawing deposit (${deposits})`,
      );
    }

    const pendingDeposits: Deposit[] = [];
    for (const _deposit of _deposits) {
      // Get deposit by public key and deposit tx hash and vout
      const { deposit } = await relayer.user.getDeposit({
        publicKey,
        txHash: _deposit.txHash,
        vout: _deposit.vout,
      });
      const depositStatus = deposit.status;

      if (['WithdrawConfirmed'].includes(depositStatus)) {
        console.log(
          `Deposit (${formatDeposits(_deposit)}) has been withdrawn successfully`,
        );
        count.success++;
      } else if (['WithdrawProcessing'].includes(depositStatus)) {
        pendingDeposits.push(_deposit);
      } else if (['WithdrawFailed'].includes(depositStatus)) {
        console.error(
          `Deposit (${formatDeposits(_deposit)}) has failed to withdraw`,
        );
        count.failure++;
      } else {
        console.error(
          `Invalid status (${depositStatus}) for withdrawing (${formatDeposits(_deposit)})`,
        );
        count.invalid++;
      }
    }
    if (pendingDeposits.length > 0) {
      console.log(
        `Withdrawing (${formatDeposits(pendingDeposits)}) are under processing... Waiting for 2 minutes...`,
      );
      _deposits = pendingDeposits;
      await sleep(DEFAULT_WAIT_INTERVAL);
    } else {
      console.log(
        `All deposits withdrawal have been processed. Success: ${count.success}, Failure: ${count.failure}, Invalid: ${count.invalid}`,
      );
      break;
    }
  }
}

/**
 * List all deposits of the user
 * @param publicKey User public key (compressed)
 * @param deposits A list of deposits with txHash and vout. If not specified, all deposits will be returned.
 * @returns List of deposits
 */
export async function listDeposits(publicKey: string, deposits?: Deposits) {
  if (!deposits) {
    const { deposits: _deposits } = await relayer.user.getDeposits({
      publicKey,
    });
    return _deposits;
  } else {
    return await queryDeposits(publicKey, parseDepositsInput(deposits));
  }
}

/**
 * Parse the deposits input
 * @param input A single deposit tx hash, or list of deposit tx hashes, or list of deposits with txHash and vout
 * @returns List of deposits
 */
function parseDepositsInput(input: Deposits): Deposit[] {
  if (typeof input === 'string') {
    return [{ txHash: input, vout: 0 }];
  } else if (
    Array.isArray(input) &&
    input.every((item) => typeof item === 'string')
  ) {
    return input.map((txHash) => ({ txHash, vout: 0 }));
  } else {
    return input;
  }
}

/**
 * Query deposits from the relayer
 * @param publicKey User public key (compressed)
 * @param deposits A list of deposits with txHash and vout
 * @returns List of deposits data
 */
async function queryDeposits(publicKey: string, deposits: Deposit[]) {
  const results = await Promise.all(
    deposits.map((deposit) =>
      relayer.user.getDeposit({
        publicKey: publicKey,
        txHash: deposit.txHash,
        vout: deposit.vout,
      }),
    ),
  );
  return results.map((result) => result.deposit);
}

function formatDeposits(deposits: Deposit[] | Deposit) {
  return JSON.stringify(deposits, null, 2);
}
