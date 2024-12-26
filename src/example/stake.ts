import * as bitcoin from 'bitcoinjs-lib';
import { config } from '../utils/config';
import { listDeposits, stake, waitUntilStaked } from '../utils/relayer';
import { BitcoinSigner } from '../utils/signer';
import { txUrl } from '../utils/helper';

/**
 * Stake BTC.
 *
 * Run with `pnpm start stake`
 */
export async function run() {
  // Initialize a Bitcoin signer
  const signer = BitcoinSigner.fromWif(
    config.privateKey,
    bitcoin.networks.testnet,
  );
  // Get the public key and address
  const publicKey = signer.getPublicKey();
  const address = signer.getAddress();

  // Stake 0.00005 BTC
  console.log('Staking 0.00005 BTC...');
  const amount = 5000;
  const txHash = await stake(signer, publicKey, address, amount);
  await waitUntilStaked(publicKey, txHash);
  console.log('Staked BTC confirmed', txUrl(txHash));

  // List all deposits of the user
  const deposits = await listDeposits(publicKey);
  console.log(
    `List ${deposits.length} deposits of user (${publicKey}):`,
    deposits,
  );
}
