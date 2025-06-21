import {
  Chain,
  createPublicClient,
  createWalletClient,
  extractChain,
  http,
  HttpTransport,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import * as viemChains from 'viem/chains';

const chains = Object.values(viemChains) as Chain[];

/**
 * Creates a wallet client to read/write on-chain data.
 * @param chainId the chain Id.
 * @param privateKey the private key of the wallet.
 */
export function useWallet(chainId: number, privateKey: `0x${string}`) {
  return createWalletClient<HttpTransport<undefined, false>, Chain>({
    transport: http(),
    account: privateKeyToAccount(privateKey),
    chain: extractChain({
      chains,
      id: chainId,
    }),
  });
}

/**
 * Creates a public client to read on-chain data.
 * @param chainId the chain Id.
 */
export function useClient(chainId: number) {
  return createPublicClient({
    transport: http(),
    chain: extractChain({
      chains,
      id: chainId,
    }),
  });
}
