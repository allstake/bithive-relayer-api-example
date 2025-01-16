import { config } from './config';
import * as bitcoin from 'bitcoinjs-lib';

export async function sleep(ms: number) {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export function txUrl(txHash: string) {
  const network =
    getBitcoinNetwork() === bitcoin.networks.testnet
      ? `${config.network}/`
      : '';
  return `https://mempool.space/${network}tx/${txHash}`;
}

export function satToBtc(sats: number) {
  return sats / 100000000;
}

export function getBitcoinNetwork(): bitcoin.Network {
  const network = config.network;
  if (network === 'mainnet') {
    return bitcoin.networks.bitcoin;
  } else if (['testnet', 'testnet4', 'signet'].includes(network)) {
    return bitcoin.networks.testnet;
  } else {
    throw Error('Invalid network');
  }
}
