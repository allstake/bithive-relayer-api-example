import { satToBtc, txUrl } from './helper';
import {
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

  async stake(amount: number, { fee, feeRate, wait = true }: TxOptions = {}) {
    const publicKey = this.signer.getPublicKey();
    const address = this.signer.getAddress();

    console.log(`Staking ${satToBtc(amount)} BTC...`);
    const txHash = await stake(this.signer, publicKey, address, amount, {
      fee,
      feeRate,
    });
    console.log(`Staking transaction broadcasted: ${txUrl(txHash)}`);

    if (wait) {
      await waitUntilStaked(publicKey, txHash);
    }

    return txHash;
  }

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
      `Withdrawal transaction broadcasted: ${txUrl(withdrawalTxHash)}`,
    );

    if (wait) {
      await waitUntilWithdrawn(publicKey, depositTxHash);
    }

    return withdrawalTxHash;
  }
}
