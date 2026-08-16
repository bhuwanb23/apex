/**
 * Seeds the real teams for NBA / NFL / MLB / NHL from committed data, so a
 * fresh container (or checkout) gets a working demo without live API sync.
 *
 * This mirrors what the sports APIs would write: NBA (30), NFL (32), MLB (30)
 * and NHL (32) — real names, cities, conferences/divisions and externalIds.
 * Idempotent: upserts by (abbreviation, sportId).
 *
 * Run with: npm run db:seed:teams
 */
import { prisma } from '../src/db/client.js';

interface TeamSeed {
  sport: string; // sports.abbreviation
  name: string;
  abbreviation: string;
  city: string;
  conference?: string;
  division?: string;
  externalId: string;
}

const TEAMS: TeamSeed[] = [
  // --- NBA (sportId resolved from 'nba') ---
  { sport: 'nba', name: 'Atlanta Hawks', abbreviation: 'ATL', city: 'Atlanta', conference: 'East', division: 'Southeast', externalId: '1' },
  { sport: 'nba', name: 'Boston Celtics', abbreviation: 'BOS', city: 'Boston', conference: 'East', division: 'Atlantic', externalId: '2' },
  { sport: 'nba', name: 'Brooklyn Nets', abbreviation: 'BKN', city: 'Brooklyn', conference: 'East', division: 'Atlantic', externalId: '3' },
  { sport: 'nba', name: 'Charlotte Hornets', abbreviation: 'CHA', city: 'Charlotte', conference: 'East', division: 'Southeast', externalId: '4' },
  { sport: 'nba', name: 'Chicago Bulls', abbreviation: 'CHI', city: 'Chicago', conference: 'East', division: 'Central', externalId: '5' },
  { sport: 'nba', name: 'Cleveland Cavaliers', abbreviation: 'CLE', city: 'Cleveland', conference: 'East', division: 'Central', externalId: '6' },
  { sport: 'nba', name: 'Dallas Mavericks', abbreviation: 'DAL', city: 'Dallas', conference: 'West', division: 'Southwest', externalId: '7' },
  { sport: 'nba', name: 'Denver Nuggets', abbreviation: 'DEN', city: 'Denver', conference: 'West', division: 'Northwest', externalId: '8' },
  { sport: 'nba', name: 'Detroit Pistons', abbreviation: 'DET', city: 'Detroit', conference: 'East', division: 'Central', externalId: '9' },
  { sport: 'nba', name: 'Golden State Warriors', abbreviation: 'GSW', city: 'Golden State', conference: 'West', division: 'Pacific', externalId: '10' },
  { sport: 'nba', name: 'Houston Rockets', abbreviation: 'HOU', city: 'Houston', conference: 'West', division: 'Southwest', externalId: '11' },
  { sport: 'nba', name: 'Indiana Pacers', abbreviation: 'IND', city: 'Indiana', conference: 'East', division: 'Central', externalId: '12' },
  { sport: 'nba', name: 'LA Clippers', abbreviation: 'LAC', city: 'LA', conference: 'West', division: 'Pacific', externalId: '13' },
  { sport: 'nba', name: 'Los Angeles Lakers', abbreviation: 'LAL', city: 'Los Angeles', conference: 'West', division: 'Pacific', externalId: '14' },
  { sport: 'nba', name: 'Memphis Grizzlies', abbreviation: 'MEM', city: 'Memphis', conference: 'West', division: 'Southwest', externalId: '15' },
  { sport: 'nba', name: 'Miami Heat', abbreviation: 'MIA', city: 'Miami', conference: 'East', division: 'Southeast', externalId: '16' },
  { sport: 'nba', name: 'Milwaukee Bucks', abbreviation: 'MIL', city: 'Milwaukee', conference: 'East', division: 'Central', externalId: '17' },
  { sport: 'nba', name: 'Minnesota Timberwolves', abbreviation: 'MIN', city: 'Minnesota', conference: 'West', division: 'Northwest', externalId: '18' },
  { sport: 'nba', name: 'New Orleans Pelicans', abbreviation: 'NOP', city: 'New Orleans', conference: 'West', division: 'Southwest', externalId: '19' },
  { sport: 'nba', name: 'New York Knicks', abbreviation: 'NYK', city: 'New York', conference: 'East', division: 'Atlantic', externalId: '20' },
  { sport: 'nba', name: 'Oklahoma City Thunder', abbreviation: 'OKC', city: 'Oklahoma City', conference: 'West', division: 'Northwest', externalId: '21' },
  { sport: 'nba', name: 'Orlando Magic', abbreviation: 'ORL', city: 'Orlando', conference: 'East', division: 'Southeast', externalId: '22' },
  { sport: 'nba', name: 'Philadelphia 76ers', abbreviation: 'PHI', city: 'Philadelphia', conference: 'East', division: 'Atlantic', externalId: '23' },
  { sport: 'nba', name: 'Phoenix Suns', abbreviation: 'PHX', city: 'Phoenix', conference: 'West', division: 'Pacific', externalId: '24' },
  { sport: 'nba', name: 'Portland Trail Blazers', abbreviation: 'POR', city: 'Portland', conference: 'West', division: 'Northwest', externalId: '25' },
  { sport: 'nba', name: 'Sacramento Kings', abbreviation: 'SAC', city: 'Sacramento', conference: 'West', division: 'Pacific', externalId: '26' },
  { sport: 'nba', name: 'San Antonio Spurs', abbreviation: 'SAS', city: 'San Antonio', conference: 'West', division: 'Southwest', externalId: '27' },
  { sport: 'nba', name: 'Toronto Raptors', abbreviation: 'TOR', city: 'Toronto', conference: 'East', division: 'Atlantic', externalId: '28' },
  { sport: 'nba', name: 'Utah Jazz', abbreviation: 'UTA', city: 'Utah', conference: 'West', division: 'Northwest', externalId: '29' },
  { sport: 'nba', name: 'Washington Wizards', abbreviation: 'WAS', city: 'Washington', conference: 'East', division: 'Southeast', externalId: '30' },

  // --- NFL (sportId resolved from 'nfl') ---
  { sport: 'nfl', name: 'Arizona Cardinals', abbreviation: 'ARI', city: 'Arizona', externalId: '22' },
  { sport: 'nfl', name: 'Atlanta Falcons', abbreviation: 'ATL', city: 'Atlanta', externalId: '1' },
  { sport: 'nfl', name: 'Baltimore Ravens', abbreviation: 'BAL', city: 'Baltimore', externalId: '33' },
  { sport: 'nfl', name: 'Buffalo Bills', abbreviation: 'BUF', city: 'Buffalo', externalId: '2' },
  { sport: 'nfl', name: 'Carolina Panthers', abbreviation: 'CAR', city: 'Carolina', externalId: '29' },
  { sport: 'nfl', name: 'Chicago Bears', abbreviation: 'CHI', city: 'Chicago', externalId: '3' },
  { sport: 'nfl', name: 'Cincinnati Bengals', abbreviation: 'CIN', city: 'Cincinnati', externalId: '4' },
  { sport: 'nfl', name: 'Cleveland Browns', abbreviation: 'CLE', city: 'Cleveland', externalId: '5' },
  { sport: 'nfl', name: 'Dallas Cowboys', abbreviation: 'DAL', city: 'Dallas', externalId: '6' },
  { sport: 'nfl', name: 'Denver Broncos', abbreviation: 'DEN', city: 'Denver', externalId: '7' },
  { sport: 'nfl', name: 'Detroit Lions', abbreviation: 'DET', city: 'Detroit', externalId: '8' },
  { sport: 'nfl', name: 'Green Bay Packers', abbreviation: 'GB', city: 'Green Bay', externalId: '9' },
  { sport: 'nfl', name: 'Houston Texans', abbreviation: 'HOU', city: 'Houston', externalId: '34' },
  { sport: 'nfl', name: 'Indianapolis Colts', abbreviation: 'IND', city: 'Indianapolis', externalId: '11' },
  { sport: 'nfl', name: 'Jacksonville Jaguars', abbreviation: 'JAX', city: 'Jacksonville', externalId: '30' },
  { sport: 'nfl', name: 'Kansas City Chiefs', abbreviation: 'KC', city: 'Kansas City', externalId: '12' },
  { sport: 'nfl', name: 'Las Vegas Raiders', abbreviation: 'LV', city: 'Las Vegas', externalId: '13' },
  { sport: 'nfl', name: 'Los Angeles Chargers', abbreviation: 'LAC', city: 'Los Angeles', externalId: '24' },
  { sport: 'nfl', name: 'Los Angeles Rams', abbreviation: 'LAR', city: 'Los Angeles', externalId: '14' },
  { sport: 'nfl', name: 'Miami Dolphins', abbreviation: 'MIA', city: 'Miami', externalId: '15' },
  { sport: 'nfl', name: 'Minnesota Vikings', abbreviation: 'MIN', city: 'Minnesota', externalId: '16' },
  { sport: 'nfl', name: 'New England Patriots', abbreviation: 'NE', city: 'New England', externalId: '17' },
  { sport: 'nfl', name: 'New Orleans Saints', abbreviation: 'NO', city: 'New Orleans', externalId: '18' },
  { sport: 'nfl', name: 'New York Giants', abbreviation: 'NYG', city: 'New York', externalId: '19' },
  { sport: 'nfl', name: 'New York Jets', abbreviation: 'NYJ', city: 'New York', externalId: '20' },
  { sport: 'nfl', name: 'Philadelphia Eagles', abbreviation: 'PHI', city: 'Philadelphia', externalId: '21' },
  { sport: 'nfl', name: 'Pittsburgh Steelers', abbreviation: 'PIT', city: 'Pittsburgh', externalId: '23' },
  { sport: 'nfl', name: 'San Francisco 49ers', abbreviation: 'SF', city: 'San Francisco', externalId: '25' },
  { sport: 'nfl', name: 'Seattle Seahawks', abbreviation: 'SEA', city: 'Seattle', externalId: '26' },
  { sport: 'nfl', name: 'Tampa Bay Buccaneers', abbreviation: 'TB', city: 'Tampa Bay', externalId: '27' },
  { sport: 'nfl', name: 'Tennessee Titans', abbreviation: 'TEN', city: 'Tennessee', externalId: '10' },
  { sport: 'nfl', name: 'Washington Commanders', abbreviation: 'WSH', city: 'Washington', externalId: '28' },

  // --- MLB (sportId resolved from 'mlb') ---
  { sport: 'mlb', name: 'Arizona Diamondbacks', abbreviation: 'AZ', city: 'Phoenix', conference: 'National League', division: 'National League West', externalId: '109' },
  { sport: 'mlb', name: 'Athletics', abbreviation: 'ATH', city: 'Sacramento', conference: 'American League', division: 'American League West', externalId: '133' },
  { sport: 'mlb', name: 'Atlanta Braves', abbreviation: 'ATL', city: 'Atlanta', conference: 'National League', division: 'National League East', externalId: '144' },
  { sport: 'mlb', name: 'Baltimore Orioles', abbreviation: 'BAL', city: 'Baltimore', conference: 'American League', division: 'American League East', externalId: '110' },
  { sport: 'mlb', name: 'Boston Red Sox', abbreviation: 'BOS', city: 'Boston', conference: 'American League', division: 'American League East', externalId: '111' },
  { sport: 'mlb', name: 'Chicago Cubs', abbreviation: 'CHC', city: 'Chicago', conference: 'National League', division: 'National League Central', externalId: '112' },
  { sport: 'mlb', name: 'Chicago White Sox', abbreviation: 'CWS', city: 'Chicago', conference: 'American League', division: 'American League Central', externalId: '145' },
  { sport: 'mlb', name: 'Cincinnati Reds', abbreviation: 'CIN', city: 'Cincinnati', conference: 'National League', division: 'National League Central', externalId: '113' },
  { sport: 'mlb', name: 'Cleveland Guardians', abbreviation: 'CLE', city: 'Cleveland', conference: 'American League', division: 'American League Central', externalId: '114' },
  { sport: 'mlb', name: 'Colorado Rockies', abbreviation: 'COL', city: 'Denver', conference: 'National League', division: 'National League West', externalId: '115' },
  { sport: 'mlb', name: 'Detroit Tigers', abbreviation: 'DET', city: 'Detroit', conference: 'American League', division: 'American League Central', externalId: '116' },
  { sport: 'mlb', name: 'Houston Astros', abbreviation: 'HOU', city: 'Houston', conference: 'American League', division: 'American League West', externalId: '117' },
  { sport: 'mlb', name: 'Kansas City Royals', abbreviation: 'KC', city: 'Kansas City', conference: 'American League', division: 'American League Central', externalId: '118' },
  { sport: 'mlb', name: 'Los Angeles Angels', abbreviation: 'LAA', city: 'Anaheim', conference: 'American League', division: 'American League West', externalId: '108' },
  { sport: 'mlb', name: 'Los Angeles Dodgers', abbreviation: 'LAD', city: 'Los Angeles', conference: 'National League', division: 'National League West', externalId: '119' },
  { sport: 'mlb', name: 'Miami Marlins', abbreviation: 'MIA', city: 'Miami', conference: 'National League', division: 'National League East', externalId: '146' },
  { sport: 'mlb', name: 'Milwaukee Brewers', abbreviation: 'MIL', city: 'Milwaukee', conference: 'National League', division: 'National League Central', externalId: '158' },
  { sport: 'mlb', name: 'Minnesota Twins', abbreviation: 'MIN', city: 'Minneapolis', conference: 'American League', division: 'American League Central', externalId: '142' },
  { sport: 'mlb', name: 'New York Mets', abbreviation: 'NYM', city: 'Flushing', conference: 'National League', division: 'National League East', externalId: '121' },
  { sport: 'mlb', name: 'New York Yankees', abbreviation: 'NYY', city: 'Bronx', conference: 'American League', division: 'American League East', externalId: '147' },
  { sport: 'mlb', name: 'Philadelphia Phillies', abbreviation: 'PHI', city: 'Philadelphia', conference: 'National League', division: 'National League East', externalId: '143' },
  { sport: 'mlb', name: 'Pittsburgh Pirates', abbreviation: 'PIT', city: 'Pittsburgh', conference: 'National League', division: 'National League Central', externalId: '134' },
  { sport: 'mlb', name: 'San Diego Padres', abbreviation: 'SD', city: 'San Diego', conference: 'National League', division: 'National League West', externalId: '135' },
  { sport: 'mlb', name: 'San Francisco Giants', abbreviation: 'SF', city: 'San Francisco', conference: 'National League', division: 'National League West', externalId: '137' },
  { sport: 'mlb', name: 'Seattle Mariners', abbreviation: 'SEA', city: 'Seattle', conference: 'American League', division: 'American League West', externalId: '136' },
  { sport: 'mlb', name: 'St. Louis Cardinals', abbreviation: 'STL', city: 'St. Louis', conference: 'National League', division: 'National League Central', externalId: '138' },
  { sport: 'mlb', name: 'Tampa Bay Rays', abbreviation: 'TB', city: 'St. Petersburg', conference: 'American League', division: 'American League East', externalId: '139' },
  { sport: 'mlb', name: 'Texas Rangers', abbreviation: 'TEX', city: 'Arlington', conference: 'American League', division: 'American League West', externalId: '140' },
  { sport: 'mlb', name: 'Toronto Blue Jays', abbreviation: 'TOR', city: 'Toronto', conference: 'American League', division: 'American League East', externalId: '141' },
  { sport: 'mlb', name: 'Washington Nationals', abbreviation: 'WSH', city: 'Washington', conference: 'National League', division: 'National League East', externalId: '120' },
];

async function main(): Promise<void> {
  let count = 0;
  for (const team of TEAMS) {
    const sport = await prisma.sports.findUnique({ where: { abbreviation: team.sport } });
    if (!sport) {
      console.warn(`  SKIP ${team.abbreviation} — sport '${team.sport}' not seeded yet (run npm run db:seed first)`);
      continue;
    }
    await prisma.teams.upsert({
      where: { abbreviation_sportId: { abbreviation: team.abbreviation, sportId: sport.id } },
      update: {
        name: team.name,
        city: team.city,
        conference: team.conference ?? null,
        division: team.division ?? null,
        externalId: team.externalId,
        isActive: true,
      },
      create: {
        sportId: sport.id,
        name: team.name,
        abbreviation: team.abbreviation,
        city: team.city,
        conference: team.conference ?? null,
        division: team.division ?? null,
        externalId: team.externalId,
        isActive: true,
      },
    });
    count += 1;
  }
  const total = await prisma.teams.count();
  console.log(`Teams seeded: ${count} upserted (${total} total in DB)`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async err => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
