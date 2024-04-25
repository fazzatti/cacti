import { Given, When, Then, Before, After } from "cucumber";
import axios from "axios";
import CryptoMaterial from "../../../../crypto-material/crypto-material.json";
import {
  getEthAddress,
  assertEqual,
  assertNonNullish,
  assertStringContains,
  getStellarPk,
  getStellarSk,
} from "./common";
import {
  deleteStellarAssetReference,
  getAdminTxInvocation,
  getAssetRefContractId,
  getStellarBalance,
  getTokenContracId,
  getTxInvocation,
  lockStellarAssetReference,
  readStellarAssetReference,
  refundStellarTokens,
  resetStellar,
  stellarAssetReferenceExists,
} from "../stellar-helper";
import { RunSorobanTransactionRequest } from "@hyperledger/cacti-plugin-ledger-connector-stellar";
import {
  assetReferenceContractSpecXdr,
  tokenContractSpecXdr,
} from "../../../../main/typescript/infrastructure/contract-specs";

// const FABRIC_CHANNEL_NAME = "mychannel";
// const FABRIC_CONTRACT_CBDC_ERC20_NAME = "cbdc";
// const FABRIC_CONTRACT_ASSET_REF_NAME = "asset-reference-contract";

Before({ timeout: 20 * 1000, tags: "@fabric" }, async function () {
  await resetStellar();
});

After({ timeout: 20 * 1000, tags: "@fabric" }, async function () {
  await resetStellar();
});

Given(
  "{string} with {int} CBDC available in the source chain",
  { timeout: 10 * 1000 },
  async function (user: string, amount: number) {
    await axios.post(
      "http://127.0.0.1:4000/api/v1/plugins/@hyperledger/cacti-plugin-ledger-connector-stellar/run-soroban-transaction",
      {
        contractId: getTokenContracId(),
        specXdr: tokenContractSpecXdr,
        method: "mint",
        methodArgs: {
          to: getStellarPk(user),
          amount: amount,
        },
        transactionInvocation: getAdminTxInvocation(),
        // contractName: FABRIC_CONTRACT_CBDC_ERC20_NAME,
        // channelName: FABRIC_CHANNEL_NAME,
        // params: [amount.toString()],
        // methodName: "Mint",
        // invocationType: "FabricContractInvocationType.SEND",
        // signingCredential: {
        //   keychainId: CryptoMaterial.keychains.keychain1.id,
        //   keychainRef: getUserFromPseudonim("alice"),
        // },
      } as RunSorobanTransactionRequest,
    );

    assertEqual(await getStellarBalance(getStellarPk(user)), amount);
  },
);

When(
  "{string} escrows {int} CBDC and creates an asset reference with id {string} in the source chain",
  { timeout: 10 * 1000 },
  async function (user: string, amount: number, assetRefID: string) {
    await axios.post(
      "http://127.0.0.1:4000/api/v1/plugins/@hyperledger/cacti-plugin-ledger-connector-stellar/run-soroban-transaction",
      {
        contractId: getTokenContracId(),
        specXdr: tokenContractSpecXdr,
        method: "escrow",
        methodArgs: {
          from: getStellarPk(user),
          amount: amount,
          asset_ref_id: assetRefID,
        },
        transactionInvocation: getTxInvocation(
          getStellarPk(user),
          getStellarSk(user),
        ),
        //   contractName: FABRIC_CONTRACT_CBDC_ERC20_NAME,
        //   channelName: FABRIC_CHANNEL_NAME,
        //   params: [amount.toString(), assetRefID],
        //   methodName: "Escrow",
        //   invocationType: "FabricContractInvocationType.SEND",
        //   signingCredential: {
        //     keychainId: CryptoMaterial.keychains.keychain1.id,
        //     keychainRef: getUserFromPseudonim(user),
        //   },
      } as RunSorobanTransactionRequest,
    );
  },
);

When(
  "{string} locks the asset reference with id {string} in the source chain",
  { timeout: 10 * 1000 },
  async function (user: string, assetRefID: string) {
    await lockStellarAssetReference(user, assetRefID);
  },
);

When(
  "{string} locks and deletes an asset reference with id {string} in the source chain",
  { timeout: 10 * 1000 },
  async function (user: string, assetRefID: string) {
    await lockStellarAssetReference(user, assetRefID);
    await deleteStellarAssetReference(user, assetRefID);
  },
);

When(
  "bob refunds {int} CBDC to {string} in the source chain",
  { timeout: 10 * 1000 },
  async function (amount: number, userTo: string) {
    const finalUserStellarID = getStellarPk(userTo);
    const finalUserEthAddress = getEthAddress(userTo);

    await refundStellarTokens(finalUserStellarID, amount, finalUserEthAddress);
  },
);

Then(
  "{string} fails to lock the asset reference with id {string} in the source chain",
  { timeout: 10 * 1000 },
  async function (user: string, assetRefID: string) {
    return axios
      .post(
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

          //   contractName: FABRIC_CONTRACT_ASSET_REF_NAME,
          //   channelName: FABRIC_CHANNEL_NAME,
          //   params: [assetRefID],
          //   methodName: "LockAssetReference",
          //   invocationType: "FabricContractInvocationType.CALL",
          //   signingCredential: {
          //     keychainId: CryptoMaterial.keychains.keychain1.id,
          //     keychainRef: getUserFromPseudonim(user),
          //   },
        } as RunSorobanTransactionRequest,
      )
      .catch((err) => {
        assertStringContains(
          err.response.data.error,
          `client is not authorized to perform the operation`,
        );
      });
  },
);

Then(
  "{string} fails to transfer {int} CBDC to {string}",
  { timeout: 10 * 1000 },
  async function (userFrom: string, amount: number, userTo: string) {
    const recipient = getStellarPk(userTo);

    axios
      .post(
        "http://127.0.0.1:4000/api/v1/plugins/@hyperledger/cacti-plugin-ledger-connector-stellar/run-soroban-transaction",
        {
          contractId: getTokenContracId(),
          specXdr: tokenContractSpecXdr,
          method: "transfer",
          methodArgs: {
            from: getStellarPk(userFrom),
            to: recipient,
            amount: amount,
          },
          transactionInvocation: getTxInvocation(
            getStellarPk(userFrom),
            getStellarSk(userFrom),
          ),
          //   contractName: FABRIC_CONTRACT_CBDC_ERC20_NAME,
          //   channelName: FABRIC_CHANNEL_NAME,
          //   params: [recipient, amount.toString()],
          //   methodName: "Transfer",
          //   invocationType: "FabricContractInvocationType.CALL",
          //   signingCredential: {
          //     keychainId: CryptoMaterial.keychains.keychain1.id,
          //     keychainRef: getUserFromPseudonim(userFrom),
          //   },
        } as RunSorobanTransactionRequest,
      )
      .catch((err) => {
        assertStringContains(err.response.data.error, `has insufficient funds`);
      });
  },
);

Then(
  "{string} has {int} CBDC available in the source chain",
  { timeout: 10 * 1000 },
  async function (user: string, amount: number) {
    assertEqual(await getStellarBalance(getStellarPk(user)), amount);
  },
);

Then(
  "the asset reference chaincode has an asset reference with id {string}",
  { timeout: 10 * 1000 },
  async function (assetRefID: string) {
    assertNonNullish(await readStellarAssetReference(assetRefID));
  },
);

Then(
  "the asset reference with id {string} is locked in the source chain",
  { timeout: 10 * 1000 },
  async function (assetRefID: string) {
    assertEqual((await readStellarAssetReference(assetRefID)).isLocked, true);
  },
);

Then(
  "the asset reference chaincode has no asset reference with id {string}",
  { timeout: 10 * 1000 },
  async function (assetRefID: string) {
    assertEqual(await stellarAssetReferenceExists(assetRefID), "false");
  },
);
