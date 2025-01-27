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
 * Stake and unstake BTC.
 *
 * Run with `pnpm start unstake`
 */
export async function run() {
  // Initialize a Bitcoin signer
  const signer = BitcoinSigner.fromWif(config.privateKey, getBitcoinNetwork());
  // Get the public key and address
  const publicKey = signer.getPublicKey();
  const address = signer.getAddress();

  // Stake 0.00005 BTC
  console.log('Staking 0.00005 BTC...');
  const amount = 5000;
  const { txHash } = await stake(signer, publicKey, address, amount);
  await waitUntilStaked(publicKey, txHash);
  console.log('Staked BTC confirmed', txUrl(txHash));

  // Unstake the staked 0.00005 BTC
  console.log('Unstaking BTC...');
  await unstake(signer, publicKey, txHash);
  await waitUntilUnstaked(publicKey, txHash);
  console.log('Unstaked BTC confirmed');

  // Withdraw the unstaked BTC
  console.log('Withdrawing BTC...');
  const { txHash: withdrawalTxHash } = await withdraw(
    signer,
    publicKey,
    address,
    txHash,
  );
  await waitUntilWithdrawn(publicKey, txHash);
  console.log(
    'Withdrawn BTC confirmed. Withdrawal transaction:',
    txUrl(withdrawalTxHash),
  );
}
