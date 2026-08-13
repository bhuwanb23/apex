// Step 10 Test 2 helper — "server process 1".
//   Boots the app on env.PORT, primes ONE leaderboard cache entry (MISS →
//   registry marked valid), prints CHILD_STATUS=<x-cache-status>, exits.
//   The parent process then boots its own app on the same port and asserts
//   the entry survived the process restart (HIT / X-Cache-Layer: sqlite).
process.env.LOG_LEVEL = 'silent';

const { createApp } = await import('../../src/app.js');
const { env } = await import('../../src/config/env.js');
const { prisma } = await import('../../src/db/client.js');

const port = Number(env.PORT);
const app = createApp();
const server = app.listen(port, async () => {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/decisions/coaches/NBA`);
    console.log(`CHILD_STATUS=${res.headers.get('x-cache-status') ?? 'none'}`);
    console.log(`CHILD_LAYER=${res.headers.get('x-cache-layer') ?? 'none'}`);
    // The middleware marks the registry fire-and-forget, so wait until the
    // upsert has landed before exiting — the parent asserts on this row.
    const key = 'leaderboard:NBA::all:all';
    for (let i = 0; i < 40 && (await prisma.cacheMetadata.findUnique({ where: { cacheKey: key } })) == null; i++) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    console.log('CHILD_REGISTRY=written');
  } finally {
    server.close();
    await prisma.$disconnect();
  }
});
