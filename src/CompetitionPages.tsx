import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useParams } from 'react-router-dom';
import { ArrowUpRight, Trophy, Search, ArrowUpDown } from 'lucide-react';
import { useRosters, useSummaries } from './data';
import { LEAGUES, type LeagueSlug, type LeagueSummary } from './types';
import { MANAGERS, TIMELINE, managerFor } from './reference';
import { buildCup, provisionalZone, regularSeason, type CupId, type CupMatch, type SummaryMap } from './competitions';
import { Fresh, points, record } from './ui';
import { TeamIdentity } from './TeamIdentity';

const CUP_IDS: CupId[] = ['jffl', 'premier', 'championship', 'league-one'];
const teamUrl = (slug: string, id: string) => `/league/${slug}/team/${id}`;
const delta = (value: number | null) => value === null ? '—' : value > 0 ? `+${value}` : String(value);

function useCompetitionData() {
  const states = useSummaries();
  const data: SummaryMap = {};
  for (const meta of LEAGUES) if (states[meta.slug].data) data[meta.slug] = states[meta.slug].data!;
  return { data, states };
}

function SectionNav() {
  return <nav className="section-nav" aria-label="Season pages"><NavLink to="/summary">Standings</NavLink><NavLink to="/weekly">Weekly roundup</NavLink><NavLink to="/history">Trophies & history</NavLink></nav>;
}

function UpdateStrip({ data }: { data: SummaryMap }) {
  const states = useSummaries();
  const loaded = Object.values(data).filter((summary): summary is LeagueSummary => !!summary);
  const oldest = loaded.slice().sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt))[0];
  const hasIssue = LEAGUES.some(meta => states[meta.slug].error || data[meta.slug]?.refreshStatus === 'error');
  return <details className="competition-updates" open={hasIssue || undefined}>
    <summary>{oldest ? <Fresh data={oldest} error={hasIssue} /> : <span className="muted">Loading scores…</span>}<span>League updates{loaded.length < 3 && loaded.length > 0 ? ` · ${loaded.length} of 3 loaded` : ''}</span></summary>
    <div>{LEAGUES.map(meta => <span key={meta.slug}><b>{meta.name}</b>{data[meta.slug] ? <Fresh data={data[meta.slug]!} error={states[meta.slug].error} /> : <span className="muted">{states[meta.slug].error ? 'Unavailable' : 'Loading…'}</span>}</span>)}</div>
  </details>;
}

function MatchCard({ match, weeks, data, highlighted, index }: { match: CupMatch; weeks: number[]; data: SummaryMap; highlighted: string; index: number }) {
  const status = { bye:'Bye · advances', waiting:'Upcoming', live:weeks.length > 1 ? 'Live aggregate' : 'Live score', final:'Final', tied:'Awaiting commissioner decision', unavailable:'Waiting for score data' }[match.status];
  const selected = highlighted && [match.a.participant?.key, match.b.participant?.key].includes(highlighted);
  return <article className={`cup-match ${match.status} ${selected ? 'highlighted' : ''}`}>
    <header><span>Match {index + 1}</span><span className={`status-tag ${match.status}`}>{status}</span></header>
    <table><caption className="sr-only">Cup matchup {index + 1}, weeks {weeks.join(' and ')}</caption><thead><tr><th>Team</th>{weeks.map(week => <th key={week}>W{week}</th>)}<th>Total</th></tr></thead><tbody>
      {[match.a, match.b].map((side, sideIndex) => {
        const participant = side.participant;
        const team = participant ? data[participant.slug]?.teams.find(item => item.id === participant.teamId) : null;
        const winner = participant && participant.key === match.winner?.key;
        return <tr key={sideIndex} className={winner ? 'cup-winner' : ''}>
          <td>{participant ? <><Link className="cup-manager" to={teamUrl(participant.slug, participant.teamId)}><span className="cup-seed">{match.id.startsWith('jffl-') ? participant.jfflSeed : participant.leagueSeed}</span>{participant.manager}{winner && <span className="sr-only"> · Advances</span>}</Link><small className="cup-team"><span className="cup-league">{LEAGUES.find(item => item.slug === participant.slug)?.name}</span> · {team ? <TeamIdentity team={team} /> : 'Team data loading'}</small></> : <span className="muted cup-placeholder">{side.label || 'TBD'}</span>}</td>
          {side.legs.map((score, legIndex) => <td key={legIndex} className="numeric muted">{match.status === 'bye' ? '—' : points(score)}</td>)}
          <td className="numeric emphasis">{match.status === 'bye' ? '—' : points(side.total)}</td>
        </tr>;
      })}
    </tbody></table>
  </article>;
}

export function CupHubPage() {
  const { data } = useCompetitionData();
  return <><section className="page-intro"><div><p className="eyebrow">SEASON 25 <span>/</span> 2026 TOURNAMENTS</p><h1>The cups</h1><p className="intro-copy">Four brackets. One set of live JFFL scores.</p></div></section><UpdateStrip data={data} />
    <div className="cup-tiles">{CUP_IDS.map(id => {
      const cup = buildCup(id, data);
      const rounds = cup.rounds;
      const active = rounds.find(round => round.matches.some(match => ['live','tied','unavailable'].includes(match.status))) ?? rounds.find(round => round.matches.some(match => match.status === 'waiting')) ?? rounds.at(-1)!;
      const players = id === 'jffl' ? 30 : 10;
      return <Link key={id} className={`cup-tile ${id}`} to={`/cups/${id}`}><p className="eyebrow">{players} TEAMS · {id === 'jffl' ? 'TWO-WEEK TIES' : 'SINGLE-WEEK TIES'}</p><h2>{cup.name}</h2><p>{cup.champion ? `${cup.champion.manager} · Champion` : `${active.name} · ${active.weeks.length > 1 ? 'Weeks' : 'Week'} ${active.weeks.join(' + ')}`}</p><span className="tile-link">Open bracket<ArrowUpRight size={17} /></span></Link>;
    })}</div>
    <details className="explainer"><summary>How the cups work</summary><p>Your ESPN score counts in your regular league matchup and in any cup tie scheduled for that week. JFFL Cup totals combine two weeks; league cups use one week. Scores retain each league’s scoring rules, even when the same NFL player appears on both sides.</p><p>Seeds and bracket positions follow Jason’s 2026 Week 2 PDF. Winners advance only after every scoring leg is final. A tied total waits for the commissioner’s decision.</p></details>
    <div className="section-heading"><h2>JFFL Cup · opening round</h2><Link className="text-link" to="/cups/jffl">All matchups<ArrowUpRight size={14} /></Link></div><div className="featured-cup-matches">{buildCup('jffl', data).rounds[0].matches.slice(-4).map((match,index) => <MatchCard key={match.id} match={match} weeks={[3,4]} data={data} highlighted="" index={index + 12} />)}</div>
  </>;
}

export function CupPage() {
  const { cupId = 'jffl' } = useParams();
  const location = useLocation();
  const { data } = useCompetitionData();
  const [highlighted, setHighlighted] = useState('');
  const [selectedRound, setSelectedRound] = useState('current');
  useEffect(() => {
    const requested = new URLSearchParams(location.search).get('manager') ?? '';
    setHighlighted(MANAGERS.some(item => item.key === requested && (cupId === 'jffl' || item.slug === cupId)) ? requested : '');
    setSelectedRound('current');
  }, [cupId, location.search]);
  if (!CUP_IDS.includes(cupId as CupId)) return <p className="notice">Cup not found. <Link to="/cups">View all cups</Link></p>;
  const cup = buildCup(cupId as CupId, data);
  const participants = MANAGERS.filter(item => cupId === 'jffl' || item.slug === cupId);
  const activeIndex = cup.rounds.findIndex(round => round.matches.some(match => ['live', 'tied', 'unavailable'].includes(match.status)));
  const nextIndex = cup.rounds.findIndex(round => round.matches.some(match => match.status === 'waiting'));
  const currentIndex = activeIndex >= 0 ? activeIndex : nextIndex >= 0 ? nextIndex : cup.rounds.length - 1;
  const rounds = cup.rounds.filter((_, index) => selectedRound === 'all' || (selectedRound === 'current' ? index === currentIndex : String(index) === selectedRound));
  return <><Link className="back-link" to="/cups">← All cups</Link><section className="page-intro"><div><p className="eyebrow">2026 SEASON <span>/</span> KNOCKOUT TOURNAMENT</p><h1>{cup.name}</h1><p className="intro-copy">{cupId === 'jffl' ? '30 teams. Two-week aggregate scores. Jeff and Jason receive first-round byes.' : '10 teams. One-week scores. The top six seeds receive first-round byes.'}</p></div>{cup.champion && <span className="champion-pill"><Trophy size={20} />{cup.champion.manager}</span>}</section><UpdateStrip data={data} />
    <div className="bracket-controls"><label>Highlight a manager<select aria-label="Highlight a manager" value={highlighted} onChange={event => setHighlighted(event.target.value)}><option value="">All managers</option>{participants.sort((a,b)=>a.manager.localeCompare(b.manager)).map(item => <option key={item.key} value={item.key}>{item.manager}</option>)}</select></label><label>Show rounds<select aria-label="Show rounds" value={selectedRound} onChange={event => setSelectedRound(event.target.value)}><option value="current">Active round</option><option value="all">Full bracket</option>{cup.rounds.map((round,index)=><option key={index} value={index}>{round.name} · W{round.weeks.join('+')}</option>)}</select></label><span className="muted">Final scores advance teams. A live lead is provisional.</span></div>
    <div className={`bracket-scroll ${selectedRound !== 'all' ? 'single-round' : ''}`} tabIndex={0} role="region" aria-label={selectedRound === 'all' ? `${cup.name} full bracket. Scroll horizontally to see later rounds.` : `${cup.name} selected round`}><div className="bracket-columns">{rounds.map(round => {
      const scores=round.matches.filter(match=>match.status!=='bye').flatMap(match=>[...match.a.legs,...match.b.legs]).filter((score):score is number=>score!==null);
      return <section className="bracket-round" key={round.name}><header className="round-heading"><div><p className="eyebrow">{round.weeks.length>1?'WEEKS':'WEEK'} {round.weeks.join(' + ')}</p><h2>{round.name}</h2></div><span>{scores.length?`${points(scores.reduce((sum,score)=>sum+score,0)/scores.length)} avg`:'— avg'}</span></header><div className="round-matches">{round.matches.map((match,index)=><MatchCard key={match.id} match={match} weeks={round.weeks} data={data} highlighted={highlighted} index={index}/>)}</div></section>;
    })}</div></div>
    <p className="source-note">Bracket source: Jason’s Week 2 PDF. Live and completed leg scores: ESPN, refreshed every three minutes. Missing or future scores remain blank. Ties await commissioner decision.</p>
  </>;
}

export function SeasonPage() {
  const { data } = useCompetitionData();
  const [league, setLeague] = useState('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'rank'|'points'|'manager'>('rank');
  return <><SectionNav/><section className="page-intro"><div><p className="eyebrow">2026 SEASON <span>/</span> COMMISSIONER’S SUMMARY</p><h1>Standings</h1><p className="intro-copy">Records, scoring, rank movement, and the promotion race.</p></div></section><UpdateStrip data={data}/>
    <div className="summary-controls"><label className="search-field"><Search size={17}/><input aria-label="Find a manager or team" placeholder="Find a manager or team" value={search} onChange={event=>setSearch(event.target.value)}/></label><label className="sr-only" htmlFor="summary-league">League</label><select id="summary-league" value={league} onChange={event=>setLeague(event.target.value)}><option value="all">All leagues</option>{LEAGUES.map(meta=><option key={meta.slug} value={meta.slug}>{meta.name}</option>)}</select><label className="sr-only" htmlFor="summary-sort">Sort standings</label><select id="summary-sort" value={sort} onChange={event=>setSort(event.target.value as typeof sort)}><option value="rank">Sort by rank</option><option value="points">Sort by points</option><option value="manager">Sort by manager</option></select></div>
    {LEAGUES.filter(meta=>league==='all'||league===meta.slug).map(meta=>{
      const summary=data[meta.slug];
      if(!summary) return <section className="surface waiting" key={meta.slug}>{meta.name} data is loading or unavailable.</section>;
      const teams=summary.teams.filter(team=>`${managerFor(meta.slug,team.id)?.manager} ${team.name}`.toLowerCase().includes(search.toLowerCase())).sort((a,b)=>sort==='points'?(b.pointsFor??-Infinity)-(a.pointsFor??-Infinity):sort==='manager'?(managerFor(meta.slug,a.id)?.manager??a.name).localeCompare(managerFor(meta.slug,b.id)?.manager??b.name):(a.rank??99)-(b.rank??99));
      const games=summary.teams.reduce((sum,team)=>sum+(team.wins??0)+(team.losses??0)+(team.ties??0),0);
      const cumulative=summary.teams.reduce((sum,team)=>sum+(team.pointsFor??0),0);
      return <section className={`surface season-league ${meta.slug}`} key={meta.slug}><div className="surface-heading"><div><p className="eyebrow">{summary.completedWeeks??'—'} COMPLETED WEEKS</p><h2 className={`league-label ${meta.slug}`}>{meta.name}</h2></div><span className="muted">{games?points(cumulative/games):'—'} season avg / team / week</span></div><div className="table-scroll" tabIndex={0} role="region" aria-label={`${meta.name} detailed standings`}><table className="commissioner-table"><thead><tr><th>#</th><th>Manager / team</th><th>Record</th><th>Win %</th><th>PF</th><th>PA</th><th>Week Δ</th><th>Start Δ</th><th>Draft Δ</th><th>Current zone</th></tr></thead><tbody>{teams.map(team=>{
        const profile=managerFor(meta.slug,team.id);
        const rank=team.rank;
        const played=(team.wins??0)+(team.losses??0)+(team.ties??0);
        const weekChange=team.previousRank&&rank?team.previousRank-rank:null;
        const startChange=profile&&rank?profile.leagueSeed-rank:null;
        const draftChange=(team.draftRank??profile?.draftRank)&&rank?(team.draftRank??profile!.draftRank)-rank:null;
        return <tr key={team.id}><td className="rank">{rank??'—'}</td><td><Link className="manager-link" to={teamUrl(meta.slug,team.id)}>{profile?.manager??team.name}</Link><span className="muted team-subline"><TeamIdentity team={team}/></span></td><td className="numeric">{record(team)}</td><td className="numeric muted">{played?`${points(((team.wins??0)+(team.ties??0)/2)/played*100)}%`:'—'}</td><td className="numeric emphasis">{points(team.pointsFor)}</td><td className="numeric muted">{points(team.pointsAgainst)}</td>{[weekChange,startChange,draftChange].map((change,index)=><td key={index} className={`numeric rank-change ${change!==null&&change>0?'up':change!==null&&change<0?'down':''}`}>{delta(change)}</td>)}<td><span className={`zone-badge ${provisionalZone(meta.slug,rank).includes('Relegation')?'danger':provisionalZone(meta.slug,rank).includes('promotion')?'promotion':''}`}>{provisionalZone(meta.slug,rank)}</span></td></tr>;
      })}</tbody></table></div>{!teams.length&&<p className="empty-inline">No teams match your search.</p>}</section>;
    })}
    <details className="explainer"><summary>Rank movement, promotion & relegation</summary><p>Week Δ compares the latest completed standings with the previous completed week. Start Δ compares today’s rank with the starting order in Jason’s PDF. Draft Δ compares it with ESPN’s draft-day rank. Positive numbers mean a climb.</p><p>Promotion and relegation bands are provisional: Premier’s top six are in the safety zone; Championship and League One’s top four occupy promotion bands; Premier and Championship’s bottom four occupy relegation bands. Trophy-based automatic promotions and saved relegations can change the final allocation. Jason confirms those exceptions.</p></details>
  </>;
}

export function WeeklyPage() {
  const { data } = useCompetitionData();
  const currentWeek=Math.max(0,...Object.values(data).map(summary=>summary?.week??0));
  const [selectedWeek,setSelectedWeek]=useState(0);
  const week=selectedWeek||currentWeek;
  const states=useRosters(LEAGUES.map(meta=>meta.slug));
  const matchups=LEAGUES.flatMap(meta=>(data[meta.slug]?.weeklyMatchups??[]).filter(item=>item.week===week).map(item=>({...item,slug:meta.slug})));
  const scores=matchups.flatMap(matchup=>[[matchup.homeTeamId,matchup.homeScore,matchup.awayScore],[matchup.awayTeamId,matchup.awayScore,matchup.homeScore]].filter(([id,score])=>id!==null&&score!==null).map(([id,score,opponent])=>({id:String(id),score:Number(score),opponent:opponent as number|null,slug:matchup.slug,final:matchup.status==='final'}))).sort((a,b)=>b.score-a.score);
  const margins=matchups.filter(matchup=>matchup.homeScore!==null&&matchup.awayScore!==null&&matchup.homeScore!==matchup.awayScore).map(matchup=>({...matchup,margin:Math.abs(matchup.homeScore!-matchup.awayScore!)})).sort((a,b)=>a.margin-b.margin);
  const winners=scores.filter(row=>row.opponent!==null&&row.score>row.opponent).sort((a,b)=>a.score-b.score);
  const losers=scores.filter(row=>row.opponent!==null&&row.score<row.opponent).sort((a,b)=>b.score-a.score);
  const hundred=scores.filter(row=>row.score>=100);
  const describe=(row:typeof scores[number]|undefined)=>row?`${managerFor(row.slug,row.id)?.manager??'Team'} · ${points(row.score)} pts`:'—';
  const matchupName=(row:typeof margins[number]|undefined)=>row?`${managerFor(row.slug,row.homeTeamId??'')?.manager??'Team'} / ${managerFor(row.slug,row.awayTeamId??'')?.manager??'Team'}`:'—';
  const allFinal=matchups.length===15&&matchups.every(matchup=>matchup.status==='final');
  const standouts=LEAGUES.flatMap(meta=>(states[meta.slug]?.data?.players??[]).filter(player=>player.group==='starter'&&player.weekPoints!==null).map(player=>({...player,slug:meta.slug}))).sort((a,b)=>b.weekPoints!-a.weekPoints!).slice(0,12);
  return <><SectionNav/><section className="page-intro"><div><p className="eyebrow">2026 SEASON <span>/</span> WEEKLY ROUNDUP</p><h1>Week {week||'—'}</h1><p className="intro-copy">{allFinal?'Final ESPN scores and scoring extremes.':'Live scores. Leads and scoring extremes remain provisional.'}</p></div><label className="week-picker">Choose week<select aria-label="Choose week" value={selectedWeek} onChange={event=>setSelectedWeek(Number(event.target.value))}><option value={0}>Current week</option>{Array.from({length:currentWeek},(_,index)=><option key={index} value={index+1}>Week {index+1}</option>)}</select></label></section><UpdateStrip data={data}/>
    <div className="recap-metrics"><article><p className="eyebrow">HIGH SCORER</p><strong>{describe(scores[0])}</strong><span>{scores[0]?LEAGUES.find(meta=>meta.slug===scores[0].slug)?.name:'Awaiting scores'}</span></article><article><p className="eyebrow">100+ CLUB</p><strong>{hundred.length} teams</strong><span>{scores.length} scores reported</span></article><article><p className="eyebrow">SMALLEST {allFinal?'WINNING MARGIN':'MARGIN'}</p><strong>{margins[0]?`${points(margins[0].margin)} points`:'—'}</strong><span>{matchupName(margins[0])}</span></article><article><p className="eyebrow">LARGEST {allFinal?'BLOWOUT':'LEAD'}</p><strong>{margins.at(-1)?`${points(margins.at(-1)!.margin)} points`:'—'}</strong><span>{matchupName(margins.at(-1))}</span></article><article><p className="eyebrow">LOWEST {allFinal?'WINNER':'LEADING SCORE'}</p><strong>{describe(winners[0])}</strong></article><article><p className="eyebrow">HIGHEST {allFinal?'LOSER':'TRAILING SCORE'}</p><strong>{describe(losers[0])}</strong></article></div>
    <section className="surface"><div className="surface-heading"><h2>Scoring leaderboard</h2><span className="muted">League-specific points</span></div><div className="table-scroll" tabIndex={0} role="region" aria-label="Weekly scoring leaderboard"><table><thead><tr><th>#</th><th>Manager</th><th>League</th><th>Points</th><th>Matchup</th></tr></thead><tbody>{scores.map((row,index)=><tr key={`${row.slug}-${row.id}`}><td className="rank">{index+1}</td><td><Link className="manager-link" to={teamUrl(row.slug,row.id)}>{managerFor(row.slug,row.id)?.manager??'Team'}</Link></td><td><span className={`league-label ${row.slug}`}>{LEAGUES.find(meta=>meta.slug===row.slug)?.name}</span></td><td className="numeric emphasis">{points(row.score)}{row.score>=100&&<span className="hundred-tag">100+</span>}</td><td className="muted">{row.opponent===null?'—':row.score===row.opponent?row.final?'Tie':'Level':row.score>row.opponent?row.final?'Won':'Leading':row.final?'Lost':'Trailing'}</td></tr>)}</tbody></table></div></section>
    {week===currentWeek&&<section className="surface standouts"><div className="surface-heading"><h2>Top starting-player performances</h2><span className="muted">Current rosters · current week</span></div><div className="table-scroll"><table><thead><tr><th>Player</th><th>Manager</th><th>League</th><th>Points</th></tr></thead><tbody>{standouts.map(player=><tr key={`${player.slug}-${player.id}`}><td><strong>{player.name}</strong><small className="team-subline muted">{player.proTeam} · {player.position}</small></td><td><Link to={teamUrl(player.slug,player.teamId)}>{managerFor(player.slug,player.teamId)?.manager}</Link></td><td className={`league-label ${player.slug}`}>{LEAGUES.find(meta=>meta.slug===player.slug)?.name}</td><td className="numeric emphasis">{points(player.weekPoints)}</td></tr>)}</tbody></table></div></section>}
    {week===2&&week!==currentWeek&&<section className="surface explainer"><h2>Week 2 player highlights · reported by Jason</h2><p>Josh Allen: 39 points; Jaxon Smith-Njigba: 33; Davante Adams: 31. These three historical player highlights come from the supplied email. The team leaderboard above uses ESPN’s current official historical scores, including corrections.</p></section>}
    <p className="source-note">The smallest margin excludes tied games. Completed weeks use ESPN’s corrected scores; live-week winners and losers are shown as leaders and trailers.</p>
  </>;
}

export function HistoryPage() {
  const { data }=useCompetitionData();
  const [view,setView]=useState<'trophies'|'cup'>('trophies');
  const [search,setSearch]=useState('');
  const [league,setLeague]=useState('all');
  const [sort,setSort]=useState<'default'|'manager'>('default');
  const rows=MANAGERS.filter(item=>(league==='all'||item.slug===league)&&item.manager.toLowerCase().includes(search.toLowerCase())).sort((a,b)=>sort==='manager'?a.manager.localeCompare(b.manager):view==='trophies'?b.trophies-a.trophies:(a.cupRank||99)-(b.cupRank||99));
  const trophies=MANAGERS.reduce((sum,item)=>sum+item.trophies,0);
  const finals=MANAGERS.reduce((sum,item)=>sum+item.finals,0);
  return <><SectionNav/><section className="page-intro"><div><p className="eyebrow">25 SEASONS <span>/</span> JFFL’S TROPHY ROOM</p><h1>Trophies & history</h1><p className="intro-copy">This season’s races, and the history behind them.</p></div></section><UpdateStrip data={data}/>
    <div className="trophy-races">{CUP_IDS.map(id=>{const cup=buildCup(id,data);return <Link className="trophy-race" key={id} to={`/cups/${id}`}><div><h3>{cup.name}</h3><span>{cup.champion?`${cup.champion.manager} · Champion`:'Tournament in progress'}</span><small>Final: week {id==='jffl'?'15 + 16':'11'}{id==='jffl'?' · Automatic Premier promotion':''}</small></div></Link>;})}{LEAGUES.flatMap(meta=>{
      const summary=data[meta.slug];
      const seasonLeader=summary?.teams.slice().sort((a,b)=>(a.regularSeasonRank??a.rank??99)-(b.regularSeasonRank??b.rank??99))[0];
      const totals=summary?regularSeason(summary):[];
      const pointLeader=totals.filter(item=>item.games>0).sort((a,b)=>b.points-a.points)[0];
      const superbowlWinner=summary?.teams.find(team=>team.finalStanding===1);
      const manager=(id:string|undefined)=>id?managerFor(meta.slug,id)?.manager??'Team':'Awaiting scores';
      return [<Link key={`${meta.slug}-season`} className="trophy-race" to="/summary"><div><h3>{meta.name} season champion</h3><span>{manager(seasonLeader?.id)} · {(summary?.completedWeeks??0)>=14?'Regular season complete':'Current leader'}</span><small>Week 14{meta.slug==='premier'?'':` · Automatic ${meta.slug==='championship'?'Premier':'Championship'} promotion`}</small></div></Link>,<Link key={`${meta.slug}-points`} className="trophy-race" to="/summary"><div><h3>{meta.name} points champion</h3><span>{manager(pointLeader?.teamId)}{pointLeader?` · ${points(pointLeader.points)} pts`:''}</span><small>Regular-season points through week 14</small></div></Link>,<Link key={`${meta.slug}-superbowl`} className="trophy-race" to={`/league/${meta.slug}`}><div><h3>{meta.name} Superbowl</h3><span>{superbowlWinner?`${manager(superbowlWinner.id)} · Champion`:'Awaiting ESPN playoff results'}</span><small>Top 8 qualify · {meta.slug==='league-one'?'Championship':'Premier'} promotion for champion</small></div></Link>];
    })}</div>
    <div className="section-heading"><h2>Historical leaderboard</h2><span className="muted">Week 2 source snapshot · 2026</span></div><div className="archive-stats"><span><strong>{trophies}</strong> total trophies</span><span><strong>{finals}</strong> finals appearances</span><span><strong>30</strong> current managers</span></div><section className="surface"><div className="history-tabs" role="group" aria-label="Historical table"><button className={view==='trophies'?'active':''} aria-pressed={view==='trophies'} onClick={()=>setView('trophies')}>Trophy history</button><button className={view==='cup'?'active':''} aria-pressed={view==='cup'} onClick={()=>setView('cup')}>JFFL Cup history</button></div><div className="filters"><label className="search-field"><Search size={17}/><input aria-label="Search historical managers" placeholder="Search managers" value={search} onChange={event=>setSearch(event.target.value)}/></label><select aria-label="Historical league" value={league} onChange={event=>setLeague(event.target.value)}><option value="all">All leagues</option>{LEAGUES.map(meta=><option key={meta.slug} value={meta.slug}>{meta.name}</option>)}</select><button className="sort-button" aria-label="Toggle historical sort" onClick={()=>setSort(sort==='default'?'manager':'default')}><ArrowUpDown size={16}/>{sort==='manager'?'Name':'Rank'}</button></div><div className="table-scroll" tabIndex={0} role="region" aria-label="Historical manager statistics"><table className="history-table"><thead><tr><th>Manager</th><th>League</th>{view==='trophies'?<><th>Seasons</th><th>2025</th><th>2021+</th><th>2013+</th><th>All trophies</th><th>Trophies / season</th><th>Finals</th></>:<><th>All-time rank</th><th>Avg finish</th><th>Cup record</th><th>Win %</th><th>Cup titles</th><th>2026 seed</th></>}</tr></thead><tbody>{rows.map(item=><tr key={item.key}><td><Link className="manager-link" to={teamUrl(item.slug,item.teamId)}>{item.manager}</Link></td><td className={`league-label ${item.slug}`}>{LEAGUES.find(meta=>meta.slug===item.slug)?.name}</td>{view==='trophies'?<>{[item.seasons,item.trophies2025,item.trophies2021,item.trophies2013,item.trophies].map((value,index)=><td className={`numeric ${index===4?'emphasis':''}`} key={index}>{value}</td>)}<td className="numeric muted">{item.seasons>1?points(Math.round(item.trophies/(item.seasons-1)*10)/10):'—'}</td><td className="numeric">{item.finals}</td></>:<><td className="numeric">{item.cupRank||'Rookie'}</td><td className="numeric">{item.cupRank?points(item.cupAverageFinish):'—'}</td><td className="numeric">{item.cupWins}–{item.cupLosses}</td><td className="numeric">{item.cupWins+item.cupLosses?`${points(item.cupWins/(item.cupWins+item.cupLosses)*100)}%`:'—'}</td><td className="numeric emphasis">{item.cupTitles}</td><td className="numeric">{item.jfflSeed}</td></>}</tr>)}</tbody></table></div>{!rows.length&&<p className="empty-inline">No managers match your filters.</p>}</section>
    <p className="source-note">Historical trophy counts and finals: Jason’s Week 2 PDF. JFFL Cup records, ranks, finishes and titles: supplied Week 3 email, through 2025. Historical figures are a labeled source snapshot; 2026 cup results are tracked in the live brackets. Trophy rate excludes the current unfinished season.</p>
    <div className="section-heading"><h2>From the first draft to season 25</h2></div><ol className="history-timeline">{TIMELINE.map(event=><li key={event.year}><span>{event.year}</span><div><h3>{event.title}</h3><p>{event.detail}</p></div></li>)}</ol>
  </>;
}
