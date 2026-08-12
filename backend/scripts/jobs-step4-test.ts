// Step 3-4 validation:
//   npx tsx scripts/jobs-step4-test.ts
import { queueManager } from '../src/jobs/queue.manager.js';
import type { JobDefinition } from '../src/jobs/job.runner.js';

async function main(): Promise<void> {
  // 1. Lifecycle — registers + schedules everything, runs startup health check.
  await queueManager.startAllJobs();
  console.log('1. startAllJobs: ok (schedules active)');

  // 2. Status — nextRunAt should come from the cron schedule.
  const status = await queueManager.getJobStatus('data_sync');
  console.log(
    '2. getJobStatus(data_sync):',
    JSON.stringify({
      isRunning: status?.isRunning,
      lastRunStatus: status?.lastRunStatus,
      nextRunAt: status?.nextRunAt,
    })
  );

  // 3. History — recent health_check runs from JobLogs.
  const history = await queueManager.getJobHistory('health_check', 3);
  console.log(
    '3. getJobHistory(health_check, 3):',
    JSON.stringify(history.map(h => ({ id: h.id, status: h.status, trigger: h.triggeredBy })))
  );

  // 4. Manual trigger — real cleanup run, awaited for its log entry.
  const entry = await queueManager.triggerJob('cleanup', undefined, 'manual');
  console.log(
    '4. triggerJob(cleanup):',
    JSON.stringify({ id: entry.id, status: entry.status, records: entry.recordsProcessed })
  );

  // 5. Running jobs — a slow job shows up while in flight.
  const slowJob: JobDefinition = {
    name: 'synthetic_slow_probe',
    schedule: '',
    run: async () => {
      await new Promise(resolve => {
        setTimeout(resolve, 800);
      });
      return { status: 'completed', recordsProcessed: 1 };
    },
  };
  queueManager.register(slowJob);
  const inflight = queueManager.triggerJob('synthetic_slow_probe');
  console.log('5a. getRunningJobs while running:', JSON.stringify(queueManager.getRunningJobs()));
  await inflight;
  console.log('5b. getRunningJobs after done:', JSON.stringify(queueManager.getRunningJobs()));

  // 6. Shutdown — stops schedules and drains.
  await queueManager.stopAllJobs();
  console.log('6. stopAllJobs: ok');
  process.exit(0);
}

main().catch(err => {
  console.error('STEP4 TEST FAILED:', err);
  process.exitCode = 1;
});
