// =============================================================================
// Shared seed utilities — used across all seeders.
// =============================================================================

import { PrismaClient } from '@prisma/client';

// ── Parsers ───────────────────────────────────────────────────────────────────

export function parseCm(val: string | null | undefined): number | null {
  if (!val) return null;
  const n = parseInt(val.replace(/[^\d]/g, ''));
  return isNaN(n) ? null : n;
}

export function normalizePosition(pos: string | null | undefined): string {
  if (!pos) return 'MID';
  const p = pos.toLowerCase();
  if (p === 'goalkeeper' || p === 'g' || p === 'gk') return 'GK';
  if (p === 'defender'   || p === 'd' || p === 'def') return 'DEF';
  if (p === 'midfielder' || p === 'm' || p === 'mid') return 'MID';
  if (p === 'attacker'   || p === 'f' || p === 'fw' || p === 'fwd') return 'FWD';
  return 'MID';
}

// ── Shared ApiFixture type ─────────────────────────────────────────────────────

export interface ApiFixture {
  fixture: {
    id:        number;
    referee:   string | null;
    timezone:  string;
    date:      string;
    timestamp: number;
    periods:   { first: number | null; second: number | null };
    venue:     { id: number | null; name: string; city: string };
    status:    { long: string; short: string; elapsed: number | null; extra: number | null };
  };
  league: {
    id:     number;
    name:   string;
    season: number;
    round:  string;
  };
  teams: {
    home: { id: number; name: string; winner: boolean | null };
    away: { id: number; name: string; winner: boolean | null };
  };
  goals: { home: number | null; away: number | null };
  score: {
    halftime:  { home: number | null; away: number | null };
    fulltime:  { home: number | null; away: number | null };
    extratime: { home: number | null; away: number | null };
    penalty:   { home: number | null; away: number | null };
  };
}

// ── Match record builders ──────────────────────────────────────────────────────

export function matchUpdateData(f: ApiFixture) {
  return {
    kickoffAt:     new Date(f.fixture.date),
    timestamp:     f.fixture.timestamp,
    statusShort:   f.fixture.status.short,
    statusLong:    f.fixture.status.long,
    statusElapsed: f.fixture.status.elapsed,
    statusExtra:   f.fixture.status.extra,
    roundLabel:    f.league.round,
    refereeMain:   f.fixture.referee,
    homeScore:     f.score.fulltime.home,
    awayScore:     f.score.fulltime.away,
    homeScoreHt:   f.score.halftime.home,
    awayScoreHt:   f.score.halftime.away,
    homeScoreEt:   f.score.extratime.home,
    awayScoreEt:   f.score.extratime.away,
    homePenScore:  f.score.penalty.home,
    awayPenScore:  f.score.penalty.away,
  };
}

export function matchCreateData(
  f: ApiFixture,
  seasonDbId: number,
  homeDbId: number,
  awayDbId: number,
  venueId: number | null,
) {
  return {
    apiFootballId:       f.fixture.id,
    competitionSeasonId: seasonDbId,
    homeTeamId:          homeDbId,
    awayTeamId:          awayDbId,
    venueId,
    timezone:            f.fixture.timezone,
    periodFirstStart:    f.fixture.periods.first,
    periodSecondStart:   f.fixture.periods.second,
    enrichStatus:        'SCHEDULED' as const,
    ...matchUpdateData(f),
  };
}

// ── Competition / Season auto-create ──────────────────────────────────────────

export async function ensureCompetition(
  prisma: PrismaClient,
  leagueId: number,
  leagueName: string,
  competitionMap: Map<number, number>,
): Promise<number> {
  if (competitionMap.has(leagueId)) return competitionMap.get(leagueId)!;

  const rawName  = (leagueName || `League ${leagueId}`).trim();
  const baseName = rawName.slice(0, 193);

  const nameConflict = await prisma.competition.findFirst({
    where: { name: baseName, NOT: { apiFootballId: leagueId } },
    select: { id: true },
  });
  const finalName = nameConflict ? `${baseName} [${leagueId}]`.slice(0, 200) : baseName;

  const comp = await prisma.competition.upsert({
    where:  { apiFootballId: leagueId },
    update: {},
    create: {
      apiFootballId: leagueId,
      name:          finalName,
      shortName:     finalName.slice(0, 50),
      type:          'friendly',
    },
  });

  competitionMap.set(leagueId, comp.id);
  return comp.id;
}

export async function ensureSeason(
  prisma: PrismaClient,
  compDbId: number,
  leagueId: number,
  year: number,
  seasonMap: Map<string, number>,
): Promise<number> {
  const key = `${leagueId}-${year}`;
  if (seasonMap.has(key)) return seasonMap.get(key)!;

  const now = new Date();
  const cs  = await prisma.competitionSeason.upsert({
    where:  { competitionId_label: { competitionId: compDbId, label: String(year) } },
    update: { isCurrent: year === now.getFullYear() },
    create: {
      competitionId:     compDbId,
      apiFootballSeason: year,
      label:             String(year),
      startDate:         new Date(year, 0, 1),
      endDate:           new Date(year, 11, 31),
      isCurrent:         year === now.getFullYear(),
    },
  });

  seasonMap.set(key, cs.id);
  return cs.id;
}
