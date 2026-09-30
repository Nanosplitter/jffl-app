import { MANAGERS, type ManagerReference } from './reference.ts';
import type { LeagueSlug, LeagueSummary } from './types.ts';

export type SummaryMap = Partial<Record<LeagueSlug, LeagueSummary>>;
export type CupId = 'jffl' | LeagueSlug;
export interface CupSide { participant: ManagerReference | null; label: string; legs: (number | null)[]; total: number | null; }
export interface CupMatch { id: string; a: CupSide; b: CupSide; status: 'bye' | 'waiting' | 'live' | 'final' | 'tied' | 'unavailable'; winner: ManagerReference | null; }
export interface CupRound { name: string; weeks: number[]; matches: CupMatch[]; }
export interface Cup { id: CupId; name: string; rounds: CupRound[]; champion: ManagerReference | null; }

export function scoreFor(data: SummaryMap, participant: ManagerReference, week: number) {
  const league = data[participant.slug];
  const matchup = league?.weeklyMatchups?.find(item => item.week === week && [item.homeTeamId, item.awayTeamId].includes(participant.teamId));
  if (!matchup) return { score: null, final: false };
  return { score: matchup.homeTeamId === participant.teamId ? matchup.homeScore : matchup.awayScore, final: matchup.status === 'final' };
}

function side(data: SummaryMap, participant: ManagerReference | null, label: string, weeks: number[]): CupSide {
  const legs = weeks.map(week => participant ? scoreFor(data, participant, week).score : null);
  return { participant, label, legs, total: legs.some(value => value !== null) ? Math.round(legs.reduce<number>((sum, value) => sum + (value ?? 0), 0) * 100) / 100 : null };
}

function match(data: SummaryMap, id: string, a: ManagerReference | null, b: ManagerReference | null, labels: [string,string], weeks: number[], bye = false): CupMatch {
  const left = side(data, a, labels[0], weeks), right = side(data, b, labels[1], weeks);
  if (bye) return { id, a:left, b:right, status:'bye', winner:a ?? b };
  if (!a || !b) return { id, a:left, b:right, status:'waiting', winner:null };
  const finished = weeks.every(week => [a,b].every(player => { const result = scoreFor(data, player, week); return result.final && result.score !== null; }));
  const missingPast = weeks.some(week => [a,b].some(player => week < (data[player.slug]?.week ?? 0) && scoreFor(data, player, week).score === null));
  const status = finished ? left.total === right.total ? 'tied' : 'final' : missingPast ? 'unavailable' : left.total !== null || right.total !== null ? 'live' : 'waiting';
  return { id, a:left, b:right, status, winner:finished && left.total !== right.total ? (left.total! > right.total! ? a : b) : null };
}

function nextRound(data: SummaryMap, previous: CupRound, name: string, weeks: number[], cupId: string, index: number): CupRound {
  const matches: CupMatch[] = [];
  for (let i=0; i<previous.matches.length; i+=2) {
    const a=previous.matches[i], b=previous.matches[i+1];
    matches.push(match(data,`${cupId}-${index}-${i/2}`,a.winner,b.winner,[`Winner of ${previous.name} ${i+1}`,`Winner of ${previous.name} ${i+2}`],weeks));
  }
  return { name, weeks, matches };
}

export function buildCup(id: CupId, data: SummaryMap): Cup {
  const participants=MANAGERS.filter(item=>id==='jffl'||item.slug===id);
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
export function currentCupMatchesForTeam(data: SummaryMap, slug: LeagueSlug, teamId: string) {
  return (['jffl', slug] as CupId[]).flatMap(cupId => {
    const cup = buildCup(cupId, data);
    let best: { cupId: CupId; cupName: string; roundName: string; weeks: number[]; match: CupMatch; matchIndex: number } | null = null;
    for (const round of cup.rounds) {
      for (const [matchIndex, match] of round.matches.entries()) {
        const inMatch = [match.a.participant, match.b.participant].some(participant => participant?.slug === slug && participant.teamId === teamId);
        if (inMatch) best = { cupId, cupName: cup.name, roundName: round.name, weeks: round.weeks, match, matchIndex };
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

export const provisionalZone=(slug:LeagueSlug,rank:number|null)=>rank===null?'Unranked':slug==='premier'?rank<=6?'Premier safety zone':'Relegation zone':slug==='championship'?rank<=4?'Premier promotion zone':rank>=7?'Relegation zone':'Championship safety zone':rank<=4?'Championship promotion zone':'League One';
