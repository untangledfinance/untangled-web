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

type ClientOptions = {
  /**
   * URL of the chain's JSON-RPC.
   */
  url?: string;
};

/**
 * Creates a wallet client to read/write on-chain data.
 * @param chainId the chain Id.
 * @param privateKey the private key of the wallet.
 */
export function useWallet(
  chainId: number,
  privateKey: `0x${string}`,
  options?: ClientOptions
) {
  return createWalletClient<HttpTransport<undefined, false>, Chain>({
    transport: http(options?.url),
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
export function useClient(chainId: number, options?: ClientOptions) {
  return createPublicClient({
    transport: http(options?.url),
    chain: extractChain({
      chains,
      id: chainId,
    }),
  });
}
