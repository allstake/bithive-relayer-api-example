import { config } from '../utils/config';
import { listDeposits } from '../utils/relayer';
import { BitcoinSigner } from '../utils/signer';
import { getBitcoinNetwork } from '../utils/helper';

/**
 * List deposits of a user.
 *
 * Run with `pnpm start deposits`
 */
export async function run() {
  // Initialize a Bitcoin signer
  const signer = BitcoinSigner.fromWif(config.privateKey, getBitcoinNetwork());
  // Get the public key
  const publicKey = signer.getPublicKey();

  // List all deposits of the user
  const deposits = await listDeposits(publicKey);
  console.log(deposits);
  console.log(`User (${publicKey}) has ${deposits.length} deposits in total`);

  // Example deposits output
  // [
  //   {
  //     depositTxHash: '404a2034f89e8fd0abd82b0958b67175aa2abed99e5700715f3624a4b730d87a',
  //     depositVout: 0,
  //     depositTxBlockHash: '00000000fe7b192488536de91bedbcd94c59364da5db1cfbfcfa8939d1bbfe68',
  //     depositTxBlockHeight: 59914,
  //     depositTxBlockTimestamp: 1735096660,
  //     depositTxBroadcastTimestamp: 1735088721032,
  //     withdrawTxHash: '69f9f85ef1383daebe7ce2ba2c48e8e370b9ec9ab875462738711eada0d07452',
  //     withdrawVin: 0,
  //     withdrawTxBlockHash: '00000000a453f48e1c6dc1bff3ffe676a72b9b2d3a5bb9ba34a4f9d2788f1ceb',
  //     withdrawTxBlockHeight: 59920,
  //     withdrawTxBlockTimestamp: 1735099063,
  //     withdrawTxBroadcastTimestamp: 1735091044159,
  //     status: 'WithdrawConfirmed',
  //     amount: 5000,
  //     pointsMultiplier: 16
  //   },
  //   {
  //     depositTxHash: 'e43abd395f867ac3a20956bc567e23b6c1f48c53a50bb7a619872c642bb66079',
  //     depositVout: 0,
  //     depositTxBlockHash: '00000000000d0321dbbda68f8f4b6afdb9b64670bf92b72b0b4c0ab0f2e1561b',
  //     depositTxBlockHeight: 54719,
  //     depositTxBlockTimestamp: 1731923491,
  //     depositTxBroadcastTimestamp: 1731916214552,
  //     status: 'DepositConfirmed',
  //     amount: 500000,
  //     pointsMultiplier: 16
  //   }
  // ]
  // User (xxxxxxxxxxxxx) has 2 deposits in total
}
