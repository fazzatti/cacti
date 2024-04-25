// /* eslint-disable @typescript-eslint/explicit-module-boundary-types */
import { Configuration } from "@hyperledger/cactus-core-api";
// import {
//   DefaultApi as FabricApi,
//   FabricContractInvocationType,
//   FabricSigningCredential,
//   RunTransactionRequest as FabricRunTransactionRequest,
// } from "@hyperledger/cactus-plugin-ledger-connector-fabric";

import {
  DefaultApi as StellarApi,
  RunSorobanTransactionRequest as StellarRunTransactionRequest,
  TransactionInvocation,
} from "@hyperledger/cacti-plugin-ledger-connector-stellar";
import { DefaultAccountHandler } from "stellar-plus/lib/stellar-plus/account";
import { NetworkConfig } from "stellar-plus/lib/stellar-plus/network";
import {
  IPluginSatpGatewayConstructorOptions,
  PluginSatpGateway,
  SessionDataRollbackActionsPerformedEnum,
} from "@hyperledger/cactus-plugin-satp-hermes";

export interface IStellarSatpGatewayConstructorOptions
  extends IPluginSatpGatewayConstructorOptions {
  stellarPath?: string;
  assetAdminSk: string;
  stellarNetworkConfig: NetworkConfig;
  tokenContractId: string;
  tokenContractSpecXdr: string[];
  assetReferenceContractId: string;
  assetReferenceContractSpecXdr: string[];
}

export class StellarSatpGateway extends PluginSatpGateway {
  public stellarApi?: StellarApi;
  private assetAdmin: DefaultAccountHandler;
  private networkConfig: NetworkConfig;
  private tokenContractId: string;
  private tokenContractSpecXdr: string[];
  private assetReferenceContractId: string;
  private assetReferenceContractSpecXdr: string[];

  // public stellarSigningCredential?: StellarSigningCredential;
  // public stellarChannelName?: string;
  // public stellarContractName?: string;

  public constructor(options: IStellarSatpGatewayConstructorOptions) {
    super({
      name: options.name,
      dltIDs: options.dltIDs,
      instanceId: options.instanceId,
      keyPair: options.keyPair,
      backupGatewaysAllowed: options.backupGatewaysAllowed,
      ipfsPath: options.ipfsPath,
      clientHelper: options.clientHelper,
      serverHelper: options.serverHelper,
      knexLocalConfig: options.knexLocalConfig,
      knexRemoteConfig: options.knexRemoteConfig,
    });

    if (options.stellarPath != undefined) this.defineStellarConnection(options);
    this.networkConfig = options.stellarNetworkConfig;
    this.assetAdmin = new DefaultAccountHandler({
      networkConfig: this.networkConfig,
      secretKey: options.assetAdminSk,
    });

    this.tokenContractId = options.tokenContractId;
    this.tokenContractSpecXdr = options.tokenContractSpecXdr;
    this.assetReferenceContractId = options.assetReferenceContractId;
    this.assetReferenceContractSpecXdr = options.assetReferenceContractSpecXdr;
  }

  private defaultTxInvocation(
    account: DefaultAccountHandler = this.assetAdmin,
  ): TransactionInvocation {
    return {
      header: {
        source: account.getPublicKey(),
        fee: 10000000,
        timeout: 45,
      },
      signers: [account.getSecretKey()],
    };
  }

  private defineStellarConnection(
    options: IStellarSatpGatewayConstructorOptions,
  ): void {
    const fnTag = `${this.className}#defineStellarConnection()`;

    const config = new Configuration({ basePath: options.stellarPath });
    const apiClient = new StellarApi(config);
    this.stellarApi = apiClient;
    const notEnoughStellarParams: boolean = false;
    // options.fabricSigningCredential == undefined ||
    // options.fabricChannelName == undefined ||
    // options.fabricContractName == undefined;

    if (notEnoughStellarParams) {
      throw new Error(
        `${fnTag}, stellar params missing should have: signing credentials, contract name, channel name, asset ID`,
      );
    }
    // this.fabricSigningCredential = options.fabricSigningCredential;
    // this.fabricChannelName = options.fabricChannelName;
    // this.fabricContractName = options.fabricContractName;
  }

  async lockAsset(sessionID: string, assetId?: string): Promise<string> {
    const fnTag = `${this.className}#lockAsset()`;

    const sessionData = this.sessions.get(sessionID);

    if (sessionData == undefined) {
      throw new Error(`${fnTag}, session data is not correctly initialized`);
    }

    let stellarLockAssetProof = "";

    if (assetId == undefined) {
      assetId = sessionData.sourceLedgerAssetID;
    }

    await this.storeLog({
      sessionID: sessionID,
      type: "exec",
      operation: "lock-asset",
      data: JSON.stringify(sessionData),
    });

    if (this.stellarApi != undefined) {
      const response = await this.stellarApi.runSorobanTransactionV1({
        contractId: this.assetReferenceContractId,
        specXdr: this.assetReferenceContractSpecXdr,
        method: "lock_asset_reference",
        methodArgs: {
          id: assetId,
        },
        transactionInvocation: this.defaultTxInvocation(),
      } as StellarRunTransactionRequest);

      // const receiptLockRes = await this.fabricApi.getTransactionReceiptByTxIDV1(
      //   {
      //     signingCredential: this.fabricSigningCredential,
      //     channelName: this.fabricChannelName,
      //     contractName: "qscc",
      //     invocationType: FabricContractInvocationType.Call,
      //     methodName: "GetBlockByTxID",
      //     params: [this.fabricChannelName, response.data.transactionId],
      //   } as FabricRunTransactionRequest,
      // );

      // this.log.warn(receiptLockRes.data);
      // fabricLockAssetProof = JSON.stringify(receiptLockRes.data);

      stellarLockAssetProof = JSON.stringify(response.data);
    }

    sessionData.lockEvidenceClaim = stellarLockAssetProof;

    this.sessions.set(sessionID, sessionData);

    this.log.info(
      `${fnTag}, proof of the asset lock: ${stellarLockAssetProof}`,
    );

    await this.storeProof({
      sessionID: sessionID,
      type: "proof",
      operation: "lock",
      data: stellarLockAssetProof,
    });

    await this.storeLog({
      sessionID: sessionID,
      type: "done",
      operation: "lock-asset",
      data: JSON.stringify(sessionData),
    });

    return stellarLockAssetProof;
  }

  async unlockAsset(sessionID: string, assetId?: string): Promise<string> {
    const fnTag = `${this.className}#unlockAsset()`;

    const sessionData = this.sessions.get(sessionID);

    if (
      sessionData == undefined ||
      sessionData.rollbackActionsPerformed == undefined ||
      sessionData.rollbackProofs == undefined
    ) {
      throw new Error(`${fnTag}, session data is not correctly initialized`);
    }

    let stellarUnlockAssetProof = "";

    await this.storeLog({
      sessionID: sessionID,
      type: "exec-rollback",
      operation: "unlock-asset",
      data: JSON.stringify(sessionData),
    });

    if (this.stellarApi != undefined) {
      const response = await this.stellarApi.runSorobanTransactionV1({
        contractId: this.assetReferenceContractId,
        specXdr: this.assetReferenceContractSpecXdr,
        method: "unlock_asset_reference",
        methodArgs: {
          id: assetId,
        },
        transactionInvocation: this.defaultTxInvocation(),
      } as StellarRunTransactionRequest);

      stellarUnlockAssetProof = JSON.stringify(response.data);

      // const receiptUnlock = await this.fabricApi.getTransactionReceiptByTxIDV1({
      //   signingCredential: this.fabricSigningCredential,
      //   channelName: this.fabricChannelName,
      //   contractName: "qscc",
      //   invocationType: FabricContractInvocationType.Call,
      //   methodName: "GetBlockByTxID",
      //   params: [this.fabricChannelName, response.data.transactionId],
      // } as FabricRunTransactionRequest);

      // this.log.warn(receiptUnlock.data);
      // fabricUnlockAssetProof = JSON.stringify(receiptUnlock.data);
    }

    sessionData.rollbackActionsPerformed.push(
      SessionDataRollbackActionsPerformedEnum.Unlock,
    );
    sessionData.rollbackProofs.push(stellarUnlockAssetProof);

    this.sessions.set(sessionID, sessionData);

    this.log.info(
      `${fnTag}, proof of the asset unlock: ${stellarUnlockAssetProof}`,
    );

    await this.storeProof({
      sessionID: sessionID,
      type: "proof-rollback",
      operation: "unlock",
      data: stellarUnlockAssetProof,
    });

    await this.storeLog({
      sessionID: sessionID,
      type: "done-rollback",
      operation: "unlock-asset",
      data: JSON.stringify(sessionData),
    });

    return stellarUnlockAssetProof;
  }

  async deleteAsset(sessionID: string, assetId?: string): Promise<string> {
    const fnTag = `${this.className}#deleteAsset()`;

    const sessionData = this.sessions.get(sessionID);

    if (sessionData == undefined) {
      throw new Error(`${fnTag}, session data is not correctly initialized`);
    }

    let stellarUnlockAssetProof = "";

    if (assetId == undefined) {
      assetId = sessionData.sourceLedgerAssetID;
    }

    await this.storeLog({
      sessionID: sessionID,
      type: "exec",
      operation: "delete-asset",
      data: JSON.stringify(sessionData),
    });

    if (this.stellarApi != undefined) {
      const response = await this.stellarApi.runSorobanTransactionV1({
        contractId: this.assetReferenceContractId,
        specXdr: this.assetReferenceContractSpecXdr,
        method: "delete_asset_reference",
        methodArgs: {
          id: assetId,
        },
        transactionInvocation: this.defaultTxInvocation(),
      } as StellarRunTransactionRequest);

      // const deleteRes = await this.fabricApi.runTransactionV1({
      //   signingCredential: this.fabricSigningCredential,
      //   channelName: this.fabricChannelName,
      //   contractName: this.fabricContractName,
      //   invocationType: FabricContractInvocationType.Send,
      //   methodName: "DeleteAsset",
      //   params: [assetId],
      // } as FabricRunTransactionRequest);

      // const receiptDeleteRes =
      //   await this.fabricApi.getTransactionReceiptByTxIDV1({
      //     signingCredential: this.fabricSigningCredential,
      //     channelName: this.fabricChannelName,
      //     contractName: "qscc",
      //     invocationType: FabricContractInvocationType.Call,
      //     methodName: "GetBlockByTxID",
      //     params: [this.fabricChannelName, deleteRes.data.transactionId],
      //   } as FabricRunTransactionRequest);

      // this.log.warn(receiptDeleteRes.data);
      // fabricDeleteAssetProof = JSON.stringify(receiptDeleteRes.data);

      stellarUnlockAssetProof = JSON.stringify(response.data);
    }

    sessionData.commitFinalClaim = stellarUnlockAssetProof;

    this.sessions.set(sessionID, sessionData);

    this.log.info(
      `${fnTag}, proof of the asset deletion: ${stellarUnlockAssetProof}`,
    );

    await this.storeProof({
      sessionID: sessionID,
      type: "proof",
      operation: "delete",
      data: stellarUnlockAssetProof,
    });

    await this.storeLog({
      sessionID: sessionID,
      type: "done",
      operation: "delete-asset",
      data: JSON.stringify(sessionData),
    });

    return stellarUnlockAssetProof;
  }

  async createAssetToRollback(
    sessionID: string,
    assetID?: string,
  ): Promise<string> {
    const fnTag = `${this.className}#createAsset()`;

    const sessionData = this.sessions.get(sessionID);

    if (
      sessionData == undefined ||
      this.assetAdmin == undefined ||
      this.assetReferenceContractId == undefined ||
      this.tokenContractId == undefined ||
      sessionData.rollbackProofs == undefined ||
      sessionData.rollbackActionsPerformed == undefined
    ) {
      throw new Error(`${fnTag}, session data is not correctly initialized`);
    }

    let stellarCreateAssetProof = "";

    if (assetID == undefined) {
      assetID = sessionData.recipientLedgerAssetID;
    }

    await this.storeLog({
      sessionID: sessionID,
      type: "exec-rollback",
      operation: "create-asset",
      data: JSON.stringify(sessionData),
    });

    if (this.stellarApi != undefined) {
      const response = await this.stellarApi.runSorobanTransactionV1({
        contractId: this.assetReferenceContractId,
        specXdr: this.assetReferenceContractSpecXdr,
        method: "create_asset_reference",
        methodArgs: {
          id: assetID,
        },
        transactionInvocation: this.defaultTxInvocation(),
      } as StellarRunTransactionRequest);

      stellarCreateAssetProof = JSON.stringify(response.data);

      // const response = await this.fabricApi.runTransactionV1({
      //   contractName: this.fabricContractName,
      //   channelName: this.fabricChannelName,
      //   params: [assetID!, "19"],
      //   methodName: "CreateAsset",
      //   invocationType: FabricContractInvocationType.Send,
      //   signingCredential: this.fabricSigningCredential,
      // });

      // const receiptCreate = await this.fabricApi.getTransactionReceiptByTxIDV1({
      //   signingCredential: this.fabricSigningCredential,
      //   channelName: this.fabricChannelName,
      //   contractName: "qscc",
      //   invocationType: FabricContractInvocationType.Call,
      //   methodName: "GetBlockByTxID",
      //   params: [this.fabricChannelName, response.data.transactionId],
      // } as FabricRunTransactionRequest);

      // this.log.warn(receiptCreate.data);
      // fabricCreateAssetProof = JSON.stringify(receiptCreate.data);
    }

    sessionData.rollbackActionsPerformed.push(
      SessionDataRollbackActionsPerformedEnum.Create,
    );

    sessionData.rollbackProofs.push(stellarCreateAssetProof);

    this.sessions.set(sessionID, sessionData);

    this.log.info(
      `${fnTag}, proof of the asset creation: ${stellarCreateAssetProof}`,
    );

    await this.storeProof({
      sessionID: sessionID,
      type: "proof-rollback",
      operation: "create",
      data: stellarCreateAssetProof,
    });

    await this.storeLog({
      sessionID: sessionID,
      type: "done-rollback",
      operation: "create-asset",
      data: JSON.stringify(sessionData),
    });

    return stellarCreateAssetProof;
  }

  // Not implementing these methods because this class is an example
  // of a client gateway. They are only used for server gateways.
  async createAsset(sessionID: string, assetID?: string): Promise<string> {
    return new Promise(() => `${sessionID}, ${assetID}`);
  }

  async deleteAssetToRollback(
    sessionID: string,
    assetID?: string,
  ): Promise<string> {
    return new Promise(() => `${sessionID}, ${assetID}`);
  }

  async rollback(sessionID: string): Promise<void> {
    const fnTag = `${this.className}#rollback()`;
    const sessionData = this.sessions.get(sessionID);

    if (
      sessionData == undefined ||
      sessionData.step == undefined ||
      sessionData.lastSequenceNumber == undefined
    ) {
      throw new Error(`${fnTag}, session data is undefined`);
    }

    sessionData.rollback = true;

    this.log.info(`${fnTag}, rolling back session ${sessionID}`);

    if (
      this.stellarApi == undefined ||
      this.tokenContractId == undefined ||
      this.assetReferenceContractId == undefined ||
      this.assetAdmin == undefined ||
      sessionData.sourceLedgerAssetID == undefined ||
      sessionData.recipientLedgerAssetID == undefined
    ) {
      return;
    }

    if (this.isClientGateway(sessionID)) {
      if (await this.stellarAssetExists(sessionData.sourceLedgerAssetID)) {
        if (await this.isStellarAssetLocked(sessionData.sourceLedgerAssetID)) {
          // Rollback locking of the asset
          await this.unlockAsset(sessionID, sessionData.sourceLedgerAssetID);
        }
      } else {
        // Rollback extinguishment of the asset
        await this.createAssetToRollback(
          sessionID,
          sessionData.sourceLedgerAssetID,
        );
      }
    } else {
      if (await this.stellarAssetExists(sessionData.sourceLedgerAssetID)) {
        await this.deleteAsset(sessionID, sessionData.recipientLedgerAssetID);
      }
    }
  }

  /* Helper functions */
  async stellarAssetExists(
    stellarAssetID: string,
  ): Promise<boolean | undefined> {
    const fnTag = `${this.className}#stellarAssetExists()`;

    if (
      this.tokenContractId == undefined ||
      this.assetReferenceContractId == undefined ||
      this.assetAdmin == undefined
    ) {
      throw new Error(`${fnTag} stellar config is not defined`);
    }

    const response = await this.stellarApi?.runSorobanTransactionV1({
      contractId: this.assetReferenceContractId,
      specXdr: this.assetReferenceContractSpecXdr,
      method: "is_present",
      methodArgs: {
        id: stellarAssetID,
      },
      transactionInvocation: this.defaultTxInvocation(),
      readOnly: true,
    } as StellarRunTransactionRequest);

    return (response?.data.result as unknown as boolean) === true
      ? true
      : false;

    //     const assetExists = await this.fabricApi?.runTransactionV1({
    //       contractName: this.fabricContractName,
    //       channelName: this.fabricChannelName,
    //       params: [fabricAssetID],
    //       methodName: "AssetExists",
    //       invocationType: FabricContractInvocationType.Send,
    //       signingCredential: this.fabricSigningCredential,
    //     });

    //     if (assetExists == undefined) {
    //       throw new Error(`${fnTag} the asset does not exist`);
    //     }

    //     return assetExists?.data.functionOutput == "true";
  }

  async isStellarAssetLocked(
    stellarAssetID: string,
  ): Promise<boolean | undefined> {
    const fnTag = `${this.className}#stellarAssetExists()`;

    if (
      this.tokenContractId == undefined ||
      this.assetReferenceContractId == undefined ||
      this.assetAdmin == undefined
    ) {
      throw new Error(`${fnTag} stellar config is not defined`);
    }

    const response = await this.stellarApi?.runSorobanTransactionV1({
      contractId: this.assetReferenceContractId,
      specXdr: this.assetReferenceContractSpecXdr,
      method: "is_asset_locked",
      methodArgs: {
        id: stellarAssetID,
      },
      transactionInvocation: this.defaultTxInvocation(),
      readOnly: true,
    } as StellarRunTransactionRequest);

    return (response?.data.result as unknown as boolean) === true
      ? true
      : false;

    //     const assetIsLocked = await this.fabricApi?.runTransactionV1({
    //       contractName: this.fabricContractName,
    //       channelName: this.fabricChannelName,
    //       params: [fabricAssetID],
    //       methodName: "IsAssetLocked",
    //       invocationType: FabricContractInvocationType.Send,
    //       signingCredential: this.fabricSigningCredential,
    //     });

    //     if (assetIsLocked == undefined) {
    //       throw new Error(`${fnTag} the asset does not exist`);
    //     }

    //     return assetIsLocked?.data.functionOutput == "true";
  }
}
