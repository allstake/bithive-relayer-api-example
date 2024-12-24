function requiredEnv(name: string): string {
  if (!process.env[name]) {
    console.error('Error: Missing environment variable', name);
    process.exit(1);
  } else {
    return process.env[name];
  }
}

export type Config = {
  network: 'testnet' | 'testnet4' | 'signet';
  privateKey: string;
  relayerRpcUrl: string;
};

export const config: Config = {
  network:
    (process.env.BITCOIN_NETWORK as 'testnet' | 'testnet4' | 'signet') ||
    'signet',
  privateKey: requiredEnv('BITCOIN_WIF_PRIVATE_KEY'),
  relayerRpcUrl: requiredEnv('BITHIVE_RELAYER_RPC_URL'),
};
