/* Temporary inspection script for the ESPN NBA summary structure. */
const fs = require('fs');

const d = JSON.parse(fs.readFileSync('/tmp/nba_summary.json', 'utf8'));
console.log('keys:', Object.keys(d).join(','));
console.log('plays:', (d.plays || []).length);
console.log('drives:', (d.drives || []).length);
console.log(
  'header comps:',
  d.header && d.header.competitions ? d.header.competitions.length : 0
);

if (d.plays && d.plays.length) {
  const p = d.plays[0];
  console.log('play keys:', Object.keys(p).join(','));
  console.log(
    'sample:',
    JSON.stringify(
      {
        type: p.type,
        text: p.text,
        clock: p.clock,
        period: p.period,
        homeScore: p.homeScore,
        awayScore: p.awayScore,
        team: p.team && p.team.id,
        shootingPlay: !!p.shootingPlay,
      },
      null,
      1
    ).slice(0, 500)
  );
}
