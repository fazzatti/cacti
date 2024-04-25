import {
  LogLevelDesc,
  Logger,
  LoggerProvider,
  Servers,
} from "@hyperledger/cactus-common";
import { AssetBridgingAppDemoInfrastructure } from "./infrastructure/asset-bridging-app-demo-infrastructure";
import { AddressInfo } from "net";
import {
  Configuration,
  IKeyPair,
  DefaultApi as SatpApi,
} from "@hyperledger/cactus-plugin-satp-hermes";
import { PluginRegistry } from "@hyperledger/cactus-core";
import { PluginKeychainMemory } from "@hyperledger/cactus-plugin-keychain-memory";
import { v4 as uuidv4 } from "uuid";
import CryptoMaterial from "../../crypto-material/crypto-material.json";
import { DefaultApi as StellarApi } from "@hyperledger/cacti-plugin-ledger-connector-stellar";
import { DefaultApi as BesuApi } from "@hyperledger/cactus-plugin-ledger-connector-besu";
import {
  ApiServer,
  AuthorizationProtocol,
  ConfigService,
  ICactusApiServerOptions,
} from "@hyperledger/cactus-cmd-api-server";
import { StellarSatpGateway } from "./satp-extension/stellar-satp-gateway";
import { BesuSatpGateway } from "./satp-extension/besu-satp-gateway";
import { Server } from "http";
import exitHook, { IAsyncExitHookDoneCallback } from "async-exit-hook";
import { SupportedStellarNetworkChain } from "./infrastructure/supported-stellar-network-chain";
import { NetworkConfig } from "stellar-plus/lib/stellar-plus/network";
import { getStellarChainConfiguration } from "./infrastructure/stellar-network-chain-configuration";

export interface IAssetBridgingApp {
  apiHost: string;
  apiServer1Port: number;
  apiServer2Port: number;
  clientGatewayKeyPair: IKeyPair;
  serverGatewayKeyPair: IKeyPair;
  apiServerOptions?: ICactusApiServerOptions;
  logLevel?: LogLevelDesc;
  disableSignalHandlers?: true;
  stellarAdminSk: string;
  stellarBridgePk: string;
  stellarChain: SupportedStellarNetworkChain;
}

export interface IStartInfo {
  readonly apiServer1: ApiServer;
  readonly apiServer2: ApiServer;
  readonly stellarGatewayApi: SatpApi;
  readonly besuGatewayApi: SatpApi;
  readonly besuApiClient: BesuApi;
  readonly stellarApiClient: StellarApi;
  readonly stellarSatpGateway: StellarSatpGateway;
  readonly besuSatpGateway: BesuSatpGateway;
}

export type ShutdownHook = () => Promise<void>;

export class AssetBridgingApp {
  private readonly log: Logger;
  private readonly shutdownHooks: ShutdownHook[];
  private readonly stellarNetworkConfig: NetworkConfig;

  readonly infrastructure: AssetBridgingAppDemoInfrastructure;

  constructor(public readonly options: IAssetBridgingApp) {
    const fnTag = "AssetBridgingApp#constructor()";

    const { logLevel } = options;
    const level = logLevel || "INFO";
    const label = "asset-bridging-app";
    this.log = LoggerProvider.getOrCreate({ level, label });

    this.shutdownHooks = [];

    this.infrastructure = new AssetBridgingAppDemoInfrastructure({
      logLevel: level,
    });

    this.stellarNetworkConfig = getStellarChainConfiguration(
      options.stellarChain,
    );
  }

  public async start(): Promise<IStartInfo> {
    this.log.debug(`Starting Asset Bridging App...`);

    if (!this.options.disableSignalHandlers) {
      exitHook((callback: IAsyncExitHookDoneCallback) => {
        this.stop().then(callback);
      });
      this.log.debug(`Registered signal handlers for graceful auto-shutdown`);
    }

    await this.infrastructure.start();
    this.onShutdown(() => this.infrastructure.stop());

    const stellarPlugin = await this.infrastructure.createStellarconnector();
    const besuPlugin = await this.infrastructure.createBesuLedgerConnector();

    const httpApiA = await Servers.startOnPort(
      this.options.apiServer1Port,
      this.options.apiHost,
    );

    const httpApiB = await Servers.startOnPort(
      this.options.apiServer2Port,
      this.options.apiHost,
    );

    const addressInfoA = httpApiA.address() as AddressInfo;
    const nodeApiHostA = `http://${this.options.apiHost}:${addressInfoA.port}`;

    const addressInfoB = httpApiB.address() as AddressInfo;
    const nodeApiHostB = `http://${this.options.apiHost}:${addressInfoB.port}`;

    const stellarSatpGateway = await this.infrastructure.createClientGateway(
      nodeApiHostA,
      this.options.clientGatewayKeyPair,
      this.options.stellarAdminSk,
    );

    const besuSatpGateway = await this.infrastructure.createServerGateway(
      nodeApiHostB,
      this.options.serverGatewayKeyPair,
    );

    const clientPluginRegistry = new PluginRegistry({
      plugins: [
        new PluginKeychainMemory({
          keychainId: CryptoMaterial.keychains.keychain1.id,
          instanceId: uuidv4(),
          logLevel: "INFO",
        }),
      ],
    });

    const serverPluginRegistry = new PluginRegistry({
      plugins: [
        new PluginKeychainMemory({
          keychainId: CryptoMaterial.keychains.keychain2.id,
          instanceId: uuidv4(),
          logLevel: "INFO",
        }),
      ],
    });

    clientPluginRegistry.add(stellarPlugin);
    clientPluginRegistry.add(stellarSatpGateway);

    serverPluginRegistry.add(besuPlugin);
    serverPluginRegistry.add(besuSatpGateway);

    const apiServer1 = await this.startNode(httpApiA, clientPluginRegistry);
    const apiServer2 = await this.startNode(httpApiB, serverPluginRegistry);

    const stellarApiClient = new StellarApi(
      new Configuration({ basePath: nodeApiHostA }),
    );
    const besuApiClient = new BesuApi(
      new Configuration({ basePath: nodeApiHostB }),
    );

    this.log.info("Deploying chaincode and smart contracts...");

    const { tokenContractId, assetReferenceContractId } =
      await this.infrastructure.deployStellarContracts(
        stellarApiClient,
        this.options.stellarAdminSk,
        this.stellarNetworkConfig,
        this.options.stellarBridgePk,
      );

    stellarSatpGateway.setContracts(assetReferenceContractId, tokenContractId);
    // FIXME: Implement for Stellar
    // await this.infrastructure.deployFabricAssetReferenceContract(
    //   fabricApiClient,
    // );

    await this.infrastructure.deployBesuContracts(besuApiClient);

    this.log.info(`Chaincode and smart Contracts deployed.`);

    return {
      apiServer1,
      apiServer2,
      stellarGatewayApi: new SatpApi(
        new Configuration({ basePath: nodeApiHostA }),
      ),
      besuGatewayApi: new SatpApi(
        new Configuration({ basePath: nodeApiHostB }),
      ),
      stellarApiClient,
      besuApiClient,
      stellarSatpGateway,
      besuSatpGateway,
    };
  }

  public async stop(): Promise<void> {
    for (const hook of this.shutdownHooks) {
      await hook(); // FIXME add timeout here so that shutdown does not hang
    }
  }

  public onShutdown(hook: ShutdownHook): void {
    this.shutdownHooks.push(hook);
  }

  public async startNode(
    httpServerApi: Server,
    pluginRegistry: PluginRegistry,
  ): Promise<ApiServer> {
    this.log.info(`Starting API Server node...`);

    const addressInfoApi = httpServerApi.address() as AddressInfo;

    let config;
    if (this.options.apiServerOptions) {
      config = this.options.apiServerOptions;
    } else {
      const configService = new ConfigService();
      const convictConfig = await configService.getOrCreate();
      config = convictConfig.getProperties();
      config.configFile = "";
      config.apiCorsDomainCsv = `*`;
      config.cockpitCorsDomainCsv = `*`;
      config.apiPort = addressInfoApi.port;
      config.apiHost = addressInfoApi.address;
      config.grpcPort = 0;
      config.logLevel = this.options.logLevel || "INFO";
      config.authorizationProtocol = AuthorizationProtocol.NONE;
      config.crpcPort = addressInfoApi.port + 50; // FIXME: Using the same port clashes the startup when both api servers use the default port 6000
    }

    const apiServer = new ApiServer({
      config,
      httpServerApi,
      pluginRegistry,
    });

    this.onShutdown(() => apiServer.shutdown());

    await apiServer.start();

    return apiServer;
  }
}
