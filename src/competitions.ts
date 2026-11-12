import { MANAGERS, type ManagerReference } from './reference.ts';
import type { LeagueSlug, LeagueSummary } from './types.ts';

export type SummaryMap = Partial<Record<LeagueSlug, LeagueSummary>>;
export type CupId = 'jffl' | LeagueSlug;
export interface CupSide { participant: ManagerReference | null; label: string; legs: (number | null)[]; total: number | null; }
export interface CupMatch { id: string; a: CupSide; b: CupSide; weeks: number[]; replay: boolean; status: 'bye' | 'waiting' | 'live' | 'final' | 'tied' | 'unavailable'; winner: ManagerReference | null; }
export interface CupRound { name: string; weeks: number[]; matches: CupMatch[]; }
export interface Cup { id: CupId; name: string; rounds: CupRound[]; champion: ManagerReference | null; }

export function scoreFor(data: SummaryMap, participant: ManagerReference, week: number) {
  const league = data[participant.slug];
  const matchup = league?.weeklyMatchups?.find(item => item.week === week && [item.homeTeamId, item.awayTeamId].includes(participant.teamId));
  if (!matchup) return { score: null, final: false };
  return { score: matchup.homeTeamId === participant.teamId ? matchup.homeScore : matchup.awayScore, final: matchup.status === 'final' };
}

/** Saved ESPN projection for these weeks, added when a tie covers more than one. Null when any week has none. */
export function matchupProjection(data: SummaryMap, participant: ManagerReference, weeks: number[], finalsOnly = false) {
  let total = 0;
  for (const week of weeks) {
    const matchup = data[participant.slug]?.weeklyMatchups?.find(item => item.week === week && [item.homeTeamId, item.awayTeamId].includes(participant.teamId));
    if (!matchup || (finalsOnly && matchup.status !== 'final')) return null;
    const value = matchup.homeTeamId === participant.teamId ? matchup.homeProjected : matchup.awayProjected;
    if (value == null || !Number.isFinite(value)) return null;
    total += value;
  }
  return Math.round(total * 100) / 100;
}

function side(data: SummaryMap, participant: ManagerReference | null, label: string, weeks: number[]): CupSide {
  const legs = weeks.map(week => participant ? scoreFor(data, participant, week).score : null);
  return { participant, label, legs, total: legs.some(value => value !== null) ? Math.round(legs.reduce<number>((sum, value) => sum + (value ?? 0), 0) * 100) / 100 : null };
}

function legFinal(data: SummaryMap, players: ManagerReference[], week: number) {
  return players.every(player => { const result = scoreFor(data, player, week); return result.final && result.score !== null; });
}

function match(data: SummaryMap, id: string, a: ManagerReference | null, b: ManagerReference | null, labels: [string,string], weeks: number[], bye = false): CupMatch {
  const scheduledTied = !bye && !!a && !!b && weeks.every(week => legFinal(data, [a, b], week)) && side(data, a, labels[0], weeks).total === side(data, b, labels[1], weeks).total;
  const scoringWeeks = scheduledTied ? [...weeks, weeks[weeks.length - 1] + 1] : weeks;
  const left = side(data, a, labels[0], scoringWeeks), right = side(data, b, labels[1], scoringWeeks);
  const base = { id, a: left, b: right, weeks: scoringWeeks, replay: scheduledTied };
  if (bye) return { ...base, status: 'bye', winner: a ?? b };
  if (!a || !b) return { ...base, status: 'waiting', winner: null };
  const finished = scoringWeeks.every(week => legFinal(data, [a, b], week));
  const missingPast = scoringWeeks.some(week => [a, b].some(player => week < (data[player.slug]?.week ?? 0) && scoreFor(data, player, week).score === null));
  const status = finished ? left.total === right.total ? 'tied' : 'final' : missingPast ? 'unavailable' : left.total !== null || right.total !== null ? 'live' : 'waiting';
  return { ...base, status, winner: finished && left.total !== right.total ? (left.total! > right.total! ? a : b) : null };
}

function nextRound(data: SummaryMap, previous: CupRound, name: string, weeks: number[], cupId: string, index: number): CupRound {
  const matches: CupMatch[] = [];
  for (let i=0; i<previous.matches.length; i+=2) {
    const a=previous.matches[i], b=previous.matches[i+1];
    matches.push(match(data,`${cupId}-${index}-${i/2}`,a.winner,b.winner,[`Winner of ${previous.name} ${i+1}`,`Winner of ${previous.name} ${i+2}`],weeks));
  }
  return { name, weeks, matches };
}

export function buildCup(id: CupId, data: SummaryMap, roster: readonly ManagerReference[] = MANAGERS): Cup {
  const participants=roster.filter(item=>id==='jffl'||item.slug===id);
  const bySeed=(seed:number|null)=>participants.find(item=>(id==='jffl'?item.jfflSeed:item.leagueSeed)===seed)??null;
  const rounds: CupRound[]=[];
  if(id==='jffl') {
    const order=[1,null,16,17,9,24,8,25,5,28,12,21,13,20,4,29,2,null,15,18,10,23,7,26,6,27,11,22,14,19,3,30];
    const matches: CupMatch[]=[];
    for(let i=0;i<order.length;i+=2) matches.push(match(data,`${id}-0-${i/2}`,bySeed(order[i]),bySeed(order[i+1]),['Bye','Bye'],[3,4],order[i+1]===null));
    rounds.push({name:'Round 1',weeks:[3,4],matches});
    for(const [index,weeks] of [[6,7],[9,10],[12,13],[15,16]].entries()) rounds.push(nextRound(data,rounds.at(-1)!,index===3?'Final':`Round ${index+2}`,weeks,id,index+1));
  } else {
    const first={name:'First round',weeks:[2],matches:[[8,9],[7,10]].map(([a,b],index)=>match(data,`${id}-0-${index}`,bySeed(a),bySeed(b),['',''],[2]))};
    rounds.push(first);
    const inputs: [ManagerReference|null,ManagerReference|null,[string,string]][]=[
      [bySeed(1),first.matches[0].winner,['','Winner of first round 1']],
      [bySeed(5),bySeed(4),['','']],
      [bySeed(3),bySeed(6),['','']],
      [bySeed(2),first.matches[1].winner,['','Winner of first round 2']],
    ];
    rounds.push({name:'Quarterfinals',weeks:[5],matches:inputs.map(([a,b,labels],index)=>match(data,`${id}-1-${index}`,a,b,labels,[5]))});
    rounds.push(nextRound(data,rounds[1],'Semifinals',[8],id,2));
    rounds.push(nextRound(data,rounds[2],'Final',[11],id,3));
  }
  const names={jffl:'JFFL Cup',premier:'Premier League Cup',championship:'Championship Cup','league-one':'League One Cup'};
  return {id,name:names[id],rounds,champion:rounds.at(-1)!.matches[0].winner};
}

export function roundScoreAverage(round: CupRound) {
  const totals = round.matches.filter(match => match.status !== 'bye').flatMap(match => [match.a.total, match.b.total]).filter((total): total is number => total !== null);
  return totals.length ? totals.reduce((sum, total) => sum + total, 0) / totals.length : null;
}

/** Furthest JFFL and league-cup ties that still list this team as a participant. */
export function currentCupMatchesForTeam(data: SummaryMap, slug: LeagueSlug, teamId: string, week?: number) {
  return (['jffl', slug] as CupId[]).flatMap(cupId => {
    const cup = buildCup(cupId, data);
    if (week != null) {
      return cup.rounds.flatMap(round => round.matches.flatMap((match, matchIndex) => {
        const inMatch = [match.a.participant, match.b.participant].some(participant => participant?.slug === slug && participant.teamId === teamId);
        return inMatch && match.weeks.includes(week) ? [{ cupId, cupName: cup.name, roundName: round.name, weeks: match.weeks, match, matchIndex }] : [];
      }));
    }
    let best: { cupId: CupId; cupName: string; roundName: string; weeks: number[]; match: CupMatch; matchIndex: number } | null = null;
    for (const round of cup.rounds) {
      for (const [matchIndex, match] of round.matches.entries()) {
        const inMatch = [match.a.participant, match.b.participant].some(participant => participant?.slug === slug && participant.teamId === teamId);
        if (inMatch) best = { cupId, cupName: cup.name, roundName: round.name, weeks: match.weeks, match, matchIndex };
      }
    }
    return best ? [best] : [];
  });
}

export function regularSeason(data: LeagueSummary) {
  const totals=new Map(data.teams.map(team=>[team.id,{teamId:team.id,wins:0,losses:0,ties:0,points:0,games:0}]));
  for(const matchup of data.weeklyMatchups??[]) {
    if(matchup.week>14||matchup.status!=='final'||matchup.homeScore===null||matchup.awayScore===null) continue;
    for(const [id,score,opponent] of [[matchup.homeTeamId,matchup.homeScore,matchup.awayScore],[matchup.awayTeamId,matchup.awayScore,matchup.homeScore]] as const) {
      const total=id?totals.get(id):null;
      if(total) { total.games++; total.points+=score; if(score>opponent)total.wins++;else if(score<opponent)total.losses++;else total.ties++; }
    }
  }
  return [...totals.values()];
}

/** Last rank still inside Championship and League One's promotion band. Premier has no promotion line. */
export const PROMOTION_RANK = 4;
/** First rank inside Premier and Championship's relegation band. League One has no demotion line. */
export const DEMOTION_RANK = 7;
/** Last rank in each league's top-8 Superbowl bracket. */
export const PLAYOFF_RANK = 8;

export const promotionCutoff = (slug: LeagueSlug) => slug === 'premier' ? null : PROMOTION_RANK;
export const demotionCutoff = (slug: LeagueSlug) => slug === 'league-one' ? null : DEMOTION_RANK;

export const provisionalZone=(slug:LeagueSlug,rank:number|null)=>rank===null?'Unranked':slug==='premier'?rank<DEMOTION_RANK?'Premier safety zone':'Relegation zone':slug==='championship'?rank<=PROMOTION_RANK?'Premier promotion zone':rank>=DEMOTION_RANK?'Relegation zone':'Championship safety zone':rank<=PROMOTION_RANK?'Championship promotion zone':'League One';

export interface RecordLine { wins: number | null; losses: number | null }

/**
 * Games ahead of a line team's record. Positive is ahead, negative is back,
 * and zero means the wins and losses are level. A tie that changes only one
 * side leaves a half game.
 */
export function gamesAhead(team: RecordLine, line: RecordLine | null): number | null {
  if (!line || team.wins == null || team.losses == null || line.wins == null || line.losses == null) return null;
  return ((team.wins - line.wins) + (line.losses - team.losses)) / 2;
}

export function lineTeam<T extends { rank: number | null }>(teams: readonly T[], rank: number): T | null {
  return teams.find(team => team.rank === rank) ?? null;
}

export type ScoringRole = 'leader' | 'tied' | 'behind' | 'unknown';

/** Points behind the most-points leader. The leader, and anyone tied with them, are 0. */
export function pointsLeaderGap(entries: readonly { id: string; points: number | null; counted: boolean }[]) {
  const result = new Map<string, { back: number | null; role: ScoringRole }>();
  const racing = entries.filter((entry): entry is { id: string; points: number; counted: boolean } => entry.counted && entry.points != null && Number.isFinite(entry.points));
  const cents = (value: number) => Math.round(value * 100);
  const best = racing.length ? Math.max(...racing.map(entry => cents(entry.points))) : null;
  const leaders = best == null ? 0 : racing.filter(entry => cents(entry.points) === best).length;
  for (const entry of entries) {
    if (best == null || entry.points == null || !entry.counted || !Number.isFinite(entry.points)) {
      result.set(entry.id, { back: null, role: 'unknown' });
      continue;
    }
    const back = (best - cents(entry.points)) / 100;
    const role: ScoringRole = back === 0 ? (leaders > 1 ? 'tied' : 'leader') : 'behind';
    result.set(entry.id, { back, role });
  }
  return result;
}

/** The scoring title: finished regular-season points, through week 14. Falls back to the standings total when those weeks are unavailable. */
export function scoringGaps(summary: LeagueSummary | undefined, teams: readonly { id: string; pointsFor: number | null }[]) {
  if (summary?.weeklyMatchups) return pointsLeaderGap(regularSeason(summary).map(row => ({ id: row.teamId, points: row.points, counted: row.games > 0 })));
  return pointsLeaderGap(teams.map(team => ({ id: team.id, points: team.pointsFor, counted: team.pointsFor != null })));
}

export function pointsBackLabel(back: number | null, role: ScoringRole): { text: string; phrase: string } {
  if (back == null || role === 'unknown') return { text: '—', phrase: '' };
  if (role === 'leader') return { text: '0', phrase: 'Scoring leader' };
  if (role === 'tied') return { text: '0', phrase: 'Tied for the scoring lead' };
  const body = back.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return { text: `-${body}`, phrase: `${body} points back of the scoring leader` };
}

const SEASON_GAMES = 14;

export type OutlookTone = 'good' | 'up' | 'hold' | 'warn' | 'long' | 'danger' | 'bad' | 'steady' | 'muted';
export interface SeasonOutlook { label: string; detail: string; tone: OutlookTone }
type OutlookTeam = { id: string; rank: number | null; wins: number | null; losses: number | null; ties?: number | null };

function gamesLeft(team: OutlookTeam): number | null {
  if (team.wins == null || team.losses == null) return null;
  return Math.max(0, SEASON_GAMES - (team.wins + team.losses + (team.ties ?? 0)));
}

/** How many games the trailer can close if one side loses out and the other wins out. */
function maxSwing(team: OutlookTeam, rival: OutlookTeam): number | null {
  const left = gamesLeft(team);
  const right = gamesLeft(rival);
  if (left == null || right == null) return null;
  return (left + right) / 2;
}

function gamesPhrase(gap: number, tail: 'clear' | 'back' | 'from safety'): string {
  const abs = Math.abs(gap);
  const body = Number.isInteger(abs) ? String(abs) : abs.toFixed(1);
  const unit = abs === 1 ? 'game' : 'games';
  if (tail === 'clear') return `${body} ${unit} clear`;
  if (tail === 'back') return `${body} ${unit} back`;
  return `${body} ${unit} from safety`;
}

type SpotRead = { state: 'clinched' | 'likely' | 'holding' | 'reach' | 'long' | 'out' | 'none'; detail: string };

/** Where a team stands against the last place inside a cutoff, with the games still left. */
function spotRace(team: OutlookTeam, teams: readonly OutlookTeam[], cutoff: number, outDetail: string, levelDetail: string): SpotRead {
  const at = (rank: number) => teams.find(item => item.rank === rank) ?? null;
  const line = at(cutoff);
  const firstOut = at(cutoff + 1);
  if (!line || team.rank == null) return { state: 'none', detail: '' };
  if (team.rank <= cutoff && firstOut) {
    const cushion = gamesAhead(team, firstOut);
    const swing = maxSwing(team, firstOut);
    if (cushion == null || swing == null) return { state: 'holding', detail: '' };
    if (cushion > swing) return { state: 'clinched', detail: 'Cannot fall out' };
    if (cushion >= swing / 2 && cushion >= 1) return { state: 'likely', detail: gamesPhrase(cushion, 'clear') };
    return { state: 'holding', detail: cushion > 0 ? gamesPhrase(cushion, 'clear') : cushion === 0 ? 'Level with the team below' : gamesPhrase(cushion, 'back') };
  }
  if (team.rank > cutoff) {
    const ahead = gamesAhead(team, line);
    const swing = maxSwing(team, line);
    if (ahead == null || swing == null) return { state: 'none', detail: '' };
    const back = -ahead;
    if (back > swing) return { state: 'out', detail: outDetail };
    if (back <= Math.max(1.5, swing * 0.35)) return { state: 'reach', detail: back === 0 ? levelDetail : gamesPhrase(back, 'back') };
    return { state: 'long', detail: gamesPhrase(back, 'back') };
  }
  return { state: 'none', detail: '' };
}

/**
 * One reading of the promotion and demotion races. The words follow the
 * games still left: a lead that the other side cannot close is clinched,
 * and a gap they cannot close is settled.
 */
export function seasonOutlook(slug: LeagueSlug, team: OutlookTeam, teams: readonly OutlookTeam[]): SeasonOutlook {
  const blank: SeasonOutlook = { label: '—', detail: '', tone: 'muted' };
  if (team.rank == null || team.wins == null || team.losses == null) return blank;
  const at = (rank: number) => teams.find(item => item.rank === rank) ?? null;
  const promoCut = promotionCutoff(slug);
  const dropCut = demotionCutoff(slug);
  const dropLine = dropCut == null ? null : at(dropCut);
  const lastSafe = dropCut == null ? null : at(dropCut - 1);

  const promo: SpotRead = promoCut == null ? { state: 'none', detail: '' } : spotRace(team, teams, promoCut, 'Out of promotion', 'Level with promotion');

  type Drop = { state: 'clinched' | 'safe' | 'close' | 'danger' | 'likely' | 'down' | 'none'; detail: string };
  let drop: Drop = { state: 'none', detail: '' };
  if (dropLine && lastSafe) {
    const aheadOfDrop = gamesAhead(team, dropLine);
    const aheadOfSafe = gamesAhead(team, lastSafe);
    const swingDrop = maxSwing(team, dropLine);
    const swingSafe = maxSwing(team, lastSafe);
    const inZone = team.rank >= dropCut!;
    const backOfSafe = aheadOfSafe == null ? null : -aheadOfSafe;
    if (backOfSafe != null && swingSafe != null && backOfSafe > swingSafe) drop = { state: 'down', detail: 'Cannot catch safety' };
    else if (!inZone && aheadOfDrop != null && swingDrop != null && aheadOfDrop > swingDrop) drop = { state: 'clinched', detail: 'Clear of the drop' };
    else if (inZone) {
      if (backOfSafe != null && swingSafe != null && backOfSafe >= Math.max(2, swingSafe / 2)) drop = { state: 'likely', detail: gamesPhrase(backOfSafe, 'from safety') };
      else if (aheadOfDrop === 0) drop = { state: 'danger', detail: 'On the drop line' };
      else if (aheadOfDrop != null && aheadOfDrop < 0) drop = { state: 'danger', detail: gamesPhrase(-aheadOfDrop, 'from safety') };
      else drop = { state: 'danger', detail: 'In the drop' };
    } else if (aheadOfDrop != null && aheadOfDrop <= 1 && (promoCut == null || team.rank > promoCut)) drop = { state: 'close', detail: aheadOfDrop === 0 ? 'Level with the drop' : gamesPhrase(aheadOfDrop, 'clear') };
    else if (aheadOfDrop != null) drop = { state: 'safe', detail: gamesPhrase(aheadOfDrop, 'clear') };
  }

  const noteDrop = (reading: SeasonOutlook): SeasonOutlook => {
    if (drop.state !== 'close') return reading;
    const extra = drop.detail;
    if (!extra) return reading;
    const joined = extra.charAt(0).toLowerCase() + extra.slice(1);
    return { ...reading, detail: reading.detail ? `${reading.detail} · ${joined}` : extra, tone: reading.tone === 'up' ? 'warn' : reading.tone };
  };

  if (drop.state === 'down') return { label: 'Demoted', detail: drop.detail, tone: 'bad' };
  if (drop.state === 'likely') return { label: 'Drop likely', detail: drop.detail, tone: 'bad' };
  if (drop.state === 'danger') return { label: 'In danger', detail: drop.detail, tone: 'danger' };
  if (promo.state === 'clinched') return noteDrop({ label: 'Clinched', detail: promo.detail, tone: 'good' });
  if (promo.state === 'likely') return noteDrop({ label: 'Likely up', detail: promo.detail, tone: 'up' });
  if (promo.state === 'holding') return noteDrop({ label: 'Inside', detail: promo.detail, tone: 'hold' });
  if (promo.state === 'reach') return noteDrop({ label: 'Chasing', detail: promo.detail, tone: 'warn' });
  if (drop.state === 'close') return { label: 'Drop close', detail: promo.state === 'long' && promo.detail ? `${promo.detail} of promotion` : drop.detail, tone: 'warn' };
  if (promo.state === 'long') return { label: 'Long shot', detail: drop.state === 'safe' || drop.state === 'clinched' ? `${promo.detail} · safe from the drop` : promo.detail, tone: 'long' };
  if (promo.state === 'out' && drop.state === 'none') return { label: 'Staying', detail: promo.detail, tone: 'long' };
  if (drop.state === 'clinched') return { label: 'Safe', detail: promo.state === 'out' ? 'Out of promotion' : drop.detail, tone: 'good' };
  if (drop.state === 'safe') return { label: 'Safe', detail: promo.state === 'out' ? 'Out of promotion' : drop.detail, tone: 'up' };
  if (promo.state === 'out') return { label: 'Safe', detail: promo.detail, tone: 'up' };
  return { label: 'Safe', detail: '', tone: 'up' };
}

/** The top-8 Superbowl race, in the same words as the promotion outlook. */
export function playoffOutlook(team: OutlookTeam, teams: readonly OutlookTeam[]): SeasonOutlook {
  if (team.rank == null || team.wins == null || team.losses == null) return { label: '—', detail: '', tone: 'muted' };
  const race = spotRace(team, teams, PLAYOFF_RANK, 'Out of the playoffs', 'Level with the cut');
  if (race.state === 'clinched') return { label: 'Clinched', detail: race.detail, tone: 'good' };
  if (race.state === 'likely') return { label: 'Likely in', detail: race.detail, tone: 'up' };
  if (race.state === 'holding') return { label: 'Inside', detail: race.detail, tone: 'hold' };
  if (race.state === 'reach') return { label: 'Chasing', detail: race.detail, tone: 'warn' };
  if (race.state === 'long') return { label: 'Long shot', detail: race.detail, tone: 'long' };
  if (race.state === 'out') return { label: 'Out', detail: race.detail, tone: 'bad' };
  return { label: '—', detail: '', tone: 'muted' };
}

export function gamesApartLabel(ahead: number | null, lineName: string, onLine = false): { text: string; phrase: string; tone: 'up' | 'down' | '' } {
  if (ahead == null) return { text: '—', phrase: '', tone: '' };
  const abs = Math.abs(ahead);
  const body = Number.isInteger(abs) ? String(abs) : abs.toFixed(1);
  if (ahead === 0) return { text: 'even', phrase: onLine ? `On the ${lineName}` : `Even with the ${lineName}`, tone: '' };
  const games = abs === 1 ? 'game' : 'games';
  if (ahead > 0) return { text: `${body} ahead`, phrase: `${body} ${games} ahead of the ${lineName}`, tone: 'up' };
  return { text: `${body} back`, phrase: `${body} ${games} back of the ${lineName}`, tone: 'down' };
}

const PROJECTION_MISS = 15;

/**
 * The side whose final score missed its ESPN projection by at least 15 points
 * and, on its own, flipped the projected winner. Pass final totals only.
 * Returns null when the favorite won, the miss is smaller, or a projection is missing.
 */
export function projectionUpset(leftScore: number | null, rightScore: number | null, leftProjected: number | null, rightProjected: number | null): 'left' | 'right' | null {
  if (leftScore == null || rightScore == null || leftProjected == null || rightProjected == null) return null;
  if (![leftScore, rightScore, leftProjected, rightProjected].every(Number.isFinite)) return null;
  if (leftScore === rightScore || leftProjected === rightProjected) return null;
  const cents = (value: number) => Math.round(value * 100);
  const favorite = leftProjected > rightProjected ? 'left' : 'right';
  const winner = leftScore > rightScore ? 'left' : 'right';
  if (winner === favorite) return null;
  const score = { left: leftScore, right: rightScore };
  const projected = { left: leftProjected, right: rightProjected };
  const other = (side: 'left' | 'right') => side === 'left' ? 'right' : 'left';
  const responsible = (['left', 'right'] as const).filter(side => {
    if (Math.abs(cents(score[side]) - cents(projected[side])) < PROJECTION_MISS * 100) return false;
    const restoredLeft = side === 'left' ? projected.left : score.left;
    const restoredRight = side === 'right' ? projected.right : score.right;
    if (restoredLeft === restoredRight) return true;
    const restoredWinner = restoredLeft > restoredRight ? 'left' : 'right';
    return restoredWinner === favorite;
  });
  responsible.sort((a, b) => Math.abs(cents(score[b]) - cents(projected[b])) - Math.abs(cents(score[a]) - cents(projected[a])) || (a === winner ? -1 : 1));
  return responsible[0] ?? null;
}
