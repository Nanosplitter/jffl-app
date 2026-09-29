import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { buildCup, roundScoreAverage, scoreFor, type CupRound, type SummaryMap } from '../src/competitions.ts';
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
});

test('two-week winners resolve only when both legs are final; ties await the commissioner',()=>{
  const data=fixture();
  const wayne=managerFor('premier','38')!,rc=managerFor('league-one','29')!;
  for(const participant of [wayne,rc]) {
    const league=data[participant.slug]!;
    const current=league.weeklyMatchups!.find(item=>item.week===3&&[item.homeTeamId,item.awayTeamId].includes(participant.teamId))!;
    current.status='final';
    current[current.homeTeamId===participant.teamId?'homeScore':'awayScore']=100;
    league.week=4;
    league.weeklyMatchups!.push({id:'test-week4',week:4,status:'final',homeTeamId:participant.teamId,awayTeamId:null,homeScore:80,awayScore:null,homeProjected:null,awayProjected:null});
  }
  let tie=buildCup('jffl',data).rounds[0].matches.find(match=>match.a.participant?.manager==='Wayne')!;
  assert.equal(tie.status,'tied');
  assert.equal(tie.winner,null);
  data['league-one']!.weeklyMatchups!.find(item=>item.id==='test-week4')!.homeScore=81;
  tie=buildCup('jffl',data).rounds[0].matches.find(match=>match.a.participant?.manager==='Wayne')!;
  assert.equal(tie.status,'final');
  assert.equal(tie.winner?.manager,'RonniColin');
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

test('a round average is the mean of playing totals and leaves byes out',()=>{
  const round: CupRound = {
    name: 'Round 1',
    weeks: [3, 4],
    matches: [
      { id: 'bye', status: 'bye', winner: null, a: { participant: null, label: '', legs: [90, 0], total: 90 }, b: { participant: null, label: 'Bye', legs: [null, null], total: null } },
      { id: 'live', status: 'live', winner: null, a: { participant: null, label: '', legs: [61, 0], total: 61 }, b: { participant: null, label: '', legs: [55, 0], total: 55 } },
    ],
  };
  assert.equal(roundScoreAverage(round), 58);
  const cup = buildCup('jffl', fixture());
  const playing = cup.rounds[0].matches.filter(match => match.status !== 'bye').flatMap(match => [match.a.total, match.b.total]).filter((total): total is number => total !== null);
  assert.ok(cup.rounds[0].matches.some(match => match.status === 'bye' && match.a.total !== null));
  assert.equal(roundScoreAverage(cup.rounds[0]), playing.reduce((sum, total) => sum + total, 0) / playing.length);
  assert.equal(roundScoreAverage(cup.rounds[1]), null);
});
