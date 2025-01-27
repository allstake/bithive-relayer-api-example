import { config } from '../utils/config';
import {
  stake,
  unstake,
  waitUntilStaked,
  waitUntilUnstaked,
  waitUntilWithdrawn,
  withdraw,
} from '../utils/relayer';
import { BitcoinSigner } from '../utils/signer';
import { getBitcoinNetwork, txUrl } from '../utils/helper';

/**
 * Stake BTC, and then unstake and withdraw partially
 *
 * Run with `pnpm start partial-withdrawal`
 */
export async function run() {
  // Initialize a Bitcoin signer
  const signer = BitcoinSigner.fromWif(config.privateKey, getBitcoinNetwork());
  // Get the public key and address
  const publicKey = signer.getPublicKey();
  const address = signer.getAddress();

  // Stake 0.00005 BTC
  console.log('Staking 0.00005 BTC...');
  const stakeAmount = 5000;
  const { txHash } = await stake(signer, publicKey, address, stakeAmount);
  await waitUntilStaked(publicKey, txHash);
  console.log('Staked BTC confirmed', txUrl(txHash));

  // Unstake 0.00003 BTC partially, rather than with a specific deposit tx hash
  console.log('Unstaking 0.00003 BTC...');
  const unstakeAmount = 3000;
  await unstake(signer, publicKey, unstakeAmount);
  await waitUntilUnstaked(publicKey, unstakeAmount);
  console.log('Unstaked BTC confirmed');

  // Withdraw 0.00003 BTC partially, rather than with a specific deposit tx hash
  // The remaining 0.00002 BTC will be redeposited
  console.log('Withdrawing 0.00003 BTC...');
  const { txHash: withdrawalTxHash, deposits } = await withdraw(
    signer,
    publicKey,
    address,
    unstakeAmount,
  );
  await waitUntilWithdrawn(publicKey, deposits);
  console.log(
    'Withdrawn BTC confirmed. Withdrawal transaction:',
    txUrl(withdrawalTxHash),
  );
}
