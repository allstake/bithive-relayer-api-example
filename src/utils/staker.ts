import { satToBtc, txUrl } from './helper';
import {
  listDeposits,
  stake,
  unstake,
  WaitOptions,
  waitUntilStaked,
  waitUntilUnstaked,
  waitUntilWithdrawn,
  withdraw,
  WithdrawalInput,
} from './relayer';
import { BitcoinSigner } from './signer';

type TxWaitOptions = {
  wait?: boolean;
} & WaitOptions;

type TxOptions = {
  fee?: number;
  feeRate?: number;
} & TxWaitOptions;

export class BitHiveStaker {
  signer: BitcoinSigner;

  constructor(signer: BitcoinSigner) {
    this.signer = signer;
  }

  /**
   * Stake BTC
   * @param amount BTC amount (in sats)
   * @param options Staking options
   *  - fee: Specify the fee (in sats) for the staking transaction. If not specified, the fee will be calculated automatically.
   *  - feeRate: Specify the fee rate (in sat/vB) for the staking transaction. If not specified, the fee will be calculated automatically.
   *  - wait: Specify whether to wait for the staking transaction to be confirmed. If not specified, the function will wait for the staking transaction to be confirmed.
   *  - timeout: Specify the timeout (in milliseconds) for waiting for staking transaction confirmation. The default timeout is 30 minutes.
   * @returns Deposit tx hash
   */
  async stake(
    amount: number,
    { fee, feeRate, wait = true, timeout }: TxOptions = {},
  ) {
    const publicKey = this.signer.getPublicKey();
    const address = this.signer.getAddress();

    console.log(`Staking ${satToBtc(amount)} BTC...`);
    const { txHash } = await stake(this.signer, publicKey, address, amount, {
      fee,
      feeRate,
    });
    console.log(`Staking transaction has been broadcast: ${txUrl(txHash)}`);

    if (wait) {
      await waitUntilStaked(publicKey, txHash, { timeout });
    }

    return txHash;
  }

  /**
   * Unstake BTC
   * @param input A single deposit tx hash, or list of deposit tx hashes, or list of deposits with txHash and vout, or the amount to unstake
   * @param options Unstaking options
   *  - wait: Specify whether to wait for the unstaking transaction to be confirmed. If not specified, the function will wait for the unstaking transaction to be confirmed.
   *  - timeout: Specify the timeout (in milliseconds) for waiting for unstaking transaction confirmation. The default timeout is 30 minutes.
   * @returns Unstaking tx hash
   */
  async unstake(
    input: WithdrawalInput,
    { wait = true, timeout }: TxWaitOptions = {},
  ) {
    const publicKey = this.signer.getPublicKey();

    console.log('Unstaking BTC...');
    await unstake(this.signer, publicKey, input);

    if (wait) {
      await waitUntilUnstaked(publicKey, input, { timeout });
    }
  }

  /**
   * Withdraw BTC
   * @param input A single deposit tx hash, or list of deposit tx hashes, or list of deposits with txHash and vout, or the withdrawal amount
   * @param options Withdrawal options
   *  - fee: Specify the fee (in sats) for the withdrawal transaction. If not specified, the fee will be calculated automatically.
   *  - feeRate: Specify the fee rate (in sat/vB) for the withdrawal transaction. If not specified, the fee will be calculated automatically.
   *  - wait: Specify whether to wait for the withdrawal transaction to be confirmed. If not specified, the function will wait for the withdrawal transaction to be confirmed.
   *  - timeout: Specify the timeout (in milliseconds) for waiting for withdrawal transaction confirmation. The default timeout is 30 minutes.
   * @returns Withdrawal tx hash
   */
  async withdraw(
    input: WithdrawalInput,
    { fee, feeRate, wait = true, timeout }: TxOptions = {},
  ) {
    const publicKey = this.signer.getPublicKey();
    const address = this.signer.getAddress();

    console.log('Withdrawing BTC...');
    const { txHash: withdrawalTxHash, deposits } = await withdraw(
      this.signer,
      publicKey,
      address,
      input,
      {
        fee,
        feeRate,
      },
    );
    console.log(
      `Withdrawal transaction has been broadcast: ${txUrl(withdrawalTxHash)}`,
    );

    if (wait) {
      await waitUntilWithdrawn(publicKey, deposits, { timeout });
    }

    return withdrawalTxHash;
  }

  /**
   * List all deposits of the staker
   * @returns List of deposits
   */
  async deposits() {
    const publicKey = this.signer.getPublicKey();
    return listDeposits(publicKey);
  }
}
