import * as okx from '@okxweb3/coin-bitcoin';
import { ECPairFactory, ECPairInterface } from 'ecpair';
import * as ecc from 'tiny-secp256k1';
import * as bitcoin from 'bitcoinjs-lib';
import { SignatureType } from '@bithive/relayer-api';

type AddressType = 'NativeSegwit' | 'NestedSegwit' | 'Legacy';

export type SignPsbtOptions = {
  autoFinalized?: boolean;
  toSignInputs?: {
    index: number;
    publicKey: string;
    signatureTypes?: number[];
  }[];
};

export type BitcoinProvider = {
  signPsbt: (psbt: string, options?: SignPsbtOptions) => string;
  signMessage: (message: string, signatureType?: SignatureType) => string;
};

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

  getPrivateKeyRaw(): Buffer {
    if (!this.keyPair.privateKey) {
      throw Error('Private key not found');
    }
    return this.keyPair.privateKey;
  }

  getPrivateKeyHex(): string {
    return this.getPrivateKeyRaw().toString('hex');
  }

  getPrivateKeyWif(): string {
    return this.keyPair.toWIF();
  }

  getPublicKeyRaw(): Buffer {
    return this.keyPair.publicKey;
  }

  getPublicKeyHex(): string {
    return this.getPublicKeyRaw().toString('hex');
  }

  getPublicKey(): string {
    return this.getPublicKeyHex();
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

  signPsbt(psbtHex: string, options?: SignPsbtOptions): string {
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

  signMessage(message: string, signatureType: SignatureType = 'ECDSA'): string {
    if (signatureType === 'ECDSA') {
      return this.signMessageEcdsa(message);
    } else {
      return this.signMessageBip32Full(
        message,
        signatureType.Bip322Full.address,
      );
    }
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
