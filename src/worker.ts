import dotenv from 'dotenv';
dotenv.config();

import { NativeConnection, Worker } from '@temporalio/worker';
import * as activities from './activities/supplierActivities';
import { TASK_QUEUE, TEMPORAL_NAMESPACE } from './shared/constants';

async function run() {
  const connection = await NativeConnection.connect({
    address: process.env.TEMPORAL_ADDRESS || 'localhost:7233',
  });

  const worker = await Worker.create({
    connection,
    namespace: TEMPORAL_NAMESPACE,
    taskQueue: TASK_QUEUE,
    workflowsPath: require.resolve('./workflows/hotelWorkflow'),
    activities,
  });

  console.log(`[worker] polling task queue "${TASK_QUEUE}"`);
  await worker.run();
}

run().catch((err) => {
  console.error('[worker] fatal error', err);
  process.exit(1);
});
