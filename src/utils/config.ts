function requiredEnv(name: string): string {
  if (!process.env[name]) {
    console.error('Error: Missing environment variable', name);
    process.exit(1);
  }
  return process.env[name];
}

type Network = 'testnet' | 'testnet4' | 'signet' | 'mainnet';

export type Config = {
  network: Network;
  privateKey: string;
  relayerRpcUrl: string;
};

export const config: Config = {
  network: (process.env.BITCOIN_NETWORK as Network) || 'signet',
  privateKey: requiredEnv('BITCOIN_WIF_PRIVATE_KEY'),
  relayerRpcUrl: requiredEnv('BITHIVE_RELAYER_RPC_URL'),
};
