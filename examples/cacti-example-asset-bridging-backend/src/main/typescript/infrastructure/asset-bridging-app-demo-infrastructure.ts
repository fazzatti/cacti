import {
  Logger,
  Checks,
  LogLevelDesc,
  LoggerProvider,
} from "@hyperledger/cactus-common";
import {
  DeployContractV1Request,
  DeployContractV1Response,
  PluginLedgerConnectorStellar,
  RunSorobanTransactionRequest,
} from "@hyperledger/cacti-plugin-ledger-connector-stellar";
import { SupportedStellarNetworkChain } from "./supported-stellar-network-chain";
import { NetworkConfig } from "stellar-plus/lib/stellar-plus/network";
import { getStellarChainConfiguration } from "./stellar-network-chain-configuration";
import { v4 as uuidv4 } from "uuid";
import { IKeyPair } from "@hyperledger/cactus-plugin-satp-hermes";
import { BesuSatpGateway } from "../satp-extension/besu-satp-gateway";
import CryptoMaterial from "../../../crypto-material/crypto-material.json";
import {
  PluginFactoryLedgerConnector,
  PluginLedgerConnectorBesu,
  Web3SigningCredentialType,
  DefaultApi as BesuApi,
  DeployContractSolidityBytecodeV1Request,
  EthContractInvocationType,
  InvokeContractV1Request as BesuInvokeContractV1Request,
} from "@hyperledger/cactus-plugin-ledger-connector-besu";
import { ClientHelper } from "../satp-extension/client-helper";
import { ServerHelper } from "../satp-extension/server-helper";
import { StellarSatpGateway } from "../satp-extension/stellar-satp-gateway";
import AssetReferenceContractJson from "../../../solidity/asset-reference-contract/AssetReferenceContract.json";
import CBDCcontractJson from "../../../solidity/cbdc-erc-20/CBDCcontract.json";
import { PluginRegistry } from "@hyperledger/cactus-core";
import { BesuTestLedger } from "@hyperledger/cactus-test-tooling";
import { PluginKeychainMemory } from "@hyperledger/cactus-plugin-keychain-memory";
import { PluginImportType } from "@hyperledger/cactus-core-api";
import { DefaultApi as StellarApi } from "@hyperledger/cacti-plugin-ledger-connector-stellar";
import { DefaultAccountHandler } from "stellar-plus/lib/stellar-plus/account";
import {
  assetReferenceContractSpecXdr,
  tokenContractSpecXdr,
} from "./contract-specs";
import { loadWasmFile } from "../utils/load-wasm";
export interface IAssetBridgingAppDemoInfrastructure {
  logLevel?: LogLevelDesc;
  stellarNetworkChain?: SupportedStellarNetworkChain;
}

export class AssetBridgingAppDemoInfrastructure {
  public static readonly CLASS_NAME = "AssetBridgingAppDemoInfrastructure";

  private readonly log: Logger;
  private readonly stellarNetworkChain: SupportedStellarNetworkChain;

  private readonly besu: BesuTestLedger;

  constructor(public readonly options: IAssetBridgingAppDemoInfrastructure) {
    const fnTag = `${this.className}#constructor()`;

    const { logLevel } = options;
    const level = logLevel || "INFO";
    const label = "asset-bridging-app";
    this.log = LoggerProvider.getOrCreate({ level, label });

    this.besu = new BesuTestLedger({
      logLevel: level || "DEBUG",
      emitContainerLogs: true,
      envVars: ["BESU_NETWORK=dev"],
    });

    this.stellarNetworkChain =
      options.stellarNetworkChain || SupportedStellarNetworkChain.TESTNET;
  }

  public get className(): string {
    return AssetBridgingAppDemoInfrastructure.CLASS_NAME;
  }

  public async start(): Promise<void> {
    try {
      this.log.debug(`Starting Demo Infrastructure`);
      await Promise.all([
        this.besu.start(),
        /*using stellar test networks, no start process required*/
      ]);
      this.log.info(`Started Demo infrastructure OK`);
    } catch (error) {
      this.log.error(`Failed to start Demo infrastructure: `, error);
      throw error;
    }
  }

  public async stop(): Promise<void> {
    try {
      this.log.info(`Stopping Besu Test Ledger...`);
      await Promise.all([
        this.besu.stop().then(() => this.besu.destroy()),
        /*using stellar test networks, no stop process required*/
      ]);
      this.log.info(`Successfully stopped Besu Test Ledger`);
    } catch (error) {
      this.log.error(`Failed to stop Besu Test Ledger: `, error);
      throw error;
    }
  }

  // =======================================
  // Client: STELLAR
  // =======================================

  public async createStellarconnector(): Promise<PluginLedgerConnectorStellar> {
    const fnTag = `${this.className}#createStellarconnector()`;

    const networkConfig = getStellarChainConfiguration(
      this.stellarNetworkChain,
    );

    const pluginRegistry = new PluginRegistry({ plugins: [] });
    try {
      return new PluginLedgerConnectorStellar({
        instanceId: uuidv4(),
        networkConfig,
        pluginRegistry,
        logLevel: this.log.options.level || "INFO",
      });
    } catch (error) {
      this.log.error(
        `${fnTag} failed to create PluginLedgerConnectorStellar`,
        error,
      );
      throw error;
    }
  }

  public async createClientGateway(
    nodeApiHost: string,
    keyPair: IKeyPair,
    assetAdminSk: string,
  ): Promise<StellarSatpGateway> {
    this.log.info(`Creating Source Gateway...`);

    const networkConfig = getStellarChainConfiguration(
      this.stellarNetworkChain,
    );

    const pluginSourceGateway = new StellarSatpGateway({
      name: "cactus-plugin-source#satpGateway",
      dltIDs: ["DLT2"],
      instanceId: uuidv4(),
      keyPair: keyPair,
      stellarPath: nodeApiHost,
      stellarNetworkConfig: networkConfig,
      assetAdminSk: assetAdminSk,
      assetReferenceContractSpecXdr: assetReferenceContractSpecXdr,
      tokenContractSpecXdr: tokenContractSpecXdr,
      clientHelper: new ClientHelper(),
      serverHelper: new ServerHelper({}),
    });

    await pluginSourceGateway.localRepository?.reset();
    await pluginSourceGateway.remoteRepository?.reset();

    return pluginSourceGateway;
  }

  public async deployStellarContracts(
    stellarApiClient: StellarApi,
    stellarAdminSk: string,
    networkConfig: NetworkConfig,
    bridgePk: string,
  ): Promise<{ tokenContractId: string; assetReferenceContractId: string }> {
    const fnTag = `${this.className}#deployBesuContracts()`;

    const adminAccount = new DefaultAccountHandler({
      networkConfig,
      secretKey: stellarAdminSk,
    });

    try {
      await adminAccount.initializeWithFriendbot();
    } catch (error) {
      console.log("Admin initialization failed. Probably set already");
    }

    const tokenWasm = await loadWasmFile("./src/wasm/satp_token.wasm");
    const assetRefWasm = await loadWasmFile(
      "./src/wasm/satp_asset_reference.wasm",
    );

    const adminTxInvocation = {
      header: {
        source: adminAccount.getPublicKey(),
        fee: 1000000,
        timeout: 45,
      },
      signers: [adminAccount.getSecretKey()],
    };

    const deployTokenContractResponse = await stellarApiClient.deployContractV1(
      {
        wasmBuffer: tokenWasm.toString("base64"),
        transactionInvocation: adminTxInvocation,
      } as DeployContractV1Request,
    );

    if (deployTokenContractResponse == undefined) {
      throw new Error(
        `${fnTag}, error when deploying the token smart contract`,
      );
    }

    const tokenContractId = deployTokenContractResponse.data
      .contractId as string;

    const deployAssetRefContractResponse =
      await stellarApiClient.deployContractV1({
        wasmBuffer: assetRefWasm.toString("base64"),
        transactionInvocation: adminTxInvocation,
      } as DeployContractV1Request);

    if (deployAssetRefContractResponse == undefined) {
      throw new Error(
        `${fnTag}, error when deploying the asset reference smart contract`,
      );
    }

    const assetReferenceContractId = deployAssetRefContractResponse.data
      .contractId as string;

    const assetReferenceInitializationResponse =
      await stellarApiClient.runSorobanTransactionV1({
        contractId: assetReferenceContractId,
        specXdr: assetReferenceContractSpecXdr,
        method: "initialize",
        methodArgs: {
          admin: adminAccount.getPublicKey(),
          asset: tokenContractId,
        },
        transactionInvocation: adminTxInvocation,
      } as RunSorobanTransactionRequest);

    if (assetReferenceInitializationResponse == undefined) {
      throw new Error(
        `${fnTag}, error when initializing the asset reference smart contract`,
      );
    }

    const tokenInitializationResponse =
      await stellarApiClient.runSorobanTransactionV1({
        contractId: tokenContractId,
        specXdr: tokenContractSpecXdr,
        method: "initialize",
        methodArgs: {
          admin: adminAccount.getPublicKey(),
          decimal: 7,
          name: "SATP Token",
          symbol: "SATP",
          bridge_address: bridgePk,
          asset_reference: assetReferenceContractId,
        },
        transactionInvocation: adminTxInvocation,
      } as RunSorobanTransactionRequest);

    if (tokenInitializationResponse == undefined) {
      throw new Error(
        `${fnTag}, error when initializing the token smart contract`,
      );
    }

    return {
      assetReferenceContractId,
      tokenContractId,
    };
  }

  // =======================================
  // Server: BESU
  // =======================================

  public async createBesuLedgerConnector(): Promise<PluginLedgerConnectorBesu> {
    const rpcApiHttpHost = await this.besu.getRpcApiHttpHost();
    const rpcApiWsHost = await this.besu.getRpcApiWsHost();

    const keychainEntryKey = AssetReferenceContractJson.contractName;
    const keychainEntryValue = JSON.stringify(AssetReferenceContractJson);

    const keychainEntryKey2 = CBDCcontractJson.contractName;
    const keychainEntryValue2 = JSON.stringify(CBDCcontractJson);

    const keychainPlugin = new PluginKeychainMemory({
      instanceId: uuidv4(),
      keychainId: CryptoMaterial.keychains.keychain2.id,
      logLevel: undefined,
      backend: new Map([
        [keychainEntryKey, keychainEntryValue],
        [keychainEntryKey2, keychainEntryValue2],
      ]),
    });

    this.log.info(`Creating Besu Connector...`);
    const factory = new PluginFactoryLedgerConnector({
      pluginImportType: PluginImportType.Local,
    });

    const besuConnector = await factory.create({
      rpcApiHttpHost,
      rpcApiWsHost,
      instanceId: uuidv4(),
      pluginRegistry: new PluginRegistry({ plugins: [keychainPlugin] }),
    });

    const accounts = [
      CryptoMaterial.accounts.userA.ethAddress,
      CryptoMaterial.accounts.userB.ethAddress,
      CryptoMaterial.accounts.bridge.ethAddress,
    ];

    for (const account of accounts) {
      await this.besu.sendEthToAccount(account);
    }

    return besuConnector;
  }

  public async createServerGateway(
    nodeApiHost: string,
    keyPair: IKeyPair,
  ): Promise<BesuSatpGateway> {
    this.log.info(`Creating Recipient Gateway...`);
    const pluginRecipientGateway = new BesuSatpGateway({
      name: "cactus-plugin-recipient#satpGateway",
      dltIDs: ["DLT1"],
      instanceId: uuidv4(),
      keyPair: keyPair,
      besuPath: nodeApiHost,
      besuWeb3SigningCredential: {
        ethAccount: CryptoMaterial.accounts["bridge"].ethAddress,
        secret: CryptoMaterial.accounts["bridge"].privateKey,
        type: Web3SigningCredentialType.PrivateKeyHex,
      },
      besuContractName: AssetReferenceContractJson.contractName,
      besuKeychainId: CryptoMaterial.keychains.keychain2.id,
      clientHelper: new ClientHelper(),
      serverHelper: new ServerHelper({}),
    });

    await pluginRecipientGateway.localRepository?.reset();
    await pluginRecipientGateway.remoteRepository?.reset();

    return pluginRecipientGateway;
  }

  public async deployBesuContracts(besuApiClient: BesuApi): Promise<void> {
    const fnTag = `${this.className}#deployBesuContracts()`;

    const deployCbdcContractResponse =
      await besuApiClient.deployContractSolBytecodeV1({
        keychainId: CryptoMaterial.keychains.keychain2.id,
        contractName: CBDCcontractJson.contractName,
        contractAbi: CBDCcontractJson.abi,
        constructorArgs: [],
        web3SigningCredential: {
          ethAccount: CryptoMaterial.accounts["bridge"].ethAddress,
          secret: CryptoMaterial.accounts["bridge"].privateKey,
          type: Web3SigningCredentialType.PrivateKeyHex,
        },
        bytecode: CBDCcontractJson.bytecode,
        gas: 10000000,
      } as DeployContractSolidityBytecodeV1Request);

    if (deployCbdcContractResponse == undefined) {
      throw new Error(`${fnTag}, error when deploying CBDC smart contract`);
    }

    const deployAssetReferenceContractResponse =
      await besuApiClient.deployContractSolBytecodeV1({
        keychainId: CryptoMaterial.keychains.keychain2.id,
        contractName: AssetReferenceContractJson.contractName,
        contractAbi: AssetReferenceContractJson.abi,
        constructorArgs: [
          deployCbdcContractResponse.data.transactionReceipt.contractAddress,
        ],
        web3SigningCredential: {
          ethAccount: CryptoMaterial.accounts["bridge"].ethAddress,
          secret: CryptoMaterial.accounts["bridge"].privateKey,
          type: Web3SigningCredentialType.PrivateKeyHex,
        },
        bytecode: AssetReferenceContractJson.bytecode,
        gas: 10000000,
      } as DeployContractSolidityBytecodeV1Request);

    if (deployAssetReferenceContractResponse == undefined) {
      throw new Error(
        `${fnTag}, error when deploying Asset Reference smart contract`,
      );
    }

    // set Asset Reference smart contract address in cbdc one (sidechain contract)
    const insertARContractAddress = await besuApiClient.invokeContractV1({
      contractName: CBDCcontractJson.contractName,
      invocationType: EthContractInvocationType.Send,
      methodName: "setAssetReferenceContract",
      gas: 1000000,
      params: [
        deployAssetReferenceContractResponse.data.transactionReceipt
          .contractAddress,
      ],
      signingCredential: {
        ethAccount: CryptoMaterial.accounts["bridge"].ethAddress,
        secret: CryptoMaterial.accounts["bridge"].privateKey,
        type: Web3SigningCredentialType.PrivateKeyHex,
      },
      keychainId: CryptoMaterial.keychains.keychain2.id,
    } as BesuInvokeContractV1Request);

    if (insertARContractAddress == undefined) {
      throw new Error(
        `${fnTag}, error when setting Asset Reference smart contract address in sidechain contract`,
      );
    }

    // make the owner of the sidechain contract the asset reference one
    const transferOwnership = await besuApiClient.invokeContractV1({
      contractName: CBDCcontractJson.contractName,
      invocationType: EthContractInvocationType.Send,
      methodName: "transferOwnership",
      gas: 1000000,
      params: [
        deployAssetReferenceContractResponse.data.transactionReceipt
          .contractAddress,
      ],
      signingCredential: {
        ethAccount: CryptoMaterial.accounts["bridge"].ethAddress,
        secret: CryptoMaterial.accounts["bridge"].privateKey,
        type: Web3SigningCredentialType.PrivateKeyHex,
      },
      keychainId: CryptoMaterial.keychains.keychain2.id,
    } as BesuInvokeContractV1Request);

    if (transferOwnership == undefined) {
      throw new Error(
        `${fnTag}, error when transferring the ownershop Reference smart contract address in sidechain contract`,
      );
    }

    // make the owner of the asset reference contract the sidechain one
    const addOwnerToAssetRefContract = await besuApiClient.invokeContractV1({
      contractName: AssetReferenceContractJson.contractName,
      invocationType: EthContractInvocationType.Send,
      methodName: "addOwner",
      gas: 1000000,
      params: [
        deployCbdcContractResponse.data.transactionReceipt.contractAddress,
      ],
      signingCredential: {
        ethAccount: CryptoMaterial.accounts["bridge"].ethAddress,
        secret: CryptoMaterial.accounts["bridge"].privateKey,
        type: Web3SigningCredentialType.PrivateKeyHex,
      },
      keychainId: CryptoMaterial.keychains.keychain2.id,
    } as BesuInvokeContractV1Request);

    if (addOwnerToAssetRefContract == undefined) {
      throw new Error(
        `${fnTag}, error when transfering CBDC smart contract ownership`,
      );
    }
  }
}
