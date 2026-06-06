import { config } from '../config';
import { MarketDataProvider } from '../types';
import { MockProvider } from './mock';
import { AlpacaProvider } from './alpaca';
import { YahooProvider } from './yahoo';
import { log } from '../logger';

let instance: MarketDataProvider | null = null;

/** Returns the configured market-data provider (singleton). */
export function getProvider(): MarketDataProvider {
  if (instance) return instance;
  switch (config.dataProvider) {
    case 'yahoo':
      instance = new YahooProvider();
      break;
    case 'alpaca':
      instance = new AlpacaProvider();
      break;
    default:
      instance = new MockProvider();
  }
  log.info(`Market data provider: ${instance.name}`);
  return instance;
}
