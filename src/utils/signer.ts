import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory, ECPairInterface } from 'ecpair';
import * as ecc from 'tiny-secp256k1';

import { SignatureType } from '@bithive/relayer-api';
import * as okx from '@okxweb3/coin-bitcoin';

type AddressType = 'NativeSegwit' | 'NestedSegwit' | 'Legacy';

export type SignPsbtOptions = {
  autoFinalized?: boolean;
  toSignInputs?: {
    index: number;
    publicKey: string;
    signatureTypes?: number[];
  }[];
};

/**
 * Bitcoin provider interface that is compatible with BTC wallets like UniSat, OKX Wallet, etc.
 */
export interface BitcoinProvider {
  signPsbt: (psbt: string, options?: SignPsbtOptions) => Promise<string>;
  signMessage: (
    message: string,
    signatureType?: SignatureType,
  ) => Promise<string>;
}

export class BitcoinSigner implements BitcoinProvider {
  keyPair: ECPairInterface;

  get network(): bitcoin.Network {
    return this.keyPair.network;
  }

  constructor(keyPair: ECPairInterface) {
    this.keyPair = keyPair;
  }

  static fromWif(privateKey: string, network: bitcoin.Network): BitcoinSigner {
    const ECPair = ECPairFactory(ecc);
    const keyPair = ECPair.fromWIF(privateKey, network);
    return new BitcoinSigner(keyPair);
  }

  static fromRandom(network: bitcoin.Network): BitcoinSigner {
    const ECPair = ECPairFactory(ecc);
    const keyPair = ECPair.makeRandom({
      network,
    });
    return new BitcoinSigner(keyPair);
  }

  toWif(): string {
    return this.keyPair.toWIF();
  }

  getPrivateKeyRaw(): Buffer {
    if (!this.keyPair.privateKey) {
      throw Error('Private key not found');
    }
    return this.keyPair.privateKey;
  }

  getPrivateKey(): string {
    return this.getPrivateKeyRaw().toString('hex');
  }

  getPublicKeyRaw(): Buffer {
    return this.keyPair.publicKey;
  }

  getPublicKey(): string {
    return this.getPublicKeyRaw().toString('hex');
  }

  getAddress(addressType: AddressType = 'NativeSegwit'): string {
    if (addressType === 'NativeSegwit') {
      return this.getAddressNativeSegwit();
    } else if (addressType === 'NestedSegwit') {
      return this.getAddressNestedSegwit();
    } else if (addressType === 'Legacy') {
      return this.getAddressLegacy();
    } else {
      throw Error(`Unexpected address type: ${addressType}`);
    }
  }

  private getAddressNativeSegwit(): string {
    const payment = bitcoin.payments.p2wpkh({
      network: this.network,
      pubkey: this.keyPair.publicKey,
    });

    if (!payment.address) {
      throw Error('Bad P2WPKH payment');
    }

    return payment.address;
  }

  private getAddressNestedSegwit(): string {
    let payment = bitcoin.payments.p2wpkh({
      network: this.network,
      pubkey: this.keyPair.publicKey,
    });

    payment = bitcoin.payments.p2sh(payment);

    if (!payment.address) {
      throw Error('Bad P2SH payment');
    }

    return payment.address;
  }

  private getAddressLegacy(): string {
    const payment = bitcoin.payments.p2pkh({
      network: this.network,
      pubkey: this.keyPair.publicKey,
    });

    if (!payment.address) {
      throw Error('Bad P2PKH payment');
    }

    return payment.address;
  }

  async signPsbt(psbtHex: string, options?: SignPsbtOptions): Promise<string> {
    const psbt = bitcoin.Psbt.fromHex(psbtHex, { network: this.network });
    const autoFinalized = options?.autoFinalized ?? true;

    if (options?.toSignInputs) {
      for (const input of options.toSignInputs) {
        psbt.signInput(input.index, this.keyPair, input.signatureTypes);
      }
    } else {
      psbt.signAllInputs(this.keyPair);
    }

    if (autoFinalized) {
      if (options?.toSignInputs) {
        for (const input of options.toSignInputs) {
          psbt.finalizeInput(input.index);
        }
      } else {
        psbt.finalizeAllInputs();
      }
    }

    return psbt.toHex();
  }

  async signMessage(
    message: string,
    signatureType: SignatureType = 'ECDSA',
  ): Promise<string> {
    if (signatureType === 'ECDSA') {
      return this.signMessageEcdsa(message);
    }
    return this.signMessageBip32Full(message, signatureType.Bip322Full.address);
  }

  private signMessageEcdsa(message: string): string {
    return okx.message.sign(this.keyPair.toWIF(), message, this.network);
  }

  private signMessageBip32Full(
    /* eslint-disable @typescript-eslint/no-unused-vars */ message: string,
    /* eslint-disable @typescript-eslint/no-unused-vars */ address: string,
  ): string {
    throw Error('Unimplemented');
  }
}
