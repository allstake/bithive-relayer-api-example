import * as bitcoin from 'bitcoinjs-lib';
import { config } from '../utils/config';
import { listDeposits } from '../utils/relayer';
import { BitcoinSigner } from '../utils/signer';

/**
 * List deposits of a user.
 *
 * Run with `pnpm start deposits`
 */
export async function run() {
  // Initialize a Bitcoin signer
  const signer = BitcoinSigner.fromWif(
    config.privateKey,
    bitcoin.networks.testnet,
  );
  // Get the public key
  const publicKey = signer.getPublicKey();

  // List all deposits of the user
  const deposits = await listDeposits(publicKey);
  console.log(deposits);
  console.log(`User (${publicKey}) has ${deposits.length} deposits in total`);
}
