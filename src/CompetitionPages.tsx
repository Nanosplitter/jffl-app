import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useParams } from 'react-router-dom';
import { ArrowUpRight, Trophy, Search, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useRosters, useSummaries } from './data';
import { LEAGUES, type LeagueSlug, type LeagueSummary, type RosteredPlayer, type Team } from './types';
import { MANAGERS, TIMELINE, leagueInk, leagueOfManager, managerFor, type ManagerReference } from './reference';
import { RankMark, cupSeed } from './RankMark';
import { ArchiveChart, useDarkMode } from './history/ArchiveChart';
import { chartTheme, horizontalBars } from './history/archiveCharts';
import { esc } from './history/chartKit';
import { buildCup, projectionUpset, provisionalZone, regularSeason, roundScoreAverage, type CupId, type CupMatch, type SummaryMap } from './competitions';
import { Fresh, points, record, weeklyAverage } from './ui';
import { projectedWinChance } from './projections';
import { cupMatchChance } from './cupOdds';
import { TeamIdentity } from './TeamIdentity';
import { PlayerIdentity, nflLogoUrl, playerHeadshotUrl } from './PlayerIdentity';
import { compareByLineup, historicalStarters, lineupWouldWin, rosterForWeek, type LineupMove, type LineupSwing } from './lineups';
import { usePageLabel } from './BackLink';

const matchUrl = (cupId: string, matchId: string) => `/cups/${cupId}/match/${matchId}`;

const CUP_IDS: CupId[] = ['jffl', 'premier', 'championship', 'league-one'];
const teamUrl = (slug: string, id: string) => `/league/${slug}/team/${id}`;
const delta = (value: number | null) => value === null ? '—' : value > 0 ? `+${value}` : String(value);

function useCompetitionData() {
  const states = useSummaries();
  const data: SummaryMap = {};
  for (const meta of LEAGUES) if (states[meta.slug].data) data[meta.slug] = states[meta.slug].data!;
  return { data, states };
}

export function SectionNav() {
  return <nav className="section-nav" aria-label="Season pages"><NavLink to="/summary">Standings</NavLink><NavLink to="/weekly">Weekly roundup</NavLink><NavLink to="/history" end>Trophies & history</NavLink></nav>;
}

function UpdateStrip({ data }: { data: SummaryMap }) {
  const states = useSummaries();
  const loaded = Object.values(data).filter((summary): summary is LeagueSummary => !!summary);
  const oldest = loaded.slice().sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt))[0];
  const hasIssue = LEAGUES.some(meta => states[meta.slug].error || data[meta.slug]?.refreshStatus === 'error');
  return <p className="competition-updates">{oldest ? <Fresh data={oldest} error={hasIssue} /> : <span className="muted">Loading scores…</span>}</p>;
}

function totalShare(left: number | null, right: number | null) {
  if (left == null || right == null || left + right <= 0) return null;
  const away = Math.round(left / (left + right) * 100);
  return { away, home: 100 - away };
}

function weekPhrase(weeks: number[]) {
  if (weeks.length <= 1) return `Week ${weeks[0]}`;
  if (weeks.length === 2) return `Weeks ${weeks[0]} and ${weeks[1]}`;
  return `Weeks ${weeks.slice(0, -1).join(', ')}, and ${weeks.at(-1)}`;
}

function feederLabel(label: string) {
  const parsed = /^Winner of (.+) (\d+)$/.exec(label);
  if (!parsed) return label || 'TBD';
  const round = parsed[1].replace(/^Round /, 'R').replace('Quarterfinals', 'QF').replace('Semifinals', 'SF').replace('First round', 'R1');
  return `${round} · Match ${parsed[2]}`;
}

export function MatchCard({ match, weeks, data, highlighted, index, layout = 'board', cupId, players = undefined }: { match: CupMatch; weeks: number[]; data: SummaryMap; highlighted: string; index: number; layout?: 'board' | 'slot'; cupId: string; players?: Partial<Record<LeagueSlug, RosteredPlayer[] | null>> | null }) {
  const status = match.status === 'tied' ? 'Old fashioned duel' : match.status === 'live' && match.replay ? 'Replay week' : { bye:'Bye · advances', waiting:'', live:'', final:'Final', unavailable:'Waiting for score data' }[match.status];
  const selected = highlighted && [match.a.participant?.key, match.b.participant?.key].includes(highlighted);
  const share = match.status === 'bye' ? null : totalShare(match.a.total, match.b.total);
  const open = match.status === 'live' || match.status === 'waiting';
  const chance = open && players ? cupMatchChance(match, data, players) : null;
  const odds = chance && chance !== 'level' ? chance : null;
  const sideName = (side: CupMatch['a']) => side.participant?.manager ?? (side.label || 'TBD');
  const label = `Cup matchup ${index + 1}, ${weekPhrase(weeks)}. ${sideName(match.a)} ${match.status === 'bye' ? 'bye' : points(match.a.total)}. ${sideName(match.b)} ${match.status === 'bye' ? 'bye' : points(match.b.total)}.${odds ? ` ${sideName(match.a)} ${odds.left} percent chance to advance. ${sideName(match.b)} ${odds.right} percent.` : ''}`;
  if (layout === 'slot') return <Link className={`bracket-node cup-${match.status} ${selected ? 'highlighted' : ''}`} to={matchUrl(cupId, match.id)} aria-label={label}>
    {[match.a, match.b].map((side, sideIndex) => {
      const participant = side.participant;
      const team = participant ? data[participant.slug]?.teams.find(item => item.id === participant.teamId) : null;
      const winner = participant && participant.key === match.winner?.key;
      const seed = participant ? (match.id.startsWith('jffl-') ? participant.jfflSeed : participant.leagueSeed) : null;
      const openSlot = !participant;
      const name = participant ? participant.manager : match.status === 'bye' ? 'Bye' : feederLabel(side.label);
      const showScore = !!participant && match.status !== 'bye' && match.status !== 'waiting' && side.total !== null;
      const detail = participant ? `${LEAGUES.find(item => item.slug === participant.slug)?.name ?? ''} · ${team?.name ?? 'Team data loading'}` : side.label;
      return <div className={`bracket-row ${winner ? 'winner' : ''} ${openSlot ? 'open-slot' : ''}`} key={sideIndex} title={detail || undefined}>
        {team?.logoUrl ? <img className="bracket-logo" src={team.logoUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true; }} /> : <span className="bracket-logo" aria-hidden="true" />}
        <span className={`bracket-name ${participant ? leagueInk(participant.slug) : ''}`}><RankMark value={seed} />{name}{winner && <span className="sr-only"> · Advances</span>}</span>
        <span className="bracket-score">{showScore ? points(side.total) : ''}</span>
      </div>;
    })}
  </Link>;
  return <Link className={`cup-match cup-${match.status} ${selected ? 'highlighted' : ''}`} to={matchUrl(cupId, match.id)} aria-label={label}>
    <header><span>Match {index + 1}</span>{status && <span className={`status-tag status-${match.status}`}>{status}</span>}</header>
    <div className="cup-body">
      <div className="cup-face">
        {[match.a, match.b].map((side, sideIndex) => {
          const participant = side.participant;
          const team = participant ? data[participant.slug]?.teams.find(item => item.id === participant.teamId) : null;
          const winner = participant && participant.key === match.winner?.key;
          return <div className={`cup-side ${sideIndex === 1 ? 'home' : 'away'} ${winner ? 'cup-winner' : ''}`} key={sideIndex}>
            {team?.logoUrl && <img className="matchup-logo" src={team.logoUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true; }} />}
            <div className="cup-side-copy">
              {participant ? <span className={`cup-manager ${leagueInk(participant.slug)}`}><span><RankMark value={cupSeed(match.id.startsWith('jffl-') ? 'jffl' : 'league', participant)} />{participant.manager}</span>{winner && <span className="sr-only"> · Advances</span>}</span> : <span className="muted cup-placeholder">{side.label || 'TBD'}</span>}
              {participant && <small className="cup-team"><span className="cup-league">{LEAGUES.find(item => item.slug === participant.slug)?.name}</span> · {team?.name ?? 'Team data loading'}</small>}
              <strong className="score">{match.status === 'bye' ? '—' : points(side.total)}</strong>
              {weeks.length > 1 && match.status !== 'bye' && <small className="proj-line">{weeks.map((week, legIndex) => `W${week} ${points(side.legs[legIndex])}`).join(' · ')}</small>}
            </div>
          </div>;
        })}
      </div>
      {odds ? <div className="cup-odds"><p className="cup-odds-read"><span className={odds.left > odds.right ? 'favored' : ''}>{odds.left}%</span><span className={odds.right > odds.left ? 'favored' : ''}>{odds.right}%</span></p><div className="win-bar" role="img" aria-label={`${sideName(match.a)} ${odds.left} percent chance to advance. ${sideName(match.b)} ${odds.right} percent.`}><span className={odds.left > odds.right ? 'favored' : ''} style={{ width: `${odds.left}%` }} /><span className={odds.right > odds.left ? 'favored' : ''} style={{ width: `${odds.right}%` }} /></div></div> : players !== null && share && <div className="win-bar" role="img" aria-label={`${sideName(match.a)} ${share.away} percent of the scored points. ${sideName(match.b)} ${share.home} percent.`}><span className={share.away > share.home ? 'favored' : ''} style={{ width: `${share.away}%` }} /><span className={share.home > share.away ? 'favored' : ''} style={{ width: `${share.home}%` }} /></div>}
    </div>
  </Link>;
}

function cupRosterSlugs(cupId: string): LeagueSlug[] {
  if (cupId === 'jffl') return LEAGUES.map(league => league.slug);
  return LEAGUES.some(league => league.slug === cupId) ? [cupId as LeagueSlug] : [];
}

function rosterPlayers(slugs: LeagueSlug[], rosters: ReturnType<typeof useRosters>) {
  return Object.fromEntries(slugs.map(slug => [slug, rosters[slug]?.data?.players ?? null])) as Partial<Record<LeagueSlug, RosteredPlayer[] | null>>;
}

export function CupHubPage() {
  usePageLabel('Cups');
  const { data } = useCompetitionData();
  const rosterSlugs = cupRosterSlugs('jffl');
  const rosters = useRosters(rosterSlugs);
  const players = rosterPlayers(rosterSlugs, rosters);
  const rostersReady = rosterSlugs.every(slug => rosters[slug]?.data || rosters[slug]?.error);
  const jffl = buildCup('jffl', data);
  const live = jffl.rounds.flatMap(round => round.matches.flatMap((match, index) => match.status === 'live' ? [{ match, index, weeks: match.weeks, roundName: round.name }] : []));
  const roundNames = [...new Set(live.map(item => item.roundName))];
  const liveTitle = roundNames.length === 1 ? `JFFL Cup · ${roundNames[0] === 'Round 1' ? 'opening round' : roundNames[0]}` : 'JFFL Cup · live';
  return <><section className="page-intro"><div><p className="eyebrow">SEASON 25 <span>/</span> 2026 TOURNAMENTS</p><h1>The cups</h1><p className="intro-copy">The JFFL Cup, plus a cup in each league.</p></div></section><UpdateStrip data={data} />
    <div className="cup-tiles">{CUP_IDS.map(id => {
      const cup = buildCup(id, data);
      const rounds = cup.rounds;
      const active = rounds.find(round => round.matches.some(match => ['live','tied','unavailable'].includes(match.status))) ?? rounds.find(round => round.matches.some(match => match.status === 'waiting')) ?? rounds.at(-1)!;
      return <Link key={id} className={`cup-tile ${id}`} to={`/cups/${id}`}><p className="eyebrow">{id === 'jffl' ? 'TWO-WEEK TIES' : 'SINGLE-WEEK TIES'}</p><h2>{cup.name}</h2><p>{cup.champion ? <><span className={leagueInk(cup.champion.slug)}>{cup.champion.manager}</span> · Champion</> : `${active.name} · ${active.weeks.length > 1 ? 'Weeks' : 'Week'} ${active.weeks.join(' + ')}`}</p><span className="tile-link">Open bracket<ArrowUpRight size={17} /></span></Link>;
    })}</div>
    <details className="explainer"><summary>How the cups work</summary><p>Your ESPN score counts in your regular league matchup and in any cup tie scheduled for that week. JFFL Cup totals combine two weeks; league cups use one week. Scores retain each league’s scoring rules, even when the same NFL player appears on both sides.</p><p>Winners advance only after every scoring leg is final. A level tie plays again the next week, a second week in a league cup and a third week in the JFFL Cup. If that replay is also level, they settle it with an old fashioned duel.</p></details>
    {live.length > 0 && <><div className="section-heading"><h2>{liveTitle}</h2><Link className="text-link" to="/cups/jffl">All matchups<ArrowUpRight size={14} /></Link></div><div className="featured-cup-matches">{live.map(({ match, index, weeks }) => <MatchCard key={match.id} match={match} weeks={weeks} data={data} highlighted="" index={index} cupId="jffl" players={rostersReady ? players : null} />)}</div></>}
  </>;
}

function ManagerHighlight({ participants, highlighted, onChange }: { participants: { key: string; manager: string }[]; highlighted: string; onChange: (key: string) => void }) {
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const selected = participants.find(item => item.key === highlighted);
  const value = query ?? selected?.manager ?? '';
  const needle = value.trim().toLowerCase();
  const matches = [...participants].sort((a, b) => a.manager.localeCompare(b.manager)).filter(item => !query || item.manager.toLowerCase().includes(needle));
  const choose = (key: string) => { onChange(key); setQuery(null); setOpen(false); };
  return <div className="manager-highlight" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <label className="search-field">
      <Search size={16} />
      <input role="combobox" aria-expanded={open} aria-controls="manager-highlight-list" aria-autocomplete="list" aria-label="Highlight a manager" placeholder="Highlight a manager" value={value} onFocus={event => { setOpen(true); event.currentTarget.select(); }} onChange={event => { setQuery(event.target.value); setOpen(true); setActive(0); if (highlighted) onChange(''); }} onKeyDown={event => {
        if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); setActive(index => Math.min(index + 1, Math.max(matches.length - 1, 0))); }
        if (event.key === 'ArrowUp') { event.preventDefault(); setActive(index => Math.max(index - 1, 0)); }
        if (event.key === 'Enter' && open && matches[active]) { event.preventDefault(); choose(matches[active].key); }
        if (event.key === 'Escape') setOpen(false);
      }} />
      {value && <button type="button" className="highlight-clear" aria-label="Clear highlighted manager" onClick={() => { setQuery(''); onChange(''); setOpen(false); }}>Clear</button>}
    </label>
    {open && <ul id="manager-highlight-list" className="manager-suggestions" role="listbox">{matches.length ? matches.map((item, index) => <li key={item.key}><button type="button" role="option" aria-selected={item.key === highlighted} className={`${index === active ? 'active' : ''} ${leagueInk(item.key.split(':')[0])}`.trim()} onMouseEnter={() => setActive(index)} onClick={() => choose(item.key)}>{item.manager}</button></li>) : <li className="empty-inline">No managers match.</li>}</ul>}
  </div>;
}

export function CupPage() {
  const { cupId = 'jffl' } = useParams();
  const location = useLocation();
  const { data } = useCompetitionData();
  const [highlighted, setHighlighted] = useState('');
  const [selectedRound, setSelectedRound] = useState('all');
  useEffect(() => {
    const requested = new URLSearchParams(location.search).get('manager') ?? '';
    setHighlighted(MANAGERS.some(item => item.key === requested && (cupId === 'jffl' || item.slug === cupId)) ? requested : '');
  }, [cupId, location.search]);
  useEffect(() => { setSelectedRound('all'); }, [cupId]);
  const cup = CUP_IDS.includes(cupId as CupId) ? buildCup(cupId as CupId, data) : null;
  const rosterSlugs = cupRosterSlugs(cupId);
  const rosters = useRosters(rosterSlugs);
  const players = rosterPlayers(rosterSlugs, rosters);
  const rostersReady = rosterSlugs.every(slug => rosters[slug]?.data || rosters[slug]?.error);
  usePageLabel(cup?.name ?? null);
  if (!cup) return <p className="notice">Cup not found. <Link to="/cups">View all cups</Link></p>;
  const participants = MANAGERS.filter(item => cupId === 'jffl' || item.slug === cupId);
  const leagueCup = cupId !== 'jffl';
  const balanced = cup.rounds.every((round, index) => index === 0 || round.matches.length * 2 === cup.rounds[index - 1].matches.length);
  const tree = selectedRound === 'all' && (balanced || leagueCup);
  return <><section className="page-intro"><div><p className="eyebrow">2026 SEASON <span>/</span> KNOCKOUT TOURNAMENT</p><h1>{cup.name}</h1><p className="intro-copy">{cupId === 'jffl' ? 'Two-week aggregate scores. A tie plays a third week.' : 'One-week scores. A tie plays the next week. The top six seeds receive first-round byes.'}</p></div>{cup.champion && <span className={`champion-pill ${leagueInk(cup.champion.slug)}`}><Trophy size={20} />{cup.champion.manager}</span>}</section><UpdateStrip data={data} />
    <div className="bracket-controls"><ManagerHighlight participants={participants} highlighted={highlighted} onChange={setHighlighted} />{selectedRound !== 'all' && <button type="button" className="round-back" onClick={() => setSelectedRound('all')}>Full bracket</button>}</div>
    <div className={`bracket-scroll ${selectedRound !== 'all' ? 'single-round' : tree ? 'bracket-tree' : 'bracket-flow'}${leagueCup && tree ? ' league-bracket' : ''}`} tabIndex={0} role="region" aria-label={selectedRound === 'all' ? `${cup.name} full bracket. Scroll horizontally to see later rounds.` : `${cup.name} selected round`}><div className="bracket-columns">{cup.rounds.map((round, roundIndex) => {
      if (selectedRound !== 'all' && String(roundIndex) !== selectedRound) return null;
      const average = roundScoreAverage(round);
      return <section className="bracket-round" key={round.name}><header className="round-heading"><div><p className="eyebrow">{round.weeks.length>1?'WEEKS':'WEEK'} {round.weeks.join(' + ')}</p><h2>{selectedRound === 'all' ? <button type="button" className="round-jump" onClick={() => setSelectedRound(String(roundIndex))} aria-label={`Open ${round.name}`}>{round.name}<ArrowUpRight size={16} aria-hidden="true" /></button> : round.name}</h2></div><span>{average == null ? '— avg' : `${points(average)} avg`}</span></header><div className="round-matches">{(leagueCup && tree && roundIndex === 0 ? [round.matches[0] ?? null, null, null, round.matches[1] ?? null] : round.matches).map((match, index) => {
        if (!match) return <div className="bracket-slot bracket-spacer" key={`spacer-${index}`} aria-hidden="true" />;
        const matchIndex = leagueCup && roundIndex === 0 ? (index === 0 ? 0 : 1) : index;
        const board = selectedRound !== 'all' && match.status !== 'waiting';
        const card = <MatchCard key={tree ? undefined : match.id} match={match} weeks={match.weeks} data={data} highlighted={highlighted} index={matchIndex} layout={board ? 'board' : 'slot'} cupId={cupId} players={board ? (rostersReady ? players : null) : undefined} />;
        return tree ? <div className={`bracket-slot${leagueCup && roundIndex === 0 ? ' play-in' : ''}`} key={match.id}>{card}</div> : card;
      })}</div></section>;
    })}</div></div>
    <p className="source-note">Live and completed leg scores come from ESPN and refresh every three minutes. Missing or future scores remain blank. A level tie plays the next week. A second tie is an old fashioned duel.</p>
  </>;
}

function MatchIdentity({ participant, team, seed, title, align }: { participant: CupMatch['a']['participant']; team: { logoUrl?: string | null; name: string } | null; seed: number | null; title: string; align: 'left' | 'right' }) {
  return <div className={`match-id ${align}`}>
    {team?.logoUrl && <img className="matchup-logo" src={team.logoUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true; }} />}
    <div className="match-id-copy">
      {participant ? <Link className={`cup-manager ${leagueInk(participant.slug)}`} to={teamUrl(participant.slug, participant.teamId)}><span><RankMark value={seed} />{participant.manager}</span></Link> : <span className="muted cup-placeholder">{title}</span>}
      {participant && <small className="cup-team"><span className="cup-league">{LEAGUES.find(item => item.slug === participant.slug)?.name}</span> · {team?.name ?? 'Team data loading'}</small>}
    </div>
  </div>;
}

function StarterCompare({ sides }: { sides: { title: string; mark?: number | null; players: RosteredPlayer[]; message: string | null }[] }) {
  const [left, right] = sides;
  const count = Math.max(left.players.length, right.players.length);
  return <div className="starter-compare">
    <div className="starter-head"><p className={leagueInk(leagueOfManager(left.title))}><RankMark value={left.mark} />{left.title}</p><span /><span /><p className={leagueInk(leagueOfManager(right.title))}><RankMark value={right.mark} />{right.title}</p></div>
    <div className="starter-body">
      {(left.message || right.message) && <div className="starter-row starter-status"><p className="empty-inline">{left.message}</p><span /><span /><p className="empty-inline">{right.message}</p></div>}
      {Array.from({ length: count }, (_, index) => {
        const a = left.players[index];
        const b = right.players[index];
        return <div className="starter-row" key={a?.id ?? b?.id ?? index}>
          <div className="starter-id">{a && <PlayerIdentity player={a} injury={a.injuryStatus} />}</div>
          <StarterScore player={a} align="left" />
          <StarterScore player={b} align="right" />
          <div className="starter-id right">{b && <PlayerIdentity player={b} injury={b.injuryStatus} />}</div>
        </div>;
      })}
    </div>
  </div>;
}

function startersFor(players: RosteredPlayer[], teamId: string) {
  return players.filter(player => player.teamId === teamId && player.group === 'starter').sort(compareByLineup);
}

function benchFor(players: RosteredPlayer[], teamId: string) {
  return players.filter(player => player.teamId === teamId && player.group === 'bench').sort(compareByLineup);
}

function StarterScore({ player, align }: { player?: RosteredPlayer; align: 'left' | 'right' }) {
  if (!player) return <span className={`starter-score ${align}`} />;
  const yet = player.weekPoints == null && player.projectedPoints != null;
  const projected = player.projectedPoints != null ? points(player.projectedPoints) : null;
  return <span className={`starter-score ${align}${yet ? ' yet' : ''}`}>
    <strong>{points(player.weekPoints)}</strong>
    {projected != null && <small>{align === 'left' ? <>{yet && <span className="yet-label">Yet to play · </span>}proj {projected}</> : <>{projected} proj{yet && <span className="yet-label"> · Yet to play</span>}</>}</small>}
  </span>;
}

export function CupMatchPage() {
  const { cupId = '', matchId = '' } = useParams();
  const { data } = useCompetitionData();
  const valid = CUP_IDS.includes(cupId as CupId);
  const cup = valid ? buildCup(cupId as CupId, data) : null;
  const located = cup?.rounds.flatMap(round => round.matches.map((match, index) => ({ round, match, index }))).find(item => item.match.id === matchId) ?? null;
  const lineupSlugs = located && located.match.status !== 'bye'
    ? [...new Set((['a', 'b'] as const).flatMap(key => {
      const participant = located.match[key].participant;
      return participant ? [participant.slug] : [];
    }))]
    : [];
  const rosters = useRosters(lineupSlugs as LeagueSlug[]);
  const awayName = located?.match.a.participant?.manager ?? null;
  const homeName = located?.match.b.participant?.manager ?? null;
  usePageLabel(awayName && homeName ? `${awayName} vs ${homeName}` : cup?.name ?? null);
  if (!valid || !cup) return <p className="notice">Cup not found. <Link to="/cups">View all cups</Link></p>;
  if (!located) return <p className="notice">Match not found. <Link to={`/cups/${cupId}`}>Back to the bracket</Link></p>;
  const { round, match, index } = located;
  const status = match.status === 'tied' ? 'Old fashioned duel' : match.status === 'live' && match.replay ? 'Replay week' : { bye: 'Bye · advances', waiting: 'Upcoming', live: 'Live', final: 'Final', unavailable: 'Waiting for score data' }[match.status];
  const sideTitle = (side: CupMatch['a']) => side.participant?.manager ?? (match.status === 'bye' ? 'Bye' : feederLabel(side.label));
  const heading = match.status === 'bye' ? sideTitle(match.a.participant ? match.a : match.b) : `${sideTitle(match.a)} vs ${sideTitle(match.b)}`;
  const share = match.status === 'bye' ? null : totalShare(match.a.total, match.b.total);
  const sideProfile = (side: CupMatch['a']) => {
    const participant = side.participant;
    const team = participant ? data[participant.slug]?.teams.find(item => item.id === participant.teamId) ?? null : null;
    const seed = participant ? (match.id.startsWith('jffl-') ? participant.jfflSeed : participant.leagueSeed) : null;
    return { participant, team, seed, title: sideTitle(side), leading: side.total != null && (side === match.a ? match.b : match.a).total != null && side.total > (side === match.a ? match.b : match.a).total! };
  };
  const left = sideProfile(match.a);
  const right = sideProfile(match.b);
  const openMatch = match.status === 'live' || match.status === 'waiting';
  const rosterPending = openMatch && lineupSlugs.some(slug => !rosters[slug]?.data && !rosters[slug]?.error);
  const players = Object.fromEntries(lineupSlugs.map(slug => [slug, rosters[slug]?.data?.players ?? null])) as Partial<Record<LeagueSlug, RosteredPlayer[] | null>>;
  const chance = openMatch && !rosterPending ? cupMatchChance(match, data, players) : null;
  const odds = chance && chance !== 'level' ? chance : null;
  const oddsLabel = odds ? `${left.title} has a ${odds.left} percent chance to advance. ${right.title} has a ${odds.right} percent chance to advance. Finished weeks count as played. Each starter still to play uses an ESPN projection, widened by that player's weekly range.` : '';
  return <div className="match-sheet">
    <section className="page-intro"><div><p className="eyebrow">{cup.name.toUpperCase()} <span>/</span> {round.name.toUpperCase()} <span>/</span> MATCH {index + 1}</p><h1>{match.status === 'bye' ? <span className={leagueInk(left.participant?.slug ?? right.participant?.slug)}><RankMark value={(left.participant ? left : right).seed} />{heading}</span> : <><span className={leagueInk(left.participant?.slug)}><RankMark value={left.seed} />{sideTitle(match.a)}</span> vs <span className={leagueInk(right.participant?.slug)}><RankMark value={right.seed} />{sideTitle(match.b)}</span></>}</h1><p className="intro-copy">{match.status === 'bye' ? status : <>{weekPhrase(match.weeks)} · {status}{match.winner ? <> · <span className={leagueInk(match.winner.slug)}>{match.winner.manager}</span> advances</> : null}</>}</p></div></section>
    <UpdateStrip data={data} />
    {match.status === 'bye' ? <p className="source-note">{sideTitle(match.a.participant ? match.a : match.b)} has a bye in {round.name} and advances.</p> : <>
      <article className="match-board" aria-label={heading}>
        <div className="match-board-row">
          <MatchIdentity participant={left.participant} team={left.team} seed={left.seed} title={left.title} align="left" />
          <div className="match-center-score"><strong className={left.leading ? 'leading' : ''}>{points(match.a.total)}</strong><span aria-hidden="true">–</span><strong className={right.leading ? 'leading' : ''}>{points(match.b.total)}</strong></div>
          <MatchIdentity participant={right.participant} team={right.team} seed={right.seed} title={right.title} align="right" />
        </div>
        {odds ? <div className="cup-odds"><p className="cup-odds-read"><span className={odds.left > odds.right ? 'favored' : ''}>{odds.left}%</span><span className={odds.right > odds.left ? 'favored' : ''}>{odds.right}%</span></p><div className="win-bar" role="img" aria-label={oddsLabel}><span className={odds.left > odds.right ? 'favored' : ''} style={{ width: `${odds.left}%` }} /><span className={odds.right > odds.left ? 'favored' : ''} style={{ width: `${odds.right}%` }} /></div><p className="cup-odds-note">Chance to advance from the starters still to play. Finished weeks count as played. Each remaining projection is widened by that player’s weekly range.</p></div> : chance === 'level' ? <p className="cup-odds-note">Both lineups are done and the match is level.</p> : share && <div className="win-bar" role="img" aria-label={`${left.title} ${share.away} percent of the scored points. ${right.title} ${share.home} percent.`}><span className={share.away > share.home ? 'favored' : ''} style={{ width: `${share.away}%` }} /><span className={share.home > share.away ? 'favored' : ''} style={{ width: `${share.home}%` }} /></div>}
      </article>
      <section className="match-stats" aria-label="Score and season comparison">
        <table className="match-compare"><caption className="sr-only">Score and season comparison</caption><thead><tr><th scope="col"><span className="sr-only">Stat</span></th><th scope="col">{left.title}</th><th scope="col">{right.title}</th></tr></thead><tbody>
          {match.weeks.map((week, legIndex) => <tr key={week}><th scope="row">Week {week}{match.replay && week === match.weeks.at(-1) ? ' · replay' : ''}</th><td>{points(match.a.legs[legIndex])}</td><td>{points(match.b.legs[legIndex])}</td></tr>)}
          {match.weeks.length > 1 && <tr className="match-total"><th scope="row">Cup total</th><td>{points(match.a.total)}</td><td>{points(match.b.total)}</td></tr>}
          <tr><th scope="row">Record</th><td>{left.team ? record(left.team) : '—'}</td><td>{right.team ? record(right.team) : '—'}</td></tr>
          <tr><th scope="row">Avg / week</th><td>{points(weeklyAverage(left.team))}</td><td>{points(weeklyAverage(right.team))}</td></tr>
          <tr><th scope="row">League rank</th><td>{left.team?.rank != null ? `#${left.team.rank}` : '—'}</td><td>{right.team?.rank != null ? `#${right.team.rank}` : '—'}</td></tr>
        </tbody></table>
      </section>
      {match.weeks.map(week => <section className="match-lineups" key={week} aria-label={`Week ${week} starters`}><h2>Week {week} starters</h2><StarterCompare sides={([match.a, match.b] as const).map(side => {
        const participant = side.participant;
        const roster = participant ? rosters[participant.slug] : null;
        const current = participant ? data[participant.slug]?.week === week : false;
        const historical = !current && participant && roster?.data ? historicalStarters(roster.data.weeklyLineups, participant.teamId, week) : null;
        const players = current && roster?.data ? startersFor(roster.data.players, participant!.teamId) : historical ?? [];
        const message = !participant ? 'Opponent is not set yet.' : roster?.loading && !roster.data ? 'Loading starters…' : roster?.error && !roster.data ? 'Starter list is unavailable.' : !current && historical === null ? 'Starter scores for this week are not in the latest snapshot yet.' : players.length ? null : 'No starters in this snapshot.';
        return { title: sideTitle(side), mark: side.participant ? (cupId === 'jffl' ? side.participant.jfflSeed : side.participant.leagueSeed) : null, players, message };
      })} /></section>)}
    </>}
  </div>;
}

export function LeagueMatchPage() {
  const { slug = '', matchId = '' } = useParams();
  const meta = LEAGUES.find(league => league.slug === slug);
  const summaries = useSummaries();
  const summaryState = meta ? summaries[meta.slug] : undefined;
  const data = summaryState?.data;
  const rosters = useRosters(meta ? [meta.slug] : []);
  const scoreboard = data?.matchups.find(item => item.id === matchId);
  const weekly = data?.weeklyMatchups?.find(item => item.id === matchId) ?? data?.weeklyMatchups?.find(item => scoreboard && item.week === data.week && item.homeTeamId === scoreboard.homeTeamId && item.awayTeamId === scoreboard.awayTeamId);
  const matched = scoreboard ?? weekly;
  const managerName = (id: string | null) => id && meta ? managerFor(meta.slug, id)?.manager ?? null : null;
  const awayLabel = matched ? managerName(matched.awayTeamId) : null;
  const homeLabel = matched ? managerName(matched.homeTeamId) : null;
  usePageLabel(awayLabel && homeLabel ? `${awayLabel} vs ${homeLabel}` : null);
  if (!meta) return <p className="notice">League not found. <Link to="/">All leagues</Link></p>;
  if (!data) return <p className="notice">{summaryState?.error ? 'League data is temporarily unavailable.' : 'Loading league data…'}</p>;
  const matchup = matched;
  if (!matchup) return <p className="notice">Match not found. <Link to={`/league/${slug}`}>Back to {meta.name}</Link></p>;
  const week = weekly?.week ?? data.week;
  const decided = weekly ? weekly.status === 'final' : week < data.week;
  const upcoming = !decided && week > data.week;
  const roster = rosters[meta.slug];
  const side = (teamId: string | null, score: number | null, projected: number | null) => {
    const team = teamId ? data.teams.find(item => item.id === teamId) ?? null : null;
    return { teamId, team, manager: team ? managerFor(meta.slug, team.id)?.manager ?? team.name : 'Bye', score, projected };
  };
  const away = side(matchup.awayTeamId, matchup.awayScore, matchup.awayProjected);
  const home = side(matchup.homeTeamId, matchup.homeScore, matchup.homeProjected);
  const heading = `${away.manager} vs ${home.manager}`;
  const chance = decided ? null : projectedWinChance(home.projected, away.projected);
  const share = pointShare(away.score, home.score);
  const bar = chance ? { left: chance.away, right: chance.home, label: `From ESPN projected totals. ${away.manager} ${chance.away} percent. ${home.manager} ${chance.home} percent.` } : share ? { left: share.left, right: share.right, label: `${away.manager} ${share.left} percent of the scored points. ${home.manager} ${share.right} percent.` } : null;
  const leading = (score: number | null, opponent: number | null) => score != null && opponent != null && score > opponent;
  const starters = (teamId: string | null, manager: string, mark: number | null) => {
    if (!teamId) return { title: manager, mark, players: [] as RosteredPlayer[], message: 'Bye' };
    if (roster?.loading && !roster.data) return { title: manager, mark, players: [] as RosteredPlayer[], message: 'Loading starters…' };
    if (roster?.error && !roster.data) return { title: manager, mark, players: [] as RosteredPlayer[], message: 'Starter list is unavailable.' };
    const current = data.week === week;
    if (current && roster?.data) {
      const players = startersFor(roster.data.players, teamId);
      return { title: manager, mark, players, message: players.length ? null : 'No starters in this snapshot.' };
    }
    const historical = roster?.data ? historicalStarters(roster.data.weeklyLineups, teamId, week) : null;
    if (historical === null) return { title: manager, mark, players: [] as RosteredPlayer[], message: 'Starter scores for this week are not in the latest snapshot yet.' };
    return { title: manager, mark, players: historical, message: historical.length ? null : 'No starters in this snapshot.' };
  };
  const bench = (teamId: string | null, manager: string, mark: number | null) => {
    if (!teamId) return { title: manager, mark, players: [] as RosteredPlayer[], message: 'Bye' };
    if (roster?.loading && !roster.data) return { title: manager, mark, players: [] as RosteredPlayer[], message: 'Loading bench…' };
    if (roster?.error && !roster.data) return { title: manager, mark, players: [] as RosteredPlayer[], message: 'Bench is unavailable.' };
    const players = roster?.data ? benchFor(roster.data.players, teamId) : [];
    return { title: manager, mark, players, message: players.length ? null : 'No bench players in this snapshot.' };
  };
  const identity = (entry: typeof away, align: 'left' | 'right') => <div className={`match-id ${align}`}>
    {entry.team?.logoUrl && <img className="matchup-logo" src={entry.team.logoUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true; }} />}
    <div className="match-id-copy">
      {entry.team ? <Link className={`cup-manager ${leagueInk(meta.slug)}`} to={teamUrl(meta.slug, entry.team.id)}><span><RankMark value={entry.team.rank} />{entry.manager}</span></Link> : <span className="muted">Bye</span>}
      {entry.team && <small className="cup-team">{entry.team.name}</small>}
    </div>
  </div>;
  return <div className="match-sheet">
    <section className="page-intro"><div><p className="eyebrow">{meta.name.toUpperCase()} <span>/</span> WEEK {week}</p><h1>{away.team ? <Link className={leagueInk(meta.slug)} to={teamUrl(meta.slug, away.team.id)}><RankMark value={away.team.rank} />{away.manager}</Link> : away.manager} vs {home.team ? <Link className={leagueInk(meta.slug)} to={teamUrl(meta.slug, home.team.id)}><RankMark value={home.team.rank} />{home.manager}</Link> : home.manager}</h1><p className="intro-copy">{decided ? 'Final' : upcoming ? 'Upcoming' : 'Live'} league matchup</p></div></section>
    <p className="competition-updates">{summaryState ? <Fresh data={data} error={summaryState.error} /> : null}</p>
    <article className="match-board" aria-label={heading}>
      <div className="match-board-row">
        {identity(away, 'left')}
        <div className="match-center-score"><strong className={leading(away.score, home.score) ? 'leading' : ''}>{points(away.score)}</strong><span aria-hidden="true">–</span><strong className={leading(home.score, away.score) ? 'leading' : ''}>{points(home.score)}</strong></div>
        {identity(home, 'right')}
      </div>
      {bar && <div className="win-bar" role="img" aria-label={bar.label}><span className={bar.left > bar.right ? 'favored' : ''} style={{ width: `${bar.left}%` }} /><span className={bar.right > bar.left ? 'favored' : ''} style={{ width: `${bar.right}%` }} /></div>}
    </article>
    <section className="match-stats" aria-label="Score and season comparison">
      <table className="match-compare"><caption className="sr-only">Score and season comparison</caption><thead><tr><th scope="col"><span className="sr-only">Stat</span></th><th scope="col">{away.manager}</th><th scope="col">{home.manager}</th></tr></thead><tbody>
        <tr><th scope="row">Week {week}</th><td>{points(away.score)}</td><td>{points(home.score)}</td></tr>
        {(away.projected != null || home.projected != null) && <tr><th scope="row">Projected</th><td>{points(away.projected)}</td><td>{points(home.projected)}</td></tr>}
        <tr><th scope="row">Record</th><td>{away.team ? record(away.team) : '—'}</td><td>{home.team ? record(home.team) : '—'}</td></tr>
        <tr><th scope="row">Avg / week</th><td>{points(weeklyAverage(away.team))}</td><td>{points(weeklyAverage(home.team))}</td></tr>
        <tr><th scope="row">League rank</th><td>{away.team?.rank != null ? `#${away.team.rank}` : '—'}</td><td>{home.team?.rank != null ? `#${home.team.rank}` : '—'}</td></tr>
      </tbody></table>
    </section>
    {upcoming
      ? <p className="notice">Week {week} has not started. Scores, projections, and starters appear once it is the current week.</p>
      : <>
        <section className="match-lineups" aria-label={`Week ${week} starters`}><h2>Week {week} starters</h2><StarterCompare sides={[starters(away.teamId, away.manager, away.team?.rank ?? null), starters(home.teamId, home.manager, home.team?.rank ?? null)]} /></section>
        {data.week === week && <section className="match-lineups" aria-label={`Week ${week} bench`}><h2>Week {week} bench</h2><StarterCompare sides={[bench(away.teamId, away.manager, away.team?.rank ?? null), bench(home.teamId, home.manager, home.team?.rank ?? null)]} /></section>}
      </>}
  </div>;
}

function pointShare(left: number | null, right: number | null) {
  if (left == null || right == null || left + right <= 0) return null;
  const share = Math.round((left / (left + right)) * 100);
  return { left: share, right: 100 - share };
}

export function LeagueStandingsCard({ meta, teams, updated, error = false }: { meta: (typeof LEAGUES)[number]; teams: Team[]; updated?: LeagueSummary; error?: boolean }) {
  return <section className={`surface season-league ${meta.slug}`}><div className="surface-heading"><h2 className={`league-label ${meta.slug}`}><Link to={`/league/${meta.slug}`}>{meta.name}</Link></h2>{updated && <Fresh data={updated} error={error} />}</div><div className="table-scroll" tabIndex={0} role="region" aria-label={`${meta.name} detailed standings`}><table className="commissioner-table"><thead><tr><th>#</th><th>Manager / team</th><th>Record</th><th>Points</th><th>Per week</th><th>P. Against</th><th>Week Δ</th><th>Start Δ</th><th>Draft Δ</th></tr></thead><tbody>{teams.map(team=>{
    const profile=managerFor(meta.slug,team.id);
    const rank=team.rank;
    const weekChange=team.previousRank&&rank?team.previousRank-rank:null;
    const startChange=profile&&rank?profile.leagueSeed-rank:null;
    const draftChange=(team.draftRank??profile?.draftRank)&&rank?(team.draftRank??profile!.draftRank)-rank:null;
    const zone=provisionalZone(meta.slug,rank);
    const zoneClass=zone.includes('Relegation')?'danger':zone.includes('promotion')?'promotion':'';
    return <tr key={team.id}><td className="rank"><span className="rank-with-zone"><span>{rank??'—'}</span><span className={`zone-dot ${zoneClass}`} title={zone} role="img" aria-label={zone} /></span></td><td><div className="manager-cell"><Link className={`manager-link ${leagueInk(meta.slug)}`} to={teamUrl(meta.slug,team.id)}>{profile?.manager??team.name}</Link><span className="muted team-subline"><TeamIdentity team={team}/></span></div></td><td className="numeric">{record(team)}</td><td className="numeric emphasis">{points(team.pointsFor)}</td><td className="numeric">{points(weeklyAverage(team))}</td><td className="numeric muted">{points(team.pointsAgainst)}</td>{[weekChange,startChange,draftChange].map((change,index)=><td key={index} className={`numeric rank-change ${change!==null&&change>0?'up':change!==null&&change<0?'down':''}`}>{delta(change)}</td>)}</tr>;
  })}</tbody></table></div>{!teams.length&&<p className="empty-inline">No teams match your search.</p>}</section>;
}

export function SeasonPage() {
  usePageLabel('Standings');
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
      return <LeagueStandingsCard key={meta.slug} meta={meta} teams={teams} />;
    })}
    <details className="explainer"><summary>Rank movement, promotion & relegation</summary><p>Week Δ compares the latest completed standings with the previous completed week. Start Δ compares today’s rank with the preseason order. Draft Δ compares it with the draft-day rank. Positive numbers mean a climb.</p><p>Promotion and relegation bands are provisional: Premier’s top six are in the safety zone; Championship and League One’s top four occupy promotion bands; Premier and Championship’s bottom four occupy relegation bands. Trophy-based automatic promotions and saved relegations can change the final allocation.</p></details>
  </>;
}

function WeekNav({ week, count, onChange }: { week: number; count: number; onChange: (week: number) => void }) {
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    list.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }, [week]);
  if (count < 1) return null;
  return <div className="week-nav" role="group" aria-label="Choose week">
    <button type="button" className="week-nav-step" aria-label="Previous week" disabled={week <= 1} onClick={() => onChange(week - 1)}><ChevronLeft size={18} aria-hidden="true" /></button>
    <div className="week-nav-weeks" ref={list}>{Array.from({ length: count }, (_, index) => {
      const value = index + 1;
      return <button type="button" key={value} aria-pressed={value === week} aria-label={`Week ${value}`} onClick={() => onChange(value)}>{value}</button>;
    })}</div>
    <button type="button" className="week-nav-step" aria-label="Next week" disabled={week >= count} onClick={() => onChange(week + 1)}><ChevronRight size={18} aria-hidden="true" /></button>
  </div>;
}

function groupStandouts(rows: { player: RosteredPlayer; slug: LeagueSlug }[]) {
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const spots = groups.get(row.player.id) ?? [];
    spots.push(row);
    groups.set(row.player.id, spots);
  }
  return [...groups.values()].map(spots => {
    const ordered = [...spots].sort((a, b) => LEAGUES.findIndex(meta => meta.slug === a.slug) - LEAGUES.findIndex(meta => meta.slug === b.slug));
    const score = Math.max(...ordered.map(spot => spot.player.weekPoints ?? 0));
    const player = ordered.find(spot => spot.player.weekPoints === score)?.player ?? ordered[0].player;
    return { player, score, spots: ordered };
  }).sort((a, b) => b.score - a.score || a.player.name.localeCompare(b.player.name)).slice(0, 12);
}

function standoutGroups(states: ReturnType<typeof useRosters>, group: 'starter' | 'bench', week: number, currentWeek: number) {
  if (week === currentWeek) {
    return groupStandouts(LEAGUES.flatMap(meta => (states[meta.slug]?.data?.players ?? []).filter(player => player.group === group && player.weekPoints != null).map(player => ({ player, slug: meta.slug }))));
  }
  return groupStandouts(LEAGUES.flatMap(meta => {
    const roster = states[meta.slug]?.data;
    if (!roster) return [];
    const teamIds = [...new Set((roster.weeklyLineups ?? []).filter(lineup => lineup.week === week).map(lineup => lineup.teamId))];
    return teamIds.flatMap(teamId => (rosterForWeek(roster.weeklyLineups, roster.players, teamId, week) ?? [])
      .filter(player => player.group === group && player.weekPoints != null)
      .map(player => ({ player, slug: meta.slug })));
  }));
}

function lineupSwings(states: ReturnType<typeof useRosters>, matchups: readonly { id: string; slug: LeagueSlug; status: string; homeTeamId: string | null; awayTeamId: string | null; homeScore: number | null; awayScore: number | null }[], week: number | null) {
  const rows: (LineupSwing & { wouldScore: number; slug: LeagueSlug; matchId: string; final: boolean; teamId: string; opponentId: string; opponentScore: number })[] = [];
  for (const match of matchups) {
    if (match.homeScore == null || match.awayScore == null || !match.homeTeamId || !match.awayTeamId) continue;
    const roster = states[match.slug]?.data;
    const players = roster?.players ?? [];
    const rosterSide = (teamId: string) => week == null
      ? players.filter(player => player.teamId === teamId)
      : rosterForWeek(roster?.weeklyLineups, players, teamId, week) ?? [];
    const home = rosterSide(match.homeTeamId);
    const away = rosterSide(match.awayTeamId);
    for (const side of [
      { teamId: match.homeTeamId, score: match.homeScore, opponentId: match.awayTeamId, opponentScore: match.awayScore, team: home, opponent: away },
      { teamId: match.awayTeamId, score: match.awayScore, opponentId: match.homeTeamId, opponentScore: match.homeScore, team: away, opponent: home },
    ]) {
      const swing = lineupWouldWin(side.team, side.opponent, side.score, side.opponentScore);
      if (!swing) continue;
      rows.push({ ...swing, wouldScore: swing.score, score: side.score, slug: match.slug, matchId: match.id, final: match.status === 'final', teamId: side.teamId, opponentId: side.opponentId, opponentScore: side.opponentScore });
    }
  }
  return rows.sort((a, b) => LEAGUES.findIndex(meta => meta.slug === a.slug) - LEAGUES.findIndex(meta => meta.slug === b.slug) || (a.opponentScore - a.score) - (b.opponentScore - b.score) || (managerFor(a.slug, a.teamId)?.manager ?? '').localeCompare(managerFor(b.slug, b.teamId)?.manager ?? ''));
}

function sideTeam(data: SummaryMap, slug: string, id: string | null) {
  if (!id) return null;
  return data[slug as LeagueSlug]?.teams.find(team => team.id === id) ?? null;
}

function TeamMark({ logoUrl }: { logoUrl?: string | null }) {
  if (!logoUrl) return null;
  return <img className="team-logo" src={logoUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true; }} />;
}

function WeekFace({ data, slug, id, score }: { data: SummaryMap; slug: string; id: string; score: number }) {
  const team = sideTeam(data, slug, id);
  return <Link className="week-face" to={teamUrl(slug, id)}>
    <TeamMark logoUrl={team?.logoUrl} />
    <span className="week-who">
      <span className={`week-name ${leagueInk(slug)}`}>{managerFor(slug, id)?.manager ?? 'Team'}</span>
      {team?.name && <span className="week-team">{team.name}</span>}
    </span>
    <strong>{points(score)}</strong>
  </Link>;
}

function WeekPair({ data, slug, id, homeId, awayId, homeScore, awayScore }: { data: SummaryMap; slug: string; id: string; homeId: string | null; awayId: string | null; homeScore: number | null; awayScore: number | null }) {
  const sides = [
    { id: homeId, score: homeScore },
    { id: awayId, score: awayScore },
  ].sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  return <Link className="week-pair" to={`/league/${slug}/match/${id}`}>
    {sides.map(side => {
      const team = sideTeam(data, slug, side.id);
      const leading = side.score != null && sides[0].score != null && side.score === sides[0].score && sides[0].score !== sides[1].score;
      return <span key={side.id ?? 'bye'}>
        <TeamMark logoUrl={team?.logoUrl} />
        <span className="week-who">
          <span className={`week-name ${side.id ? leagueInk(slug) : ''}`}><RankMark value={team?.rank} />{side.id ? managerFor(slug, side.id)?.manager ?? 'Team' : 'Bye'}</span>
          {team?.name && <span className="week-team">{team.name}</span>}
        </span>
        <b className={leading ? 'leading' : ''}>{points(side.score)}</b>
      </span>;
    })}
  </Link>;
}

function SwapPlayer({ player, tone }: { player: LineupMove; tone: 'in' | 'out' }) {
  const headshot = playerHeadshotUrl(player);
  const portrait = headshot ?? (player.proTeam ? nflLogoUrl(player.proTeam) : null);
  const meta = [player.proTeam, player.position].filter(Boolean).join(' · ');
  return <Link className={`swap-player swap-${tone}`} to={`/players/${player.id}`}>
    <span className="swap-photo">{portrait && <img className={headshot ? 'player-headshot' : 'nfl-portrait'} src={portrait} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true; }} />}</span>
    <span className="swap-copy">
      <span className="swap-name">{player.name}</span>
      {meta && <small>{meta}</small>}
    </span>
    <b>{points(player.points)}</b>
  </Link>;
}

function StandoutBoard({ title, rows, ready, empty = 'No scores yet.' }: { title: string; rows: ReturnType<typeof standoutGroups>; ready: boolean; empty?: string }) {
  const leagueName = (slug: string) => LEAGUES.find(meta => meta.slug === slug)?.name ?? slug;
  return <section className="surface standouts week-board">
    <div className="surface-heading"><h2>{title}</h2></div>
    {!ready ? <p className="empty-inline">Loading lineups…</p> : rows.length ? <div className="table-scroll"><table><thead><tr><th>Player</th><th>Points</th><th>Manager</th></tr></thead><tbody>{rows.map(({ player, score, spots }) => <tr key={player.id}><td><PlayerIdentity player={player} injury={player.injuryStatus} /></td><td className="numeric emphasis">{points(score)}</td><td><div className="standout-managers">{spots.map(spot => <Link key={spot.slug} className={leagueInk(spot.slug)} to={teamUrl(spot.slug, spot.player.teamId)}>{managerFor(spot.slug, spot.player.teamId)?.manager ?? 'Team'}<span className="sr-only">, {leagueName(spot.slug)}</span></Link>)}</div></td></tr>)}</tbody></table></div> : <p className="empty-inline">{empty}</p>}
  </section>;
}

function ResultSlate({ title, ink, games, empty }: { title: string; ink: string; empty: string; games: { key: string; href: string; upset: boolean; span: string | null; sides: { key: string; name: string; slug: string; mark: number | null; score: number | null; logoUrl: string | null; projected: number | null; miss: boolean; leading: boolean; trailing: boolean }[] }[] }) {
  const upsets = games.filter(game => game.upset).length;
  const spans = [...new Set(games.map(game => game.span).filter((span): span is string => !!span))];
  const split = games.length >= 8;
  return <section className="surface week-board result-slate">
    <div className="surface-heading"><h2 className={ink}>{title}</h2>{upsets > 0 && <span>{upsets === 1 ? '1 upset' : `${upsets} upsets`}</span>}</div>
    {spans.length === 1 && <p className="result-span">{spans[0]}</p>}
    {games.length ? <ul className={split ? 'result-games split' : 'result-games'} style={split ? { '--rows': Math.ceil(games.length / 2) } as React.CSSProperties : undefined}>{games.map(game => <li key={game.key} className="result-game"><Link to={game.href}>{game.sides.map((side, index) => <span className="result-side" key={side.key}><span className="result-logo">{side.logoUrl && <TeamMark logoUrl={side.logoUrl} />}</span><span className={`result-name ${side.slug ? leagueInk(side.slug) : ''}`}><RankMark value={side.mark} />{side.name}</span><span className="result-meta">{game.upset && index === 0 && <span className="upset-tag">Upset</span>}{side.miss && side.projected != null && <span className="result-proj">proj {points(side.projected)}</span>}</span><b className={side.leading ? 'leading' : side.trailing ? 'trailing' : ''} aria-label={side.miss && side.projected != null ? `${points(side.score)}, projected ${points(side.projected)}` : undefined}>{points(side.score)}</b></span>)}</Link></li>)}</ul> : <p className="empty-inline">{empty}</p>}
  </section>;
}

function resultSides(home: { key: string; id: string | null; slug: string; score: number | null; projected: number | null; mark: number | null; logoUrl: string | null }, away: typeof home, missKey: string | null) {
  const sides = [home, away].sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.key.localeCompare(b.key));
  const leader = sides[0].score;
  const trailer = sides[1].score;
  const decided = leader != null && trailer != null && leader !== trailer;
  return sides.map(side => ({
    key: side.key,
    name: side.id ? managerFor(side.slug, side.id)?.manager ?? 'Team' : 'Bye',
    slug: side.id ? side.slug : '',
    mark: side.mark,
    score: side.score,
    logoUrl: side.logoUrl,
    projected: side.projected,
    miss: side.key === missKey,
    leading: decided && side.score === leader,
    trailing: decided && side.score === trailer,
  }));
}

function leagueResultGames(data: SummaryMap, slug: LeagueSlug, week: number) {
  const summary = data[slug];
  return (summary?.weeklyMatchups ?? []).filter(item => item.week === week).map(matchup => {
    const rank = (id: string | null) => id ? summary?.teams.find(team => team.id === id)?.rank ?? null : null;
    const logo = (id: string | null) => id ? summary?.teams.find(team => team.id === id)?.logoUrl ?? null : null;
    const final = matchup.status === 'final';
    const miss = final ? projectionUpset(matchup.homeScore, matchup.awayScore, matchup.homeProjected, matchup.awayProjected) : null;
    return {
      key: matchup.id,
      href: `/league/${slug}/match/${matchup.id}`,
      upset: miss !== null,
      span: null,
      sides: resultSides(
        { key: 'home', id: matchup.homeTeamId, slug, score: matchup.homeScore, projected: matchup.homeProjected, mark: rank(matchup.homeTeamId), logoUrl: logo(matchup.homeTeamId) },
        { key: 'away', id: matchup.awayTeamId, slug, score: matchup.awayScore, projected: matchup.awayProjected, mark: rank(matchup.awayTeamId), logoUrl: logo(matchup.awayTeamId) },
        miss === 'left' ? 'home' : miss === 'right' ? 'away' : null,
      ),
    };
  });
}

function cupProjection(data: SummaryMap, slug: LeagueSlug, teamId: string, weeks: number[]) {
  let total = 0;
  for (const week of weeks) {
    const matchup = data[slug]?.weeklyMatchups?.find(item => item.week === week && (item.homeTeamId === teamId || item.awayTeamId === teamId));
    const projected = !matchup || matchup.status !== 'final' ? null : matchup.homeTeamId === teamId ? matchup.homeProjected : matchup.awayProjected;
    if (projected == null) return null;
    total += projected;
  }
  return Math.round(total * 100) / 100;
}

function cupResultGames(data: SummaryMap, cupId: CupId, week: number) {
  const cup = buildCup(cupId, data);
  return cup.rounds.flatMap(round => round.matches.filter(match => match.status !== 'bye' && match.weeks.includes(week)).map(match => {
    const side = (key: string, participant: CupMatch['a']['participant'], score: number | null, seed: number | null) => {
      const slug = participant?.slug ?? 'premier';
      const id = participant?.teamId ?? null;
      return {
        key, id, slug: participant?.slug ?? '', score, mark: seed,
        projected: participant ? cupProjection(data, participant.slug, participant.teamId, match.weeks) : null,
        logoUrl: id ? sideTeam(data, slug, id)?.logoUrl ?? null : null,
        name: participant?.manager ?? '',
      };
    };
    const left = side('a', match.a.participant, match.a.total, cupSeed(cupId, match.a.participant));
    const right = side('b', match.b.participant, match.b.total, cupSeed(cupId, match.b.participant));
    const miss = match.status === 'final' ? projectionUpset(left.score, right.score, left.projected, right.projected) : null;
    const named = resultSides(
      { key: left.key, id: left.id, slug: left.slug || 'premier', score: left.score, projected: left.projected, mark: left.mark, logoUrl: left.logoUrl },
      { key: right.key, id: right.id, slug: right.slug || 'premier', score: right.score, projected: right.projected, mark: right.mark, logoUrl: right.logoUrl },
      miss === 'left' ? 'a' : miss === 'right' ? 'b' : null,
    ).map(item => item.key === 'a' && !match.a.participant ? { ...item, name: match.a.label || 'TBD', slug: '' } : item.key === 'b' && !match.b.participant ? { ...item, name: match.b.label || 'TBD', slug: '' } : item);
    return {
      key: match.id,
      href: `/cups/${cupId}/match/${match.id}`,
      upset: miss !== null,
      span: match.weeks.length > 1 ? `Weeks ${match.weeks.join(' + ')}` : null,
      sides: named,
    };
  }));
}

export function WeeklyPage() {
  usePageLabel('Weekly roundup');
  const { data } = useCompetitionData();
  const currentWeek=Math.max(0,...Object.values(data).map(summary=>summary?.week??0));
  const [selectedWeek,setSelectedWeek]=useState(0);
  const week=selectedWeek||currentWeek;
  const showWeek=(value: number)=>setSelectedWeek(value>=currentWeek?0:value);
  const states=useRosters(LEAGUES.map(meta=>meta.slug));
  const matchups=LEAGUES.flatMap(meta=>(data[meta.slug]?.weeklyMatchups??[]).filter(item=>item.week===week).map(item=>({...item,slug:meta.slug})));
  const scores=matchups.flatMap(matchup=>[[matchup.homeTeamId,matchup.homeScore,matchup.awayScore],[matchup.awayTeamId,matchup.awayScore,matchup.homeScore]].filter(([id,score])=>id!==null&&score!==null).map(([id,score,opponent])=>({id:String(id),score:Number(score),opponent:opponent as number|null,slug:matchup.slug,final:matchup.status==='final'}))).sort((a,b)=>b.score-a.score);
  const margins=matchups.filter(matchup=>matchup.homeScore!==null&&matchup.awayScore!==null&&matchup.homeScore!==matchup.awayScore).map(matchup=>({...matchup,margin:Math.abs(matchup.homeScore!-matchup.awayScore!)})).sort((a,b)=>a.margin-b.margin);
  const winners=scores.filter(row=>row.opponent!==null&&row.score>row.opponent).sort((a,b)=>a.score-b.score);
  const losers=scores.filter(row=>row.opponent!==null&&row.score<row.opponent).sort((a,b)=>b.score-a.score);
  const hundred=scores.filter(row=>row.score>=100);
  const allFinal=matchups.length===15&&matchups.every(matchup=>matchup.status==='final');
  const peak=scores[0]?.score??0;
  const leagueName=(slug: string)=>LEAGUES.find(meta=>meta.slug===slug)?.name??slug;
  const past=week!==currentWeek&&week>0;
  const standouts=standoutGroups(states, 'starter', week, currentWeek);
  const bench=standoutGroups(states, 'bench', week, currentWeek);
  const swings=lineupSwings(states, matchups, past?week:null);
  const rostersReady=LEAGUES.every(meta=>!!states[meta.slug]?.data);
  const lineupsReady=!past||LEAGUES.some(meta=>states[meta.slug]?.data?.weeklyLineups?.some(lineup=>lineup.week===week));
  const missingLineups='Lineups for this week aren\'t in the latest snapshot yet.';
  const leagueSlates=LEAGUES.map(meta=>({title:meta.name,ink:leagueInk(meta.slug),games:leagueResultGames(data,meta.slug,week),empty:'No matchups this week.'}));
  const cupSlates=CUP_IDS.map(id=>({title:buildCup(id,data).name,ink:leagueInk(id),games:cupResultGames(data,id,week),empty:'No matches this week.'}));
  return <><SectionNav/><section className="page-intro"><div><p className="eyebrow">2026 SEASON <span>/</span> WEEKLY ROUNDUP</p><h1>Week {week||'—'}</h1><p className="intro-copy">{allFinal?'Final ESPN scores and scoring extremes.':'Live scores. Leads and scoring extremes remain provisional.'}</p></div><WeekNav week={week} count={currentWeek} onChange={showWeek} /></section><UpdateStrip data={data}/>
    <div className="recap-metrics week-recap">
      <article><p className="eyebrow">High scorer</p>{scores[0] ? <WeekFace data={data} slug={scores[0].slug} id={scores[0].id} score={scores[0].score} /> : <strong>—</strong>}{scores[0] && <span className={`league-label ${scores[0].slug}`}>{leagueName(scores[0].slug)}</span>}</article>
      <article><p className="eyebrow">{allFinal ? 'Lowest-scoring winner' : 'Lowest leading score'}</p>{winners[0] ? <WeekFace data={data} slug={winners[0].slug} id={winners[0].id} score={winners[0].score} /> : <strong>—</strong>}{winners[0] && <span className={`league-label ${winners[0].slug}`}>{leagueName(winners[0].slug)}</span>}</article>
      <article><p className="eyebrow">{allFinal ? 'Highest-scoring loser' : 'Highest trailing score'}</p>{losers[0] ? <WeekFace data={data} slug={losers[0].slug} id={losers[0].id} score={losers[0].score} /> : <strong>—</strong>}{losers[0] && <span className={`league-label ${losers[0].slug}`}>{leagueName(losers[0].slug)}</span>}</article>
      <article><header className="week-card-head"><p className="eyebrow">Smallest {allFinal ? 'winning margin' : 'margin'}</p><strong>{margins[0] ? `${points(margins[0].margin)} pts` : '—'}</strong></header>{margins[0] && <WeekPair data={data} slug={margins[0].slug} id={margins[0].id} homeId={margins[0].homeTeamId} awayId={margins[0].awayTeamId} homeScore={margins[0].homeScore} awayScore={margins[0].awayScore} />}</article>
      <article><header className="week-card-head"><p className="eyebrow">Largest {allFinal ? 'blowout' : 'lead'}</p><strong>{margins.at(-1) ? `${points(margins.at(-1)!.margin)} pts` : '—'}</strong></header>{margins.at(-1) && <WeekPair data={data} slug={margins.at(-1)!.slug} id={margins.at(-1)!.id} homeId={margins.at(-1)!.homeTeamId} awayId={margins.at(-1)!.awayTeamId} homeScore={margins.at(-1)!.homeScore} awayScore={margins.at(-1)!.awayScore} />}</article>
      <article className="week-club-card"><header className="week-card-head"><p className="eyebrow">100+ club</p><span>{hundred.length} {hundred.length === 1 ? 'team' : 'teams'}</span></header><ul className="week-club">{hundred.map(row => {
        const team = sideTeam(data, row.slug, row.id);
        return <li key={`${row.slug}-${row.id}`}><Link to={teamUrl(row.slug, row.id)}>
          <TeamMark logoUrl={team?.logoUrl} />
          <span className="week-who">
            <span className={`week-name ${leagueInk(row.slug)}`}>{managerFor(row.slug, row.id)?.manager ?? 'Team'}</span>
            {team?.name && <span className="week-team">{team.name}</span>}
          </span>
          <b>{points(row.score)}</b>
        </Link></li>;
      })}</ul></article>
    </div>
    <div className="week-slates">
      <div className="week-slate-row">{leagueSlates.map(slate => <ResultSlate key={slate.title} {...slate} />)}</div>
      {cupSlates.some(slate => slate.games.length > 0) && <div className="week-slate-row week-slate-cups">{cupSlates.filter(slate => slate.games.length > 0).map(slate => <ResultSlate key={slate.title} {...slate} />)}</div>}
      {cupSlates.some(slate => slate.games.length === 0) && <p className="result-note">{cupSlates.every(slate => slate.games.length === 0) ? 'No cup matches this week.' : <>No matches this week: {cupSlates.filter(slate => slate.games.length === 0).map((slate, index) => <span key={slate.title}>{index > 0 && ', '}<span className={slate.ink}>{slate.title}</span></span>)}.</>}</p>}
      <p className="result-note">An upset is a final result flipped by a score at least 15 points off its ESPN projection.</p>
    </div>
    <section className="surface week-board could-have-board"><div className="surface-heading"><h2>Could have had ’em</h2></div><p className="could-note">Hindsight is always 20/20. The fewest start and bench moves that turn a loss or a tie into a win.</p>{!rostersReady?<p className="empty-inline">Loading lineups…</p>:!lineupsReady?<p className="empty-inline">{missingLineups}</p>:swings.length?<ul className="could-have">{swings.map(swing=>{
      const manager=managerFor(swing.slug, swing.teamId)?.manager??'Team';
      const opponent=managerFor(swing.slug, swing.opponentId)?.manager??'Team';
      return <li key={`${swing.slug}-${swing.teamId}`}>
        <div className="could-match">
          <Link className={`could-manager ${leagueInk(swing.slug)}`} to={teamUrl(swing.slug, swing.teamId)}>{manager}</Link>
          <Link className="could-score" to={`/league/${swing.slug}/match/${swing.matchId}`}><span className="could-result could-result-old"><strong>{points(swing.score)}</strong>–{points(swing.opponentScore)}</span><span className="could-arrow" aria-hidden="true">→</span><span className="could-result could-result-new"><strong>{points(swing.wouldScore)}</strong>–{points(swing.opponentScore)}</span><span className="sr-only"> against {opponent}</span></Link>
          <p className="could-against">vs <Link className={leagueInk(swing.slug)} to={teamUrl(swing.slug, swing.opponentId)}>{opponent}</Link></p>
        </div>
        {swing.swaps.map(swap => <div className="swap-row" key={`${swap.start.id}-${swap.sit.id}`}><SwapPlayer player={swap.sit} tone="out" /><span className="swap-arrow" aria-hidden="true">→</span><span className="sr-only"> could have started </span><SwapPlayer player={swap.start} tone="in" /></div>)}
      </li>;
    })}</ul>:<p className="empty-inline">No one was a move or two away.</p>}</section>
    <section className="surface week-board"><div className="surface-heading"><h2>Scoring leaderboard</h2></div><div className="table-scroll" tabIndex={0} role="region" aria-label="Weekly scoring leaderboard"><table className="week-leaderboard"><thead><tr><th>#</th><th>Manager</th><th>Points</th><th>Matchup</th></tr></thead><tbody>{scores.map((row, index) => {
      const ahead = row.opponent !== null && row.score > row.opponent;
      const behind = row.opponent !== null && row.score < row.opponent;
      const result = row.opponent === null ? '—' : !ahead && !behind ? row.final ? 'Tie' : 'Level' : ahead ? row.final ? 'Won' : 'Leading' : row.final ? 'Lost' : 'Trailing';
      return <tr key={`${row.slug}-${row.id}`}><td className="rank">{index + 1}</td><td><Link className={`manager-link team-identity league-ink ${row.slug}`} to={teamUrl(row.slug, row.id)}><TeamMark logoUrl={sideTeam(data, row.slug, row.id)?.logoUrl} />{managerFor(row.slug, row.id)?.manager ?? 'Team'}<span className="sr-only">, {leagueName(row.slug)}</span></Link></td><td className="week-points"><span className="week-score"><span className="numeric emphasis">{points(row.score)}{row.score >= 100 && <span className="hundred-tag">100+</span>}</span><span className="week-bar" data-league={row.slug} aria-hidden="true"><span style={{ width: peak > 0 ? `${Math.round(row.score / peak * 100)}%` : '0%' }} /></span></span></td><td className={ahead ? 'week-result win' : behind ? 'week-result loss' : 'muted'}>{result}</td></tr>;
    })}</tbody></table></div></section>
    <StandoutBoard title="Top starting-player performances" rows={standouts} ready={rostersReady} empty={lineupsReady ? undefined : missingLineups} />
    <StandoutBoard title="Top bench performances" rows={bench} ready={rostersReady} empty={lineupsReady ? undefined : missingLineups} />
    <p className="source-note">The smallest margin excludes tied games. Completed weeks use ESPN’s corrected scores; live-week winners and losers are shown as leaders and trailers.</p>
  </>;
}

function HistoryBoard({ rows, view }: { rows: ManagerReference[]; view: 'trophies' | 'cup' }) {
  const dark = useDarkMode();
  const option = useMemo(() => {
    const { theme } = chartTheme(dark);
    const leagueName = (slug: string) => LEAGUES.find(meta => meta.slug === slug)?.name ?? slug;
    const colorAt = (slug: string) => theme.palette[slug === 'premier' ? 0 : slug === 'championship' ? 1 : 2];
    return horizontalBars(dark, rows.map(item => `${item.manager}`), rows.map(item => {
      if (view === 'cup') {
        const decided = item.cupWins + item.cupLosses;
        const win = decided ? Math.round(item.cupWins / decided * 1000) / 10 : 0;
        return {
          value: win, color: colorAt(item.slug), url: teamUrl(item.slug, item.teamId),
          tip: `<b>${esc(item.manager)}</b> · ${esc(leagueName(item.slug))}<br/>${item.cupRank ? `All-time rank ${item.cupRank}` : 'Rookie'} · avg finish ${item.cupRank ? item.cupAverageFinish : '—'}<br/>${item.cupWins}–${item.cupLosses}${decided ? ` · ${win}%` : ''}<br/>${item.cupTitles} cup titles · 2026 seed ${item.jfflSeed}`,
        };
      }
      const rate = item.seasons > 1 ? Math.round(item.trophies / (item.seasons - 1) * 10) / 10 : null;
      return {
        value: item.trophies, color: colorAt(item.slug), url: teamUrl(item.slug, item.teamId),
        tip: `<b>${esc(item.manager)}</b> · ${esc(leagueName(item.slug))}<br/>${item.trophies} trophies · ${item.finals} finals<br/>2025: ${item.trophies2025} · 2021+: ${item.trophies2021} · 2013+: ${item.trophies2013}<br/>${item.seasons} seasons${rate === null ? '' : ` · ${rate} per season`}`,
      };
    }), { max: view === 'cup' ? 100 : undefined, visible: 14 });
  }, [dark, rows, view]);
  if (!rows.length) return null;
  const summary = view === 'cup'
    ? `JFFL Cup win percentage for ${rows.length} managers.`
    : `All-time trophies for ${rows.length} managers. Bar color is the league.`;
  return <ArchiveChart option={option} summary={summary} height={Math.min(560, Math.max(240, 48 + Math.min(rows.length, 14) * 32))} />;
}

function moveUp(slug: LeagueSlug) {
  if (slug === 'championship') return 'Premier';
  if (slug === 'league-one') return 'Championship';
  return null;
}

function teamLogo(data: SummaryMap, slug: LeagueSlug, teamId: string) {
  return data[slug]?.teams.find(team => team.id === teamId)?.logoUrl;
}

function RaceCard({ league, href, logoUrl, kicker, name, stat, unit, when, up }: {
  league: 'jffl' | LeagueSlug; href: string; logoUrl?: string | null; kicker: string; name: string; stat?: string; unit?: string; when?: string; up?: string | null;
}) {
  return <Link className="trophy-race" data-league={league} to={href}>
    {logoUrl && <img className="trophy-logo" src={logoUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true; }} />}
    <span className="trophy-copy">
      <span className="eyebrow">{kicker}</span>
      <strong className={leagueInk(name ? leagueOfManager(name) : null)}>{name}</strong>
      {up && <span className="trophy-up">To {up}</span>}
    </span>
    {when ? <span className="trophy-when">{when}</span> : <span className="trophy-stat">{stat}{unit && <small>{unit}</small>}</span>}
  </Link>;
}

function seasonRecord(row: { wins: number; losses: number; ties: number }) {
  return `${row.wins}–${row.losses}${row.ties ? `–${row.ties}` : ''}`;
}

function SeasonRaces({ data }: { data: SummaryMap }) {
  return <section className="trophy-races" aria-labelledby="season-races">
    <header className="trophy-intro">
      <h2 id="season-races">This season</h2>
      <p>Leaders so far. The name becomes the champion once that race is finished.</p>
    </header>
    <div className="trophy-group">
      <header className="trophy-group-head"><h3>Cups</h3><p>Knockout brackets</p></header>
      <div className="trophy-row trophy-row-4">{CUP_IDS.map(id => {
        const cup = buildCup(id, data);
        const champion = cup.champion;
        return <RaceCard key={id} league={id} href={`/cups/${id}`}
          logoUrl={champion ? teamLogo(data, champion.slug, champion.teamId) : null}
          kicker={champion ? 'Champion' : 'In progress'}
          name={champion ? champion.manager : cup.name}
          stat={champion ? 'Won' : undefined}
          when={champion ? undefined : id === 'jffl' ? 'Weeks 15–16 final' : 'Week 11 final'}
          up={id === 'jffl' ? 'Premier' : null} />;
      })}</div>
    </div>
    <div className="trophy-group">
      <header className="trophy-group-head"><h3>Best record</h3><p>Season title</p></header>
      <div className="trophy-row">{LEAGUES.map(meta => {
        const summary = data[meta.slug];
        const leader = summary?.teams.slice().sort((a, b) => (a.regularSeasonRank ?? a.rank ?? 99) - (b.regularSeasonRank ?? b.rank ?? 99))[0];
        const row = summary && leader ? regularSeason(summary).find(item => item.teamId === leader.id && item.games > 0) : undefined;
        const done = (summary?.completedWeeks ?? 0) >= 14;
        const week = summary?.completedWeeks || summary?.week || 0;
        return <RaceCard key={meta.slug} league={meta.slug} href="/summary"
          logoUrl={leader ? teamLogo(data, meta.slug, leader.id) : null}
          kicker={meta.name}
          name={leader ? managerFor(meta.slug, leader.id)?.manager ?? 'Team' : 'No scores yet'}
          stat={row ? seasonRecord(row) : '—'}
          unit={row ? done ? 'champion' : `week ${week || '—'}` : undefined}
          up={moveUp(meta.slug)} />;
      })}</div>
    </div>
    <div className="trophy-group">
      <header className="trophy-group-head"><h3>Most points</h3><p>Scoring title</p></header>
      <div className="trophy-row">{LEAGUES.map(meta => {
        const summary = data[meta.slug];
        const leader = summary ? regularSeason(summary).filter(item => item.games > 0).sort((a, b) => b.points - a.points)[0] : undefined;
        return <RaceCard key={meta.slug} league={meta.slug} href="/summary"
          logoUrl={leader ? teamLogo(data, meta.slug, leader.teamId) : null}
          kicker={meta.name}
          name={leader ? managerFor(meta.slug, leader.teamId)?.manager ?? 'Team' : 'No scores yet'}
          stat={leader ? points(leader.points) : '—'}
          unit={leader ? 'points' : undefined} />;
      })}</div>
    </div>
    <div className="trophy-group">
      <header className="trophy-group-head"><h3>Superbowl</h3><p>Playoff after week 14</p></header>
      <div className="trophy-row">{LEAGUES.map(meta => {
        const summary = data[meta.slug];
        const winner = summary?.teams.find(team => team.finalStanding === 1);
        const started = (summary?.completedWeeks ?? 0) >= 14;
        const name = winner ? managerFor(meta.slug, winner.id)?.manager ?? 'Team' : null;
        return <RaceCard key={meta.slug} league={meta.slug} href={`/league/${meta.slug}`}
          logoUrl={winner ? teamLogo(data, meta.slug, winner.id) : null}
          kicker={meta.name}
          name={name ?? (started ? 'Bracket pending' : 'Not started')}
          stat={name ? 'Won' : 'Top 8'}
          up={moveUp(meta.slug)} />;
      })}</div>
    </div>
  </section>;
}

export function HistoryPage() {
  usePageLabel('Trophies & history');
  const { data }=useCompetitionData();
  const [view,setView]=useState<'trophies'|'cup'>('trophies');
  const [search,setSearch]=useState('');
  const [league,setLeague]=useState('all');
  const [sort,setSort]=useState<'default'|'manager'>('default');
  const rows=MANAGERS.filter(item=>(league==='all'||item.slug===league)&&item.manager.toLowerCase().includes(search.toLowerCase())).sort((a,b)=>sort==='manager'?a.manager.localeCompare(b.manager):view==='trophies'?b.trophies-a.trophies:(a.cupRank||99)-(b.cupRank||99));
  const trophies=MANAGERS.reduce((sum,item)=>sum+item.trophies,0);
  const finals=MANAGERS.reduce((sum,item)=>sum+item.finals,0);
  return <><SectionNav/><section className="page-intro"><div><p className="eyebrow">25 SEASONS <span>/</span> JFFL’S TROPHY ROOM</p><h1>Trophies & history</h1><p className="intro-copy">Who is leading this season, then the trophy history underneath.</p></div></section><UpdateStrip data={data}/>
    <SeasonRaces data={data} />
    <div className="section-heading"><h2>Historical leaderboard</h2><Link to="/archive">Archive</Link></div><div className="archive-stats"><span><strong>{trophies}</strong> total trophies</span><span><strong>{finals}</strong> finals appearances</span><span><strong>30</strong> current managers</span></div><section className="surface"><div className="history-tabs" role="group" aria-label="Historical table"><button className={view==='trophies'?'active':''} aria-pressed={view==='trophies'} onClick={()=>setView('trophies')}>Trophy history</button><button className={view==='cup'?'active':''} aria-pressed={view==='cup'} onClick={()=>setView('cup')}>JFFL Cup history</button></div><div className="filters"><label className="search-field"><Search size={17}/><input aria-label="Search historical managers" placeholder="Search managers" value={search} onChange={event=>setSearch(event.target.value)}/></label><select aria-label="Historical league" value={league} onChange={event=>setLeague(event.target.value)}><option value="all">All leagues</option>{LEAGUES.map(meta=><option key={meta.slug} value={meta.slug}>{meta.name}</option>)}</select><button className="sort-button" aria-label="Toggle historical sort" onClick={()=>setSort(sort==='default'?'manager':'default')}><ArrowUpDown size={16}/>{sort==='manager'?'Name':'Rank'}</button></div><HistoryBoard rows={rows} view={view} />{!rows.length&&<p className="empty-inline">No managers match your filters.</p>}</section>
    <p className="source-note">Trophy counts, finals, and cup records run through 2025. This season’s cup results are in the live brackets. Trophy rate excludes the current unfinished season.</p>
    <div className="section-heading"><h2>From the first draft to season 25</h2></div><ol className="history-timeline">{TIMELINE.map(event=><li key={event.year}><span>{event.year}</span><div><h3>{event.title}</h3><p>{event.detail}</p></div></li>)}</ol>
  </>;
}
