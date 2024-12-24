import * as bitcoin from 'bitcoinjs-lib';
import { config } from '../utils/config';
import { BitcoinSigner } from '../utils/signer';
import { BitHiveStaker } from '../utils/staker';

export async function run() {
  // Initialize a Bitcoin signer
  const signer = BitcoinSigner.fromWif(
    config.privateKey,
    bitcoin.networks.testnet,
  );
  // Initialize a BitHive staker
  const staker = new BitHiveStaker(signer);
  // Stake 0.00005 BTC
  const txHash = await staker.stake(5000);
  // Unstake the staked BTC
  await staker.unstake(txHash);
  // Withdraw the unstaked BTC
  await staker.withdraw(txHash);
}
