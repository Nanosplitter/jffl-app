import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { buildCup, currentCupMatchesForTeam, DEMOTION_RANK, demotionCutoff, gamesAhead, gamesApartLabel, matchupProjection, PLAYOFF_RANK, pointsBackLabel, pointsLeaderGap, projectionUpset, PROMOTION_RANK, promotionCutoff, provisionalZone, regularSeason, roundScoreAverage, scoreFor, scoringGaps, playoffOutlook, seasonOutlook, type CupRound, type SummaryMap } from '../src/competitions.ts';
import { MANAGERS, managerFor } from '../src/reference.ts';

// Fixed public Week 3 scores keep this suite independent of ESPN and live updates.
const local={summaries:JSON.parse(readFileSync(new URL('./fixtures/week3-summaries.json',import.meta.url),'utf8')) as SummaryMap};
const fixture=()=>structuredClone(local.summaries);

test('all 30 PDF managers and unique cup seeds map to the verified ESPN teams',()=>{
  assert.equal(MANAGERS.length,30);
  assert.equal(new Set(MANAGERS.map(item=>item.key)).size,30);
  assert.equal(new Set(MANAGERS.map(item=>item.jfflSeed)).size,30);
  for(const participant of MANAGERS) {
    const team=local.summaries[participant.slug]?.teams.find(item=>item.id===participant.teamId);
    assert.ok(team,participant.manager);
  }
  assert.equal(MANAGERS.reduce((sum,item)=>sum+item.trophies,0),174);
  assert.equal(MANAGERS.reduce((sum,item)=>sum+item.finals,0),162);
});

test('the 2026 JFFL bracket has the PDF byes and cross-league Wayne–RonniColin pairing',()=>{
  const cup=buildCup('jffl',fixture());
  assert.deepEqual(cup.rounds.map(round=>round.weeks),[[3,4],[6,7],[9,10],[12,13],[15,16]]);
  assert.equal(cup.rounds[0].matches.filter(match=>match.status==='bye').length,2);
  assert.deepEqual(cup.rounds[0].matches.filter(match=>match.status==='bye').map(match=>match.winner?.manager),['Jeff','Jason']);
  const tie=cup.rounds[0].matches.find(match=>[match.a.participant?.manager,match.b.participant?.manager].includes('RonniColin'))!;
  assert.equal(tie.a.participant?.manager,'Wayne');
  assert.equal(tie.b.participant?.manager,'RonniColin');
  assert.equal(tie.status,'live');
  assert.equal(tie.winner,null,'An incomplete two-week tie must never advance its live leader');
  assert.equal(tie.b.legs[1],null,'Future weeks remain missing');
});

test('all six Week 2 league-cup results and quarterfinal participants match the PDF',()=>{
  const expected={premier:['Ryan','Jeff'],championship:['SeanT','Josh'],'league-one':['JoshuaS','Joe']};
  for(const [id,winners] of Object.entries(expected)) {
    const cup=buildCup(id as 'premier'|'championship'|'league-one',fixture());
    assert.deepEqual(cup.rounds[0].matches.map(match=>match.winner?.manager),winners);
    assert.equal(cup.rounds[1].matches[0].b.participant?.manager,winners[0]);
    assert.equal(cup.rounds[1].matches[3].b.participant?.manager,winners[1]);
  }
  const match=buildCup('championship',fixture()).rounds[0].matches[1];
  assert.equal(match.a.participant?.manager,'Josh');
  assert.equal(match.b.participant?.manager,'SeanH');
  assert.equal(match.a.total,99);
  assert.equal(match.b.total,86);
  assert.equal(match.replay,false);
  assert.deepEqual(match.weeks,[2]);
});

function finalLeg(data: SummaryMap, slug: 'premier' | 'championship' | 'league-one', teamId: string, week: number, score: number, id: string) {
  const league=data[slug]!;
  league.week=Math.max(league.week, week);
  const matchup=league.weeklyMatchups!.find(item=>item.week===week&&[item.homeTeamId,item.awayTeamId].includes(teamId));
  if(matchup) {
    matchup.status='final';
    matchup[matchup.homeTeamId===teamId?'homeScore':'awayScore']=score;
    return;
  }
  league.weeklyMatchups!.push({id,week,status:'final',homeTeamId:teamId,awayTeamId:null,homeScore:score,awayScore:null,homeProjected:null,awayProjected:null});
}

test('a level tie replays the next week, and a second tie is an old fashioned duel',()=>{
  const data=fixture();
  const wayne=managerFor('premier','38')!,rc=managerFor('league-one','29')!;
  finalLeg(data,'premier',wayne.teamId,3,100,'wayne-3');
  finalLeg(data,'league-one',rc.teamId,3,100,'rc-3');
  finalLeg(data,'premier',wayne.teamId,4,80,'wayne-4');
  finalLeg(data,'league-one',rc.teamId,4,80,'rc-4');
  let tie=buildCup('jffl',data).rounds[0].matches.find(match=>match.a.participant?.manager==='Wayne')!;
  assert.equal(tie.status,'live');
  assert.equal(tie.replay,true);
  assert.deepEqual(tie.weeks,[3,4,5]);
  assert.equal(tie.a.legs[2],null);
  assert.equal(tie.winner,null,'A replay still in the future must not advance either side');

  finalLeg(data,'premier',wayne.teamId,5,40,'wayne-5');
  finalLeg(data,'league-one',rc.teamId,5,40,'rc-5');
  tie=buildCup('jffl',data).rounds[0].matches.find(match=>match.a.participant?.manager==='Wayne')!;
  assert.equal(tie.status,'tied');
  assert.equal(tie.winner,null);
  assert.equal(tie.a.total,220);
  assert.equal(tie.b.total,220);
  assert.equal(buildCup('jffl',data).rounds[1].matches.every(match=>match.winner===null),true);

  finalLeg(data,'league-one',rc.teamId,5,41,'rc-5');
  tie=buildCup('jffl',data).rounds[0].matches.find(match=>match.a.participant?.manager==='Wayne')!;
  assert.equal(tie.status,'final');
  assert.equal(tie.replay,true);
  assert.equal(tie.winner?.manager,'RonniColin');
  assert.ok(buildCup('jffl',data).rounds[1].matches.some(match=>[match.a.participant?.manager,match.b.participant?.manager].includes('RonniColin')));

  const decided=fixture();
  finalLeg(decided,'premier',wayne.teamId,3,100,'wayne-3');
  finalLeg(decided,'league-one',rc.teamId,3,100,'rc-3');
  finalLeg(decided,'premier',wayne.teamId,4,80,'wayne-4');
  finalLeg(decided,'league-one',rc.teamId,4,81,'rc-4');
  tie=buildCup('jffl',decided).rounds[0].matches.find(match=>match.a.participant?.manager==='Wayne')!;
  assert.equal(tie.replay,false);
  assert.deepEqual(tie.weeks,[3,4]);
  assert.equal(tie.winner?.manager,'RonniColin');
});

test('a level league-cup tie replays the following week',()=>{
  const data=fixture();
  const josh=managerFor('championship','73')!,sean=MANAGERS.find(item=>item.manager==='SeanH')!;
  finalLeg(data,'championship',josh.teamId,2,90,'josh-2');
  finalLeg(data,'championship',sean.teamId,2,90,'sean-2');
  let match=buildCup('championship',data).rounds[0].matches[1];
  assert.equal(match.replay,true);
  assert.deepEqual(match.weeks,[2,3]);
  assert.equal(match.winner,null);
  assert.equal(buildCup('championship',data).rounds[1].matches[3].b.participant,null);

  finalLeg(data,'championship',josh.teamId,3,10,'josh-3');
  finalLeg(data,'championship',sean.teamId,3,10,'sean-3');
  match=buildCup('championship',data).rounds[0].matches[1];
  assert.equal(match.status,'tied');
  assert.equal(match.winner,null);

  finalLeg(data,'championship',josh.teamId,3,11,'josh-3');
  match=buildCup('championship',data).rounds[0].matches[1];
  assert.equal(match.status,'final');
  assert.equal(match.winner?.manager,'Josh');
  assert.equal(buildCup('championship',data).rounds[1].matches[3].b.participant?.manager,'Josh');
});

test('a missing league or score cannot manufacture a cup winner or a zero',()=>{
  const data=fixture();
  delete data['league-one'];
  const participant=managerFor('league-one','29')!;
  assert.deepEqual(scoreFor(data,participant,3),{score:null,final:false});
  const match=buildCup('jffl',data).rounds[0].matches.find(item=>item.b.participant?.manager==='RonniColin')!;
  assert.equal(match.b.total,null);
  assert.equal(match.winner,null);
});

test('team pages surface the furthest JFFL and league-cup ties for a manager',()=>{
  const wayne=managerFor('premier','38')!;
  const appearances=currentCupMatchesForTeam(fixture(),wayne.slug,wayne.teamId);
  assert.deepEqual(appearances.map(item=>item.cupId),['jffl','premier']);
  assert.equal(appearances[0].roundName,'Round 1');
  assert.equal(appearances[0].match.b.participant?.manager,'RonniColin');
  assert.equal(appearances[1].roundName,'Quarterfinals');
  assert.equal(appearances[1].match.a.participant?.manager,'Wayne');
  assert.equal(appearances[1].match.b.participant?.manager,'Jeff');
  const josh=managerFor('championship','73')!;
  assert.equal(currentCupMatchesForTeam(fixture(),josh.slug,josh.teamId).find(item=>item.cupId==='championship')?.roundName,'Quarterfinals');
  const seanH=MANAGERS.find(item=>item.manager==='SeanH')!;
  const eliminated=currentCupMatchesForTeam(fixture(),seanH.slug,seanH.teamId).find(item=>item.cupId==='championship')!;
  assert.equal(eliminated.roundName,'First round');
  assert.equal(eliminated.match.winner?.manager,'Josh');
});

test('an upset is a projection miss of 15 or more that flips the result by itself', () => {
  assert.equal(projectionUpset(112, 108, 95, 110), 'left');
  assert.equal(projectionUpset(102, 80, 100, 110), 'right');
  assert.equal(projectionUpset(71, 70, 99, 100), 'right');
  assert.equal(projectionUpset(101, 99, 98, 100), null);
  assert.equal(projectionUpset(140, 90, 100, 110), null);
  assert.equal(projectionUpset(100, 100, 90, 110), null);
  assert.equal(projectionUpset(112, 108, 110, 110), null);
  assert.equal(projectionUpset(112, 108, null, 110), null);
});

test('a saved projection adds across a tie and stays absent when any week has none', () => {
  const data = fixture();
  const jason = managerFor('premier', '16')!;
  const weeks = [1, 2];
  assert.equal(matchupProjection(data, jason, weeks), null);
  for (const week of weeks) {
    const matchup = data.premier!.weeklyMatchups!.find(item => item.week === week && [item.homeTeamId, item.awayTeamId].includes(jason.teamId))!;
    const side = matchup.homeTeamId === jason.teamId ? 'homeProjected' : 'awayProjected';
    matchup[side] = week === 1 ? 100.25 : 90;
    matchup.status = 'final';
  }
  assert.equal(matchupProjection(data, jason, weeks), 190.25);
  assert.equal(matchupProjection(data, jason, weeks, true), 190.25);
  data.premier!.weeklyMatchups!.find(item => item.week === 2 && [item.homeTeamId, item.awayTeamId].includes(jason.teamId))!.status = 'live';
  assert.equal(matchupProjection(data, jason, weeks), 190.25);
  assert.equal(matchupProjection(data, jason, weeks, true), null);
});

test('a round average is the mean of playing totals and leaves byes out',()=>{
  const round: CupRound = {
    name: 'Round 1',
    weeks: [3, 4],
    matches: [
      { id: 'bye', weeks: [3, 4], replay: false, status: 'bye', winner: null, a: { participant: null, label: '', legs: [90, 0], total: 90 }, b: { participant: null, label: 'Bye', legs: [null, null], total: null } },
      { id: 'live', weeks: [3, 4], replay: false, status: 'live', winner: null, a: { participant: null, label: '', legs: [61, 0], total: 61 }, b: { participant: null, label: '', legs: [55, 0], total: 55 } },
    ],
  };
  assert.equal(roundScoreAverage(round), 58);
  const cup = buildCup('jffl', fixture());
  const playing = cup.rounds[0].matches.filter(match => match.status !== 'bye').flatMap(match => [match.a.total, match.b.total]).filter((total): total is number => total !== null);
  assert.ok(cup.rounds[0].matches.some(match => match.status === 'bye' && match.a.total !== null));
  assert.equal(roundScoreAverage(cup.rounds[0]), playing.reduce((sum, total) => sum + total, 0) / playing.length);
  assert.equal(roundScoreAverage(cup.rounds[1]), null);
});

test('games ahead of a line uses the win and loss gap, and a one-sided tie is a half game', () => {
  const line = { wins: 5, losses: 4 };
  assert.equal(gamesAhead({ wins: 8, losses: 1 }, line), 3);
  assert.equal(gamesAhead(line, line), 0);
  assert.equal(gamesAhead({ wins: 4, losses: 5 }, line), -1);
  assert.equal(gamesAhead({ wins: 5, losses: 3 }, line), 0.5);
  assert.equal(gamesAhead({ wins: null, losses: 1 }, line), null);
  assert.equal(gamesAhead({ wins: 5, losses: 4 }, null), null);
  assert.deepEqual(gamesApartLabel(3, 'promotion line'), { text: '3 ahead', phrase: '3 games ahead of the promotion line', tone: 'up' });
  assert.deepEqual(gamesApartLabel(-1, 'demotion line'), { text: '1 back', phrase: '1 game back of the demotion line', tone: 'down' });
  assert.deepEqual(gamesApartLabel(-1.5, 'playoff line'), { text: '1.5 back', phrase: '1.5 games back of the playoff line', tone: 'down' });
  assert.deepEqual(gamesApartLabel(0, 'demotion line', true), { text: 'even', phrase: 'On the demotion line', tone: '' });
  assert.deepEqual(gamesApartLabel(0, 'promotion line'), { text: 'even', phrase: 'Even with the promotion line', tone: '' });
  assert.equal(gamesApartLabel(null, 'playoff line').text, '—');
});

test('points back is the gap to the most-points leader, and a tie shares the lead', () => {
  const gaps = pointsLeaderGap([
    { id: 'a', points: 100.26, counted: true },
    { id: 'b', points: 90, counted: true },
    { id: 'c', points: 100.26, counted: true },
    { id: 'd', points: 10, counted: false },
    { id: 'e', points: null, counted: true },
  ]);
  assert.equal(gaps.get('a')?.back, 0);
  assert.equal(gaps.get('a')?.role, 'tied');
  assert.equal(gaps.get('c')?.role, 'tied');
  assert.equal(gaps.get('b')?.back, 10.26);
  assert.equal(gaps.get('b')?.role, 'behind');
  assert.equal(gaps.get('d')?.role, 'unknown');
  assert.equal(gaps.get('e')?.back, null);
  assert.deepEqual(pointsBackLabel(0, 'leader'), { text: '0', phrase: 'Scoring leader' });
  assert.deepEqual(pointsBackLabel(10.26, 'behind'), { text: '-10.26', phrase: '10.26 points back of the scoring leader' });
  assert.equal(pointsBackLabel(null, 'unknown').text, '—');

  const premier = fixture().premier!;
  const rows = regularSeason(premier).filter(row => row.games > 0);
  const leader = rows.reduce((best, row) => row.points > best.points ? row : best);
  const race = scoringGaps(premier, premier.teams);
  assert.equal(race.get(leader.teamId)?.back, 0);
  for (const row of rows) assert.equal(race.get(row.teamId)?.back, Math.round((Math.round(leader.points * 100) - Math.round(row.points * 100))) / 100);
});

const side = (id: string, rank: number, wins: number, losses: number, ties = 0) => ({ id, rank, wins, losses, ties });

test('the outlook says how live the promotion and demotion races are', () => {
  const champ = [
    side('1', 1, 7, 2), side('2', 2, 5, 3, 1), side('3', 3, 5, 4), side('4', 4, 5, 4),
    side('5', 5, 4, 5), side('6', 6, 4, 5), side('7', 7, 4, 5), side('8', 8, 4, 5),
    side('9', 9, 3, 5, 1), side('10', 10, 3, 6),
  ];
  assert.deepEqual(seasonOutlook('championship', champ[0], champ), { label: 'Likely up', detail: '3 games clear', tone: 'up' });
  assert.deepEqual(seasonOutlook('championship', champ[1], champ), { label: 'Inside', detail: '1.5 games clear', tone: 'hold' });
  assert.deepEqual(seasonOutlook('championship', champ[3], champ), { label: 'Inside', detail: '1 game clear', tone: 'hold' });
  assert.deepEqual(seasonOutlook('championship', champ[4], champ), { label: 'Chasing', detail: '1 game back · level with the drop', tone: 'warn' });
  assert.deepEqual(seasonOutlook('championship', champ[6], champ), { label: 'In danger', detail: 'On the drop line', tone: 'danger' });
  assert.deepEqual(seasonOutlook('championship', champ[9], champ), { label: 'In danger', detail: '1 game from safety', tone: 'danger' });

  const buried = [side('6', 6, 5, 4), side('7', 7, 4, 5), side('10', 10, 1, 8)];
  assert.equal(seasonOutlook('premier', buried[2], buried).label, 'Drop likely');
  const gone = [side('6', 6, 7, 1), side('7', 7, 4, 4), side('10', 10, 0, 8)];
  assert.deepEqual(seasonOutlook('premier', gone[2], gone), { label: 'Demoted', detail: 'Cannot catch safety', tone: 'bad' });
  const clear = [side('1', 1, 8, 0), side('6', 6, 4, 4), side('7', 7, 1, 7)];
  assert.deepEqual(seasonOutlook('premier', clear[0], clear), { label: 'Safe', detail: 'Clear of the drop', tone: 'good' });

  const locked = [side('1', 1, 8, 0), side('4', 4, 6, 2), side('5', 5, 1, 7)];
  assert.deepEqual(seasonOutlook('league-one', locked[0], locked), { label: 'Clinched', detail: 'Cannot fall out', tone: 'good' });
  const shot = [side('4', 4, 5, 4), side('10', 10, 1, 8)];
  assert.deepEqual(seasonOutlook('league-one', shot[1], shot), { label: 'Long shot', detail: '4 games back', tone: 'long' });
  assert.equal(seasonOutlook('championship', { id: 'x', rank: null, wins: 1, losses: 0, ties: 0 }, champ).label, '—');
  assert.deepEqual(playoffOutlook(champ[0], champ), { label: 'Likely in', detail: '3.5 games clear', tone: 'up' });
  assert.deepEqual(playoffOutlook(champ[7], champ), { label: 'Inside', detail: '0.5 games clear', tone: 'hold' });
  assert.deepEqual(playoffOutlook(champ[8], champ), { label: 'Chasing', detail: '0.5 games back', tone: 'warn' });
  assert.deepEqual(playoffOutlook(champ[9], champ), { label: 'Chasing', detail: '1 game back', tone: 'warn' });
  const field = [side('1', 1, 8, 0), side('8', 8, 6, 2), side('9', 9, 0, 8)];
  assert.deepEqual(playoffOutlook(field[0], field), { label: 'Clinched', detail: 'Cannot fall out', tone: 'good' });
  const missing = [side('8', 8, 7, 1), side('10', 10, 0, 8)];
  assert.deepEqual(playoffOutlook(missing[1], missing), { label: 'Out', detail: 'Out of the playoffs', tone: 'bad' });
});

test('promotion is fourth and the playoff is eighth, matching the provisional bands', () => {
  assert.equal(PROMOTION_RANK, 4);
  assert.equal(DEMOTION_RANK, 7);
  assert.equal(PLAYOFF_RANK, 8);
  assert.equal(promotionCutoff('premier'), null);
  assert.equal(promotionCutoff('league-one'), PROMOTION_RANK);
  assert.equal(demotionCutoff('league-one'), null);
  assert.equal(demotionCutoff('premier'), DEMOTION_RANK);
  assert.equal(demotionCutoff('championship'), DEMOTION_RANK);
  assert.equal(provisionalZone('league-one', PROMOTION_RANK).includes('promotion'), true);
  assert.equal(provisionalZone('league-one', PROMOTION_RANK + 1).includes('promotion'), false);
  assert.equal(provisionalZone('league-one', DEMOTION_RANK), 'League One');
  assert.equal(provisionalZone('championship', PROMOTION_RANK).includes('promotion'), true);
  assert.equal(provisionalZone('championship', PROMOTION_RANK + 1), 'Championship safety zone');
  assert.equal(provisionalZone('championship', DEMOTION_RANK), 'Relegation zone');
  assert.equal(provisionalZone('premier', DEMOTION_RANK - 1), 'Premier safety zone');
  assert.equal(provisionalZone('premier', DEMOTION_RANK), 'Relegation zone');
});
