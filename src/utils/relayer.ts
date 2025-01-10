import { createRelayerClient, DepositStatus } from '@bithive/relayer-api';
import { config } from './config';
import { BitcoinProvider } from './signer';
import { sleep } from './helper';

// Create a relayer client
export const relayer = createRelayerClient({ url: config.relayerRpcUrl });

export type Deposit = {
  txHash: string;
  vout: number;
};

export type Deposits = Deposit[] | string | string[];

export type WithdrawalInput = Deposits | number;

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
  // 1. Build the PSBT that is ready for signing
  const { psbt: unsignedPsbt } = await relayer.deposit.buildUnsignedPsbt({
    publicKey,
    address,
    amount,
    ...options,
  });

  // 2. Sign and finalize the PSBT with wallet
  const signedPsbt = await provider.signPsbt(unsignedPsbt);

  // 3. Submit the finalized PSBT for broadcasting and relaying
  const { txHash } = await relayer.deposit.submitFinalizedPsbt({
    psbt: signedPsbt,
  });

  return { txHash };
}

/**
 * Unstake BTC from BitHive
 * @param provider BTC provider with `signMessage` interface
 * @param publicKey User public key (compressed)
 * @param input A single deposit tx hash, or list of deposit tx hashes, or list of deposits with txHash and vout
 */
export async function unstake(
  provider: BitcoinProvider,
  publicKey: string,
  input: WithdrawalInput,
) {
  const { amount, deposits } = parseWithdrawalInput(input);

  let _deposits;
  if (deposits) {
    _deposits = parseDepositsInput(deposits);
    const data = await queryDeposits(publicKey, _deposits);
    if (data.length === 0) {
      throw Error(`The deposits (${deposits}) are not found`);
    }
    const invalidDeposit = data.find(
      (deposit) =>
        !['DepositConfirmed', 'DepositConfirmedInvalid'].includes(
          deposit.status,
        ),
    );
    if (invalidDeposit) {
      throw Error(
        `The deposit (${invalidDeposit.depositTxHash}) with status (${invalidDeposit.status}) is not ready to unstake`,
      );
    }
  }

  // 1. Build the unstaking message that is ready for signing
  const { message } = await relayer.unstake.buildUnsignedMessage({
    deposits: _deposits,
    amount,
    publicKey,
  });

  // 2. Sign the unstaking message with wallet
  const signature = await provider.signMessage(message);

  // 3. Submit the unstaking signature and relay to BitHive contract on NEAR
  await relayer.unstake.submitSignature({
    deposits: _deposits,
    amount,
    publicKey,
    signature: Buffer.from(signature, 'base64').toString('hex'),
  });
}

/**
 * Withdraw BTC from BitHive
 * @param provider BTC provider with `signPsbt` interface
 * @param publicKey User public key (compressed)
 * @param address Recipient address (can be different with user address)
 * @param input A single deposit tx hash, or list of deposit tx hashes, or list of deposits with txHash and vout
 * @param options Optional: specify the fee (in sats) or fee rate (in sat/vB) for the withdrawal transaction. If not specified, the fee will be calculated automatically.
 * @returns Withdrawal tx hash
 */
export async function withdraw(
  provider: BitcoinProvider,
  publicKey: string,
  address: string,
  input: WithdrawalInput,
  options?: {
    fee?: number;
    feeRate?: number;
  },
) {
  // Get the account info by public key
  const { account } = await relayer.user.getAccount({
    publicKey,
  });

  let partiallySignedPsbt: string | undefined = undefined;
  let withdrawnDeposits;

  if (account.pendingSignPsbt) {
    // If there's a pending PSBT for signing, user cannot request signing a new PSBT
    partiallySignedPsbt = account.pendingSignPsbt.psbt;
    withdrawnDeposits = account.pendingSignPsbt.deposits;
    console.warn(
      `[Warning] The account with public key (${publicKey}) has a pending withdrawal PSBT that has not been signed by NEAR Chain Signatures. ` +
        `The signing request is either still in progress or has failed in the last attempt. ` +
        `We need to complete signing this withdrawal PSBT before we can submit a new one: ${JSON.stringify(account.pendingSignPsbt, null, 2)}.\n` +
        `Submit the above withdrawal PSBT for signing ... This may fail if the last signing request is still in progress, or NEAR Chain Signatures service is unstable.`,
    );
  } else {
    const { amount, deposits } = parseWithdrawalInput(input);
    let _deposits;

    if (deposits) {
      _deposits = parseDepositsInput(deposits);
      const data = await queryDeposits(publicKey, _deposits);
      if (data.length === 0) {
        throw Error(`The deposits (${deposits}) are not found`);
      }

      const invalidDeposit = data.find(
        (deposit) => !['UnstakeConfirmed'].includes(deposit.status),
      );
      if (invalidDeposit) {
        throw Error(
          `The deposit (${invalidDeposit.depositTxHash}) with status (${invalidDeposit.status}) is not ready to withdraw`,
        );
      }
    }

    // 1. Build the PSBT that is ready for signing
    const { psbt: unsignedPsbt, deposits: depositsToSign } =
      await relayer.withdraw.buildUnsignedPsbt({
        publicKey,
        deposits: _deposits,
        amount,
        recipientAddress: address,
        ...options,
      });

    // 2. Sign the PSBT with wallet. Don't finalize it.
    partiallySignedPsbt = await provider.signPsbt(unsignedPsbt, {
      autoFinalized: false,
      toSignInputs: depositsToSign.map((_, index) => ({
        index,
        publicKey,
      })),
    });
    withdrawnDeposits = depositsToSign;
  }

  // 3. Sign the PSBT with NEAR Chain Signatures
  const { psbt: fullySignedPsbt } = await relayer.withdraw.chainSignPsbt({
    psbt: partiallySignedPsbt!,
  });

  // 4. Submit the finalized PSBT for broadcasting and relaying
  const { txHash } = await relayer.withdraw.submitFinalizedPsbt({
    psbt: fullySignedPsbt,
  });

  return {
    txHash,
    deposits: withdrawnDeposits,
  };
}

export type WaitOptions = {
  timeout?: number;
};

type Operation = 'stake' | 'unstake' | 'withdraw';
type DepositStatusType = 'success' | 'pending' | 'failure';
type DepositStatusMap = {
  [key in Operation]: {
    [key in DepositStatusType]: DepositStatus[];
  };
};
type OperationNameMap = {
  [key in Operation]: {
    do: string;
    doing: string;
    done: string;
  };
};

const DEPOSIT_STATUS_MAP: DepositStatusMap = {
  stake: {
    success: ['DepositConfirmed', 'DepositConfirmedInvalid'],
    pending: ['DepositProcessing'],
    failure: ['DepositFailed'],
  },
  unstake: {
    success: ['UnstakeConfirmed'],
    pending: ['UnstakeProcessing'],
    failure: [],
  },
  withdraw: {
    success: ['WithdrawConfirmed'],
    pending: ['WithdrawChainSignProcessing', 'WithdrawProcessing'],
    failure: ['WithdrawFailed'],
  },
};

const OPERATION_NAME_MAP: OperationNameMap = {
  stake: {
    do: 'stake',
    doing: 'staking',
    done: 'staked',
  },
  unstake: {
    do: 'unstake',
    doing: 'unstaking',
    done: 'unstaked',
  },
  withdraw: {
    do: 'withdraw',
    doing: 'withdrawing',
    done: 'withdrawn',
  },
};

// Default wait interval and timeout
const DEFAULT_WAIT_INTERVAL = 2 * 60 * 1000; // 2 minutes
const DEFAULT_WAIT_TIMEOUT = 60 * 60 * 1000; // 1 hour

/**
 * Wait until the operation is confirmed
 * @param operation The operation to wait for
 * @param publicKey User public key (compressed)
 * @param deposits A single deposit tx hash, or list of deposit tx hashes, or list of deposits with txHash and vout
 * @param options Wait options:
 *  - timeout: The timeout (in milliseconds) for waiting the operation to be confirmed. Default is 1 hour.
 */
async function waitForOperation(
  operation: Operation,
  publicKey: string,
  deposits: Deposits,
  { timeout = DEFAULT_WAIT_TIMEOUT }: WaitOptions = {},
) {
  const _deposits = parseDepositsInput(deposits);
  const data = await queryDeposits(publicKey, _deposits);
  if (data.length === 0) {
    throw Error(`The deposits (${deposits}) are not found`);
  }
  const invalidDeposit = data.find(
    (deposit) =>
      !DEPOSIT_STATUS_MAP[operation].pending.includes(deposit.status),
  );
  if (invalidDeposit) {
    throw Error(
      `The deposit (${invalidDeposit.depositTxHash}) with status (${invalidDeposit.status}) hasn't started ${OPERATION_NAME_MAP[operation].doing}`,
    );
  }

  const count = {
    failure: 0,
    success: 0,
    invalid: 0,
  };
  const startTime = Date.now();
  for (const _deposit of _deposits) {
    while (true) {
      if (Date.now() - startTime > timeout) {
        throw Error(
          `Waiting timeout ${timeout} ms reached for ${OPERATION_NAME_MAP[operation].doing} (${formatDeposits(_deposits)})`,
        );
      }
      // Get deposit by public key and deposit tx hash and vout
      const { deposit } = await relayer.user.getDeposit({
        publicKey,
        txHash: _deposit.txHash,
        vout: _deposit.vout,
      });
      const depositStatus = deposit.status;

      if (DEPOSIT_STATUS_MAP[operation].success.includes(depositStatus)) {
        console.log(
          `Deposit (${formatDeposit(_deposit)}) has been ${OPERATION_NAME_MAP[operation].done} successfully`,
        );
        count.success++;
        break;
      } else if (
        DEPOSIT_STATUS_MAP[operation].pending.includes(depositStatus)
      ) {
        console.log(
          `The deposit ${OPERATION_NAME_MAP[operation].doing} of (${formatDeposit(_deposit)}) is under processing... Waiting for 2 minutes...`,
        );
        await sleep(DEFAULT_WAIT_INTERVAL);
      } else if (
        DEPOSIT_STATUS_MAP[operation].failure.includes(depositStatus)
      ) {
        console.error(
          `Deposit (${formatDeposit(_deposit)}) has failed to ${OPERATION_NAME_MAP[operation].do}`,
        );
        count.failure++;
        break;
      } else {
        console.error(
          `Invalid status (${depositStatus}) for ${OPERATION_NAME_MAP[operation].doing} (${formatDeposit(_deposit)})`,
        );
        count.invalid++;
        break;
      }
    }
  }
  if (_deposits.length > 1) {
    console.log(
      `All ${_deposits.length} deposits ${OPERATION_NAME_MAP[operation].doing} have been processed. Success: ${count.success}, Failure: ${count.failure}, Invalid: ${count.invalid}`,
    );
  }
}

/**
 * Wait until the deposit is staked
 * @param publicKey User public key (compressed)
 * @param deposits A single deposit tx hash, or list of deposit tx hashes, or list of deposits with txHash and vout
 * @param options Wait options:
 *  - timeout: The timeout (in milliseconds) for waiting the staking operation to be confirmed. Default is 1 hour.
 */
export async function waitUntilStaked(
  publicKey: string,
  deposits: Deposits,
  { timeout = DEFAULT_WAIT_TIMEOUT }: WaitOptions = {},
) {
  return waitForOperation('stake', publicKey, deposits, { timeout });
}

/**
 * Wait until the deposit is unstaked
 * @param publicKey User public key (compressed)
 * @param input A single deposit tx hash, or list of deposit tx hashes, or list of deposits with txHash and vout, or the amount to unstake
 * @param options Wait options:
 *  - timeout: The timeout (in milliseconds) for waiting the unstaking operation to be confirmed. Default is 1 hour.
 */
export async function waitUntilUnstaked(
  publicKey: string,
  input: WithdrawalInput,
  { timeout = DEFAULT_WAIT_TIMEOUT }: WaitOptions = {},
) {
  const { deposits, amount } = parseWithdrawalInput(input);

  if (deposits) {
    return waitForOperation('unstake', publicKey, deposits, { timeout });
  } else {
    return relayer.unstake.waitUntilConfirmed(
      { amount, publicKey },
      { timeout },
    );
  }
}

/**
 * Wait until the deposit is withdrawn
 * @param publicKey User public key (compressed)
 * @param deposits A single deposit tx hash, or list of deposit tx hashes, or list of deposits with txHash and vout
 * @param options Wait options:
 *  - timeout: The timeout (in milliseconds) for waiting the withdrawal operation to be confirmed. Default is 1 hour.
 */
export async function waitUntilWithdrawn(
  publicKey: string,
  deposits: Deposits,
  { timeout = DEFAULT_WAIT_TIMEOUT }: WaitOptions = {},
) {
  return waitForOperation('withdraw', publicKey, deposits, { timeout });
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

function formatDeposit(deposit: Deposit) {
  if (deposit.vout === 0) {
    return deposit.txHash;
  } else {
    return `${deposit.txHash}:${deposit.vout}`;
  }
}

function formatDeposits(deposits: Deposit[] | Deposit) {
  if (Array.isArray(deposits)) {
    return deposits.map(formatDeposit).join(', ');
  } else {
    return formatDeposit(deposits);
  }
}

export function parseWithdrawalInput(input: WithdrawalInput) {
  if (typeof input === 'number') {
    if (input <= 0) {
      throw Error('The amount must be positive');
    }
    return { amount: input, deposits: undefined };
  } else {
    return { amount: undefined, deposits: input };
  }
}
