import { useEffect, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { Activity, ArrowUpRight, ChevronLeft, ChevronRight, ExternalLink, Search, Shield, Sun, Moon } from 'lucide-react';
import { localPreview, useRosters, useSummaries } from './data';
import { LEAGUES, type LeagueSlug, type LeagueSummary, type Matchup, type RosteredPlayer, type Team } from './types';
import { Fresh, points, record, weeklyAverage } from './ui';
import { CupHubPage, CupMatchPage, CupPage, LeagueMatchPage, LeagueStandingsCard, SeasonPage, WeeklyPage, HistoryPage } from './CompetitionPages';
import { managerFor } from './reference';
import { buildCup, currentCupMatchesForTeam, type CupId, type SummaryMap } from './competitions';
import { projectedWinChance } from './projections';
import { scoringLabel } from './scoring';
import { TeamIdentity } from './TeamIdentity';
import { PlayerIdentity, injuryLabel, injuryName } from './PlayerIdentity';
import { compareByLineup, slotLabel, slotsLabel } from './lineups';

const leagueMeta = (slug: string) => LEAGUES.find(league => league.slug === slug);
const teamLink = (slug: string, id: string) => `/league/${slug}/team/${id}`;

function LeagueMark({ slug, size = '' }: { slug: string; size?: string }) {
  const meta = leagueMeta(slug);
  return <span className={`league-mark ${slug} ${size}`} aria-hidden="true">{String(meta?.tier ?? '').padStart(2, '0')}</span>;
}

function Waiting({ error = false }: { error?: boolean }) {
  return <div className="waiting" role="status"><Activity size={24} /><strong>{error ? 'League data is temporarily unavailable' : 'Loading league data…'}</strong><span>{error ? 'The next scheduled update will try again.' : 'Getting the latest shared snapshot.'}</span></div>;
}

function Standings({ data, compact = false }: { data: LeagueSummary; compact?: boolean }) {
  return <div className="table-scroll" tabIndex={0} role="region" aria-label={`${data.leagueName} standings`}><table className={`standings ${compact ? 'compact' : ''}`}><caption className="sr-only">{data.leagueName} standings</caption><thead><tr><th scope="col">#</th><th scope="col">Team</th><th scope="col">W–L</th><th scope="col">Points</th>{!compact && <th scope="col">P. Against</th>}</tr></thead><tbody>{data.teams.map(team => <tr key={team.id}><td className={team.rank === 1 ? 'rank first' : 'rank'}>{team.rank ?? '—'}</td><td><Link to={teamLink(data.slug, team.id)}><TeamIdentity team={team} /></Link></td><td className="numeric">{record(team)}</td><td className="numeric">{points(team.pointsFor)}</td>{!compact && <td className="numeric muted">{points(team.pointsAgainst)}</td>}</tr>)}</tbody></table></div>;
}

function starterList(players: RosteredPlayer[], teamId: string) {
  return players.filter(player => player.teamId === teamId && player.group === 'starter').sort(compareByLineup);
}

function Lineup({ slug, teamId, players }: { slug: string; teamId: string | null; players: RosteredPlayer[] }) {
  if (!teamId) return null;
  const starters = starterList(players, teamId);
  return <div><p className="lineup-heading">{managerFor(slug, teamId)?.manager ?? 'Team'}</p>{starters.length ? <ul className="lineup">{starters.map(player => {
    const yet = player.weekPoints == null && player.projectedPoints != null;
    return <li key={player.id} className={yet ? 'yet-to-play' : ''}><PlayerIdentity player={player} injury={player.injuryStatus} /><span className="lineup-points"><strong>{points(player.weekPoints)}</strong><small>{yet ? `Yet to play · proj ${points(player.projectedPoints)}` : player.projectedPoints != null ? `Proj ${points(player.projectedPoints)}` : ''}</small></span></li>;
  })}</ul> : <p className="empty-inline">No starters in this snapshot.</p>}</div>;
}

function MatchupCard({ matchup, data, compact = false, board = false, expanded = false, onToggle, lineup, className = '', to }: {
  matchup: Matchup; data: LeagueSummary; compact?: boolean; board?: boolean; expanded?: boolean; onToggle?: () => void;
  lineup?: { players: RosteredPlayer[] | null; loading: boolean; error: boolean }; className?: string; to?: string;
}) {
  const home = data.teams.find(team => team.id === matchup.homeTeamId);
  const away = data.teams.find(team => team.id === matchup.awayTeamId);
  const status = data.weeklyMatchups?.find(item => item.week === data.week && item.homeTeamId === matchup.homeTeamId && item.awayTeamId === matchup.awayTeamId)?.status;
  const decided = status === 'final';
  const chance = decided ? null : projectedWinChance(matchup.homeProjected, matchup.awayProjected);
  const sides: [Team | undefined, string | null, number | null, number | null, number | null, number | null][] = [
    [away, matchup.awayTeamId, matchup.awayScore, matchup.awayProjected, matchup.homeScore, chance?.away ?? null],
    [home, matchup.homeTeamId, matchup.homeScore, matchup.homeProjected, matchup.awayScore, chance?.home ?? null],
  ];
  const sideName = (team: Team | undefined, teamId: string | null) => team ? (managerFor(data.slug, team.id)?.manager ?? team.name) : teamId ? 'Team' : 'Bye';
  const panelId = `lineup-${data.slug}-${matchup.id}`;
  const sideRow = (team: Team | undefined, score: number | null, projected: number | null, opponent: number | null, pct: number | null, index: number) => {
    const result = decided && score != null && opponent != null ? score > opponent ? 'Won' : score < opponent ? 'Lost' : 'Tie' : null;
    const manager = team ? managerFor(data.slug, team.id)?.manager ?? team.name : 'Bye';
    return <div className={`matchup-side ${index === 1 ? 'home' : 'away'}`} key={index}>
      {board && team?.logoUrl && <img className="matchup-logo" src={team.logoUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true; }} />}
      <div className="matchup-team">{team ? (to ? <span className="matchup-name">{board ? <><span className="board-manager">{manager}</span><small className="matchup-club">{team.name}</small></> : <TeamIdentity team={team} />}</span> : <Link to={teamLink(data.slug, team.id)}>{board ? <><span className="board-manager">{manager}</span><small className="matchup-club">{team.name}</small></> : <TeamIdentity team={team} />}</Link>) : <span>Bye</span>}<strong className="score">{team ? points(score) : '—'}</strong>{team && !board && <small>{record(team)}</small>}{team && !decided && projected != null && <small className="proj-line">{board ? 'Proj' : 'Projected'} {points(projected)}{pct != null ? ` · ${pct}%` : ''}</small>}{team && result && <small className="proj-line">{result}</small>}</div>
    </div>;
  };
  const face = <>
    <div className="matchup-face">
      {sideRow(sides[0][0], sides[0][2], sides[0][3], sides[0][4], sides[0][5], 0)}
      {sideRow(sides[1][0], sides[1][2], sides[1][3], sides[1][4], sides[1][5], 1)}
    </div>
    {chance && <div className="win-bar" role="img" aria-label={`From ESPN projected totals. ${sideName(away, matchup.awayTeamId)} ${chance.away} percent. ${sideName(home, matchup.homeTeamId)} ${chance.home} percent.`}><span className={chance.away > chance.home ? 'favored' : ''} style={{ width: `${chance.away}%` }} /><span className={chance.home > chance.away ? 'favored' : ''} style={{ width: `${chance.home}%` }} /></div>}
  </>;
  return <article className={`matchup ${compact ? 'compact' : ''} ${expanded ? 'open' : ''} ${className}`}>
    {to ? <Link className="matchup-link" to={to}>{face}</Link> : face}
    {onToggle && <button className="matchup-toggle" aria-expanded={expanded} aria-controls={panelId} onClick={onToggle}>{expanded ? 'Hide starters' : 'Show starters'}<span className="sr-only"> for {sideName(away, matchup.awayTeamId)} versus {sideName(home, matchup.homeTeamId)}</span></button>}
    {expanded && <div id={panelId} className="matchup-lineup">{!lineup || (lineup.loading && !lineup.players) ? <p className="empty-inline">Loading starters…</p> : lineup.error && !lineup.players ? <p className="empty-inline">Starters are temporarily unavailable.</p> : <div className="lineup-sides"><Lineup slug={data.slug} teamId={matchup.awayTeamId} players={lineup.players ?? []} /><Lineup slug={data.slug} teamId={matchup.homeTeamId} players={lineup.players ?? []} /></div>}</div>}
  </article>;
}

function WeekPulse({ loaded }: { loaded: LeagueSummary[] }) {
  const week = Math.max(0, ...loaded.map(data => data.week));
  const matchups = loaded.flatMap(data => (data.weeklyMatchups ?? []).filter(item => item.week === week).map(item => ({ ...item, slug: data.slug })));
  const scores = matchups.flatMap(matchup => [
    matchup.homeTeamId != null && matchup.homeScore != null ? { slug: matchup.slug, id: matchup.homeTeamId, score: matchup.homeScore } : null,
    matchup.awayTeamId != null && matchup.awayScore != null ? { slug: matchup.slug, id: matchup.awayTeamId, score: matchup.awayScore } : null,
  ].filter((row): row is { slug: LeagueSlug; id: string; score: number } => row !== null)).sort((a, b) => b.score - a.score);
  const margins = matchups.filter(matchup => matchup.homeScore != null && matchup.awayScore != null && matchup.homeScore !== matchup.awayScore).map(matchup => ({ ...matchup, margin: Math.abs(matchup.homeScore! - matchup.awayScore!) })).sort((a, b) => a.margin - b.margin);
  if (!scores.some(row => row.score > 0)) return null;
  const high = scores[0];
  const close = margins[0];
  const hundred = scores.filter(row => row.score >= 100).length;
  const closeName = close ? `${managerFor(close.slug, close.homeTeamId ?? '')?.manager ?? 'Team'} / ${managerFor(close.slug, close.awayTeamId ?? '')?.manager ?? 'Team'}` : 'Awaiting scores';
  return <nav className="week-pulse" aria-label="This week"><Link to="/weekly"><p className="eyebrow">HIGH SCORER</p><strong>{high ? managerFor(high.slug, high.id)?.manager ?? 'Team' : '—'}</strong><span>{high ? `${points(high.score)} · ${leagueMeta(high.slug)?.name}` : 'Awaiting scores'}</span></Link><Link to="/weekly"><p className="eyebrow">CLOSEST MARGIN</p><strong>{close ? `${points(close.margin)} pts` : '—'}</strong><span>{closeName}</span></Link><Link to="/weekly"><p className="eyebrow">100+ CLUB</p><strong>{loaded.length ? hundred : '—'}</strong>{scores.length ? null : <span>Awaiting scores</span>}</Link></nav>;
}

function CupStrip({ data }: { data: SummaryMap }) {
  const cups = (['jffl', 'premier', 'championship', 'league-one'] as CupId[]).map(id => {
    const cup = buildCup(id, data);
    const round = cup.rounds.find(item => item.matches.some(match => ['live', 'tied', 'unavailable'].includes(match.status))) ?? cup.rounds.find(item => item.matches.some(match => match.status === 'waiting')) ?? cup.rounds.at(-1)!;
    const live = round.matches.filter(match => match.status === 'live' && match.a.total != null && match.b.total != null);
    const focus = live.slice().sort((a, b) => Math.abs(a.a.total! - a.b.total!) - Math.abs(b.a.total! - b.b.total!))[0];
    const detail = focus ? `${focus.a.participant?.manager ?? 'TBD'} ${points(focus.a.total)} · ${focus.b.participant?.manager ?? 'TBD'} ${points(focus.b.total)}` : cup.champion ? `${cup.champion.manager} · Champion` : 'Bracket';
    return { cup, round, detail };
  });
  return <section className="home-cups"><div className="panel-section-title"><h3>Cups</h3><Link to="/cups">All brackets</Link></div><div className="home-cup-row">{cups.map(({ cup, round, detail }) => <Link key={cup.id} className="home-cup" to={`/cups/${cup.id}`}><p className="eyebrow">{round.name} · {round.weeks.length > 1 ? `Weeks ${round.weeks.join('+')}` : `Week ${round.weeks[0]}`}</p><strong><span className="home-cup-name">{cup.name}</span><ArrowUpRight size={15} aria-hidden="true" /></strong><span>{detail}</span></Link>)}</div></section>;
}

function Overview() {
  const summaries = useSummaries();
  const loaded = Object.values(summaries).map(state => state.data).filter((data): data is LeagueSummary => !!data);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const separator = openKey?.indexOf(':') ?? -1;
  const openSlug = openKey && separator > 0 ? openKey.slice(0, separator) as LeagueSlug : null;
  const rosters = useRosters(openSlug ? [openSlug] : []);
  const board: SummaryMap = {};
  for (const meta of LEAGUES) if (summaries[meta.slug].data) board[meta.slug] = summaries[meta.slug].data!;
  return <><section className="page-intro"><div><p className="eyebrow">SEASON 25 <span>/</span> 2026 <span>/</span> WEEK {loaded[0]?.week ?? '—'}</p><h1>The leagues</h1><p className="intro-copy">Three leagues. One JFFL.</p></div></section>
    <WeekPulse loaded={loaded} />
    <nav className="overview-links" aria-label="More from JFFL"><Link to="/weekly">Weekly roundup<ArrowUpRight size={14}/></Link><Link to="/history">Trophies & history<ArrowUpRight size={14}/></Link></nav>
    {loaded.length > 0 && <CupStrip data={board} />}
    <div className="home-leagues">{LEAGUES.map(meta => { const state = summaries[meta.slug]; const roster = rosters[meta.slug]; const teams = state.data ? state.data.teams.slice().sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99)) : []; return <section className={`home-league ${meta.slug}`} key={meta.slug}>{state.data ? <LeagueStandingsCard meta={meta} teams={teams} updated={state.data} error={state.error} /> : <Waiting error={state.error} />}{state.data && <div className="mini-matchups">{state.data.matchups.map(matchup => { const key = `${meta.slug}:${matchup.id}`; const open = openKey === key; return <MatchupCard key={matchup.id} matchup={matchup} data={state.data!} compact board to={`/league/${meta.slug}/match/${matchup.id}`} expanded={open} onToggle={() => setOpenKey(open ? null : key)} lineup={open ? { players: roster?.data?.players ?? null, loading: roster?.loading ?? true, error: roster?.error ?? false } : undefined} />; })}</div>}</section>; })}</div>
  </>;
}

function LeaguePage() {
  const { slug = '' } = useParams();
  const meta = leagueMeta(slug);
  const summaries = useSummaries();
  if (!meta) return <NotFound />;
  const state = summaries[meta.slug];
  return <><Link className="back-link" to="/"><ChevronLeft size={16} />All leagues</Link><section className="page-intro league-intro"><div className="league-title"><LeagueMark slug={slug} size="large" /><div><p className="eyebrow">JFFL <span>/</span> 2026 SEASON</p><h1>{meta.name}</h1></div></div><a className="button secondary" href={`https://fantasy.espn.com/football/league?leagueId=${meta.espnId}`} target="_blank" rel="noreferrer">View on ESPN<ExternalLink size={14} /></a></section>{state.data ? <div className="league-layout" data-matchups={state.data.matchups.length}><div className="section-heading"><div><h2>Week {state.data.week} scoreboard</h2></div><Fresh data={state.data} error={state.error} /></div>{(() => { const matchups = state.data!.matchups; const card = (matchup: Matchup, className = '') => <MatchupCard key={matchup.id} className={className} matchup={matchup} data={state.data!} to={`/league/${meta.slug}/match/${matchup.id}`} />; const standings = <section className="surface standings-panel"><div className="surface-heading"><h2>Standings</h2><Link to={`/players?league=${slug}`}>Browse players</Link></div><Standings data={state.data!} /></section>; const scoring = <section className="surface scoring"><div className="surface-heading"><h2>Scoring</h2></div>{state.data!.scoring.length ? <dl>{state.data!.scoring.map((item, index) => <div key={index}><dt>{scoringLabel(item.name)}</dt><dd>{points(item.points)}</dd></div>)}</dl> : <p className="muted">Scoring details are not supplied.</p>}</section>; return matchups.length === 5 ? <><div className="board-main">{card(matchups[0])}{card(matchups[1])}{card(matchups[3], 'slot-3')}{card(matchups[4], 'slot-4')}{standings}</div><div className="board-side">{card(matchups[2], 'slot-2')}{scoring}</div></> : <>{matchups.map(matchup => card(matchup))}{standings}{scoring}</>; })()}</div> : <Waiting error={state.error} />}</>;
}

function StatDetails({ player }: { player: RosteredPlayer }) {
  const keys = [...new Set([...Object.keys(player.weekStats), ...Object.keys(player.seasonStats)])];
  return <details className="player-details"><summary aria-label={`Statistics for ${player.name}`}>Stats</summary><div className="stat-popup"><strong>{player.name}</strong><span className="muted">Eligible: {slotsLabel(player.eligibleSlots) || '—'}</span>{keys.length ? <table><thead><tr><th>Statistic</th><th>Week</th><th>Season</th></tr></thead><tbody>{keys.map(key => <tr key={key}><th>{key}</th><td>{points(player.weekStats[key])}</td><td>{points(player.seasonStats[key])}</td></tr>)}</tbody></table> : <p>Stats are not available yet.</p>}</div></details>;
}

function PlayerTable({ players, slug, teams, showSlot = true }: { players: RosteredPlayer[]; slug: LeagueSlug; teams?: Team[]; showSlot?: boolean }) {
  return <div className="table-scroll"><table className="player-table"><caption className="sr-only">Rostered players and fantasy statistics</caption><thead><tr><th scope="col">Player</th>{teams && <th scope="col">Fantasy team</th>}{showSlot && <th scope="col">Slot</th>}<th scope="col">Week pts</th><th scope="col">Proj</th><th scope="col">Season</th><th scope="col">Avg</th><th scope="col"><span className="sr-only">Statistics</span></th></tr></thead><tbody>{players.map(player => <tr key={`${player.teamId}-${player.id}`}><td><PlayerIdentity player={player} injury={player.injuryStatus} /></td>{teams && <td><Link className="muted" to={teamLink(slug, player.teamId)}>{teams.find(team => team.id === player.teamId) ? <TeamIdentity team={teams.find(team => team.id === player.teamId)!} /> : '—'}</Link></td>}{showSlot && <td><span className="slot">{slotLabel(player.slot)}</span></td>}<td className="numeric emphasis">{points(player.weekPoints)}</td><td className="numeric muted">{points(player.projectedPoints)}</td><td className="numeric">{points(player.seasonPoints)}</td><td className="numeric">{points(player.averagePoints)}</td><td><StatDetails player={player} /></td></tr>)}</tbody></table></div>;
}

function TeamPage() {
  const { slug = '', teamId = '' } = useParams();
  const meta = leagueMeta(slug);
  const summaries = useSummaries();
  const rosters = useRosters(meta ? [meta.slug] : []);
  if (!meta) return <NotFound />;
  const summaryState = summaries[meta.slug];
  const data = summaryState.data;
  const roster = rosters[meta.slug];
  if (!data) return <Waiting error={summaryState.error} />;
  const team = data.teams.find(item => item.id === teamId);
  if (!team) return <NotFound />;
  const profile = managerFor(meta.slug, teamId);
  const matchup = data.matchups.find(item => item.homeTeamId === teamId || item.awayTeamId === teamId);
  const board: SummaryMap = {};
  for (const league of LEAGUES) if (summaries[league.slug].data) board[league.slug] = summaries[league.slug].data!;
  const cupMatches = currentCupMatchesForTeam(board, meta.slug, teamId);
  const players = roster?.data?.players.filter(player => player.teamId === teamId) ?? [];
  const mismatched = roster?.data && roster.data.updatedAt !== data.updatedAt;
  return <>
    <Link className="back-link" to={`/league/${slug}`}><ChevronLeft size={16} />{meta.name}</Link>
    <section className="page-intro">
      <div>
        <p className="eyebrow">{meta.name.toUpperCase()} <span>/</span> TEAM</p>
        <h1 className="team-page-name"><TeamIdentity team={team} /></h1>
      </div>
      <span className="big-rank">#{team.rank ?? '—'}</span>
    </section>
    <div className="team-page">
      <p className="team-fresh"><Fresh data={data} error={summaryState.error || !!roster?.error || !!mismatched} /></p>
      {profile && <div className="manager-profile">
        <strong>Manager: {profile.manager}</strong>
        <span>{profile.seasons} {profile.seasons === 1 ? 'season' : 'seasons'} · {profile.trophies} historical trophies</span>
        <Link to={`/cups/jffl?manager=${encodeURIComponent(profile.key)}`}>JFFL Cup · seed {profile.jfflSeed}<ArrowUpRight size={14}/></Link>
        <Link to={`/cups/${meta.slug}?manager=${encodeURIComponent(profile.key)}`}>League Cup · seed {profile.leagueSeed}<ArrowUpRight size={14}/></Link>
      </div>}
      <div className="team-metrics">
        <Metric label="Record" value={record(team)} />
        <Metric label="Points for" value={points(team.pointsFor)} />
        <Metric label="Points against" value={points(team.pointsAgainst)} />
        <Metric label="Per week" value={points(weeklyAverage(team))} />
      </div>
      {(matchup || cupMatches.length > 0) && <section className="team-matchup">
        <div className="section-heading"><h2>Matches</h2></div>
        <div className="team-match-list">
          {matchup && (() => {
            const decided = data.weeklyMatchups?.find(item => item.week === data.week && item.homeTeamId === matchup.homeTeamId && item.awayTeamId === matchup.awayTeamId)?.status === 'final';
            const chance = decided ? null : projectedWinChance(matchup.homeProjected, matchup.awayProjected);
            const share = pointShare(matchup.awayScore, matchup.homeScore);
            const bar = chance ? { left: chance.away, right: chance.home, label: `From ESPN projected totals. Away ${chance.away} percent. Home ${chance.home} percent.` } : share ? { ...share, label: `Away ${share.left} percent of the scored points. Home ${share.right} percent.` } : null;
            const leagueSide = (teamId: string | null, score: number | null, projected: number | null, opponent: number | null) => {
              const sideTeam = teamId ? data.teams.find(item => item.id === teamId) : undefined;
              const manager = sideTeam ? managerFor(meta.slug, sideTeam.id)?.manager ?? sideTeam.name : 'Bye';
              const result = decided && score != null && opponent != null ? score > opponent ? 'Won' : score < opponent ? 'Lost' : 'Tie' : null;
              const note = !sideTeam ? '' : !decided && projected != null ? `${record(sideTeam)} · Proj ${points(projected)}` : result ? `${record(sideTeam)} · ${result}` : record(sideTeam);
              return { key: teamId ?? 'bye', logoUrl: sideTeam?.logoUrl, name: manager, detail: sideTeam?.name ?? 'Bye', score: sideTeam ? points(score) : '—', note };
            };
            return <TeamMatchSheet label={`Week ${data.week} · League`} status={decided ? 'Final' : undefined} to={`/league/${meta.slug}/match/${matchup.id}`} bar={bar} sides={[
              leagueSide(matchup.awayTeamId, matchup.awayScore, matchup.awayProjected, matchup.homeScore),
              leagueSide(matchup.homeTeamId, matchup.homeScore, matchup.homeProjected, matchup.awayScore),
            ]} />;
          })()}
          {cupMatches.map(item => {
            const status = item.match.status === 'tied' ? 'Old fashioned duel' : item.match.status === 'live' && item.match.replay ? 'Replay week' : { bye: 'Bye', waiting: '', live: '', final: 'Final', unavailable: 'Scores pending' }[item.match.status];
            const crossLeague = item.cupId === 'jffl';
            const share = item.match.status === 'bye' ? null : pointShare(item.match.a.total, item.match.b.total);
            const cupSide = (side: typeof item.match.a) => {
              const participant = side.participant;
              const sideTeam = participant ? board[participant.slug]?.teams.find(team => team.id === participant.teamId) : undefined;
              const leagueName = participant ? leagueMeta(participant.slug)?.name.replace(/ League$/, '') : '';
              const legs = item.weeks.length > 1 && item.match.status !== 'bye' ? item.weeks.map((week, legIndex) => `W${week} ${points(side.legs[legIndex])}`).join(' · ') : '';
              return {
                key: participant?.key ?? side.label,
                logoUrl: sideTeam?.logoUrl,
                name: participant?.manager ?? (item.match.status === 'bye' ? 'Bye' : 'TBD'),
                detail: participant ? `${crossLeague && leagueName ? `${leagueName} · ` : ''}${sideTeam?.name ?? 'Team'}` : side.label || 'TBD',
                score: item.match.status === 'bye' ? '—' : points(side.total),
                note: legs,
                winner: !!participant && participant.key === item.match.winner?.key,
              };
            };
            return <TeamMatchSheet key={`${item.cupId}-${item.match.id}`} label={`${item.cupName} · ${item.roundName}`} status={status || undefined} to={`/cups/${item.cupId}/match/${item.match.id}`} bar={share ? { ...share, label: `${item.match.a.participant?.manager ?? 'Away'} ${share.left} percent of the scored points. ${item.match.b.participant?.manager ?? 'Home'} ${share.right} percent.` } : null} sides={[cupSide(item.match.a), cupSide(item.match.b)]} />;
          })}
        </div>
      </section>}
      <div className="team-roster">
        <div className="section-heading"><h2>Roster</h2></div>
        {roster?.data ? <>
          {mismatched && <p className="notice">Roster and scoreboard snapshots are catching up. Their update times are shown separately.</p>}
          {(['starter', 'bench', 'ir'] as const).map(group => {
            const entries = players.filter(player => player.group === group).sort(compareByLineup);
            return <section className="surface roster-section" key={group}>
              <div className="surface-heading"><h3>{group === 'starter' ? 'Starters' : group === 'bench' ? 'Bench' : 'Injured reserve'}</h3></div>
              {entries.length ? <PlayerTable players={entries} slug={meta.slug} /> : <p className="empty-inline">No players in this section.</p>}
            </section>;
          })}
        </> : <Waiting error={roster?.error} />}
      </div>
    </div>
  </>;
}

function pointShare(left: number | null, right: number | null) {
  if (left == null || right == null || left + right <= 0) return null;
  const share = Math.round((left / (left + right)) * 100);
  return { left: share, right: 100 - share };
}

function TeamMatchSheet({ label, status, to, sides, bar }: {
  label: string;
  status?: string;
  to?: string;
  sides: { key: string; logoUrl?: string | null; name: string; teamHref?: string; detail: string; score: string; note: string; winner?: boolean }[];
  bar: { left: number; right: number; label: string } | null;
}) {
  const face = <>
    <header><span>{label}</span>{status ? <span>{status}</span> : null}</header>
    <div className="team-sheet-face">
      {sides.map((side, index) => <div className={`team-sheet-side ${index === 1 ? 'home' : 'away'} ${side.winner ? 'winner' : ''}`} key={side.key}>
        {side.logoUrl ? <img className="team-sheet-logo" src={side.logoUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true; }} /> : <span className="team-sheet-logo" aria-hidden="true" />}
        <div className="team-sheet-copy">
          {side.teamHref ? <Link className="team-sheet-name" to={side.teamHref} title={side.name}>{side.name}</Link> : <span className="team-sheet-name" title={side.name}>{side.name}{side.winner && <span className="sr-only">, advances</span>}</span>}
          <span className="team-sheet-detail" title={side.detail}>{side.detail}</span>
          <strong className="score">{side.score}</strong>
          <span className="team-sheet-note">{side.note}</span>
        </div>
      </div>)}
    </div>
    <div className={`win-bar${bar ? '' : ' is-empty'}`} role={bar ? 'img' : undefined} aria-label={bar?.label} aria-hidden={bar ? undefined : true}>
      {bar && <><span className={bar.left > bar.right ? 'favored' : ''} style={{ width: `${bar.left}%` }} /><span className={bar.right > bar.left ? 'favored' : ''} style={{ width: `${bar.right}%` }} /></>}
    </div>
  </>;
  return to ? <Link className="team-sheet" to={to}>{face}</Link> : <article className="team-sheet">{face}</article>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="metric"><span>{label}</span><strong>{value}</strong></div>; }

const STAT_ORDER = ['Pass attempts', 'Completions', 'Pass yards', 'Pass TD', 'Interceptions', 'Rush attempts', 'Rush yards', 'Rush TD', 'Receptions', 'Rec yards', 'Rec TD', 'Targets', 'Fumbles', 'Fumbles lost', 'Field goals', 'Extra points', 'Defensive TD', 'Defensive INT', 'Fumble recoveries', 'Safeties', 'Sacks', 'Points allowed', 'Yards allowed'];

function playerWeeks(playerId: string, spots: { player: RosteredPlayer; slug: LeagueSlug }[], rosters: ReturnType<typeof useRosters>) {
  const byWeek = new Map<number, { week: number; points: number | null; stats: Record<string, number> }>();
  const column = (week: number) => {
    const existing = byWeek.get(week);
    if (existing) return existing;
    const created = { week, points: null as number | null, stats: {} as Record<string, number> };
    byWeek.set(week, created);
    return created;
  };
  for (const spot of spots) {
    for (const row of spot.player.weeklyStats ?? []) {
      const week = column(row.week);
      if (week.points == null && row.points != null) week.points = row.points;
      for (const [key, value] of Object.entries(row.stats ?? {})) if (week.stats[key] == null && value != null) week.stats[key] = value;
    }
    const roster = rosters[spot.slug]?.data;
    for (const lineup of roster?.weeklyLineups ?? []) {
      const played = lineup.players.find(item => item.id === playerId);
      if (played?.points != null) {
        const week = column(lineup.week);
        if (week.points == null) week.points = played.points;
      }
    }
    if (roster?.week) {
      const week = column(roster.week);
      if (week.points == null && spot.player.weekPoints != null) week.points = spot.player.weekPoints;
      for (const [key, value] of Object.entries(spot.player.weekStats)) if (week.stats[key] == null && value != null) week.stats[key] = value;
    }
  }
  return [...byWeek.values()].sort((a, b) => a.week - b.week);
}

function PlayerPage() {
  const { playerId = '' } = useParams();
  const rosters = useRosters(LEAGUES.map(meta => meta.slug));
  const summaries = useSummaries();
  const spots = LEAGUES.flatMap(meta => (rosters[meta.slug]?.data?.players ?? []).filter(player => player.id === playerId).map(player => ({ player, slug: meta.slug })));
  const loading = LEAGUES.some(meta => rosters[meta.slug]?.loading && !rosters[meta.slug]?.data);
  const player = spots.find(spot => spot.player.seasonPoints != null)?.player ?? spots[0]?.player;
  useEffect(() => { document.title = `${player?.name ?? 'Player'} · JFFL`; }, [player?.name]);
  if (!player) return loading ? <Waiting /> : <NotFound />;
  const weeks = playerWeeks(player.id, spots, rosters);
  const statNames = [...new Set([...Object.keys(player.seasonStats), ...weeks.flatMap(week => Object.keys(week.stats))])].sort((a, b) => {
    const rank = (name: string) => { const index = STAT_ORDER.indexOf(name); return index === -1 ? STAT_ORDER.length : index; };
    return rank(a) - rank(b) || a.localeCompare(b);
  });
  return <>
    <Link className="back-link" to="/players"><ChevronLeft size={16} />Players</Link>
    <section className="page-intro">
      <div>
        <p className="eyebrow">2026 SEASON <span>/</span> PLAYER</p>
        <h1 className="player-page-name"><PlayerIdentity player={player} /></h1>
        {injuryLabel(player.injuryStatus) && <p className="injury player-page-injury" title={injuryName(player.injuryStatus)}>{injuryLabel(player.injuryStatus)}</p>}
      </div>
    </section>
    <div className="team-metrics">
      <Metric label="Week pts" value={points(player.weekPoints)} />
      <Metric label="Projected" value={points(player.projectedPoints)} />
      <Metric label="Season" value={points(player.seasonPoints)} />
      <Metric label="Average" value={points(player.averagePoints)} />
    </div>
    <section className="surface player-ownership"><div className="surface-heading"><h2>Rostered by</h2></div><ul className="player-rosters">{spots.map(spot => { const team = summaries[spot.slug].data?.teams.find(item => item.id === spot.player.teamId); return <li key={`${spot.slug}-${spot.player.teamId}`}><span className={`league-label ${spot.slug}`}>{leagueMeta(spot.slug)?.name}</span><Link to={teamLink(spot.slug, spot.player.teamId)}>{team ? <TeamIdentity team={team} /> : 'Team'}</Link><span className="slot">{slotLabel(spot.player.slot)}</span></li>; })}</ul></section>
    <section className="surface"><div className="surface-heading"><h2>Statistics</h2><span className="muted">Eligible: {slotsLabel(player.eligibleSlots) || '—'}</span></div>{weeks.length || statNames.length ? <div className="table-scroll" tabIndex={0} role="region" aria-label={`${player.name} statistics by week`}><table className="player-stat-table"><thead><tr><th>Statistic</th>{weeks.map(week => <th key={week.week}>W{week.week}</th>)}<th>Season</th></tr></thead><tbody><tr><th>Fantasy points</th>{weeks.map(week => <td key={week.week} className="numeric">{points(week.points)}</td>)}<td className="numeric">{points(player.seasonPoints)}</td></tr>{statNames.map(key => <tr key={key}><th>{key}</th>{weeks.map(week => <td key={week.week} className="numeric">{points(week.stats[key])}</td>)}<td className="numeric">{points(player.seasonStats[key])}</td></tr>)}</tbody></table></div> : <p className="empty-inline">Stats are not available yet.</p>}</section>
  </>;
}

function PlayersPage() {
  const location = useLocation();
  const initial = new URLSearchParams(location.search).get('league');
  const [league, setLeague] = useState<string>(initial && leagueMeta(initial) ? initial : 'all');
  const [position, setPosition] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  useEffect(() => {
    const requested = new URLSearchParams(location.search).get('league');
    setLeague(requested && leagueMeta(requested) ? requested : 'all');
    setPage(0);
  }, [location.search]);
  const selected = LEAGUES.filter(meta => league === 'all' || meta.slug === league);
  const states = useRosters(selected.map(meta => meta.slug));
  const summaries = useSummaries();
  const rows = selected.flatMap(meta => (states[meta.slug]?.data?.players ?? []).map(player => ({ player, slug: meta.slug })));
  const grouped = [...rows.reduce((groups, row) => {
    const spots = groups.get(row.player.id) ?? [];
    spots.push(row);
    groups.set(row.player.id, spots);
    return groups;
  }, new Map<string, typeof rows>()).values()].map(spots => ({ player: spots.find(spot => spot.player.seasonPoints != null)?.player ?? spots[0].player, spots }));
  const filtered = grouped.filter(({ player }) => (position === 'all' || player.position === position) && player.name.toLowerCase().includes(search.trim().toLowerCase())).sort((a, b) => (b.player.seasonPoints ?? -Infinity) - (a.player.seasonPoints ?? -Infinity) || a.player.name.localeCompare(b.player.name));
  const pages = Math.max(1, Math.ceil(filtered.length / 30));
  const safePage = Math.min(page, pages - 1);
  const visible = filtered.slice(safePage * 30, (safePage + 1) * 30);
  const loading = selected.some(meta => !states[meta.slug] || states[meta.slug]?.loading);
  const positions = [...new Set(rows.map(({ player }) => player.position))].sort();
  return <><section className="page-intro"><div><p className="eyebrow">2026 SEASON <span>/</span> ROSTERED PLAYERS</p><h1>Players</h1><p className="intro-copy">Fantasy points follow each league’s scoring rules.</p></div></section><section className="surface player-browser"><div className="filters"><label className="search-field"><Search size={18} /><span className="sr-only">Search players</span><input aria-label="Search players" placeholder="Search players" value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} /></label><label><span className="sr-only">League</span><select aria-label="League" value={league} onChange={event => { setLeague(event.target.value); setPage(0); }}><option value="all">All leagues</option>{LEAGUES.map(meta => <option key={meta.slug} value={meta.slug}>{meta.name}</option>)}</select></label><label><span className="sr-only">Position</span><select aria-label="Position" value={position} onChange={event => { setPosition(event.target.value); setPage(0); }}><option value="all">All positions</option>{positions.map(pos => <option key={pos}>{pos}</option>)}</select></label></div><div className="player-freshness">{selected.map(meta => <span key={meta.slug}><b>{meta.name}</b>{states[meta.slug]?.data ? <Fresh data={states[meta.slug]!.data!} error={states[meta.slug]?.error} /> : <span className="muted">{states[meta.slug]?.error ? 'Unavailable' : 'Loading…'}</span>}</span>)}</div>{loading && !rows.length ? <Waiting /> : filtered.length ? <><div className="table-scroll"><table className="directory-table"><caption className="sr-only">Rostered players across JFFL</caption><thead><tr><th>Player</th><th>Teams</th><th>Week pts</th><th>Proj</th><th>Season</th><th>Avg</th></tr></thead><tbody>{visible.map(({ player, spots }) => <tr key={player.id}><td><Link className="directory-player" to={`/players/${encodeURIComponent(player.id)}`}><PlayerIdentity player={player} injury={player.injuryStatus} detail={spots.length === 1 ? slotLabel(spots[0].player.slot) : undefined} /></Link></td><td><div className="directory-rosters">{spots.map(spot => { const team = summaries[spot.slug].data?.teams.find(item => item.id === spot.player.teamId); const code = spot.slug === 'premier' ? 'PL' : spot.slug === 'championship' ? 'CL' : 'LO'; return <span className="directory-roster" key={`${spot.slug}-${spot.player.teamId}`}>{league === 'all' && <small className={`league-label ${spot.slug}`} title={leagueMeta(spot.slug)?.name}>{code}</small>}<Link className="directory-team" to={teamLink(spot.slug, spot.player.teamId)}>{team ? <TeamIdentity team={team} /> : 'Team'}</Link></span>; })}</div></td><td className="numeric emphasis">{points(player.weekPoints)}</td><td className="numeric muted">{points(player.projectedPoints)}</td><td className="numeric">{points(player.seasonPoints)}</td><td className="numeric">{points(player.averagePoints)}</td></tr>)}</tbody></table></div><div className="pagination"><span>{safePage * 30 + 1}–{Math.min((safePage + 1) * 30, filtered.length)} of {filtered.length}</span><div><button disabled={safePage === 0} onClick={() => setPage(safePage - 1)} aria-label="Previous page"><ChevronLeft size={17} /></button><span>Page {safePage + 1} of {pages}</span><button disabled={safePage + 1 >= pages} onClick={() => setPage(safePage + 1)} aria-label="Next page"><ChevronRight size={17} /></button></div></div></> : <div className="waiting"><Search size={24} /><strong>{rows.length ? 'No players match your filters' : 'Player data is unavailable'}</strong><span>{rows.length ? 'Try a different name or position.' : 'The next scheduled update will try again.'}</span></div>}</section></>;
}

function NotFound() { return <div className="waiting"><Shield size={30} /><h1>Page not found</h1><Link className="button" to="/">Back to the leagues</Link></div>; }

export default function App() {
  const location = useLocation();
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === 'dark');
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    try { localStorage.setItem('jffl-theme', dark ? 'dark' : 'light'); } catch { /* Theme works without storage. */ }
  }, [dark]);
  useEffect(() => {
    window.scrollTo(0, 0);
    if (/^\/players\/.+/.test(location.pathname)) return;
    const title = location.pathname.startsWith('/cups') ? 'Cups' : location.pathname === '/summary' ? 'Standings' : location.pathname === '/weekly' ? 'Weekly roundup' : location.pathname === '/history' ? 'History' : location.pathname === '/players' ? 'Players' : 'Leagues';
    document.title = `${title} · JFFL`;
  }, [location.pathname]);
  return <>
    <a className="skip-link" href="#main">Skip to content</a>
    <header className="site-header"><div className="header-inner">
      <Link to="/" className="brand" aria-label="JFFL home">JFFL</Link>
      <nav aria-label="Main navigation"><NavLink to="/" end>Leagues</NavLink><NavLink to="/summary" className={['/weekly', '/history'].includes(location.pathname) ? 'active' : undefined}>Standings</NavLink><NavLink to="/cups">Cups</NavLink><NavLink to="/players">Players</NavLink></nav>
      <button className="theme-toggle" aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} aria-pressed={dark} title={dark ? 'Light mode' : 'Dark mode'} onClick={() => setDark(value => !value)}>{dark ? <Sun size={19}/> : <Moon size={19}/>}</button>
      <span className="header-season">2026 <span>SEASON</span></span>
    </div></header>
    <nav className="league-strip" aria-label="Leagues"><div>{LEAGUES.map(meta => <NavLink key={meta.slug} to={`/league/${meta.slug}`}>{meta.name}</NavLink>)}</div></nav>
    <main id="main" tabIndex={-1}>
      {localPreview && <p className="notice preview-notice">Local preview · real ESPN snapshot.</p>}
      <Routes><Route path="/" element={<Overview/>}/><Route path="/league/:slug" element={<LeaguePage/>}/><Route path="/league/:slug/match/:matchId" element={<LeagueMatchPage/>}/><Route path="/league/:slug/team/:teamId" element={<TeamPage/>}/><Route path="/players/:playerId" element={<PlayerPage/>}/><Route path="/players" element={<PlayersPage/>}/><Route path="/summary" element={<SeasonPage/>}/><Route path="/weekly" element={<WeeklyPage/>}/><Route path="/history" element={<HistoryPage/>}/><Route path="/cups" element={<CupHubPage/>}/><Route path="/cups/:cupId/match/:matchId" element={<CupMatchPage/>}/><Route path="/cups/:cupId" element={<CupPage/>}/><Route path="*" element={<NotFound/>}/></Routes>
    </main>
    <footer className="site-footer"><Link className="footer-brand" to="/">JFFL</Link><span>2026 season · ESPN scores</span><span>Refreshes every 3 minutes · ESPN updates may be delayed</span></footer>
  </>;
}
