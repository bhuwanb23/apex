/**
 * Demo seed — "Thing 2: Seed Data for Demo" (hackathon demo prep).
 *
 * Fills the gaps a live demo needs so judges see rich data on every screen
 * without waiting for syncs:
 *   1. 30 real NBA teams already exist (ids 149-178) — the fake "Smoke City
 *      Hoopers" team (id 1), its 2 test players and 6 fake games are removed.
 *   2. Realistic NBA rosters (~15 players/team), recent NBA games with scores,
 *      and per-player game logs (workload chart + injury model inputs).
 *   3. Injury risk scores for every NBA player — 8+ red-zone stars, a yellow
 *      tier, and green the rest — with history rows (trend chart + days-in-zone).
 *   4. Momentum analysis for all four sports: NBA "inconclusive", NHL
 *      "significant", NFL/MLB "not significant" (the demo's story).
 *   5. Momentum game timelines for ~12 recent NBA games (game replay screen).
 *   6. NFL coach decisions + timeout recommendations already exist — left alone.
 *
 * Idempotent: safe to re-run (deletes its own NBA demo rows first).
 * Run with: npm run db:seed:demo
 */
import { prisma } from '../src/db/client.js';

const NBA_ID = 1;
const NHL_ID = 7; // sports table: NHL is id 7 in this DB

/** Team abbreviation → [name, position][] (15 per team, stars + rotation). */
const ROSTERS: Record<string, [string, string][]> = {
  ATL: [
    ['Trae Young', 'PG'], ['Dejounte Murray', 'PG'], ['Jalen Johnson', 'SF'], ['Onyeka Okongwu', 'C'],
    ['Clint Capela', 'C'], ['Bogdan Bogdanovic', 'SG'], ['De\'Andre Hunter', 'SF'], ['Saddiq Bey', 'SF'],
    ['Kobe Bufkin', 'PG'], ['AJ Griffin', 'SG'], ['Garrison Mathews', 'SG'], ['Bruno Fernando', 'PF'],
    ['Mouhamed Gueye', 'PF'], ['Trent Forrest', 'PG'], ['Seth Lundy', 'SG'],
  ],
  BOS: [
    ['Jayson Tatum', 'SF'], ['Jaylen Brown', 'SG'], ['Kristaps Porzingis', 'C'], ['Derrick White', 'PG'],
    ['Jrue Holiday', 'PG'], ['Al Horford', 'C'], ['Sam Hauser', 'SF'], ['Payton Pritchard', 'PG'],
    ['Luke Kornet', 'C'], ['Oshae Brissett', 'SF'], ['Xavier Tillman', 'PF'], ['Neemias Queta', 'C'],
    ['Jordan Walsh', 'SF'], ['Jaden Springer', 'SG'], ['Svi Mykhailiuk', 'SG'],
  ],
  BKN: [
    ['Mikal Bridges', 'SF'], ['Cam Thomas', 'SG'], ['Nic Claxton', 'C'], ['Dorian Finney-Smith', 'PF'],
    ['Spencer Dinwiddie', 'PG'], ['Cameron Johnson', 'SF'], ['Dennis Smith Jr.', 'PG'], ['Day\'Ron Sharpe', 'C'],
    ['Trendon Watford', 'PF'], ['Jalen Wilson', 'SF'], ['Keon Johnson', 'SG'], ['Lonnie Walker IV', 'SG'],
    ['Noah Clowney', 'PF'], ['Dariq Whitehead', 'SG'], ['Ben Simmons', 'PF'],
  ],
  CHA: [
    ['LaMelo Ball', 'PG'], ['Brandon Miller', 'SF'], ['Miles Bridges', 'SF'], ['Mark Williams', 'C'],
    ['Nick Richards', 'C'], ['Grant Williams', 'PF'], ['Cody Martin', 'SG'], ['Tre Mann', 'PG'],
    ['Vasilije Micic', 'PG'], ['Seth Curry', 'SG'], ['Davis Bertans', 'PF'], ['JT Thor', 'PF'],
    ['Nick Smith Jr.', 'SG'], ['Leaky Black', 'SF'], ['Amari Bailey', 'SG'],
  ],
  CHI: [
    ['DeMar DeRozan', 'SF'], ['Zach LaVine', 'SG'], ['Nikola Vucevic', 'C'], ['Coby White', 'PG'],
    ['Alex Caruso', 'SG'], ['Patrick Williams', 'PF'], ['Ayo Dosunmu', 'PG'], ['Andre Drummond', 'C'],
    ['Torrey Craig', 'SF'], ['Jevon Carter', 'PG'], ['Dalen Terry', 'SG'], ['Julian Phillips', 'SF'],
    ['Onuralp Bitim', 'SG'], ['Adama Sanogo', 'PF'], ['Javonte Green', 'SF'],
  ],
  CLE: [
    ['Donovan Mitchell', 'SG'], ['Darius Garland', 'PG'], ['Evan Mobley', 'PF'], ['Jarrett Allen', 'C'],
    ['Max Strus', 'SF'], ['Caris LeVert', 'SG'], ['Georges Niang', 'PF'], ['Isaac Okoro', 'SF'],
    ['Sam Merrill', 'SG'], ['Dean Wade', 'PF'], ['Craig Porter Jr.', 'PG'], ['Tristan Thompson', 'C'],
    ['Damian Jones', 'C'], ['Emoni Bates', 'SF'], ['Pete Nance', 'PF'],
  ],
  DAL: [
    ['Luka Doncic', 'PG'], ['Kyrie Irving', 'PG'], ['Klay Thompson', 'SG'], ['PJ Washington', 'PF'],
    ['Daniel Gafford', 'C'], ['Dereck Lively II', 'C'], ['Dante Exum', 'PG'], ['Jaden Hardy', 'SG'],
    ['Josh Green', 'SG'], ['Maxi Kleber', 'PF'], ['Dwight Powell', 'C'], ['Olivier-Maxence Prosper', 'SF'],
    ['Naji Marshall', 'SF'], ['Quentin Grimes', 'SG'], ['Markieff Morris', 'PF'],
  ],
  DEN: [
    ['Nikola Jokic', 'C'], ['Jamal Murray', 'PG'], ['Aaron Gordon', 'PF'], ['Michael Porter Jr.', 'SF'],
    ['Kentavious Caldwell-Pope', 'SG'], ['Christian Braun', 'SG'], ['Reggie Jackson', 'PG'], ['Peyton Watson', 'SF'],
    ['Julian Strawther', 'SG'], ['Zeke Nnaji', 'PF'], ['DeAndre Jordan', 'C'], ['Justin Holiday', 'SG'],
    ['Hunter Tyson', 'SF'], ['Jalen Pickett', 'PG'], ['Collin Gillespie', 'PG'],
  ],
  DET: [
    ['Cade Cunningham', 'PG'], ['Jaden Ivey', 'SG'], ['Ausar Thompson', 'SF'], ['Jalen Duren', 'C'],
    ['Tobias Harris', 'PF'], ['Isaiah Stewart', 'C'], ['Tim Hardaway Jr.', 'SG'], ['Malik Beasley', 'SG'],
    ['Simone Fontecchio', 'SF'], ['Marcus Sasser', 'PG'], ['Ron Holland', 'SF'], ['Paul Reed', 'PF'],
    ['Wendell Moore Jr.', 'SG'], ['Bob Klintman', 'PF'], ['Daniss Jenkins', 'PG'],
  ],
  GSW: [
    ['Stephen Curry', 'PG'], ['Draymond Green', 'PF'], ['Klay Thompson', 'SG'], ['Andrew Wiggins', 'SF'],
    ['Jonathan Kuminga', 'PF'], ['Brandin Podziemski', 'SG'], ['Moses Moody', 'SG'], ['Trayce Jackson-Davis', 'C'],
    ['Kevon Looney', 'C'], ['Gary Payton II', 'PG'], ['Chris Paul', 'PG'], ['Dario Saric', 'PF'],
    ['Gui Santos', 'SF'], ['Lester Quinones', 'SG'], ['Usman Garuba', 'PF'],
  ],
  HOU: [
    ['Jalen Green', 'SG'], ['Alperen Sengun', 'C'], ['Fred VanVleet', 'PG'], ['Dillon Brooks', 'SF'],
    ['Jabari Smith Jr.', 'PF'], ['Amen Thompson', 'SG'], ['Tari Eason', 'SF'], ['Cam Whitmore', 'SF'],
    ['Jock Landale', 'C'], ['Jeff Green', 'PF'], ['Aaron Holiday', 'PG'], ['Reggie Bullock', 'SG'],
    ['Jae\'Sean Tate', 'SF'], ['Steven Adams', 'C'], ['Nate Williams', 'SG'],
  ],
  IND: [
    ['Tyrese Haliburton', 'PG'], ['Pascal Siakam', 'PF'], ['Myles Turner', 'C'], ['Andrew Nembhard', 'PG'],
    ['Aaron Nesmith', 'SF'], ['Bennedict Mathurin', 'SG'], ['T.J. McConnell', 'PG'], ['Obi Toppin', 'PF'],
    ['Isaiah Jackson', 'C'], ['Jalen Smith', 'PF'], ['Ben Sheppard', 'SG'], ['Jarace Walker', 'SF'],
    ['Kendall Brown', 'SG'], ['James Johnson', 'PF'], ['Oscar Tshiebwe', 'C'],
  ],
  LAC: [
    ['Kawhi Leonard', 'SF'], ['James Harden', 'PG'], ['Paul George', 'SF'], ['Ivica Zubac', 'C'],
    ['Terance Mann', 'SG'], ['Norman Powell', 'SG'], ['Russell Westbrook', 'PG'], ['Mason Plumlee', 'C'],
    ['Amir Coffey', 'SG'], ['Daniel Theis', 'PF'], ['Brandon Boston Jr.', 'SG'], ['Bones Hyland', 'PG'],
    ['Kobe Brown', 'PF'], ['PJ Tucker', 'PF'], ['Xavier Moon', 'PG'],
  ],
  LAL: [
    ['LeBron James', 'SF'], ['Anthony Davis', 'PF'], ['Austin Reaves', 'SG'], ['D\'Angelo Russell', 'PG'],
    ['Rui Hachimura', 'PF'], ['Jarred Vanderbilt', 'SF'], ['Gabe Vincent', 'PG'], ['Taurean Prince', 'SF'],
    ['Christian Wood', 'C'], ['Jaxson Hayes', 'C'], ['Max Christie', 'SG'], ['Cam Reddish', 'SF'],
    ['Spencer Dinwiddie', 'PG'], ['Jalen Hood-Schifino', 'PG'], ['Colin Castleton', 'C'],
  ],
  MEM: [
    ['Ja Morant', 'PG'], ['Jaren Jackson Jr.', 'PF'], ['Desmond Bane', 'SG'], ['Marcus Smart', 'PG'],
    ['Santi Aldama', 'PF'], ['Zach Edey', 'C'], ['Brandon Clarke', 'PF'], ['Luke Kennard', 'SG'],
    ['GG Jackson', 'SF'], ['Vince Williams Jr.', 'SF'], ['John Konchar', 'SG'], ['Scotty Pippen Jr.', 'PG'],
    ['Jake LaRavia', 'SF'], ['Jay Huff', 'C'], ['Cam Spencer', 'SG'],
  ],
  MIA: [
    ['Jimmy Butler', 'SF'], ['Bam Adebayo', 'C'], ['Tyler Herro', 'SG'], ['Terry Rozier', 'PG'],
    ['Duncan Robinson', 'SG'], ['Jaime Jaquez Jr.', 'SF'], ['Kevin Love', 'PF'], ['Josh Richardson', 'SG'],
    ['Nikola Jovic', 'PF'], ['Haywood Highsmith', 'SF'], ['Caleb Martin', 'SF'], ['Orlando Robinson', 'C'],
    ['Pelle Larsson', 'SG'], ['Keshad Johnson', 'PF'], ['Thomas Bryant', 'C'],
  ],
  MIL: [
    ['Giannis Antetokounmpo', 'PF'], ['Damian Lillard', 'PG'], ['Khris Middleton', 'SF'], ['Brook Lopez', 'C'],
    ['Bobby Portis', 'PF'], ['Pat Connaughton', 'SG'], ['Gary Trent Jr.', 'SG'], ['Taurean Prince', 'SF'],
    ['AJ Green', 'SG'], ['Andre Jackson Jr.', 'SG'], ['MarJon Beauchamp', 'SF'], ['Tyler Smith', 'PF'],
    ['Liam Robbins', 'C'], ['Delon Wright', 'PG'], ['Ryan Rollins', 'PG'],
  ],
  MIN: [
    ['Anthony Edwards', 'SG'], ['Karl-Anthony Towns', 'C'], ['Rudy Gobert', 'C'], ['Jaden McDaniels', 'SF'],
    ['Mike Conley', 'PG'], ['Naz Reid', 'PF'], ['Nickeil Alexander-Walker', 'SG'], ['Kyle Anderson', 'SF'],
    ['Monte Morris', 'PG'], ['Josh Minott', 'SF'], ['Luka Garza', 'C'], ['Wendell Moore Jr.', 'SG'],
    ['Leonard Miller', 'PF'], ['Daishen Nix', 'PG'], ['TJ Warren', 'SF'],
  ],
  NOP: [
    ['Zion Williamson', 'PF'], ['Brandon Ingram', 'SF'], ['CJ McCollum', 'PG'], ['Trey Murphy III', 'SF'],
    ['Herbert Jones', 'SF'], ['Jonas Valanciunas', 'C'], ['Jose Alvarado', 'PG'], ['Naji Marshall', 'SF'],
    ['Larry Nance Jr.', 'PF'], ['Dyson Daniels', 'SG'], ['Jordan Hawkins', 'SG'], ['Matt Ryan', 'SF'],
    ['Jeremiah Robinson-Earl', 'PF'], ['Cody Zeller', 'C'], ['E.J. Liddell', 'PF'],
  ],
  NYK: [
    ['Jalen Brunson', 'PG'], ['Julius Randle', 'PF'], ['OG Anunoby', 'SF'], ['Mikal Bridges', 'SF'],
    ['Josh Hart', 'SG'], ['Donte DiVincenzo', 'SG'], ['Mitchell Robinson', 'C'], ['Isaiah Hartenstein', 'C'],
    ['Miles McBride', 'PG'], ['Precious Achiuwa', 'PF'], ['Jericho Sims', 'C'], ['Alec Burks', 'SG'],
    ['Bojan Bogdanovic', 'SF'], ['Tyler Kolek', 'PG'], ['Jacob Toppin', 'SF'],
  ],
  OKC: [
    ['Shai Gilgeous-Alexander', 'PG'], ['Jalen Williams', 'SF'], ['Chet Holmgren', 'C'], ['Josh Giddey', 'PG'],
    ['Luguentz Dort', 'SG'], ['Isaiah Joe', 'SG'], ['Cason Wallace', 'PG'], ['Kenrich Williams', 'SF'],
    ['Jaylin Williams', 'PF'], ['Aaron Wiggins', 'SG'], ['Ousmane Dieng', 'PF'], ['Lindy Waters III', 'SF'],
    ['Vasilije Micic', 'PG'], ['Keyontae Johnson', 'SF'], ['Olivier Sarr', 'C'],
  ],
  ORL: [
    ['Paolo Banchero', 'PF'], ['Franz Wagner', 'SF'], ['Jalen Suggs', 'PG'], ['Wendell Carter Jr.', 'C'],
    ['Cole Anthony', 'PG'], ['Markelle Fultz', 'PG'], ['Gary Harris', 'SG'], ['Moritz Wagner', 'PF'],
    ['Jonathan Isaac', 'PF'], ['Joe Ingles', 'SF'], ['Anthony Black', 'PG'], ['Goga Bitadze', 'C'],
    ['Caleb Houstan', 'SG'], ['Jett Howard', 'SG'], ['Chuma Okeke', 'PF'],
  ],
  PHI: [
    ['Joel Embiid', 'C'], ['Tyrese Maxey', 'PG'], ['Paul George', 'SF'], ['Kelly Oubre Jr.', 'SG'],
    ['Kyle Lowry', 'PG'], ['Andre Drummond', 'C'], ['Caleb Martin', 'SF'], ['Eric Gordon', 'SG'],
    ['KJ Martin', 'SF'], ['Ricky Council IV', 'SG'], ['Reggie Jackson', 'PG'], ['Guerschon Yabusele', 'PF'],
    ['Justin Edwards', 'SF'], ['Adem Bona', 'C'], ['Jeff Dowtin', 'PG'],
  ],
  PHX: [
    ['Kevin Durant', 'SF'], ['Devin Booker', 'SG'], ['Bradley Beal', 'SG'], ['Jusuf Nurkic', 'C'],
    ['Grayson Allen', 'SG'], ['Royce O\'Neale', 'SF'], ['Eric Gordon', 'SG'], ['Bol Bol', 'PF'],
    ['Drew Eubanks', 'C'], ['Nassir Little', 'SF'], ['Josh Okogie', 'SG'], ['Damion Lee', 'SG'],
    ['Saben Lee', 'PG'], ['Oso Ighodaro', 'PF'], ['TyTy Washington', 'PG'],
  ],
  POR: [
    ['Scoot Henderson', 'PG'], ['Anfernee Simons', 'SG'], ['Jerami Grant', 'PF'], ['Deandre Ayton', 'C'],
    ['Shaedon Sharpe', 'SG'], ['Toumani Camara', 'SF'], ['Matisse Thybulle', 'SG'], ['Robert Williams III', 'C'],
    ['Jabari Walker', 'PF'], ['Kris Murray', 'SF'], ['Dalano Banton', 'PG'], ['Duop Reath', 'C'],
    ['Justin Minaya', 'SF'], ['Rayan Rupert', 'SG'], ['Ibou Badji', 'C'],
  ],
  SAC: [
    ['De\'Aaron Fox', 'PG'], ['Domantas Sabonis', 'C'], ['Malik Monk', 'SG'], ['Keegan Murray', 'SF'],
    ['DeMar DeRozan', 'SF'], ['Kevin Huerter', 'SG'], ['Trey Lyles', 'PF'], ['Keon Ellis', 'SG'],
    ['Davion Mitchell', 'PG'], ['Sasha Vezenkov', 'PF'], ['Chris Duarte', 'SG'], ['Alex Len', 'C'],
    ['Jordan McLaughlin', 'PG'], ['Colby Jones', 'SG'], ['Isaac Jones', 'PF'],
  ],
  SAS: [
    ['Victor Wembanyama', 'C'], ['Devin Vassell', 'SG'], ['Keldon Johnson', 'SF'], ['Jeremy Sochan', 'PF'],
    ['Chris Paul', 'PG'], ['Zach Collins', 'C'], ['Tre Jones', 'PG'], ['Julian Champagnie', 'SF'],
    ['Malaki Branham', 'SG'], ['Blake Wesley', 'PG'], ['Sandro Mamukelashvili', 'PF'], ['Charles Bassey', 'C'],
    ['Harrison Barnes', 'SF'], ['Stephon Castle', 'PG'], ['Sidy Cissoko', 'SF'],
  ],
  TOR: [
    ['Scottie Barnes', 'SF'], ['RJ Barrett', 'SG'], ['Immanuel Quickley', 'PG'], ['Jakob Poeltl', 'C'],
    ['Gradey Dick', 'SG'], ['Kelly Olynyk', 'PF'], ['Bruce Brown', 'SG'], ['Chris Boucher', 'PF'],
    ['Ochai Agbaji', 'SG'], ['Jalen McDaniels', 'SF'], ['Garrett Temple', 'SG'], ['Davion Mitchell', 'PG'],
    ['Jonathan Mogbo', 'PF'], ['Ja\'Kobe Walter', 'SG'], ['Jamal Shead', 'PG'],
  ],
  UTA: [
    ['Lauri Markkanen', 'PF'], ['Collin Sexton', 'PG'], ['Jordan Clarkson', 'SG'], ['Walker Kessler', 'C'],
    ['John Collins', 'PF'], ['Keyonte George', 'SG'], ['Talen Horton-Tucker', 'SG'], ['Kris Dunn', 'PG'],
    ['Taylor Hendricks', 'PF'], ['Brice Sensabaugh', 'SF'], ['Ochai Agbaji', 'SG'], ['Micah Potter', 'C'],
    ['Luka Samanic', 'PF'], ['Johnny Juzang', 'SG'], ['Kira Lewis Jr.', 'PG'],
  ],
  WAS: [
    ['Jordan Poole', 'SG'], ['Kyle Kuzma', 'PF'], ['Jonas Valanciunas', 'C'], ['Bilal Coulibaly', 'SF'],
    ['Tyus Jones', 'PG'], ['Deni Avdija', 'SF'], ['Corey Kispert', 'SF'], ['Marvin Bagley III', 'PF'],
    ['Richaun Holmes', 'C'], ['Jared Butler', 'PG'], ['Patrick Baldwin Jr.', 'SF'], ['Anthony Gill', 'PF'],
    ['Johnny Davis', 'SG'], ['Justin Champagnie', 'SG'], ['Tristan Vukcevic', 'C'],
  ],
};

/** Red-zone stars — the demo's headline risk alerts (star workload spikes). */
const RED_ZONE_STARS = [
  'LeBron James', 'Stephen Curry', 'Nikola Jokic', 'Giannis Antetokounmpo',
  'Luka Doncic', 'Joel Embiid', 'Jayson Tatum', 'Shai Gilgeous-Alexander',
];

/** Yellow-zone players — elevated but not alarming. */
const YELLOW_ZONE = [
  'Anthony Davis', 'Ja Morant', 'Zion Williamson', 'Kevin Durant', 'Devin Booker',
  'Tyrese Haliburton', 'Jalen Brunson', 'Anthony Edwards', 'Donovan Mitchell',
  'Damian Lillard', 'Jimmy Butler', 'Victor Wembanyama', 'Kyrie Irving', 'Pascal Siakam',
];

const DAY_MS = 86_400_000;
const GAME_LEN = 2880; // 48 min NBA game in seconds

function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length];
}

/** Deterministic pseudo-random for reproducible seed data. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function cleanFakeNbaData(): Promise<void> {
  console.log('— cleaning previous NBA demo data (idempotent reset)');

  // NBA player/game data is entirely seed/test data (the 30 real teams stay;
  // all NBA players and games are demo rows). Wiping by sportId guarantees
  // re-runs never collide (P2002) or duplicate — regardless of the externalId
  // rewrite to DB ids that earlier runs left behind.
  const demoPlayers = await prisma.players.findMany({
    where: { sportId: NBA_ID },
    select: { id: true },
  });
  const playerIds = demoPlayers.map(p => p.id);
  const demoGames = await prisma.games.findMany({
    where: { sportId: NBA_ID },
    select: { id: true },
  });
  const gameIds = demoGames.map(g => g.id);

  if (gameIds.length > 0) {
    await prisma.momentumGameData.deleteMany({ where: { gameId: { in: gameIds } } });
    await prisma.playByPlay.deleteMany({ where: { gameId: { in: gameIds } } });
    await prisma.playerGameLogs.deleteMany({ where: { gameId: { in: gameIds } } });
    await prisma.games.deleteMany({ where: { id: { in: gameIds } } });
  }
  if (playerIds.length > 0) {
    await prisma.injuryRiskScores.deleteMany({ where: { playerId: { in: playerIds } } });
    await prisma.playerGameLogs.deleteMany({ where: { playerId: { in: playerIds } } });
    await prisma.players.deleteMany({ where: { id: { in: playerIds } } });
  }

  // The fake "Smoke City Hoopers" team (id 1) + any other non-real NBA teams.
  const fakeTeam = await prisma.teams.findFirst({
    where: { sportId: NBA_ID, name: 'Smoke City Hoopers' },
    select: { id: true },
  });
  if (fakeTeam) {
    await prisma.teams.deleteMany({ where: { id: fakeTeam.id } });
  }
  console.log(`  removed ${gameIds.length} games, ${playerIds.length} players${fakeTeam ? ', 1 fake team' : ''}`);
}

async function seedNbaPlayers(): Promise<Map<string, number[]>> {
  // team abbreviation → player ids
  const teamPlayers = new Map<string, number[]>();
  const teams = await prisma.teams.findMany({
    where: { sportId: NBA_ID, isActive: true },
    select: { id: true, abbreviation: true },
  });
  console.log(`— seeding NBA rosters (${teams.length} teams × 15 players)`);
  let count = 0;
  for (const team of teams) {
    const roster = ROSTERS[team.abbreviation] ?? [];
    if (roster.length === 0) {
      console.log(`  WARN: no roster for ${team.abbreviation} — skipping`);
      continue;
    }
    const ids: number[] = [];
    for (let i = 0; i < roster.length; i += 1) {
      const [name, position] = roster[i];
      const [firstName, ...rest] = name.split(' ');
      const created = await prisma.players.create({
        data: {
          teamId: team.id,
          sportId: NBA_ID,
          name,
          firstName,
          lastName: rest.join(' ') || name,
          position,
          jerseyNumber: String(1 + i),
          age: 23 + (i % 12),
          heightInches: 75 + (i % 9),
          weightLbs: 195 + ((i * 7) % 80),
          // externalId must match DB id so alerts (which return externalId)
          // and search (which returns id) both resolve in the player risk route.
          // Placeholder is unique (constraint: unique [externalId, sportId]);
          // the final externalId = DB id is written right after creation.
          externalId: `nba-demo-${team.abbreviation}-${i}`,
          isActive: true,
          injuryStatus: 'healthy',
        },
      });
      ids.push(created.id);
      count += 1;
    }
    teamPlayers.set(team.abbreviation, ids);
  }
  // Fix externalIds to equal DB ids (unique per sport, so id values are safe).
  for (const ids of teamPlayers.values()) {
    for (const id of ids) {
      await prisma.players.update({
        where: { id },
        data: { externalId: String(id) },
      });
    }
  }
  console.log(`  created ${count} NBA players`);
  return teamPlayers;
}

async function seedNbaGames(teamPlayers: Map<string, number[]>): Promise<{ games: { id: number; homeTeamId: number; awayTeamId: number; date: Date }[]; byTeam: Map<number, { id: number; date: Date }[]> }> {
  const teams = await prisma.teams.findMany({
    where: { sportId: NBA_ID, isActive: true },
    select: { id: true, abbreviation: true },
  });
  const rng = mulberry32(20260815);
  const games: { id: number; homeTeamId: number; awayTeamId: number; date: Date }[] = [];
  const byTeam = new Map<number, { id: number; date: Date }[]>();

  // 15 game days × 10 games/day = 150 games; each team plays ~10 times.
  const DAYS = 15;
  const PER_DAY = 10;
  let seq = 0;
  for (let d = DAYS - 1; d >= 0; d -= 1) {
    const date = new Date(Date.now() - d * DAY_MS);
    date.setHours(19, 30, 0, 0);
    const shuffled = [...teams].sort(() => rng() - 0.5);
    for (let g = 0; g < PER_DAY; g += 1) {
      const home = shuffled[(g * 2) % shuffled.length];
      const away = shuffled[(g * 2 + 1) % shuffled.length];
      if (!home || !away || home.id === away.id) continue;
      seq += 1;
      const homeScore = 96 + Math.floor(rng() * 32);
      const awayScore = 96 + Math.floor(rng() * 32);
      const created = await prisma.games.create({
        data: {
          sportId: NBA_ID,
          homeTeamId: home.id,
          awayTeamId: away.id,
          date,
          season: '2024-25',
          gameType: 'regular',
          homeScore,
          awayScore,
          winner: homeScore >= awayScore ? 'home' : 'away',
          status: 'final',
          externalId: `nba-demo-g${seq}`,
          venue: `${home.abbreviation} Arena`,
          attendance: 17000 + Math.floor(rng() * 3000),
        },
      });
      games.push({ id: created.id, homeTeamId: home.id, awayTeamId: away.id, date });
      for (const tid of [home.id, away.id]) {
        const list = byTeam.get(tid) ?? [];
        list.push({ id: created.id, date });
        byTeam.set(tid, list);
      }
    }
  }
  // Keep teamPlayers map warm (ids only) — not needed further here.
  void teamPlayers;
  console.log(`  created ${games.length} recent NBA games`);
  return { games, byTeam };
}

async function seedGameLogs(
  teamPlayers: Map<string, number[]>,
  games: { id: number; homeTeamId: number; awayTeamId: number; date: Date }[]
): Promise<void> {
  const rng = mulberry32(987654);
  const teams = await prisma.teams.findMany({
    where: { sportId: NBA_ID, isActive: true },
    select: { id: true, abbreviation: true },
  });
  const abbrById = new Map(teams.map(t => [t.id, t.abbreviation]));
  const logs: {
    playerId: number; gameId: number; teamId: number; date: Date; minutesPlayed: number;
    backToBack: boolean; daysRestBefore: number; gamesLast7Days: number; gamesLast14Days: number;
    gamesLast21Days: number; points: number; assists: number; rebounds: number;
  }[] = [];

  for (const game of games) {
    for (const teamId of [game.homeTeamId, game.awayTeamId]) {
      const abbr = abbrById.get(teamId);
      const playerIds = abbr ? teamPlayers.get(abbr) ?? [] : [];
      // ~12 of 15 players log minutes per game (starters + top bench).
      const active = playerIds.slice(0, 12);
      for (let i = 0; i < active.length; i += 1) {
        const starter = i < 5;
        const minutes = starter ? 30 + Math.floor(rng() * 8) : 12 + Math.floor(rng() * 14);
        logs.push({
          playerId: active[i],
          gameId: game.id,
          teamId,
          date: game.date,
          minutesPlayed: minutes,
          backToBack: false,
          daysRestBefore: 1 + Math.floor(rng() * 3),
          gamesLast7Days: 3 + Math.floor(rng() * 3),
          gamesLast14Days: 6 + Math.floor(rng() * 4),
          gamesLast21Days: 9 + Math.floor(rng() * 5),
          points: Math.round(minutes * 0.45 + rng() * 6),
          assists: Math.round(rng() * 6),
          rebounds: Math.round(rng() * 7),
        });
      }
    }
  }

  for (let i = 0; i < logs.length; i += 400) {
    const batch = logs.slice(i, i + 400);
    await prisma.playerGameLogs.createMany({
      data: batch.map(l => ({
        ...l,
        rawBoxScore: { pts: l.points, ast: l.assists, reb: l.rebounds, starter: true },
      })),
    });
  }
  console.log(`  created ${logs.length} player game logs`);
}

async function seedRiskScores(teamPlayers: Map<string, number[]>, byTeam: Map<number, { id: number; date: Date }[]>): Promise<void> {
  const rng = mulberry32(555);
  const teams = await prisma.teams.findMany({
    where: { sportId: NBA_ID, isActive: true },
    select: { id: true, abbreviation: true },
  });
  const abbrById = new Map(teams.map(t => [t.id, t.abbreviation]));
  const allIds: number[] = [];
  for (const ids of teamPlayers.values()) allIds.push(...ids);

  // name lookup for red/yellow targeting
  const players = await prisma.players.findMany({
    where: { sportId: NBA_ID },
    select: { id: true, name: true },
  });
  const nameById = new Map(players.map(p => [p.id, p.name]));

  const RED = new Set(RED_ZONE_STARS);
  const YELLOW = new Set(YELLOW_ZONE);

  const rows: {
    playerId: number; riskScore: number; zone: string; triggerMetric: string | null;
    minutesZScore: number | null; baselineMeanMinutes: number | null; baselineStdMinutes: number | null;
    explanation: string; computedAt: Date; windowStart: Date; windowEnd: Date; isLatest: boolean;
    backToBackFlag: boolean;
  }[] = [];

  for (const playerId of allIds) {
    const name = nameById.get(playerId) ?? '';
    const [first] = name.split(' ');
    const targetRed = RED.has(name);
    const targetYellow = YELLOW.has(name);

    // Baseline workload from the player's recent games (from byTeam).
    const teamId = players.find(p => p.id === playerId)?.id;
    void teamId;

    let baselineMean = 26 + rng() * 8;
    let baselineStd = 4 + rng() * 3;
    const recentMean = targetRed ? baselineMean * 1.3 + rng() * 4 : targetYellow ? baselineMean * 1.12 : baselineMean * 0.95 + rng() * 2;

    // 10 history rows over ~60 days (trend chart + days-in-zone). The latest
    // row is 1h old so the 6h freshness TTL serves it directly from the DB
    // instead of recomputing via ML (which would return insufficient_data
    // when the model can't fit the small sample).
    const HISTORY = 10;
    for (let h = HISTORY - 1; h >= 0; h -= 1) {
      const computedAt =
        h === 0
          ? new Date(Date.now() - 1 * 3600_000)
          : new Date(Date.now() - (h * 6 + 1) * DAY_MS);
      const isLatest = h === 0;
      // Red players: escalate green → yellow → red in the last ~4 rows.
      let zone: string;
      let score: number;
      let z: number;
      let trigger: string | null;
      let explain: string;
      if (targetRed) {
        if (h >= 6) { zone = 'green'; score = 18 + rng() * 15; z = 0.2 + rng() * 0.4; trigger = null; }
        else if (h >= 3) { zone = 'yellow'; score = 48 + rng() * 14; z = 1.0 + rng() * 0.6; trigger = 'minutes'; }
        else {
          zone = 'red'; score = 72 + rng() * 18; z = 2.1 + rng() * 1.1; trigger = pick(['minutes', 'back_to_back', 'intensity'], h);
          explain = `${first} has played ${Math.round((recentMean / baselineMean - 1) * 100)}% more minutes than his personal average over the last 5 games (${Math.round(recentMean)} min vs ${Math.round(baselineMean)} min baseline) — a clear workload spike flagged by the model.`;
          rows.push({
            playerId, riskScore: score, zone, triggerMetric: trigger, minutesZScore: z,
            baselineMeanMinutes: baselineMean, baselineStdMinutes: baselineStd,
            explanation: explain, computedAt, windowStart: new Date(computedAt.getTime() - 7 * DAY_MS),
            windowEnd: computedAt, isLatest, backToBackFlag: zone === 'red' && h === 0,
          });
          continue;
        }
      } else if (targetYellow) {
        if (h >= 5) { zone = 'green'; score = 15 + rng() * 15; z = 0.1 + rng() * 0.4; trigger = null; }
        else { zone = 'yellow'; score = 52 + rng() * 14; z = 1.1 + rng() * 0.5; trigger = 'minutes'; }
      } else {
        zone = 'green'; score = 8 + rng() * 30; z = -0.4 + rng() * 0.9; trigger = null;
      }
      const prefix = zone === 'green'
        ? `${first} workload is within his personal baseline — minutes and intensity look normal for this stretch of the schedule.`
        : zone === 'yellow'
          ? `${first} workload is trending up: ${Math.round(recentMean)} min over the last 5 games vs a ${Math.round(baselineMean)} min baseline. Elevated but not yet at red-zone levels.`
          : '';
      rows.push({
        playerId, riskScore: score, zone, triggerMetric: trigger, minutesZScore: z,
        baselineMeanMinutes: baselineMean, baselineStdMinutes: baselineStd,
        explanation: explain ?? prefix, computedAt,
        windowStart: new Date(computedAt.getTime() - 7 * DAY_MS), windowEnd: computedAt, isLatest,
        backToBackFlag: zone === 'red' && h === 0,
      });
    }
  }

  for (let i = 0; i < rows.length; i += 400) {
    const batch = rows.slice(i, i + 400);
    await prisma.injuryRiskScores.createMany({ data: batch });
  }
  const zones = rows.filter(r => r.isLatest).reduce<Record<string, number>>((acc, r) => {
    acc[r.zone] = (acc[r.zone] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`  created ${rows.length} risk score rows (latest: ${JSON.stringify(zones)})`);
}

async function seedMomentumVerdicts(): Promise<void> {
  console.log('— seeding momentum analysis verdicts (NBA inconclusive, NHL significant)');
  const now = new Date(Date.now() - 2 * 3600_000); // 2h ago → fresh (24h TTL)

  // Remove stale NBA momentum rows from earlier seasons (e.g. a 2026-27 row
  // left by prior testing) so only the current-season row is served.
  const nba = await prisma.sports.findUnique({ where: { abbreviation: 'nba' } });
  if (nba) {
    await prisma.momentumAnalysis.deleteMany({
      where: { sportId: nba.id, season: { not: nba.season } },
    });
  }

  // NBA — inconclusive: weak, borderline effect (p ≈ 0.09)
  await prisma.momentumAnalysis.upsert({
    where: { sportId_season: { sportId: NBA_ID, season: '2024-25' } },
    update: {
      gamesAnalyzed: 1187,
      hazardCoefficient: 1.18,
      pValue: 0.089,
      confidenceIntervalLow: 0.94,
      confidenceIntervalHigh: 1.48,
      isSignificant: false,
      effectSize: 0.18,
      streakThreshold: 2,
      hazardRateChange: 18,
      verdictLabel: 'inconclusive',
      plainExplanation:
        'The Cox model found a borderline relationship between consecutive scoring and the opponent\'s hazard of scoring next in the NBA (hazard ratio 1.18, 95% CI [0.94, 1.48], p = 0.089). The direction hints at momentum but the confidence interval crosses 1 — the effect is too weak to call real. Treat it as a story for now.',
      shortExplanation:
        'Momentum hints at a small effect in the NBA but the evidence is not conclusive (p = 0.089).',
      computedAt: now,
    },
    create: {
      sportId: NBA_ID,
      season: '2024-25',
      gamesAnalyzed: 1187,
      hazardCoefficient: 1.18,
      pValue: 0.089,
      confidenceIntervalLow: 0.94,
      confidenceIntervalHigh: 1.48,
      isSignificant: false,
      effectSize: 0.18,
      streakThreshold: 2,
      hazardRateChange: 18,
      verdictLabel: 'inconclusive',
      plainExplanation:
        'The Cox model found a borderline relationship between consecutive scoring and the opponent\'s hazard of scoring next in the NBA (hazard ratio 1.18, 95% CI [0.94, 1.48], p = 0.089). The direction hints at momentum but the confidence interval crosses 1 — the effect is too weak to call real. Treat it as a story for now.',
      shortExplanation:
        'Momentum hints at a small effect in the NBA but the evidence is not conclusive (p = 0.089).',
      computedAt: now,
    },
  });

  // NHL — significant: strong, real effect (the demo's headline)
  await prisma.momentumAnalysis.upsert({
    where: { sportId_season: { sportId: NHL_ID, season: '2024' } },
    update: {
      gamesAnalyzed: 1012,
      hazardCoefficient: 1.52,
      pValue: 0.001,
      confidenceIntervalLow: 1.18,
      confidenceIntervalHigh: 1.96,
      isSignificant: true,
      effectSize: 0.42,
      streakThreshold: 2,
      hazardRateChange: 52,
      verdictLabel: 'significant',
      plainExplanation:
        'After fitting a Cox proportional hazard model on scoring sequences across 1012 games, each consecutive goal raises the opponent\'s hazard of scoring next by 52% (hazard ratio 1.52, 95% CI [1.18, 1.96], p = 0.001). This effect is statistically significant — momentum is a measurable, real effect in hockey.',
      shortExplanation:
        'Consecutive goals raise the opponent\'s scoring hazard by 52% in the NHL — momentum is real.',
      computedAt: now,
    },
    create: {
      sportId: NHL_ID,
      season: '2024',
      gamesAnalyzed: 1012,
      hazardCoefficient: 1.52,
      pValue: 0.001,
      confidenceIntervalLow: 1.18,
      confidenceIntervalHigh: 1.96,
      isSignificant: true,
      effectSize: 0.42,
      streakThreshold: 2,
      hazardRateChange: 52,
      verdictLabel: 'significant',
      plainExplanation:
        'After fitting a Cox proportional hazard model on scoring sequences across 1012 games, each consecutive goal raises the opponent\'s hazard of scoring next by 52% (hazard ratio 1.52, 95% CI [1.18, 1.96], p = 0.001). This effect is statistically significant — momentum is a measurable, real effect in hockey.',
      shortExplanation:
        'Consecutive goals raise the opponent\'s scoring hazard by 52% in the NHL — momentum is real.',
      computedAt: now,
    },
  });

  // NFL — myth (keep data, ensure a row exists for its season)
  const nfl = await prisma.sports.findUnique({ where: { abbreviation: 'nfl' } });
  if (nfl) {
    await prisma.momentumAnalysis.upsert({
      where: { sportId_season: { sportId: nfl.id, season: nfl.season } },
      update: {
        gamesAnalyzed: 271,
        hazardCoefficient: 1.2,
        pValue: 0.236,
        confidenceIntervalLow: 0.97,
        confidenceIntervalHigh: 1.49,
        isSignificant: false,
        effectSize: 0.18,
        verdictLabel: 'not_significant',
        plainExplanation:
          'The Cox model found no significant relationship between consecutive scoring and the opponent\'s hazard of scoring next in the NFL (hazard ratio 1.20, 95% CI [0.97, 1.49], p = 0.236). Any apparent momentum is within the range of random chance — momentum looks like a myth here.',
        shortExplanation:
          'Consecutive scoring has no statistically significant effect in the NFL (p = 0.236).',
        computedAt: now,
      },
      create: {
        sportId: nfl.id,
        season: nfl.season,
        gamesAnalyzed: 271,
        hazardCoefficient: 1.2,
        pValue: 0.236,
        confidenceIntervalLow: 0.97,
        confidenceIntervalHigh: 1.49,
        isSignificant: false,
        effectSize: 0.18,
        verdictLabel: 'not_significant',
        plainExplanation:
          'The Cox model found no significant relationship between consecutive scoring and the opponent\'s hazard of scoring next in the NFL (hazard ratio 1.20, 95% CI [0.97, 1.49], p = 0.236). Any apparent momentum is within the range of random chance — momentum looks like a myth here.',
        shortExplanation:
          'Consecutive scoring has no statistically significant effect in the NFL (p = 0.236).',
        computedAt: now,
      },
    });
  }

  // MLB — myth (keep data, ensure a row exists for its season)
  const mlb = await prisma.sports.findUnique({ where: { abbreviation: 'mlb' } });
  if (mlb) {
    await prisma.momentumAnalysis.upsert({
      where: { sportId_season: { sportId: mlb.id, season: mlb.season } },
      update: {
        gamesAnalyzed: 2430,
        hazardCoefficient: 1.05,
        pValue: 0.697,
        confidenceIntervalLow: 0.87,
        confidenceIntervalHigh: 1.27,
        isSignificant: false,
        effectSize: 0.04,
        verdictLabel: 'not_significant',
        plainExplanation:
          'The Cox model found no significant relationship between consecutive scoring and the opponent\'s hazard of scoring next in MLB (hazard ratio 1.05, 95% CI [0.87, 1.27], p = 0.697). Scoring runs does not change the opponent\'s hazard — in baseball, momentum is a story fans tell, not a measurable effect.',
        shortExplanation:
          'Consecutive runs have no statistically significant effect in MLB (p = 0.697).',
        computedAt: now,
      },
      create: {
        sportId: mlb.id,
        season: mlb.season,
        gamesAnalyzed: 2430,
        hazardCoefficient: 1.05,
        pValue: 0.697,
        confidenceIntervalLow: 0.87,
        confidenceIntervalHigh: 1.27,
        isSignificant: false,
        effectSize: 0.04,
        verdictLabel: 'not_significant',
        plainExplanation:
          'The Cox model found no significant relationship between consecutive scoring and the opponent\'s hazard of scoring next in MLB (hazard ratio 1.05, 95% CI [0.87, 1.27], p = 0.697). Scoring runs does not change the opponent\'s hazard — in baseball, momentum is a story fans tell, not a measurable effect.',
        shortExplanation:
          'Consecutive runs have no statistically significant effect in MLB (p = 0.697).',
        computedAt: now,
      },
    });
  }
  console.log('  momentum analysis rows upserted for NBA / NHL / NFL / MLB');
}

async function seedGameTimelines(games: { id: number; homeTeamId: number; awayTeamId: number; date: Date }[]): Promise<void> {
  console.log('— seeding NBA game momentum timelines (game replay)');
  const rng = mulberry32(424242);
  const teams = await prisma.teams.findMany({
    where: { sportId: NBA_ID, isActive: true },
    select: { id: true, abbreviation: true, name: true },
  });
  const teamById = new Map(teams.map(t => [t.id, t]));
  const players = await prisma.players.findMany({
    where: { sportId: NBA_ID },
    select: { id: true, teamId: true, name: true },
  });
  const playersByTeam = new Map<number, string[]>();
  for (const p of players) {
    const list = playersByTeam.get(p.teamId) ?? [];
    list.push(p.name);
    playersByTeam.set(p.teamId, list);
  }

  // Pick the 12 most recent games for timelines (replay picker).
  const timelineGames = [...games].sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 12);
  let written = 0;
  let playsWritten = 0;
  for (const game of timelineGames) {
    const homeTeam = teamById.get(game.homeTeamId);
    const awayTeam = teamById.get(game.awayTeamId);
    if (!homeTeam || !awayTeam) continue;
    const homeRoster = playersByTeam.get(game.homeTeamId) ?? ['Home Player'];
    const awayRoster = playersByTeam.get(game.awayTeamId) ?? ['Away Player'];

    // Build a plausible momentum timeline: ~24 scoring events across 48 min.
    const events: { gameTimeSeconds: number; homeMomentumScore: number; awayMomentumScore: number; eventDescription: string | null }[] = [];
    const N = 24;
    let homeMom = 0;
    let awayMom = 0;
    const homeSeries: number[] = [];
    const awaySeries: number[] = [];
    for (let i = 0; i < N; i += 1) {
      const t = Math.round(((i + 1) / N) * GAME_LEN);
      const homeScores = rng() > 0.45;
      const swing = Math.round(rng() * 14 + 4);
      if (homeScores) homeMom += swing;
      else awayMom += swing;
      homeMom = Math.max(-60, Math.min(60, homeMom));
      awayMom = Math.max(-60, Math.min(60, awayMom));
      homeSeries.push(homeMom);
      awaySeries.push(awayMom);
      const scorer = homeScores ? homeRoster[i % homeRoster.length] : awayRoster[i % awayRoster.length];
      events.push({
        gameTimeSeconds: t,
        homeMomentumScore: homeMom,
        awayMomentumScore: awayMom,
        eventDescription: homeScores
          ? `${scorer} scores — ${homeTeam.abbreviation} momentum surges.`
          : `${scorer} scores — ${awayTeam.abbreviation} momentum surges.`,
      });
    }
    const peakHome = Math.max(...homeSeries);
    const peakAway = Math.max(...awaySeries);
    let shifts = 0;
    for (let i = 1; i < homeSeries.length; i += 1) {
      const prev = homeSeries[i - 1] - awaySeries[i - 1];
      const cur = homeSeries[i] - awaySeries[i];
      if ((prev > 0 && cur <= 0) || (prev < 0 && cur >= 0)) shifts += 1;
    }

    await prisma.momentumGameData.upsert({
      where: { gameId: game.id },
      update: {
        homeTeamMomentum: homeSeries,
        awayTeamMomentum: awaySeries,
        timelineEvents: events,
        peakHomeMomentum: peakHome,
        peakAwayMomentum: peakAway,
        momentumShifts: shifts,
        computedAt: new Date(Date.now() - 2 * 3600_000),
      },
      create: {
        gameId: game.id,
        homeTeamMomentum: homeSeries,
        awayTeamMomentum: awaySeries,
        timelineEvents: events,
        peakHomeMomentum: peakHome,
        peakAwayMomentum: peakAway,
        momentumShifts: shifts,
        computedAt: new Date(Date.now() - 2 * 3600_000),
      },
    });

    // Seed matching play-by-play scoring events so the replay screen's
    // "longest streak" summary derives a real value (it reads PlayByPlay).
    const plays = events.map((ev, i) => ({
      gameId: game.id,
      sportId: NBA_ID,
      eventNumber: i + 1,
      period: Math.min(4, Math.floor(ev.gameTimeSeconds / 720) + 1),
      clock: null,
      eventTimeSeconds: ev.gameTimeSeconds,
      teamId: (ev.homeMomentumScore > ev.awayMomentumScore ? game.homeTeamId : game.awayTeamId) ?? game.homeTeamId,
      playerId: null,
      eventType: 'score',
      eventSubtype: 'made_shot',
      description: ev.eventDescription ?? 'Scoring play',
      homeScore: 0,
      awayScore: 0,
      scoreDiff: 0,
      isScoring: true,
      homeWinProbability: null,
      rawEvent: {},
    }));
    // Cleanup already deleted this game's plays, so plain createMany is safe.
    await prisma.playByPlay.createMany({ data: plays });
    playsWritten += plays.length;
    written += 1;
  }
  console.log(`  wrote ${written} NBA momentum timelines (+${playsWritten} play-by-play scoring events)`);
}

async function main(): Promise<void> {
  await cleanFakeNbaData();
  const teamPlayers = await seedNbaPlayers();
  const { games, byTeam } = await seedNbaGames(teamPlayers);
  await seedGameLogs(teamPlayers, games);
  await seedRiskScores(teamPlayers, byTeam);
  await seedMomentumVerdicts();
  await seedGameTimelines(games);
  console.log('\nDemo seed complete ✅');
}

main()
  .catch(err => {
    console.error('Demo seed failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
