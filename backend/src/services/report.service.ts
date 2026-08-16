/**
 * Team + player report PDF generation (plan: "Generate a PDF report for
 * team 14 — backend collects all player risk data, formats it into a
 * structured PDF").
 *
 * Uses pdfkit (pure-JS, no native deps) to build a clean one-page report:
 * team banner, zone summary, and the full roster sorted by risk score with
 * each player's zone, trigger and score — or a single player's risk profile
 * with workload bars and trend. Returns a Buffer the route streams as
 * application/pdf.
 */
import PDFDocument from 'pdfkit';
import { prisma } from '../db/client.js';
import { ApiError } from '../middleware/error.middleware.js';

const ZONE_COLORS: Record<string, [number, number, number]> = {
  red: [229, 72, 77],
  yellow: [245, 166, 35],
  green: [47, 163, 107],
  insufficient_data: [154, 160, 181],
};

const ZONE_LABEL: Record<string, string> = {
  red: 'RED',
  yellow: 'YELLOW',
  green: 'GREEN',
  insufficient_data: 'NO DATA',
};

/** One roster row used by the PDF (DB join of player + latest score). */
interface ReportPlayer {
  name: string;
  position: string | null;
  zone: string;
  riskScore: number | null;
  triggerMetric: string | null;
}

/**
 * Builds a PDF report for a team as a Buffer.
 * @param teamId  DB team id (route param)
 * @returns { buffer, filename } — filename is `TeamName-risk-report.pdf`.
 */
/** One player risk profile row for the PDF (DB join of player + latest score). */
interface ReportPlayerProfile {
  name: string;
  position: string | null;
  zone: string;
  riskScore: number | null;
  triggerMetric: string | null;
  explanation: string;
  minutesZ: number | null;
  distanceZ: number | null;
  intensityZ: number | null;
  baselineMeanMinutes: number | null;
  baselineStdMinutes: number | null;
  backToBackFlag: boolean;
  computedAt: string;
  recentGameCount: number;
}

/**
 * Builds a single-player PDF report (the trainer's "Export PDF" button on the
 * player risk screen). Shows the risk score + zone, trigger + explanation,
 * workload z-scores vs the baseline, and the last few risk snapshots.
 * @param playerId DB player id
 */
export async function generatePlayerReportPdf(
  playerId: number
): Promise<{ buffer: Buffer; filename: string; playerName: string }> {
  const player = await prisma.players.findUnique({
    where: { id: playerId },
    include: { team: { select: { name: true } }, sport: { select: { name: true, season: true } } },
  });
  if (!player) throw ApiError.notFound(`Player ${playerId} not found`);

  const latest = await prisma.injuryRiskScores.findFirst({
    where: { playerId, isLatest: true },
    orderBy: { computedAt: 'desc' },
  });
  const recentGames = await prisma.playerGameLogs.count({
    where: { playerId, date: { gte: new Date(Date.now() - 7 * 86_400_000) } },
  });
  const history = await prisma.injuryRiskScores.findMany({
    where: { playerId },
    orderBy: { computedAt: 'desc' },
    take: 5,
    select: { computedAt: true, riskScore: true, zone: true },
  });

  const profile: ReportPlayerProfile = {
    name: player.name,
    position: player.position,
    zone: latest?.zone ?? 'insufficient_data',
    riskScore: latest?.riskScore ?? null,
    triggerMetric: latest?.triggerMetric ?? null,
    explanation: latest?.explanation ?? 'No risk score computed yet.',
    minutesZ: latest?.minutesZScore ?? null,
    distanceZ: latest?.distanceZScore ?? null,
    intensityZ: latest?.intensityZScore ?? null,
    baselineMeanMinutes: latest?.baselineMeanMinutes ?? null,
    baselineStdMinutes: latest?.baselineStdMinutes ?? null,
    backToBackFlag: latest?.backToBackFlag ?? false,
    computedAt: latest?.computedAt.toISOString() ?? new Date().toISOString(),
    recentGameCount: recentGames,
  };

  const historyPoints = history.reverse().map(h => ({ date: h.computedAt.toISOString(), score: h.riskScore, zone: h.zone }));
  const safeName = player.name.replace(/[^\w-]+/g, '-');
  const buffer = await renderPlayerPdf({
    playerName: player.name,
    teamName: player.team.name,
    position: player.position,
    sportName: player.sport.name,
    season: player.sport.season ?? '',
    profile,
    history: historyPoints,
    generatedAt: new Date(),
  });
  return { buffer, filename: `${safeName}-risk-report.pdf`, playerName: player.name };
}

/** Draws the player PDF document and resolves with the full Buffer. */
function renderPlayerPdf(opts: {
  playerName: string;
  teamName: string;
  position: string | null;
  sportName: string;
  season: string;
  profile: ReportPlayerProfile;
  history: { date: string; score: number; zone: string }[];
  generatedAt: Date;
}): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `${opts.playerName} — Risk Report`, Author: 'Apex Sports Intelligence' } });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));

  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const p = opts.profile;
  const zoneRgb = (ZONE_COLORS[p.zone] ?? ZONE_COLORS.insufficient_data)! as [number, number, number];

  // --- Header band -------------------------------------------------------
  doc.rect(0, 0, doc.page.width, 108).fill('#5856D6');
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(24).text(opts.playerName, doc.page.margins.left, 30);
  doc.font('Helvetica').fontSize(11).fillColor('#D9D6FF').text(
    `${opts.teamName} · ${opts.position ?? '—'} · ${opts.sportName} · ${opts.season || 'current season'} · Apex Sports Intelligence`,
    doc.page.margins.left, 60
  );
  doc.fontSize(9).fillColor('#C9C5F5').text(`Generated ${opts.generatedAt.toUTCString()}`, doc.page.margins.left, 78);

  let y = 132;

  // --- Risk score card ---------------------------------------------------
  doc.fillColor('#14121F').font('Helvetica-Bold').fontSize(13).text('Risk Assessment', doc.page.margins.left, y);
  y += 18;
  doc.rect(doc.page.margins.left, y, pageWidth, 76).fill('#F4F4F8');
  doc.fillColor(rgb(zoneRgb[0], zoneRgb[1], zoneRgb[2])).font('Helvetica-Bold').fontSize(34).text(
    p.riskScore != null ? String(p.riskScore) : '—', doc.page.margins.left + 16, y + 12
  );
  doc.fillColor(ZONE_LABEL[p.zone] ?? 'NO DATA').fontSize(0); // no-op keeps colors stable
  doc.fillColor('#6E7280').font('Helvetica').fontSize(10).text('RISK SCORE / 100', doc.page.margins.left + 16, y + 52);
  doc.fillColor(rgb(zoneRgb[0], zoneRgb[1], zoneRgb[2])).font('Helvetica-Bold').fontSize(14).text(
    ZONE_LABEL[p.zone] ?? 'NO DATA', doc.page.margins.left + 130, y + 18
  );
  doc.fillColor('#6E7280').font('Helvetica').fontSize(9).text(
    `Zone · ${p.triggerMetric ?? '—'} · ${p.recentGameCount} game(s) last 7 days · Back-to-back: ${p.backToBackFlag ? 'yes' : 'no'}`,
    doc.page.margins.left + 130, y + 40, { width: pageWidth - 150 }
  );
  y += 94;

  // --- Explanation -------------------------------------------------------
  doc.fillColor('#14121F').font('Helvetica-Bold').fontSize(12).text('Why the flag', doc.page.margins.left, y);
  y += 16;
  doc.font('Helvetica').fontSize(10.5).fillColor('#3A3852').text(p.explanation, doc.page.margins.left, y, { width: pageWidth });
  const used = doc.heightOfString(p.explanation, { width: pageWidth });
  y += used + 18;

  // --- Workload z-scores -------------------------------------------------
  doc.fillColor('#14121F').font('Helvetica-Bold').fontSize(12).text('Workload vs baseline (z-score)', doc.page.margins.left, y);
  y += 16;
  const rows: { label: string; z: number | null; baseline: number | null }[] = [
    { label: 'Minutes played', z: p.minutesZ, baseline: p.baselineMeanMinutes },
    { label: 'Distance covered', z: p.distanceZ, baseline: null },
    { label: 'High intensity', z: p.intensityZ, baseline: null },
  ];
  const rowW = pageWidth / 3;
  rows.forEach((r, i) => {
    const bx = doc.page.margins.left + i * rowW;
    doc.rect(bx, y, rowW - 8, 44).fill('#F4F4F8');
    doc.fillColor('#6E7280').font('Helvetica').fontSize(8).text(r.label.toUpperCase(), bx + 10, y + 8);
    const z = r.z;
    const zColor = z != null && Math.abs(z) > 1.5 ? '#E5484D' : '#5856D6';
    doc.fillColor(zColor).font('Helvetica-Bold').fontSize(16).text(z != null ? (z >= 0 ? `+${z.toFixed(1)}` : z.toFixed(1)) : '—', bx + 10, y + 20);
    if (r.baseline != null) {
      doc.fillColor('#9AA0B5').font('Helvetica').fontSize(7).text(`baseline ${r.baseline.toFixed(1)}`, bx + 10, y + 36);
    }
  });
  y += 60;

  // --- Risk trend --------------------------------------------------------
  doc.fillColor('#14121F').font('Helvetica-Bold').fontSize(12).text('Recent risk scores', doc.page.margins.left, y);
  y += 16;
  if (opts.history.length === 0) {
    doc.font('Helvetica').fontSize(9.5).fillColor('#9AA0B5').text('No previous scores recorded.', doc.page.margins.left, y);
  } else {
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#9AA0B5');
    doc.text('DATE', doc.page.margins.left, y);
    doc.text('SCORE', doc.page.margins.left + 160, y);
    doc.text('ZONE', doc.page.margins.left + 240, y);
    y += 14;
    doc.font('Helvetica').fontSize(9.5);
    for (const h of opts.history) {
      const hRgb = (ZONE_COLORS[h.zone] ?? ZONE_COLORS.insufficient_data)! as [number, number, number];
      doc.fillColor('#14121F').text(h.date.slice(0, 10), doc.page.margins.left, y);
      doc.fillColor('#14121F').text(h.score != null ? String(h.score) : '—', doc.page.margins.left + 160, y);
      doc.fillColor(rgb(hRgb[0], hRgb[1], hRgb[2])).font('Helvetica-Bold').text(ZONE_LABEL[h.zone] ?? '—', doc.page.margins.left + 240, y);
      doc.font('Helvetica').fontSize(9.5);
      y += 16;
    }
  }

  // --- Footer ------------------------------------------------------------
  doc.font('Helvetica').fontSize(8).fillColor('#9AA0B5').text(
    'Apex Sports Intelligence — risk scores compare each player to their own 21-day workload baseline.',
    doc.page.margins.left, doc.page.height - 40, { width: pageWidth }
  );

  return new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

/**
 * Builds a PDF report for a team as a Buffer.
 * @param teamId  DB team id (route param)
 * @returns { buffer, filename } — filename is `TeamName-risk-report.pdf`.
 */
export async function generateTeamReportPdf(
  teamId: number
): Promise<{ buffer: Buffer; filename: string; teamName: string }> {
  const team = await prisma.teams.findUnique({
    where: { id: teamId },
    include: { sport: { select: { name: true, season: true } } },
  });
  if (!team) throw ApiError.notFound(`Team ${teamId} not found`);

  const players = await prisma.players.findMany({
    where: { teamId, isActive: true },
    select: { id: true, name: true, position: true },
    orderBy: { lastName: 'asc' },
  });
  const scores = await prisma.injuryRiskScores.findMany({
    where: { playerId: { in: players.map(p => p.id) }, isLatest: true },
  });
  const scoreByPlayer = new Map(scores.map(s => [s.playerId, s]));

  const roster: ReportPlayer[] = players.map(p => {
    const s = scoreByPlayer.get(p.id);
    return {
      name: p.name,
      position: p.position,
      zone: s?.zone ?? 'insufficient_data',
      riskScore: s?.riskScore ?? null,
      triggerMetric: s?.triggerMetric ?? null,
    };
  });
  roster.sort((a, b) => (b.riskScore ?? -1) - (a.riskScore ?? -1));

  const counts = {
    red: roster.filter(p => p.zone === 'red').length,
    yellow: roster.filter(p => p.zone === 'yellow').length,
    green: roster.filter(p => p.zone === 'green').length,
  };

  const safeName = team.name.replace(/[^\w-]+/g, '-');
  const buffer = await renderPdf({
    teamName: team.name,
    sportName: team.sport.name,
    season: team.sport.season ?? '',
    counts,
    roster,
    generatedAt: new Date(),
  });
  return {
    buffer,
    filename: `${safeName}-risk-report.pdf`,
    teamName: team.name,
  };
}

/** Draws the PDF document and resolves with the full Buffer on the end event
 *  (pdfkit streams — data arrives asynchronously after doc.end()). */
function renderPdf(opts: {
  teamName: string;
  sportName: string;
  season: string;
  counts: { red: number; yellow: number; green: number };
  roster: ReportPlayer[];
  generatedAt: Date;
}): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 48,
    info: {
      Title: `${opts.teamName} — Risk Report`,
      Author: 'Apex Sports Intelligence',
    },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));

  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  // --- Header band -------------------------------------------------------
  doc.rect(0, 0, doc.page.width, 108).fill('#5856D6');
  doc
    .fillColor('#FFFFFF')
    .font('Helvetica-Bold')
    .fontSize(24)
    .text(opts.teamName, doc.page.margins.left, 32);
  doc
    .font('Helvetica')
    .fontSize(11)
    .fillColor('#D9D6FF')
    .text(
      `${opts.sportName} · ${opts.season || 'current season'} · Apex Sports Intelligence`,
      doc.page.margins.left,
      62
    );
  doc
    .fontSize(9)
    .fillColor('#C9C5F5')
    .text(`Generated ${opts.generatedAt.toUTCString()}`, doc.page.margins.left, 80);

  let y = 132;

  // --- Zone summary ------------------------------------------------------
  doc.fillColor('#14121F').font('Helvetica-Bold').fontSize(13).text('Risk Summary', doc.page.margins.left, y);
  y += 20;

  const summaryRow = [
    { label: 'Red zone', value: opts.counts.red, color: '#E5484D' },
    { label: 'Yellow zone', value: opts.counts.yellow, color: '#F5A623' },
    { label: 'Green zone', value: opts.counts.green, color: '#2FA36B' },
  ];
  const boxW = (pageWidth - 24) / 3;
  summaryRow.forEach((s, i) => {
    const bx = doc.page.margins.left + i * (boxW + 12);
    doc.rect(bx, y, boxW, 46).fill('#F4F4F8');
    doc.fillColor(s.color).font('Helvetica-Bold').fontSize(20).text(String(s.value), bx + 14, y + 10);
    doc.fillColor('#6E7280').font('Helvetica').fontSize(9).text(s.label.toUpperCase(), bx + 14, y + 32);
  });
  y += 62;

  // --- Roster table ------------------------------------------------------
  doc.fillColor('#14121F').font('Helvetica-Bold').fontSize(13).text(`Roster (${opts.roster.length})`, doc.page.margins.left, y);
  y += 22;

  // Column layout (A4 portrait ~496pt content width)
  const colName = doc.page.margins.left;
  const colPos = colName + 210;
  const colZone = colPos + 70;
  const colScore = colZone + 90;
  const colTrigger = colScore + 60;
  const colWidths = { trigger: pageWidth - (colTrigger - doc.page.margins.left) - 24 };

  doc.font('Helvetica-Bold').fontSize(8).fillColor('#9AA0B5');
  doc.text('PLAYER', colName, y);
  doc.text('POS', colPos, y);
  doc.text('ZONE', colZone, y);
  doc.text('SCORE', colScore, y);
  doc.text('TRIGGER', colTrigger, y, { width: colWidths.trigger });
  y += 14;

  doc.font('Helvetica').fontSize(9.5);
  for (const p of opts.roster) {
    if (y > doc.page.height - 70) {
      doc.addPage();
      y = doc.page.margins.top;
    }
    doc.fillColor('#14121F').text(p.name, colName, y, { width: 200, ellipsis: true });
    doc.fillColor('#6E7280').text(p.position ?? '—', colPos, y);
    const zoneRgb = (ZONE_COLORS[p.zone] ?? ZONE_COLORS.insufficient_data)! as [number, number, number];
    doc.fillColor(rgb(zoneRgb[0], zoneRgb[1], zoneRgb[2])).font('Helvetica-Bold').text(ZONE_LABEL[p.zone] ?? '—', colZone, y);
    doc.fillColor('#14121F').font('Helvetica').text(p.riskScore != null ? String(p.riskScore) : '—', colScore, y);
    doc.fillColor('#6E7280').text(p.triggerMetric ?? '', colTrigger, y, { width: colWidths.trigger, ellipsis: true });
    y += 17;
  }

  // --- Footer ------------------------------------------------------------
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor('#9AA0B5')
    .text(
      'Apex Sports Intelligence — risk scores compare each player to their own 21-day workload baseline.',
      doc.page.margins.left,
      doc.page.height - 40,
      { width: pageWidth }
    );

  return new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

/** pdfkit takes hex colors; this normalizes a #RRGGBB string into one. */
function rgb(r: number, g: number, b: number): string {
  const h = (n: number) => n.toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}
