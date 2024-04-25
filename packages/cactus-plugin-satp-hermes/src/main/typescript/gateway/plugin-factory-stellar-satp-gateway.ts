import {
  IPluginFactoryOptions,
  PluginFactory,
} from "@hyperledger/cactus-core-api";
import {
  IStellarSatpGatewayConstructorOptions,
  StellarSatpGateway,
} from "./stellar-satp-gateway";

export class PluginFactoryStellarSatpGateway extends PluginFactory<
  StellarSatpGateway,
  IStellarSatpGatewayConstructorOptions,
  IPluginFactoryOptions
> {
  async create(
    pluginOptions: IStellarSatpGatewayConstructorOptions,
  ): Promise<StellarSatpGateway> {
    return new StellarSatpGateway(pluginOptions);
  }
}
