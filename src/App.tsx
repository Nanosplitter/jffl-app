import { useEffect, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { Activity, ArrowUpRight, ChevronLeft, ChevronRight, ExternalLink, Search, Shield, Sun, Moon } from 'lucide-react';
import { localPreview, useRosters, useSummaries } from './data';
import { LEAGUES, type LeagueSlug, type LeagueSummary, type Matchup, type RosteredPlayer, type Team } from './types';
import { Fresh, points, record } from './ui';
import { CupHubPage, CupPage, SeasonPage, WeeklyPage, HistoryPage } from './CompetitionPages';
import { managerFor } from './reference';
import { TeamIdentity } from './TeamIdentity';

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
  return <div className="table-scroll" tabIndex={0} role="region" aria-label={`${data.leagueName} standings`}><table className={`standings ${compact ? 'compact' : ''}`}><caption className="sr-only">{data.leagueName} standings</caption><thead><tr><th scope="col">#</th><th scope="col">Team</th><th scope="col">W–L</th><th scope="col">PF</th>{!compact && <th scope="col">PA</th>}</tr></thead><tbody>{data.teams.map(team => <tr key={team.id}><td className={team.rank === 1 ? 'rank first' : 'rank'}>{team.rank ?? '—'}</td><td><Link to={teamLink(data.slug, team.id)}><TeamIdentity team={team} /></Link></td><td className="numeric">{record(team)}</td><td className="numeric">{points(team.pointsFor)}</td>{!compact && <td className="numeric muted">{points(team.pointsAgainst)}</td>}</tr>)}</tbody></table></div>;
}

function MatchupCard({ matchup, data, compact = false }: { matchup: Matchup; data: LeagueSummary; compact?: boolean }) {
  const home = data.teams.find(team => team.id === matchup.homeTeamId);
  const away = data.teams.find(team => team.id === matchup.awayTeamId);
  const lines: [Team | undefined, number | null, number | null][] = [[away, matchup.awayScore, matchup.awayProjected], [home, matchup.homeScore, matchup.homeProjected]];
  return <article className={`matchup ${compact ? 'compact' : ''}`}>{lines.map(([team, score, projected], index) => <div className="matchup-side" key={index}><div className="matchup-team">{team ? <Link to={teamLink(data.slug, team.id)}><TeamIdentity team={team} /></Link> : <span>Bye</span>}{!compact && team && <small>{record(team)} <span>· Projected {points(projected)}</span></small>}</div><strong className="score">{team ? points(score) : '—'}</strong></div>)}</article>;
}

function Overview() {
  const summaries = useSummaries();
  const loaded = Object.values(summaries).map(state => state.data).filter((data): data is LeagueSummary => !!data);
  const count = loaded.reduce((sum, data) => sum + data.teams.length, 0);
  return <><section className="page-intro"><div><p className="eyebrow">SEASON 25 <span>/</span> 2026 <span>/</span> WEEK {loaded[0]?.week ?? '—'}</p><h1>The leagues</h1><p className="intro-copy">Three divisions. One JFFL.</p></div><div className="season-totals"><div><strong>3</strong><span>Leagues</span></div><div><strong>{loaded.length ? count : '—'}</strong><span>Teams</span></div></div></section>
    <nav className="overview-links" aria-label="More from JFFL"><Link to="/weekly">Weekly roundup<ArrowUpRight size={14}/></Link><Link to="/history">Trophies & history<ArrowUpRight size={14}/></Link></nav>
    <div className="overview-grid">{LEAGUES.map(meta => { const state = summaries[meta.slug]; return <section className={`league-panel ${meta.slug}`} key={meta.slug}><header className="league-panel-header"><LeagueMark slug={meta.slug} size="large" /><div><p className="eyebrow">DIVISION {String(meta.tier).padStart(2, '0')}</p><h2><Link to={`/league/${meta.slug}`}>{meta.name}</Link></h2></div><Link className="icon-link" to={`/league/${meta.slug}`} aria-label={`Open ${meta.name}`}><ArrowUpRight size={22} /></Link></header>{state.data ? <><div className="panel-section-title"><h3>Standings</h3><span>{state.data.teams.length} teams</span></div><Standings data={state.data} compact /><div className="panel-section-title matchups-title"><h3>Week {state.data.week} matchups</h3><Activity size={15} /></div><div className="mini-matchups">{state.data.matchups.map(matchup => <MatchupCard key={matchup.id} matchup={matchup} data={state.data!} compact />)}</div><footer className="panel-footer"><Fresh data={state.data} error={state.error} /><Link to={`/league/${meta.slug}`}>League details</Link></footer></> : <Waiting error={state.error} />}</section>; })}</div>
  </>;
}

function LeaguePage() {
  const { slug = '' } = useParams();
  const meta = leagueMeta(slug);
  const summaries = useSummaries();
  if (!meta) return <NotFound />;
  const state = summaries[meta.slug];
  return <><Link className="back-link" to="/"><ChevronLeft size={16} />All leagues</Link><section className="page-intro league-intro"><div className="league-title"><LeagueMark slug={slug} size="large" /><div><p className="eyebrow">JFFL <span>/</span> 2026 SEASON</p><h1>{meta.name}</h1></div></div><a className="button secondary" href={`https://fantasy.espn.com/football/league?leagueId=${meta.espnId}`} target="_blank" rel="noreferrer">View on ESPN<ExternalLink size={14} /></a></section>{state.data ? <><div className="section-heading"><h2>Week {state.data.week} scoreboard</h2><Fresh data={state.data} error={state.error} /></div><div className="scoreboard-grid">{state.data.matchups.map(matchup => <MatchupCard key={matchup.id} matchup={matchup} data={state.data!} />)}</div><div className="league-detail-grid"><section className="surface"><div className="surface-heading"><h2>Standings</h2><Link to={`/players?league=${slug}`}>Browse players</Link></div><Standings data={state.data} /></section><section className="surface scoring"><div className="surface-heading"><h2>Scoring</h2></div><p className="muted">ESPN scoring values for this league.</p>{state.data.scoring.length ? <dl>{state.data.scoring.map((item, index) => <div key={index}><dt>{item.name.replace(/([a-z])([A-Z])/g, '$1 $2')}</dt><dd>{points(item.points)}</dd></div>)}</dl> : <p className="muted">Scoring details are not supplied.</p>}</section></div></> : <Waiting error={state.error} />}</>;
}

function StatDetails({ player }: { player: RosteredPlayer }) {
  const keys = [...new Set([...Object.keys(player.weekStats), ...Object.keys(player.seasonStats)])];
  return <details className="player-details"><summary aria-label={`Statistics for ${player.name}`}>Stats</summary><div className="stat-popup"><strong>{player.name}</strong><span className="muted">Eligible: {player.eligibleSlots.filter(slot => slot !== 'BE' && slot !== 'IR').join(', ')}</span>{keys.length ? <table><thead><tr><th>Statistic</th><th>Week</th><th>Season</th></tr></thead><tbody>{keys.map(key => <tr key={key}><th>{key}</th><td>{points(player.weekStats[key])}</td><td>{points(player.seasonStats[key])}</td></tr>)}</tbody></table> : <p>Stats are not available yet.</p>}</div></details>;
}

function PlayerTable({ players, slug, teams, showSlot = true }: { players: RosteredPlayer[]; slug: LeagueSlug; teams?: Team[]; showSlot?: boolean }) {
  return <div className="table-scroll"><table className="player-table"><caption className="sr-only">Rostered players and fantasy statistics</caption><thead><tr><th scope="col">Player</th>{teams && <th scope="col">Fantasy team</th>}{showSlot && <th scope="col">Slot</th>}<th scope="col">Week pts</th><th scope="col">Proj</th><th scope="col">Season</th><th scope="col">Avg</th><th scope="col"><span className="sr-only">Statistics</span></th></tr></thead><tbody>{players.map(player => <tr key={`${player.teamId}-${player.id}`}><td><div className="player-name">{player.name}{player.injuryStatus && !['ACTIVE', 'NORMAL', 'Active'].includes(player.injuryStatus) && <span className="injury">{player.injuryStatus}</span>}</div><small className="muted">{player.proTeam} <span>·</span> {player.position}</small></td>{teams && <td><Link className="muted" to={teamLink(slug, player.teamId)}>{teams.find(team => team.id === player.teamId) ? <TeamIdentity team={teams.find(team => team.id === player.teamId)!} /> : '—'}</Link></td>}{showSlot && <td><span className="slot">{player.slot === 'BE' ? 'Bench' : player.slot}</span></td>}<td className="numeric emphasis">{points(player.weekPoints)}</td><td className="numeric muted">{points(player.projectedPoints)}</td><td className="numeric">{points(player.seasonPoints)}</td><td className="numeric">{points(player.averagePoints)}</td><td><StatDetails player={player} /></td></tr>)}</tbody></table></div>;
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
  const players = roster?.data?.players.filter(player => player.teamId === teamId) ?? [];
  const mismatched = roster?.data && roster.data.updatedAt !== data.updatedAt;
  return <><Link className="back-link" to={`/league/${slug}`}><ChevronLeft size={16} />{meta.name}</Link><section className="page-intro"><div><p className="eyebrow">{meta.name.toUpperCase()} <span>/</span> TEAM</p><h1 className="team-page-name"><TeamIdentity team={team} /></h1></div><span className="big-rank">#{team.rank ?? '—'}<small>IN LEAGUE</small></span></section>{profile && <div className="manager-profile"><strong>Manager: {profile.manager}</strong><span>{profile.seasons} {profile.seasons === 1 ? 'season' : 'seasons'} · {profile.trophies} historical trophies</span><Link to={`/cups/jffl?manager=${encodeURIComponent(profile.key)}`}>JFFL Cup · seed {profile.jfflSeed}<ArrowUpRight size={14}/></Link><Link to={`/cups/${meta.slug}?manager=${encodeURIComponent(profile.key)}`}>League Cup · seed {profile.leagueSeed}<ArrowUpRight size={14}/></Link></div>}<div className="team-metrics"><Metric label="Record" value={record(team)} /><Metric label="Points for" value={points(team.pointsFor)} /><Metric label="Points against" value={points(team.pointsAgainst)} /><Metric label="Roster spots" value={String(team.rosterCount)} /></div>{matchup && <section className="team-matchup"><div className="section-heading"><h2>Week {data.week} matchup</h2><Fresh data={data} error={summaryState.error} /></div><MatchupCard matchup={matchup} data={data} /></section>}<div className="section-heading"><h2>Roster</h2>{roster?.data && <Fresh data={roster.data} error={roster.error || !!mismatched} />}</div>{roster?.data ? <>{mismatched && <p className="notice">Roster and scoreboard snapshots are catching up. Their update times are shown separately.</p>}{(['starter', 'bench', 'ir'] as const).map(group => { const entries = players.filter(player => player.group === group); return <section className="surface roster-section" key={group}><div className="surface-heading"><h3>{group === 'starter' ? 'Starters' : group === 'bench' ? 'Bench' : 'Injured reserve'}</h3><span className="muted">{entries.length} players</span></div>{entries.length ? <PlayerTable players={entries} slug={meta.slug} /> : <p className="empty-inline">No players in this section.</p>}</section>; })}</> : <Waiting error={roster?.error} />}</>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="metric"><span>{label}</span><strong>{value}</strong></div>; }

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
  const filtered = rows.filter(({ player }) => (position === 'all' || player.position === position) && player.name.toLowerCase().includes(search.trim().toLowerCase())).sort((a, b) => (b.player.seasonPoints ?? -Infinity) - (a.player.seasonPoints ?? -Infinity) || a.player.name.localeCompare(b.player.name));
  const pages = Math.max(1, Math.ceil(filtered.length / 30));
  const safePage = Math.min(page, pages - 1);
  const visible = filtered.slice(safePage * 30, (safePage + 1) * 30);
  const loading = selected.some(meta => !states[meta.slug] || states[meta.slug]?.loading);
  const positions = [...new Set(rows.map(({ player }) => player.position))].sort();
  return <><section className="page-intro"><div><p className="eyebrow">2026 SEASON <span>/</span> ROSTERED PLAYERS</p><h1>Players</h1><p className="intro-copy">Fantasy points follow each league’s scoring rules.</p></div><div className="player-count"><strong>{rows.length || '—'}</strong><span>roster entries</span></div></section><section className="surface player-browser"><div className="filters"><label className="search-field"><Search size={18} /><span className="sr-only">Search players</span><input aria-label="Search players" placeholder="Search players" value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} /></label><label><span className="sr-only">League</span><select aria-label="League" value={league} onChange={event => { setLeague(event.target.value); setPage(0); }}><option value="all">All leagues</option>{LEAGUES.map(meta => <option key={meta.slug} value={meta.slug}>{meta.name}</option>)}</select></label><label><span className="sr-only">Position</span><select aria-label="Position" value={position} onChange={event => { setPosition(event.target.value); setPage(0); }}><option value="all">All positions</option>{positions.map(pos => <option key={pos}>{pos}</option>)}</select></label></div><div className="player-freshness">{selected.map(meta => <span key={meta.slug}><b>{meta.name}</b>{states[meta.slug]?.data ? <Fresh data={states[meta.slug]!.data!} error={states[meta.slug]?.error} /> : <span className="muted">{states[meta.slug]?.error ? 'Unavailable' : 'Loading…'}</span>}</span>)}</div>{loading && !rows.length ? <Waiting /> : filtered.length ? <><div className="table-scroll"><table className="directory-table"><caption className="sr-only">Rostered players across JFFL</caption><thead><tr><th>Player</th><th>League / team</th><th>Week pts</th><th>Proj</th><th>Season</th><th>Avg</th><th><span className="sr-only">Statistics</span></th></tr></thead><tbody>{visible.map(({ player, slug }) => <tr key={`${slug}-${player.teamId}-${player.id}`}><td><div className="player-name">{player.name}</div><small className="muted">{player.proTeam} · {player.position} · {player.slot === 'BE' ? 'Bench' : player.slot}</small></td><td><small className={`league-label ${slug}`}>{leagueMeta(slug)?.name}</small><Link className="directory-team" to={teamLink(slug, player.teamId)}>{summaries[slug].data?.teams.find(team => team.id === player.teamId) ? <TeamIdentity team={summaries[slug].data!.teams.find(team => team.id === player.teamId)!} /> : 'Team'}</Link></td><td className="numeric emphasis">{points(player.weekPoints)}</td><td className="numeric muted">{points(player.projectedPoints)}</td><td className="numeric">{points(player.seasonPoints)}</td><td className="numeric">{points(player.averagePoints)}</td><td><StatDetails player={player} /></td></tr>)}</tbody></table></div><div className="pagination"><span>{safePage * 30 + 1}–{Math.min((safePage + 1) * 30, filtered.length)} of {filtered.length}</span><div><button disabled={safePage === 0} onClick={() => setPage(safePage - 1)} aria-label="Previous page"><ChevronLeft size={17} /></button><span>Page {safePage + 1} of {pages}</span><button disabled={safePage + 1 >= pages} onClick={() => setPage(safePage + 1)} aria-label="Next page"><ChevronRight size={17} /></button></div></div></> : <div className="waiting"><Search size={24} /><strong>{rows.length ? 'No players match your filters' : 'Player data is unavailable'}</strong><span>{rows.length ? 'Try a different name or position.' : 'The next scheduled update will try again.'}</span></div>}</section></>;
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
      <Routes><Route path="/" element={<Overview/>}/><Route path="/league/:slug" element={<LeaguePage/>}/><Route path="/league/:slug/team/:teamId" element={<TeamPage/>}/><Route path="/players" element={<PlayersPage/>}/><Route path="/summary" element={<SeasonPage/>}/><Route path="/weekly" element={<WeeklyPage/>}/><Route path="/history" element={<HistoryPage/>}/><Route path="/cups" element={<CupHubPage/>}/><Route path="/cups/:cupId" element={<CupPage/>}/><Route path="*" element={<NotFound/>}/></Routes>
    </main>
    <footer className="site-footer"><Link className="footer-brand" to="/">JFFL</Link><span>2026 season · ESPN scores · Jason’s competition records</span><span>Refreshes every 3 minutes · ESPN updates may be delayed</span></footer>
  </>;
}
