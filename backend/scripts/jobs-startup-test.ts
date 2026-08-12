// RUN_JOBS_ON_STARTUP validation:
//   RUN_JOBS_ON_STARTUP=true npx tsx scripts/jobs-startup-test.ts
import { queueManager } from '../src/jobs/queue.manager.js';

async function main(): Promise<void> {
  await queueManager.startAllJobs();
  console.log('startAllJobs: ok — waiting for startup runs to drain...');

  const deadline = Date.now() + 240_000;
  let last = '';
  while (Date.now() < deadline) {
    const running = queueManager.getRunningJobs();
    const current = running.join(',') || '(none)';
    if (current !== last) {
      last = current;
      console.log(`running now: [${current}]`);
    }
    if (running.length === 0) break;
    await new Promise(resolve => {
      setTimeout(resolve, 2000);
    });
  }

  for (const job of queueManager.list()) {
    const status = await queueManager.getJobStatus(job.name);
    if (!status) continue;
    console.log(
      `status ${job.name}: running=${status.isRunning} last=${status.lastRunStatus} nextRun=${status.nextRunAt?.toISOString()}`
    );
  }
  await queueManager.stopAllJobs();
  process.exit(0);
}

main().catch(err => {
  console.error('STARTUP TEST FAILED:', err);
  process.exitCode = 1;
});
