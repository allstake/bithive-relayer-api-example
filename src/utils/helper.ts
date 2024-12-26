import { config } from './config';

export async function sleep(ms: number) {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export function txUrl(txHash: string) {
  return `https://mempool.space/${config.network}/tx/${txHash}`;
}

export function satToBtc(sats: number) {
  return sats / 100000000;
}
