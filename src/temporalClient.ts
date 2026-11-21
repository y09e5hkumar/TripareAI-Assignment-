import { Connection, Client } from '@temporalio/client';
import { TEMPORAL_NAMESPACE } from './shared/constants';

let clientPromise: Promise<Client> | null = null;

export function getTemporalClient(): Promise<Client> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const connection = await Connection.connect({
        address: process.env.TEMPORAL_ADDRESS || 'localhost:7233',
      });
      return new Client({ connection, namespace: TEMPORAL_NAMESPACE });
    })();
  }
  return clientPromise;
}
