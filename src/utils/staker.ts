import { satToBtc, txUrl } from './helper';
import {
  listDeposits,
  stake,
  unstake,
  waitUntilStaked,
  waitUntilUnstaked,
  waitUntilWithdrawn,
  withdraw,
} from './relayer';
import { BitcoinSigner } from './signer';

type TxOptions = {
  fee?: number;
  feeRate?: number;
  wait?: boolean;
};

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
   * @returns Deposit tx hash
   */
  async stake(amount: number, { fee, feeRate, wait = true }: TxOptions = {}) {
    const publicKey = this.signer.getPublicKey();
    const address = this.signer.getAddress();

    console.log(`Staking ${satToBtc(amount)} BTC...`);
    const txHash = await stake(this.signer, publicKey, address, amount, {
      fee,
      feeRate,
    });
    console.log(`Staking transaction has been broadcast: ${txUrl(txHash)}`);

    if (wait) {
      await waitUntilStaked(publicKey, txHash);
    }

    return txHash;
  }

  /**
   * Unstake BTC
   * @param depositTxHash Deposit tx hash
   * @param options Unstaking options
   *  - wait: Specify whether to wait for the unstaking transaction to be confirmed. If not specified, the function will wait for the unstaking transaction to be confirmed.
   * @returns Unstaking tx hash
   */
  async unstake(
    depositTxHash: string,
    { wait = true }: { wait?: boolean } = {},
  ) {
    const publicKey = this.signer.getPublicKey();

    console.log('Unstaking BTC...');
    await unstake(this.signer, publicKey, depositTxHash);

    if (wait) {
      await waitUntilUnstaked(publicKey, depositTxHash);
    }
  }

  /**
   * Withdraw BTC
   * @param depositTxHash Deposit tx hash
   * @param options Withdrawal options
   *  - fee: Specify the fee (in sats) for the withdrawal transaction. If not specified, the fee will be calculated automatically.
   *  - feeRate: Specify the fee rate (in sat/vB) for the withdrawal transaction. If not specified, the fee will be calculated automatically.
   *  - wait: Specify whether to wait for the withdrawal transaction to be confirmed. If not specified, the function will wait for the withdrawal transaction to be confirmed.
   * @returns Withdrawal tx hash
   */
  async withdraw(
    depositTxHash: string,
    { fee, feeRate, wait = true }: TxOptions = {},
  ) {
    const publicKey = this.signer.getPublicKey();
    const address = this.signer.getAddress();

    console.log('Withdrawing BTC...');
    const withdrawalTxHash = await withdraw(
      this.signer,
      publicKey,
      address,
      depositTxHash,
      {
        fee,
        feeRate,
      },
    );
    console.log(
      `Withdrawal transaction has been broadcast: ${txUrl(withdrawalTxHash)}`,
    );

    if (wait) {
      await waitUntilWithdrawn(publicKey, depositTxHash);
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
