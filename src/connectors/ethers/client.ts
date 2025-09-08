import { ethers } from 'ethers';
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
 * @param chainId the chain ID.
 * @param privateKey the private key of the wallet.
 */
export function useWallet(
  chainId: number,
  privateKey: `0x${string}`,
  options?: ClientOptions
) {
  const chain = extractChain({
    chains,
    id: chainId,
  });
  const client = createWalletClient<HttpTransport<undefined, false>, Chain>({
    transport: http(options?.url),
    account: privateKeyToAccount(privateKey),
    chain,
  });
  Object.defineProperty(client, 'url', {
    value: options?.url || chain.rpcUrls.default.http.at(0),
    writable: false,
  });
  return client as typeof client & { url: string };
}

/**
 * Creates a public client to read on-chain data.
 * @param chainId the chain ID.
 */
export function useClient(chainId: number, options?: ClientOptions) {
  const chain = extractChain({
    chains,
    id: chainId,
  });
  const client = createPublicClient({
    transport: http(options?.url),
    chain,
  });
  Object.defineProperty(client, 'url', {
    value: options?.url || chain.rpcUrls.default.http.at(0),
    writable: false,
  });
  return client as typeof client & { url: string };
}

/**
 * Retrieves an {@link ethers.JsonRpcProvider} for a given network.
 * @param chainId Chain ID. of the network.
 * @see provider
 */
export function useProvider(chainId: number | `${number}`) {
  const chain = extractChain({
    chains,
    id: Number(chainId),
  });
  const url = chain.rpcUrls.default.http.at(0);
  const network = new ethers.Network(chain.name, chain.id);
  const provider = new ethers.JsonRpcProvider(url, network, {
    staticNetwork: network,
  });
  Object.defineProperty(provider, 'url', {
    value: url,
  });
  return provider as ethers.JsonRpcProvider & {
    url: string;
  };
}
