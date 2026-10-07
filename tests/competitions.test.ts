import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { buildCup, currentCupMatchesForTeam, matchupProjection, projectionUpset, roundScoreAverage, scoreFor, type CupRound, type SummaryMap } from '../src/competitions.ts';
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
