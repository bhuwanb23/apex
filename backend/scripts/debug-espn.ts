import axios from 'axios';

async function main(): Promise<void> {
  const res = await axios.get('https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/22/roster');
  const athletes = res.data.athletes ?? [];
  console.log('Athletes count:', athletes.length);
  if (athletes.length > 0) {
    console.log('First athlete (raw):', JSON.stringify(athletes[0], null, 2));
  }
}

main().catch(console.error);
