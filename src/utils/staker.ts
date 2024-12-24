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

  async stake(amount: number, wait: boolean = true) {
    const publicKey = this.signer.getPublicKey();
    const address = this.signer.getAddress();
    const txHash = await stake(this.signer, publicKey, address, amount);
    if (wait) {
      await waitUntilStaked(publicKey, txHash);
    }
    return txHash;
  }

  async unstake(depositTxHash: string, wait: boolean = true) {
    const publicKey = this.signer.getPublicKey();
    await unstake(this.signer, publicKey, depositTxHash);
    if (wait) {
      await waitUntilUnstaked(publicKey, depositTxHash);
    }
  }

  async withdraw(depositTxHash: string, wait: boolean = true) {
    const publicKey = this.signer.getPublicKey();
    const address = this.signer.getAddress();
    await withdraw(this.signer, publicKey, address, depositTxHash);
    if (wait) {
      await waitUntilWithdrawn(publicKey, depositTxHash);
    }
  }
}
