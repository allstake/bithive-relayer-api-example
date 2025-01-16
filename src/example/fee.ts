import { config } from '../utils/config';
import {
  stake,
  unstake,
  withdraw,
  waitUntilStaked,
  waitUntilUnstaked,
  waitUntilWithdrawn,
} from '../utils/relayer';
import { BitcoinSigner } from '../utils/signer';
import { getBitcoinNetwork, txUrl } from '../utils/helper';

/**
 * Stake and unstake BTC with custom fee.
 *
 * Run with `pnpm start fee`
 */
export async function run() {
  // Initialize a Bitcoin signer
  const signer = BitcoinSigner.fromWif(config.privateKey, getBitcoinNetwork());
  // Get the public key and address
  const publicKey = signer.getPublicKey();
  const address = signer.getAddress();

  // Stake 0.00005 BTC with a custom fee of 400 sats
  console.log('Staking 0.00005 BTC...');
  const amount = 5000;
  const { txHash } = await stake(signer, publicKey, address, amount, {
    fee: 400,
  });
  await waitUntilStaked(publicKey, txHash);
  console.log('Staked BTC confirmed', txUrl(txHash));

  // Unstake the staked 0.00005 BTC
  console.log('Unstaking BTC...');
  await unstake(signer, publicKey, txHash);
  await waitUntilUnstaked(publicKey, txHash);
  console.log('Unstaked BTC confirmed');

  // Withdraw the unstaked BTC with a custom fee of 400 sats
  console.log('Withdrawing BTC...');
  const { txHash: withdrawalTxHash } = await withdraw(
    signer,
    publicKey,
    address,
    txHash,
    {
      fee: 400,
    },
  );
  await waitUntilWithdrawn(publicKey, txHash);
  console.log(
    'Withdrawn BTC confirmed. Withdrawal transaction:',
    txUrl(withdrawalTxHash),
  );
}
