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

export class BitHiveStaker {
  signer: BitcoinSigner;

  constructor(signer: BitcoinSigner) {
    this.signer = signer;
  }

  async stake(
    amount: number,
    options?: { fee?: number; feeRate?: number; wait?: boolean },
  ) {
    const publicKey = this.signer.getPublicKey();
    const address = this.signer.getAddress();
    console.log(`Staking ${satToBtc(amount)} BTC...`);
    const txHash = await stake(this.signer, publicKey, address, amount, {
      fee: options?.fee,
      feeRate: options?.feeRate,
    });
    console.log(`Staking transaction broadcasted: ${txUrl(txHash)}`);
    if (options?.wait !== false) {
      await waitUntilStaked(publicKey, txHash);
    }
    return txHash;
  }

  async unstake(depositTxHash: string, options?: { wait?: boolean }) {
    const publicKey = this.signer.getPublicKey();
    console.log('Unstaking BTC...');
    await unstake(this.signer, publicKey, depositTxHash);
    if (options?.wait !== false) {
      await waitUntilUnstaked(publicKey, depositTxHash);
    }
  }

  async withdraw(
    depositTxHash: string,
    options?: { fee?: number; feeRate?: number; wait?: boolean },
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
        fee: options?.fee,
        feeRate: options?.feeRate,
      },
    );
    console.log(
      `Withdrawal transaction broadcasted: ${txUrl(withdrawalTxHash)}`,
    );
    if (options?.wait !== false) {
      await waitUntilWithdrawn(publicKey, depositTxHash);
    }
    return withdrawalTxHash;
  }
}
