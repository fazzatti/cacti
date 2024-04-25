import { SupportedStellarNetworkChain } from "./supported-stellar-network-chain";
import {
  NetworkConfig,
  TestNet,
  FutureNet,
} from "stellar-plus/lib/stellar-plus/network";

export const getStellarChainConfiguration = (
  chain: SupportedStellarNetworkChain,
): NetworkConfig => {
  const fnTag = `$AssetBridgingBackend#getStellarChainConfiguration()`;

  switch (chain) {
    case SupportedStellarNetworkChain.TESTNET:
      return TestNet();
    case SupportedStellarNetworkChain.FUTURENET:
      return FutureNet();
    default:
      throw new Error(`${fnTag} Unsupported Stellar network chain: ${chain}`);
  }
};
