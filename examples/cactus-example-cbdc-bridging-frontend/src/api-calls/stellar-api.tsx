/* eslint-disable @typescript-eslint/no-explicit-any */
import axios from "axios";
import CryptoMaterial from "../crypto-material/crypto-material.json";
import { getEthAddress, getStellarPk, getStellarSk } from "./common";
import {
  tokenContractSpecXdr,
  assetReferenceContractSpecXdr,
} from "./contract-specs.ts";

// const FABRIC_CHANNEL_NAME = "mychannel";
// const FABRIC_CONTRACT_CBDC_ERC20_NAME = "cbdc";
// const FABRIC_CONTRACT_ASSET_REF_NAME = "asset-reference-contract";

export const getTokenContracId = () => {
  return "CD3BOYJNJ6VV3TNINAH5LGP4YT5HOEDHTLZ32C5YSH4H7FEH3LSU66MF";
};
export const getAssetRefContractId = () => {
  return "CDNTAWVVIOW4Y4JRWQJDUTE5VLR2KKO5ENG63WKWLSF3PDITASQ5LBDQ";
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

export async function getStellarBalance(frontendUser: string) {
  const response = await axios.post(
    "http://127.0.0.1:4000/api/v1/plugins/@hyperledger/cacti-plugin-ledger-connector-stellar/run-soroban-transaction",
    {
      contractId: getTokenContracId(),
      specXdr: tokenContractSpecXdr,
      method: "balance",
      methodArgs: {
        id: getStellarPk(frontendUser),
      },
      transactionInvocation: getAdminTxInvocation(),
      readOnly: true,
    },
  );

  return parseInt(response.data.result);
}

export async function mintTokensStellar(frontendUser: string, amount: string) {
  const response = await axios.post(
    "http://127.0.0.1:4000/api/v1/plugins/@hyperledger/cacti-plugin-ledger-connector-stellar/run-soroban-transaction",
    {
      contractId: getTokenContracId(),
      specXdr: tokenContractSpecXdr,
      method: "mint",
      methodArgs: {
        to: getStellarPk(frontendUser),
        amount: amount,
      },
      transactionInvocation: getAdminTxInvocation(),
    },
  );

  if (response.status === 200) {
    // throw error
  }
}

export async function transferTokensStellar(
  frontendUserFrom: string,
  frontendUserTo: string,
  amount: string,
) {
  const to = getStellarPk(frontendUserTo);
  const response = await axios.post(
    "http://127.0.0.1:4000/api/v1/plugins/@hyperledger/cacti-plugin-ledger-connector-stellar/run-soroban-transaction",
    {
      contractId: getTokenContracId(),
      specXdr: tokenContractSpecXdr,
      method: "transfer",
      methodArgs: {
        from: getStellarPk(frontendUserFrom),
        to: to,
        amount: amount,
      },
      transactionInvocation: getTxInvocation(
        getStellarPk(frontendUserFrom),
        getStellarSk(frontendUserFrom),
      ),
    },
  );

  if (response.status === 200) {
    // throw error
  }
}

export async function escrowTokensStellar(
  frontendUser: string,
  amount: string,
  assetRefID: string,
) {
  const response = await axios.post(
    "http://127.0.0.1:4000/api/v1/plugins/@hyperledger/cacti-plugin-ledger-connector-stellar/run-soroban-transaction",
    {
      contractId: getTokenContracId(),
      specXdr: tokenContractSpecXdr,
      method: "escrow",
      methodArgs: {
        from: getStellarPk(frontendUser),
        amount: amount,
        asset_ref_id: assetRefID,
      },
      transactionInvocation: {
        ...getTxInvocation(
          getStellarPk(frontendUser),
          getStellarSk(frontendUser),
        ),
        signers: [
          ...getTxInvocation(
            getStellarPk(frontendUser),
            getStellarSk(frontendUser),
          ).signers,
          ...getAdminTxInvocation().signers,
        ],
      },
    },
  );

  if (response.status === 200) {
    // throw error
  }
}

export async function bridgeOutTokensStellar(
  frontendUser: string,
  amount: string,
  assetRefID: string,
) {
  const stellarPk = getStellarPk(frontendUser);
  const address = getEthAddress(frontendUser);

  const assetProfile = {
    expirationDate: new Date(2060, 11, 24).toString(),
    issuer: "CB1",
    assetCode: "CBDC1",
    // since there is no link with the asset information,
    // we are just passing the asset parameters like this
    // [amountBeingTransferred, stellarPk, ethAddress]
    keyInformationLink: [amount.toString(), stellarPk, address],
  };

  await axios.post(
    "http://localhost:4000/api/v1/@hyperledger/cactus-plugin-satp-hermes/clientrequest",
    {
      clientGatewayConfiguration: {
        apiHost: `http://localhost:4000`,
      },
      serverGatewayConfiguration: {
        apiHost: `http://localhost:4100`,
      },
      version: "0.0.0",
      loggingProfile: "dummyLoggingProfile",
      accessControlProfile: "dummyAccessControlProfile",
      applicationProfile: "dummyApplicationProfile",
      payloadProfile: {
        assetProfile,
        capabilities: "",
      },
      assetProfile: assetProfile,
      assetControlProfile: "dummyAssetControlProfile",
      beneficiaryPubkey: "dummyPubKey",
      clientDltSystem: "DLT1",
      originatorPubkey: "dummyPubKey",
      recipientGatewayDltSystem: "DLT2",
      recipientGatewayPubkey: CryptoMaterial.gateways["gateway2"].publicKey,
      serverDltSystem: "DLT2",
      sourceGatewayDltSystem: "DLT1",
      clientIdentityPubkey: "",
      serverIdentityPubkey: "",
      maxRetries: 5,
      maxTimeout: 5000,
      sourceLedgerAssetID: assetRefID,
      recipientLedgerAssetID: "STELLAR_ASSET_ID",
    },
  );
}

export async function getAssetReferencesStellar(frontendUser: string) {
  const response = await axios.post(
    "http://127.0.0.1:4000/api/v1/plugins/@hyperledger/cacti-plugin-ledger-connector-stellar/run-soroban-transaction",
    {
      contractId: getAssetRefContractId(),
      specXdr: assetReferenceContractSpecXdr,
      method: "get_all_asset_references",
      methodArgs: {},
      transactionInvocation: getTxInvocation(
        getStellarPk(frontendUser),
        getStellarSk(frontendUser),
      ),
      readOnly: true,
    },
  );

  return (
    response.data.result
      //.filter((asset: any) => typeof asset === "object")
      .map((asset: any) => {
        asset.recipient = getUserFromstellarPk(asset.recipient);
        return asset;
      })
  );
}

export function getUserFromstellarPk(stellarPk: string): string {
  switch (stellarPk) {
    case CryptoMaterial.accounts["userA"].stellarPk:
      return "Alice";
    case CryptoMaterial.accounts["userB"].stellarPk:
      return "Charlie";
    case CryptoMaterial.accounts["bridge"].stellarPk:
      return "Bridge";
    default:
      return "";
  }
}
