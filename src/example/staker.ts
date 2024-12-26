import * as bitcoin from 'bitcoinjs-lib';
import { config } from '../utils/config';
import { BitcoinSigner } from '../utils/signer';
import { BitHiveStaker } from '../utils/staker';
import { waitUntilStaked } from '../utils/relayer';

/**
 * Stake and unstake BTC with BitHive Staker.
 *
 * Run with `pnpm start staker`
 */
export async function run() {
  // Initialize a Bitcoin signer
  const signer = BitcoinSigner.fromWif(
    config.privateKey,
    bitcoin.networks.testnet,
  );
  // Initialize a BitHive staker
  const staker = new BitHiveStaker(signer);
  // Stake 0.00005 BTC
  const txHash =
    '3847d7252e06cbc4dcd3fb479af94bbec69261684776b1ca49be92e6acb8d563';
  await waitUntilStaked(staker.signer.getPublicKey(), txHash); //await staker.stake(5000);
  // Unstake the staked BTC
  await staker.unstake(txHash);
  // Withdraw the unstaked BTC
  await staker.withdraw(txHash);
  // List all deposits of the staker
  const deposits = await staker.deposits();
  console.log(
    `Staker (${staker.signer.getPublicKey()}) has ${deposits.length} deposits: `,
    deposits,
  );
}
