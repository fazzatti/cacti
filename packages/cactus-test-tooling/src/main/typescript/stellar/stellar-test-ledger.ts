import Docker, {
  Container,
  ContainerCreateOptions,
  ContainerInfo,
} from "dockerode";
import { ITestLedger } from "../i-test-ledger";
import {
  Bools,
  LogLevelDesc,
  Logger,
  LoggerProvider,
} from "@hyperledger/cactus-common";
import { Containers } from "../public-api";
import EventEmitter from "events";

export interface IStellarTestLedger extends ITestLedger {
  getNetworkConfiguration(): Promise<INetworkConfigData>;
}

export enum SupportedImageVersions {
  latest = "latest",
}

export interface INetworkConfigData {
  networkPassphrase: string;
  rpcUrl?: string;
  horizonUrl?: string;
  friendbotUrl?: string;
  allowHttp?: boolean;
}

export interface IStellarTestLedgerOptions {
  // Defines which type of network will the image will be configured to run.
  network?:
    | "local" // (Default) pull up a new pristine network image locally.
    | "futurenet" // pull up an image to connect to futurenet. Can take several minutes to sync the ledger state.
    | "testnet"; // pull up an image to connect to testnet  Can take several minutes to sync the ledger state.

  // Defines the resource limits for soroban transactions. A valid transaction and only be included in a ledger
  // block if enough resources are available for that operation.
  limits?:
    | "testnet" // (Default) sets the limits to match those used on testnet.
    | "default" // leaves resource limits set extremely low as per Stellar's core default configuration
    | "unlimited"; // set limits to maximum resources that can be configfured

  // For test development, attach to ledger that is already running, don't spin up new one
  useRunningLedger?: boolean;

  readonly logLevel?: LogLevelDesc;
  readonly containerImageName?: string;
  readonly containerImageVersion?: SupportedImageVersions;
  readonly emitContainerLogs?: boolean;
}

const DEFAULTS = Object.freeze({
  imageName: "stellar/quickstart",
  imageVersion: SupportedImageVersions.latest,
  network: "local",
  limits: "testnet",
  useRunningLedger: false,
  logLevel: "info" as LogLevelDesc,
  emitContainerLogs: false,

  // cmdArgs: ['--local', '--limits','testnet']
});

export class StellarTestLedger implements IStellarTestLedger {
  public readonly containerImageName: string;
  public readonly containerImageVersion: SupportedImageVersions;

  private readonly network: string;
  private readonly limits: string;
  private readonly useRunningLedger: boolean;

  private readonly emitContainerLogs: boolean;
  private readonly log: Logger;
  private readonly logLevel: LogLevelDesc;
  public container: Container | undefined;
  public containerId: string | undefined;

  constructor(options?: IStellarTestLedgerOptions) {
    this.network = options?.network || DEFAULTS.network;
    this.limits = options?.limits || DEFAULTS.limits;

    if (this.network != "local") {
      throw new Error(
        `StellarTestLedger#constructor() network ${this.network} not supported yet.`,
      );
    }
    if (this.limits != "testnet") {
      throw new Error(
        `StellarTestLedger#constructor() limits ${this.limits} not supported yet.`,
      );
    }

    this.containerImageVersion =
      options?.containerImageVersion || DEFAULTS.imageVersion;

    // if image name is not a supported version
    if (
      !Object.values(SupportedImageVersions).includes(
        this.containerImageVersion,
      )
    ) {
      throw new Error(
        `StellarTestLedger#constructor() containerImageVersion ${options?.containerImageVersion} not supported.`,
      );
    }

    this.containerImageName = options?.containerImageName || DEFAULTS.imageName;

    this.useRunningLedger = Bools.isBooleanStrict(options?.useRunningLedger)
      ? (options?.useRunningLedger as boolean)
      : DEFAULTS.useRunningLedger;

    this.logLevel = options?.logLevel || DEFAULTS.logLevel;
    this.emitContainerLogs = Bools.isBooleanStrict(options?.emitContainerLogs)
      ? (options?.emitContainerLogs as boolean)
      : DEFAULTS.emitContainerLogs;

    this.log = LoggerProvider.getOrCreate({
      level: this.logLevel,
      label: "stellar-test-ledger",
    });
  }

  /**
   * Stellar ledger image name and tag
   */
  public get fullContainerImageName(): string {
    return [this.containerImageName, this.containerImageVersion].join(":");
  }

  public getContainer(): Container {
    if (!this.container) {
      throw new Error(
        `StellarTestLedger#getContainer() Container not started yet by this instance.`,
      );
    } else {
      return this.container;
    }
  }

  protected async getContainerInfo(): Promise<ContainerInfo> {
    const fnTag = "StellarTestLedger#getContainerInfo()";
    const docker = new Docker();
    const image = this.containerImageName;
    const containerInfos = await docker.listContainers({});

    let aContainerInfo;
    if (this.containerId !== undefined) {
      aContainerInfo = containerInfos.find((ci) => ci.Id === this.containerId);
    }

    if (aContainerInfo) {
      return aContainerInfo;
    } else {
      throw new Error(`${fnTag} no image "${image}"`);
    }
  }

  public async getContainerIpAddress(): Promise<string> {
    const fnTag = "StellarTestLedger#getContainerIpAddress()";
    const aContainerInfo = await this.getContainerInfo();

    if (aContainerInfo) {
      const { NetworkSettings } = aContainerInfo;
      const networkNames: string[] = Object.keys(NetworkSettings.Networks);
      if (networkNames.length < 1) {
        throw new Error(`${fnTag} container not connected to any networks`);
      } else {
        // return IP address of container on the first network that we found
        return NetworkSettings.Networks[networkNames[0]].IPAddress;
      }
    } else {
      throw new Error(`${fnTag} cannot find image: ${this.containerImageName}`);
    }
  }

  private getImageCommands(): string[] {
    const cmds = [];

    switch (this.network) {
      case "futurenet":
        cmds.push("--futurenet");
        break;
      case "testnet":
        cmds.push("--testnet");
        break;
      case "local":
      default:
        cmds.push("--local");
        break;
    }

    switch (this.limits) {
      case "default":
        cmds.push("--limits", "default");
        break;
      case "unlimited":
        cmds.push("--limits", "unlimited");
        break;
      case "testnet":
      default:
        cmds.push("--limits", "testnet");
        break;
    }

    return cmds;
  }

  public async getNetworkConfiguration(): Promise<INetworkConfigData> {
    if (this.network != "local") {
      throw new Error(
        `StellarTestLedger#getNetworkConfiguration() network ${this.network} not supported yet.`,
      );
    }
    const cInfo = await this.getContainerInfo();
    const publicPort = await Containers.getPublicPort(8000, cInfo);

    // Default docker internal domain. Redirects to the local host where docker is running.
    const domain = "host.docker.internal";

    return Promise.resolve({
      networkPassphrase: "Standalone Network ; February 2017",
      rpcUrl: `http://${domain}:${publicPort}/rpc`,
      horizonUrl: `http://${domain}:${publicPort}`,
      friendbotUrl: `http://${domain}:${publicPort}/friendbot`,
      allowHttp: true,
    });
  }

  /**
   *  Start a test stellar ledger.
   */
  public async start(omitPull = false): Promise<Container> {
    if (this.useRunningLedger) {
      this.log.info(
        "Search for already running Stellar Test Ledger because 'useRunningLedger' flag is enabled.",
      );
      this.log.info(
        "Search criteria - image name: ",
        this.fullContainerImageName,
        ", state: running",
      );
      const containerInfo = await Containers.getByPredicate(
        (ci) =>
          ci.Image === this.fullContainerImageName && ci.State === "running",
      );
      const docker = new Docker();
      this.containerId = containerInfo.Id;
      this.container = docker.getContainer(this.containerId);
      return this.container;
    }

    if (this.container) {
      await this.container.stop();
      await this.container.remove();
      this.container = undefined;
      this.containerId = undefined;
    }

    if (!omitPull) {
      await Containers.pullImage(
        this.fullContainerImageName,
        {},
        this.logLevel,
      );
    }

    const createOptions: ContainerCreateOptions = {
      ExposedPorts: {
        "8000/tcp": {}, // Stellar services (Horizon, RPC and Friendbot)
      },
      HostConfig: {
        PublishAllPorts: true,
        Privileged: true,
      },
    };

    return new Promise<Container>((resolve, reject) => {
      const docker = new Docker();
      const eventEmitter: EventEmitter = docker.run(
        this.fullContainerImageName,
        [...this.getImageCommands()],
        [],
        createOptions,
        {},
        (err: unknown) => {
          if (err) {
            reject(err);
          }
        },
      );

      eventEmitter.once("start", async (container: Container) => {
        this.container = container;
        this.containerId = container.id;

        if (this.emitContainerLogs) {
          const fnTag = `[${this.fullContainerImageName}]`;
          await Containers.streamLogs({
            container: this.container,
            tag: fnTag,
            log: this.log,
          });
        }

        try {
          // FIXME: This is a hack to wait for the container to be ready
          // ideally we should verify when the container is ready to accept requests
          //
          // await Containers.waitForHealthCheck(this.containerId);
          this.log.info("Waiting for services to fully start.");
          await new Promise((resolve) => setTimeout(resolve, 25000));
          this.log.info("Stellar Test Ledger is ready.");

          resolve(container);
        } catch (ex) {
          this.log.error(ex);
          reject(ex);
        }
      });
    });
  }

  /**
   * Stop the test stellar ledger.
   */
  public async stop(): Promise<unknown> {
    if (this.useRunningLedger) {
      this.log.info("Ignore stop request because useRunningLedger is enabled.");
      return Promise.resolve();
    } else {
      return Containers.stop(this.getContainer());
    }
  }

  /**
   * Destroy the test stellar ledger.
   */
  public async destroy(): Promise<unknown> {
    if (this.useRunningLedger) {
      this.log.info(
        "Ignore destroy request because useRunningLedger is enabled.",
      );
      return Promise.resolve();
    } else if (this.container) {
      const docker = new Docker();
      const containerInfo = await this.container.inspect();
      const volumes = containerInfo.Mounts;
      await this.container.remove();
      volumes.forEach(async (volume) => {
        this.log.info(`Removing volume ${volume}`);
        if (volume.Name) {
          const volumeToDelete = docker.getVolume(volume.Name);
          await volumeToDelete.remove();
        } else {
          this.log.warn(`Volume ${volume} could not be removed!`);
        }
      });
      return Promise.resolve();
    } else {
      return Promise.reject(
        new Error(
          `StellarTestLedger#destroy() Container was never created, nothing to destroy.`,
        ),
      );
    }
  }
}
