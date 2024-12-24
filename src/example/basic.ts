import * as bitcoin from 'bitcoinjs-lib';
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
  const amount = 5000;
  const txHash = await stake(signer, publicKey, address, amount);
  await waitUntilStaked(publicKey, txHash);

  // Unstake the staked BTC
  await unstake(signer, publicKey, txHash);
  await waitUntilUnstaked(publicKey, txHash);

  // Withdraw the unstaked BTC
  await withdraw(signer, publicKey, address, txHash);
  await waitUntilWithdrawn(publicKey, txHash);
}
