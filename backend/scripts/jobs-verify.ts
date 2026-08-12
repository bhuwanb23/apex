import { prisma } from '../src/db/client.js';
const rows = await prisma.jobLogs.findMany({ orderBy: { startedAt: 'desc' }, take: 10 });
console.log(JSON.stringify(rows.map(r => ({ job: r.jobName, status: r.status, trigger: r.triggeredBy, dur: r.durationSeconds, records: r.recordsProcessed, summary: r.summary })), null, 1));
await prisma.$disconnect();
