import axios from "axios";
import {
  getStellarPk,
  getStellarSk,
  getUserFromPseudonim,
} from "./steps/common";
import CryptoMaterial from "../../../crypto-material/crypto-material.json";
import { RunSorobanTransactionRequest } from "@hyperledger/cacti-plugin-ledger-connector-stellar";
import {
  assetReferenceContractSpecXdr,
  tokenContractSpecXdr,
} from "../../../main/typescript/infrastructure/contract-specs";

// const FABRIC_CHANNEL_NAME = "mychannel";
// const FABRIC_CONTRACT_CBDC_ERC20_NAME = "cbdc";
// const FABRIC_CONTRACT_ASSET_REF_NAME = "asset-reference-contract";

export const getTokenContracId = () => {
  return "CA5UMBHBNYC756PHCXCBWAJTPN6EWMZY4JCAXPAV5DUKYMP266PFGZX3";
};
export const getAssetRefContractId = () => {
  return "CDPGSCZ4QDRPMR46VWYGW26Q7ZND3EXKI7WZJDGRXNWGHT7W2MPYYMN4";
};

export const getAdminTxInvocation = () => {
  return getTxInvocation(
    "GC3GGI5BPDK4JQ5JOS4MELLBXDPJNAXZMFW3OV34PJIBWT4HSBQDGPH3",
    "SCVG6LOL7XBE5WKNRHLUMRTCQZ64HBG6AY5ZQWD4IAWJPANLXKYSPVM5",
  );
};

export const getTxInvocation = (userPk: string, userSk: string) => {
  return {
    header: {
      source: userPk,
      fee: 100000,
      timeout: 45,
    },
    signers: [userSk],
  };
};

export async function getStellarBalance(identity: string): Promise<number> {
  const response = await axios.post(
    "http://127.0.0.1:4000/api/v1/plugins/@hyperledger/cacti-plugin-ledger-connector-stellar/run-soroban-transaction",
    {
      contractId: getTokenContracId(),
      specXdr: tokenContractSpecXdr,
      method: "balance",
      methodArgs: {
        id: identity,
      },
      transactionInvocation: getAdminTxInvocation(),
      readOnly: true,
      // contractName: FABRIC_CONTRACT_CBDC_ERC20_NAME,
      // channelName: FABRIC_CHANNEL_NAME,
      // params: [identity],
      // methodName: "BalanceOf",
      // invocationType: "FabricContractInvocationType.CALL",
      // signingCredential: {
      //   keychainId: CryptoMaterial.keychains.keychain1.id,
      //   keychainRef: "userA",
      // },
    } as RunSorobanTransactionRequest,
  );

  return parseInt(response.data.result);
}

export async function readStellarAssetReference(
  assetRefID: string,
): Promise<any> {
  const response = await axios.post(
    "http://127.0.0.1:4000/api/v1/plugins/@hyperledger/cacti-plugin-ledger-connector-stellar/run-soroban-transaction",
    {
      contractId: getAssetRefContractId(),
      specXdr: assetReferenceContractSpecXdr,
      method: "get_asset_reference",
      methodArgs: {
        id: assetRefID,
      },
      transactionInvocation: getAdminTxInvocation(),
      readOnly: true,
      //   contractName: FABRIC_CONTRACT_ASSET_REF_NAME,
      //   channelName: FABRIC_CHANNEL_NAME,
      //   params: [assetRefID],
      //   methodName: "ReadAssetReference",
      //   invocationType: "FabricContractInvocationType.CALL",
      //   signingCredential: {
      //     keychainId: CryptoMaterial.keychains.keychain1.id,
      //     keychainRef: "userA",
      //   },
      // },
    } as RunSorobanTransactionRequest,
  );

  return JSON.parse(response.data.result);
}

export async function stellarAssetReferenceExists(
  assetRefID: string,
): Promise<string> {
  const response = await axios.post(
    "http://127.0.0.1:4000/api/v1/plugins/@hyperledger/cacti-plugin-ledger-connector-stellar/run-soroban-transaction",
    {
      contractId: getAssetRefContractId(),
      specXdr: assetReferenceContractSpecXdr,
      method: "is_present",
      methodArgs: {
        id: assetRefID,
      },
      transactionInvocation: getAdminTxInvocation(),
      readOnly: true,
      // contractName: FABRIC_CONTRACT_ASSET_REF_NAME,
      // channelName: FABRIC_CHANNEL_NAME,
      // params: [assetRefID],
      // methodName: "AssetReferenceExists",
      // invocationType: "FabricContractInvocationType.CALL",
      // signingCredential: {
      //   keychainId: CryptoMaterial.keychains.keychain1.id,
      //   keychainRef: "userA",
      // },
    } as RunSorobanTransactionRequest,
  );

  return response.data.functionOutput;
}

export async function lockStellarAssetReference(
  user: string,
  assetRefID: string,
): Promise<any> {
  return axios.post(
    "http://127.0.0.1:4000/api/v1/plugins/@hyperledger/cacti-plugin-ledger-connector-stellar/run-soroban-transaction",
    {
      contractId: getAssetRefContractId(),
      specXdr: assetReferenceContractSpecXdr,
      method: "lock_asset_reference",
      methodArgs: {
        id: assetRefID,
      },
      transactionInvocation: getTxInvocation(
        getStellarPk(user),
        getStellarSk(user),
      ),
      // contractName: FABRIC_CONTRACT_ASSET_REF_NAME,
      // channelName: FABRIC_CHANNEL_NAME,
      // params: [assetRefID],
      // methodName: "LockAssetReference",
      // invocationType: "FabricContractInvocationType.SEND",
      // signingCredential: {
      //   keychainId: CryptoMaterial.keychains.keychain1.id,
      //   keychainRef: getUserFromPseudonim(user),
      // },
    } as RunSorobanTransactionRequest,
  );
}

export async function deleteStellarAssetReference(
  user: string,
  assetRefID: string,
): Promise<any> {
  return axios.post(
    "http://127.0.0.1:4000/api/v1/plugins/@hyperledger/cacti-plugin-ledger-connector-stellar/run-soroban-transaction",
    {
      contractId: getAssetRefContractId(),
      specXdr: assetReferenceContractSpecXdr,
      method: "delete_asset_reference",
      methodArgs: {
        id: assetRefID,
      },
      transactionInvocation: getTxInvocation(
        getStellarPk(user),
        getStellarSk(user),
      ),
      // contractName: FABRIC_CONTRACT_ASSET_REF_NAME,
      // channelName: FABRIC_CHANNEL_NAME,
      // params: [assetRefID],
      // methodName: "DeleteAssetReference",
      // invocationType: "FabricContractInvocationType.SEND",
      // signingCredential: {
      //   keychainId: CryptoMaterial.keychains.keychain1.id,
      //   keychainRef: getUserFromPseudonim(user),
      // },
    } as RunSorobanTransactionRequest,
  );
}

export async function refundStellarTokens(
  finalUserStellarID: string,
  amount: number,
  finalUserEthAddress: string,
): Promise<any> {
  return axios.post(
    "http://127.0.0.1:4000/api/v1/plugins/@hyperledger/cacti-plugin-ledger-connector-stellar/run-soroban-transaction",
    {
      // contractName: FABRIC_CONTRACT_ASSET_REF_NAME,
      // channelName: FABRIC_CHANNEL_NAME,
      // params: [amount.toString(), finalUserFabricID, finalUserEthAddress],
      // methodName: "Refund",
      // invocationType: "FabricContractInvocationType.SEND",
      // signingCredential: {
      //   keychainId: CryptoMaterial.keychains.keychain1.id,
      //   keychainRef: "bridge",
      // },
    },
  );
}

export async function resetStellar(): Promise<void> {
  await axios.post(
    "http://127.0.0.1:4000/api/v1/plugins/@hyperledger/cacti-plugin-ledger-connector-stellar/run-soroban-transaction",
    {
      contractId: getAssetRefContractId(),
      specXdr: assetReferenceContractSpecXdr,
      method: "reset_all_asset_refs_list",
      methodArgs: {},
      transactionInvocation: getAdminTxInvocation(),
      // contractName: FABRIC_CONTRACT_CBDC_ERC20_NAME,
      // channelName: FABRIC_CHANNEL_NAME,
      // params: [],
      // methodName: "ResetState",
      // invocationType: "FabricContractInvocationType.SEND",
      // signingCredential: {
      //   keychainId: CryptoMaterial.keychains.keychain1.id,
      //   keychainRef: "userA",
      // },
    } as RunSorobanTransactionRequest,
  );

  // await axios.post(
  //   "http://127.0.0.1:4000/api/v1/plugins/@hyperledger/cacti-plugin-ledger-connector-stellar/run-soroban-transaction",
  //   {
  //     contractName: FABRIC_CONTRACT_ASSET_REF_NAME,
  //     channelName: FABRIC_CHANNEL_NAME,
  //     params: [],
  //     methodName: "ResetState",
  //     invocationType: "FabricContractInvocationType.SEND",
  //     signingCredential: {
  //       keychainId: CryptoMaterial.keychains.keychain1.id,
  //       keychainRef: "userA",
  //     },
  //   },
  // );
}
