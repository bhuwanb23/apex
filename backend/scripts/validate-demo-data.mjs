/**
 * Validates the demo seed end-to-end through the live API — every screen the
 * seed feeds. Run with: node scripts/validate-demo-data.mjs
 */
const BASE = 'http://localhost:8000/api';
let pass = 0;
let fail = 0;

function check(name, cond, extra = '') {
  if (cond) { pass += 1; console.log(`  ✅ ${name}${extra ? ` — ${extra}` : ''}`); }
  else { fail += 1; console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ''}`); }
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

// 1. League alerts — red zone NBA
const alerts = await get('/injury/alerts/NBA?zone=red&limit=10');
check('NBA red-zone alerts return 200', alerts.status === 200);
const alertCount = alerts.body?.data?.alerts?.length ?? 0;
check('NBA red-zone alerts ≥ 5 players', alertCount >= 5, `${alertCount} alerts`);
if (alerts.body?.data?.alerts?.[0]) {
  const a = alerts.body.data.alerts[0];
  check('alert has player name + team + score', a.playerName && a.teamName && a.riskScore > 0, `${a.playerName} (${a.teamName}) ${Math.round(a.riskScore)}`);
}

// 2. Yellow zone
const yellows = await get('/injury/alerts/NBA?zone=yellow&limit=10');
check('NBA yellow-zone alerts return data', yellows.status === 200 && (yellows.body?.data?.alerts?.length ?? 0) > 0);

// 3. Player risk profile (LeBron James)
const players = await get('/search/players?q=lebron&sport=NBA&limit=5');
check('search lebron returns 200', players.status === 200);
const lebron = players.body?.data?.players?.find(p => p.playerName === 'LeBron James');
check('search finds LeBron James', !!lebron);
if (lebron) {
  const risk = await get(`/injury/player/${lebron.playerId}`);
  const d = risk.body?.data;
  check('player risk 200', risk.status === 200);
  check('LeBron zone is red', d?.zone === 'red', `zone=${d?.zone} score=${Math.round(d?.riskScore ?? 0)}`);
  check('LeBron has explanation', (d?.explanation?.length ?? 0) > 20);
  check('LeBron has game logs', (d?.gameLogs?.length ?? 0) > 5, `${d?.gameLogs?.length} logs`);
  check('LeBron has history', (d?.history?.length ?? 0) > 3, `${d?.history?.length} history points`);
  const hist = await get(`/injury/player/${lebron.playerId}/history?days=60`);
  check('player history 200', hist.status === 200 && (hist.body?.data?.history?.length ?? 0) > 3);
}

// 4. Team risk (Lakers)
const lakers = await get('/search/teams?q=lakers&sport=NBA&limit=5');
const lakersTeam = lakers.body?.data?.teams?.find(t => t.teamName === 'Los Angeles Lakers');
check('search finds Lakers', !!lakersTeam);
if (lakersTeam) {
  const teamRisk = await get(`/injury/team/${lakersTeam.teamId}`);
  const d = teamRisk.body?.data;
  check('team risk 200', teamRisk.status === 200);
  check('Lakers roster has players', (d?.players?.length ?? 0) >= 10, `${d?.players?.length} players`);
  const redInTeam = d?.players?.filter(p => p.zone === 'red').length ?? 0;
  check('Lakers has red-zone player (LeBron)', redInTeam >= 1, `${redInTeam} red`);
}

// 5. Injury counts
const counts = await get('/injury/counts/NBA');
check('NBA injury counts 200', counts.status === 200);
const c = counts.body?.data;
check('counts include red zone', (c?.counts?.red ?? 0) >= 5, `red=${c?.counts?.red} yellow=${c?.counts?.yellow} green=${c?.counts?.green}`);

// 6. Momentum analysis — NBA inconclusive
const nbaMom = await get('/momentum/analysis/NBA');
const md = nbaMom.body?.data;
check('NBA momentum 200', nbaMom.status === 200);
check('NBA verdict inconclusive', md?.verdict?.verdictLabel === 'inconclusive', `label=${md?.verdict?.verdictLabel} p=${md?.statistics?.pValue}`);
check('NBA games analyzed > 0', (md?.context?.gamesAnalyzed ?? 0) > 0);

// 7. Momentum analysis — NHL significant
const nhlMom = await get('/momentum/analysis/NHL');
const nhld = nhlMom.body?.data;
check('NHL momentum 200', nhlMom.status === 200);
check('NHL verdict significant', nhld?.verdict?.verdictLabel === 'significant', `label=${nhld?.verdict?.verdictLabel} p=${nhld?.statistics?.pValue}`);

// 8. Sport comparison — all four sports
const cmp = await get('/momentum/comparison');
const sports = cmp.body?.data?.sports ?? [];
check('comparison has 4 sports', sports.length === 4, `${sports.length} sports: ${sports.map(s => s.sport).join(', ')}`);
const nbaRow = sports.find(s => s.sport === 'NBA');
const nhlRow = sports.find(s => s.sport === 'NHL');
check('comparison NBA inconclusive', nbaRow?.verdictLabel === 'inconclusive', nbaRow?.verdictLabel);
check('comparison NHL significant', nhlRow?.verdictLabel === 'significant', nhlRow?.verdictLabel);

// 9. Game replay — recent NBA games + timeline
const recent = await get('/search/games?sport=NBA&limit=10');
check('recent NBA games ≥ 10', (recent.body?.data?.games?.length ?? 0) >= 10, `${recent.body?.data?.games?.length} games`);
const firstGame = recent.body?.data?.games?.[0];
if (firstGame) {
  const tl = await get(`/momentum/game/${firstGame.gameId}`);
  const tld = tl.body?.data;
  check('game timeline 200', tl.status === 200);
  check('timeline has events', (tld?.timeline?.events?.length ?? 0) > 5, `${tld?.timeline?.events?.length} events`);
  check('timeline has momentum arrays', (tld?.timeline?.homeTeamMomentum?.length ?? 0) > 5);
  check('timeline has longest streak', (tld?.summary?.longestStreak?.length ?? 0) > 0, `streak=${tld?.summary?.longestStreak?.length}`);
}

// 10. Timeout optimizer — NBA pre-computed
const to = await get('/momentum/timeout/NBA?consecutiveScores=3&scoreDiff=-5&timeRemaining=120&period=4&timeoutsAvailable=3');
check('timeout recommendation 200', to.status === 200);
const tr = to.body?.data?.recommendation;
check('timeout has shouldCallTimeout', typeof tr?.shouldCallTimeout === 'boolean', `shouldCall=${tr?.shouldCallTimeout} diff=${tr?.probabilityDiff}`);

// 11. Coach leaderboard — NFL still works
const board = await get('/decisions/coaches/NFL?limit=10');
check('NFL coach leaderboard 200', board.status === 200);
check('leaderboard has coaches', (board.body?.data?.coaches?.length ?? 0) >= 5, `${board.body?.data?.coaches?.length} coaches`);

// 12. Search — player names resolve (search screen demo)
const searchJ = await get('/search/players?q=james&sport=NBA&limit=5');
check('search "james" returns LeBron', searchJ.body?.data?.players?.some(p => p.playerName === 'LeBron James'));

console.log(`\nResult: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
