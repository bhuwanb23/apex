// Manual job trigger test (Phase 6, Step 2 validation):
//   npx tsx scripts/jobs-manual-test.ts
import { prisma } from '../src/db/client.js';
import { queueManager } from '../src/jobs/queue.manager.js';
import { runJob, type JobDefinition } from '../src/jobs/job.runner.js';

// Registering the job modules populates the queue (same side effect the
// scheduler relies on).
await import('../src/jobs/cleanup.job.js');
await import('../src/jobs/momentum.job.js');

async function main(): Promise<void> {
  // 1. Real job — cleanup (housekeeping).
  const cleanup = queueManager.get('cleanup');
  if (cleanup) {
    const entry = await runJob(cleanup, { triggeredBy: 'manual' });
    console.log('cleanup ->', JSON.stringify({ status: entry.status, records: entry.recordsProcessed, errors: entry.errors, summary: entry.summary }));
  }

  // 2. Real job — momentum (analysis refresh; stored results are served while fresh).
  const momentum = queueManager.get('momentum');
  if (momentum) {
    const entry = await runJob(momentum, { triggeredBy: 'manual' });
    console.log('momentum ->', JSON.stringify({ status: entry.status, records: entry.recordsProcessed, errors: entry.errors, summary: entry.summary }));
  }

  // 3. Synthetic failing job — proves a failure is captured, not thrown.
  const failingJob: JobDefinition = {
    name: 'synthetic_failure_test',
    schedule: '',
    run: async () => {
      throw new Error('boom — simulated job crash');
    },
  };
  const failed = await runJob(failingJob, { triggeredBy: 'manual' });
  console.log('failing job ->', JSON.stringify({ status: failed.status, errors: failed.errors, summary: failed.summary }));

  // 4. Verify the log history.
  const rows = await prisma.jobLogs.findMany({
    where: { triggeredBy: 'manual' },
    orderBy: { startedAt: 'desc' },
    take: 5,
    select: { jobName: true, status: true, recordsProcessed: true, errors: true, durationSeconds: true },
  });
  console.log('recent manual JobLogs:', JSON.stringify(rows, null, 1));
  await prisma.$disconnect();
}

main().catch(err => {
  console.error('MANUAL TEST FAILED:', err);
  process.exitCode = 1;
});
