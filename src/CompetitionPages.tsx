import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useParams } from 'react-router-dom';
import { ArrowUpRight, Trophy, Search, ArrowUpDown } from 'lucide-react';
import { useRosters, useSummaries } from './data';
import { LEAGUES, type LeagueSlug, type LeagueSummary, type RosteredPlayer, type Team } from './types';
import { MANAGERS, TIMELINE, managerFor } from './reference';
import { buildCup, provisionalZone, regularSeason, roundScoreAverage, type CupId, type CupMatch, type SummaryMap } from './competitions';
import { Fresh, points, record } from './ui';
import { projectedWinChance } from './projections';
import { TeamIdentity } from './TeamIdentity';
import { PlayerIdentity } from './PlayerIdentity';
import { historicalStarters } from './lineups';

const SLOT_ORDER = ['QB', 'RB', 'WR', 'TE', 'RB/WR/TE', 'FLEX', 'D/ST', 'K'];
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

function SectionNav() {
  return <nav className="section-nav" aria-label="Season pages"><NavLink to="/summary">Standings</NavLink><NavLink to="/weekly">Weekly roundup</NavLink><NavLink to="/history">Trophies & history</NavLink></nav>;
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

function feederLabel(label: string) {
  const parsed = /^Winner of (.+) (\d+)$/.exec(label);
  if (!parsed) return label || 'TBD';
  const round = parsed[1].replace(/^Round /, 'R').replace('Quarterfinals', 'QF').replace('Semifinals', 'SF').replace('First round', 'R1');
  return `${round} · Match ${parsed[2]}`;
}

export function MatchCard({ match, weeks, data, highlighted, index, layout = 'board', cupId }: { match: CupMatch; weeks: number[]; data: SummaryMap; highlighted: string; index: number; layout?: 'board' | 'slot'; cupId: string }) {
  const status = { bye:'Bye · advances', waiting:'', live:'', final:'Final', tied:'Awaiting commissioner decision', unavailable:'Waiting for score data' }[match.status];
  const selected = highlighted && [match.a.participant?.key, match.b.participant?.key].includes(highlighted);
  const share = match.status === 'bye' ? null : totalShare(match.a.total, match.b.total);
  const sideName = (side: CupMatch['a']) => side.participant?.manager ?? (side.label || 'TBD');
  const label = `Cup matchup ${index + 1}, weeks ${weeks.join(' and ')}. ${sideName(match.a)} ${match.status === 'bye' ? 'bye' : points(match.a.total)}. ${sideName(match.b)} ${match.status === 'bye' ? 'bye' : points(match.b.total)}.`;
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
        <span className="bracket-seed">{seed ?? ''}</span>
        {team?.logoUrl ? <img className="bracket-logo" src={team.logoUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true; }} /> : <span className="bracket-logo" aria-hidden="true" />}
        <span className="bracket-name">{name}{winner && <span className="sr-only"> · Advances</span>}</span>
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
              {participant ? <span className="cup-manager"><span className="cup-seed">{match.id.startsWith('jffl-') ? participant.jfflSeed : participant.leagueSeed}</span>{participant.manager}{winner && <span className="sr-only"> · Advances</span>}</span> : <span className="muted cup-placeholder">{side.label || 'TBD'}</span>}
              {participant && <small className="cup-team"><span className="cup-league">{LEAGUES.find(item => item.slug === participant.slug)?.name}</span> · {team?.name ?? 'Team data loading'}</small>}
              <strong className="score">{match.status === 'bye' ? '—' : points(side.total)}</strong>
              {weeks.length > 1 && match.status !== 'bye' && <small className="proj-line">{weeks.map((week, legIndex) => `W${week} ${points(side.legs[legIndex])}`).join(' · ')}</small>}
            </div>
          </div>;
        })}
      </div>
      {share && <div className="win-bar" role="img" aria-label={`${sideName(match.a)} ${share.away} percent of the scored points. ${sideName(match.b)} ${share.home} percent.`}><span className={share.away > share.home ? 'favored' : ''} style={{ width: `${share.away}%` }} /><span className={share.home > share.away ? 'favored' : ''} style={{ width: `${share.home}%` }} /></div>}
    </div>
  </Link>;
}

export function CupHubPage() {
  const { data } = useCompetitionData();
  return <><section className="page-intro"><div><p className="eyebrow">SEASON 25 <span>/</span> 2026 TOURNAMENTS</p><h1>The cups</h1><p className="intro-copy">Four brackets. One set of live JFFL scores.</p></div></section><UpdateStrip data={data} />
    <div className="cup-tiles">{CUP_IDS.map(id => {
      const cup = buildCup(id, data);
      const rounds = cup.rounds;
      const active = rounds.find(round => round.matches.some(match => ['live','tied','unavailable'].includes(match.status))) ?? rounds.find(round => round.matches.some(match => match.status === 'waiting')) ?? rounds.at(-1)!;
      return <Link key={id} className={`cup-tile ${id}`} to={`/cups/${id}`}><p className="eyebrow">{id === 'jffl' ? 'TWO-WEEK TIES' : 'SINGLE-WEEK TIES'}</p><h2>{cup.name}</h2><p>{cup.champion ? `${cup.champion.manager} · Champion` : `${active.name} · ${active.weeks.length > 1 ? 'Weeks' : 'Week'} ${active.weeks.join(' + ')}`}</p><span className="tile-link">Open bracket<ArrowUpRight size={17} /></span></Link>;
    })}</div>
    <details className="explainer"><summary>How the cups work</summary><p>Your ESPN score counts in your regular league matchup and in any cup tie scheduled for that week. JFFL Cup totals combine two weeks; league cups use one week. Scores retain each league’s scoring rules, even when the same NFL player appears on both sides.</p><p>Seeds and bracket positions follow Jason’s 2026 Week 2 PDF. Winners advance only after every scoring leg is final. A tied total waits for the commissioner’s decision.</p></details>
    <div className="section-heading"><h2>JFFL Cup · opening round</h2><Link className="text-link" to="/cups/jffl">All matchups<ArrowUpRight size={14} /></Link></div><div className="featured-cup-matches">{buildCup('jffl', data).rounds[0].matches.slice(-4).map((match,index) => <MatchCard key={match.id} match={match} weeks={[3,4]} data={data} highlighted="" index={index + 12} cupId="jffl" />)}</div>
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
    {open && <ul id="manager-highlight-list" className="manager-suggestions" role="listbox">{matches.length ? matches.map((item, index) => <li key={item.key}><button type="button" role="option" aria-selected={item.key === highlighted} className={index === active ? 'active' : ''} onMouseEnter={() => setActive(index)} onClick={() => choose(item.key)}>{item.manager}</button></li>) : <li className="empty-inline">No managers match.</li>}</ul>}
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
  if (!CUP_IDS.includes(cupId as CupId)) return <p className="notice">Cup not found. <Link to="/cups">View all cups</Link></p>;
  const cup = buildCup(cupId as CupId, data);
  const participants = MANAGERS.filter(item => cupId === 'jffl' || item.slug === cupId);
  const leagueCup = cupId !== 'jffl';
  const balanced = cup.rounds.every((round, index) => index === 0 || round.matches.length * 2 === cup.rounds[index - 1].matches.length);
  const tree = selectedRound === 'all' && (balanced || leagueCup);
  return <><Link className="back-link" to="/cups">← All cups</Link><section className="page-intro"><div><p className="eyebrow">2026 SEASON <span>/</span> KNOCKOUT TOURNAMENT</p><h1>{cup.name}</h1><p className="intro-copy">{cupId === 'jffl' ? 'Two-week aggregate scores. Jeff and Jason receive first-round byes.' : 'One-week scores. The top six seeds receive first-round byes.'}</p></div>{cup.champion && <span className="champion-pill"><Trophy size={20} />{cup.champion.manager}</span>}</section><UpdateStrip data={data} />
    <div className="bracket-controls"><ManagerHighlight participants={participants} highlighted={highlighted} onChange={setHighlighted} />{selectedRound !== 'all' && <button type="button" className="round-back" onClick={() => setSelectedRound('all')}>Full bracket</button>}</div>
    <div className={`bracket-scroll ${selectedRound !== 'all' ? 'single-round' : tree ? 'bracket-tree' : 'bracket-flow'}${leagueCup && tree ? ' league-bracket' : ''}`} tabIndex={0} role="region" aria-label={selectedRound === 'all' ? `${cup.name} full bracket. Scroll horizontally to see later rounds.` : `${cup.name} selected round`}><div className="bracket-columns">{cup.rounds.map((round, roundIndex) => {
      if (selectedRound !== 'all' && String(roundIndex) !== selectedRound) return null;
      const average = roundScoreAverage(round);
      return <section className="bracket-round" key={round.name}><header className="round-heading"><div><p className="eyebrow">{round.weeks.length>1?'WEEKS':'WEEK'} {round.weeks.join(' + ')}</p><h2>{selectedRound === 'all' ? <button type="button" className="round-jump" onClick={() => setSelectedRound(String(roundIndex))} aria-label={`Open ${round.name}`}>{round.name}<ArrowUpRight size={16} aria-hidden="true" /></button> : round.name}</h2></div><span>{average == null ? '— avg' : `${points(average)} avg`}</span></header><div className="round-matches">{(leagueCup && tree && roundIndex === 0 ? [round.matches[0] ?? null, null, null, round.matches[1] ?? null] : round.matches).map((match, index) => {
        if (!match) return <div className="bracket-slot bracket-spacer" key={`spacer-${index}`} aria-hidden="true" />;
        const matchIndex = leagueCup && roundIndex === 0 ? (index === 0 ? 0 : 1) : index;
        const card = <MatchCard key={tree ? undefined : match.id} match={match} weeks={round.weeks} data={data} highlighted={highlighted} index={matchIndex} layout={selectedRound === 'all' || match.status === 'waiting' ? 'slot' : 'board'} cupId={cupId} />;
        return tree ? <div className={`bracket-slot${leagueCup && roundIndex === 0 ? ' play-in' : ''}`} key={match.id}>{card}</div> : card;
      })}</div></section>;
    })}</div></div>
    <p className="source-note">Bracket source: Jason’s Week 2 PDF. Live and completed leg scores: ESPN, refreshed every three minutes. Missing or future scores remain blank. Ties await commissioner decision.</p>
  </>;
}

function MatchIdentity({ participant, team, seed, title, align }: { participant: CupMatch['a']['participant']; team: { logoUrl?: string | null; name: string } | null; seed: number | null; title: string; align: 'left' | 'right' }) {
  return <div className={`match-id ${align}`}>
    {team?.logoUrl && <img className="matchup-logo" src={team.logoUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true; }} />}
    <div className="match-id-copy">
      {participant ? <Link className="cup-manager" to={teamUrl(participant.slug, participant.teamId)}><span className="cup-seed">{seed}</span>{participant.manager}</Link> : <span className="muted cup-placeholder">{title}</span>}
      {participant && <small className="cup-team"><span className="cup-league">{LEAGUES.find(item => item.slug === participant.slug)?.name}</span> · {team?.name ?? 'Team data loading'}</small>}
    </div>
  </div>;
}

function StarterCompare({ sides }: { sides: { title: string; players: RosteredPlayer[]; message: string | null }[] }) {
  const [left, right] = sides;
  const count = Math.max(left.players.length, right.players.length);
  return <div className="starter-compare">
    <div className="starter-head"><p>{left.title}</p><span /><span /><p>{right.title}</p></div>
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

function weeklyAverage(team: { pointsFor: number | null; wins: number | null; losses: number | null; ties: number | null } | null) {
  if (!team || team.pointsFor == null || team.wins == null || team.losses == null || team.ties == null) return null;
  const games = team.wins + team.losses + team.ties;
  return games > 0 ? team.pointsFor / games : null;
}

function startersFor(players: RosteredPlayer[], teamId: string) {
  return players.filter(player => player.teamId === teamId && player.group === 'starter').sort((a, b) => {
    const slot = (player: RosteredPlayer) => { const index = SLOT_ORDER.indexOf(player.slot); return index === -1 ? SLOT_ORDER.length : index; };
    return slot(a) - slot(b) || a.name.localeCompare(b.name);
  });
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
  if (!valid || !cup) return <p className="notice">Cup not found. <Link to="/cups">View all cups</Link></p>;
  if (!located) return <p className="notice">Match not found. <Link to={`/cups/${cupId}`}>Back to the bracket</Link></p>;
  const { round, match, index } = located;
  const status = { bye: 'Bye · advances', waiting: 'Upcoming', live: 'Live', final: 'Final', tied: 'Awaiting commissioner decision', unavailable: 'Waiting for score data' }[match.status];
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
  return <div className="match-sheet">
    <Link className="back-link" to={`/cups/${cupId}`}>← {cup.name}</Link>
    <section className="page-intro"><div><p className="eyebrow">{cup.name.toUpperCase()} <span>/</span> {round.name.toUpperCase()} <span>/</span> MATCH {index + 1}</p><h1>{heading}</h1><p className="intro-copy">{match.status === 'bye' ? status : `${round.weeks.length > 1 ? `Weeks ${round.weeks.join(' and ')}` : `Week ${round.weeks[0]}`} · ${status}${match.winner ? ` · ${match.winner.manager} advances` : ''}`}</p></div></section>
    <UpdateStrip data={data} />
    {match.status === 'bye' ? <p className="source-note">{sideTitle(match.a.participant ? match.a : match.b)} has a bye in {round.name} and advances.</p> : <>
      <article className="match-board" aria-label={heading}>
        <div className="match-board-row">
          <MatchIdentity participant={left.participant} team={left.team} seed={left.seed} title={left.title} align="left" />
          <div className="match-center-score"><strong className={left.leading ? 'leading' : ''}>{points(match.a.total)}</strong><span aria-hidden="true">–</span><strong className={right.leading ? 'leading' : ''}>{points(match.b.total)}</strong></div>
          <MatchIdentity participant={right.participant} team={right.team} seed={right.seed} title={right.title} align="right" />
        </div>
        {share && <div className="win-bar" role="img" aria-label={`${left.title} ${share.away} percent of the scored points. ${right.title} ${share.home} percent.`}><span className={share.away > share.home ? 'favored' : ''} style={{ width: `${share.away}%` }} /><span className={share.home > share.away ? 'favored' : ''} style={{ width: `${share.home}%` }} /></div>}
      </article>
      <section className="match-stats" aria-label="Score and season comparison">
        <table className="match-compare"><caption className="sr-only">Score and season comparison</caption><thead><tr><th scope="col"><span className="sr-only">Stat</span></th><th scope="col">{left.title}</th><th scope="col">{right.title}</th></tr></thead><tbody>
          {round.weeks.map((week, legIndex) => <tr key={week}><th scope="row">Week {week}</th><td>{points(match.a.legs[legIndex])}</td><td>{points(match.b.legs[legIndex])}</td></tr>)}
          {round.weeks.length > 1 && <tr className="match-total"><th scope="row">Cup total</th><td>{points(match.a.total)}</td><td>{points(match.b.total)}</td></tr>}
          <tr><th scope="row">Record</th><td>{left.team ? record(left.team) : '—'}</td><td>{right.team ? record(right.team) : '—'}</td></tr>
          <tr><th scope="row">Avg / week</th><td>{points(weeklyAverage(left.team))}</td><td>{points(weeklyAverage(right.team))}</td></tr>
          <tr><th scope="row">League rank</th><td>{left.team?.rank != null ? `#${left.team.rank}` : '—'}</td><td>{right.team?.rank != null ? `#${right.team.rank}` : '—'}</td></tr>
        </tbody></table>
      </section>
      {round.weeks.map(week => <section className="match-lineups" key={week} aria-label={`Week ${week} starters`}><h2>Week {week} starters</h2><StarterCompare sides={([match.a, match.b] as const).map(side => {
        const participant = side.participant;
        const roster = participant ? rosters[participant.slug] : null;
        const current = participant ? data[participant.slug]?.week === week : false;
        const historical = !current && participant && roster?.data ? historicalStarters(roster.data.weeklyLineups, participant.teamId, week) : null;
        const players = current && roster?.data ? startersFor(roster.data.players, participant!.teamId) : historical ?? [];
        const message = !participant ? 'Opponent is not set yet.' : roster?.loading && !roster.data ? 'Loading starters…' : roster?.error && !roster.data ? 'Starter list is unavailable.' : !current && historical === null ? 'Starter scores for this week are not in the latest snapshot yet.' : players.length ? null : 'No starters in this snapshot.';
        return { title: sideTitle(side), players, message };
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
  if (!meta) return <p className="notice">League not found. <Link to="/">All leagues</Link></p>;
  if (!data) return <p className="notice">{summaryState?.error ? 'League data is temporarily unavailable.' : 'Loading league data…'}</p>;
  const scoreboard = data.matchups.find(item => item.id === matchId);
  const weekly = data.weeklyMatchups?.find(item => item.id === matchId) ?? data.weeklyMatchups?.find(item => scoreboard && item.week === data.week && item.homeTeamId === scoreboard.homeTeamId && item.awayTeamId === scoreboard.awayTeamId);
  const matchup = scoreboard ?? weekly;
  if (!matchup) return <p className="notice">Match not found. <Link to={`/league/${slug}`}>Back to {meta.name}</Link></p>;
  const week = weekly?.week ?? data.week;
  const decided = weekly ? weekly.status === 'final' : week < data.week;
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
  const starters = (teamId: string | null, manager: string) => {
    if (!teamId) return { title: manager, players: [] as RosteredPlayer[], message: 'Bye' };
    if (roster?.loading && !roster.data) return { title: manager, players: [] as RosteredPlayer[], message: 'Loading starters…' };
    if (roster?.error && !roster.data) return { title: manager, players: [] as RosteredPlayer[], message: 'Starter list is unavailable.' };
    const current = data.week === week;
    if (current && roster?.data) {
      const players = startersFor(roster.data.players, teamId);
      return { title: manager, players, message: players.length ? null : 'No starters in this snapshot.' };
    }
    const historical = roster?.data ? historicalStarters(roster.data.weeklyLineups, teamId, week) : null;
    if (historical === null) return { title: manager, players: [] as RosteredPlayer[], message: 'Starter scores for this week are not in the latest snapshot yet.' };
    return { title: manager, players: historical, message: historical.length ? null : 'No starters in this snapshot.' };
  };
  const identity = (entry: typeof away, align: 'left' | 'right') => <div className={`match-id ${align}`}>
    {entry.team?.logoUrl && <img className="matchup-logo" src={entry.team.logoUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true; }} />}
    <div className="match-id-copy">
      {entry.team ? <Link className="cup-manager" to={teamUrl(meta.slug, entry.team.id)}>{entry.manager}</Link> : <span className="muted">Bye</span>}
      {entry.team && <small className="cup-team">{entry.team.name}</small>}
    </div>
  </div>;
  return <div className="match-sheet">
    <Link className="back-link" to={`/league/${slug}`}>← {meta.name}</Link>
    <section className="page-intro"><div><p className="eyebrow">{meta.name.toUpperCase()} <span>/</span> WEEK {week}</p><h1>{heading}</h1><p className="intro-copy">{decided ? 'Final' : 'Live'} league matchup</p></div></section>
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
    <section className="match-lineups" aria-label={`Week ${week} starters`}><h2>Week {week} starters</h2><StarterCompare sides={[starters(away.teamId, away.manager), starters(home.teamId, home.manager)]} /></section>
  </div>;
}

function pointShare(left: number | null, right: number | null) {
  if (left == null || right == null || left + right <= 0) return null;
  const share = Math.round((left / (left + right)) * 100);
  return { left: share, right: 100 - share };
}

export function LeagueStandingsCard({ meta, teams, updated, error = false }: { meta: (typeof LEAGUES)[number]; teams: Team[]; updated?: LeagueSummary; error?: boolean }) {
  return <section className={`surface season-league ${meta.slug}`}><div className="surface-heading"><h2 className={`league-label ${meta.slug}`}><Link to={`/league/${meta.slug}`}>{meta.name}</Link></h2>{updated && <Fresh data={updated} error={error} />}</div><div className="table-scroll" tabIndex={0} role="region" aria-label={`${meta.name} detailed standings`}><table className="commissioner-table"><thead><tr><th>#</th><th>Manager / team</th><th>Record</th><th>Points</th><th>Per week</th><th>P. Against</th><th>Week Δ</th><th>Start Δ</th><th>Draft Δ</th><th>Current zone</th></tr></thead><tbody>{teams.map(team=>{
    const profile=managerFor(meta.slug,team.id);
    const rank=team.rank;
    const weekChange=team.previousRank&&rank?team.previousRank-rank:null;
    const startChange=profile&&rank?profile.leagueSeed-rank:null;
    const draftChange=(team.draftRank??profile?.draftRank)&&rank?(team.draftRank??profile!.draftRank)-rank:null;
    return <tr key={team.id}><td className="rank">{rank??'—'}</td><td><Link className="manager-link" to={teamUrl(meta.slug,team.id)}>{profile?.manager??team.name}</Link><span className="muted team-subline"><TeamIdentity team={team}/></span></td><td className="numeric">{record(team)}</td><td className="numeric emphasis">{points(team.pointsFor)}</td><td className="numeric">{points(weeklyAverage(team))}</td><td className="numeric muted">{points(team.pointsAgainst)}</td>{[weekChange,startChange,draftChange].map((change,index)=><td key={index} className={`numeric rank-change ${change!==null&&change>0?'up':change!==null&&change<0?'down':''}`}>{delta(change)}</td>)}<td><span className={`zone-badge ${provisionalZone(meta.slug,rank).includes('Relegation')?'danger':provisionalZone(meta.slug,rank).includes('promotion')?'promotion':''}`}>{provisionalZone(meta.slug,rank)}</span></td></tr>;
  })}</tbody></table></div>{!teams.length&&<p className="empty-inline">No teams match your search.</p>}</section>;
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
      return <LeagueStandingsCard key={meta.slug} meta={meta} teams={teams} />;
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
    <div className="recap-metrics"><article><p className="eyebrow">HIGH SCORER</p><strong>{describe(scores[0])}</strong><span>{scores[0]?LEAGUES.find(meta=>meta.slug===scores[0].slug)?.name:'Awaiting scores'}</span></article><article><p className="eyebrow">100+ CLUB</p><strong>{hundred.length} teams</strong></article><article><p className="eyebrow">SMALLEST {allFinal?'WINNING MARGIN':'MARGIN'}</p><strong>{margins[0]?`${points(margins[0].margin)} points`:'—'}</strong><span>{matchupName(margins[0])}</span></article><article><p className="eyebrow">LARGEST {allFinal?'BLOWOUT':'LEAD'}</p><strong>{margins.at(-1)?`${points(margins.at(-1)!.margin)} points`:'—'}</strong><span>{matchupName(margins.at(-1))}</span></article><article><p className="eyebrow">LOWEST {allFinal?'WINNER':'LEADING SCORE'}</p><strong>{describe(winners[0])}</strong></article><article><p className="eyebrow">HIGHEST {allFinal?'LOSER':'TRAILING SCORE'}</p><strong>{describe(losers[0])}</strong></article></div>
    <section className="surface"><div className="surface-heading"><h2>Scoring leaderboard</h2></div><div className="table-scroll" tabIndex={0} role="region" aria-label="Weekly scoring leaderboard"><table><thead><tr><th>#</th><th>Manager</th><th>League</th><th>Points</th><th>Matchup</th></tr></thead><tbody>{scores.map((row,index)=><tr key={`${row.slug}-${row.id}`}><td className="rank">{index+1}</td><td><Link className="manager-link" to={teamUrl(row.slug,row.id)}>{managerFor(row.slug,row.id)?.manager??'Team'}</Link></td><td><span className={`league-label ${row.slug}`}>{LEAGUES.find(meta=>meta.slug===row.slug)?.name}</span></td><td className="numeric emphasis">{points(row.score)}{row.score>=100&&<span className="hundred-tag">100+</span>}</td><td className="muted">{row.opponent===null?'—':row.score===row.opponent?row.final?'Tie':'Level':row.score>row.opponent?row.final?'Won':'Leading':row.final?'Lost':'Trailing'}</td></tr>)}</tbody></table></div></section>
    {week===currentWeek&&<section className="surface standouts"><div className="surface-heading"><h2>Top starting-player performances</h2></div><div className="table-scroll"><table><thead><tr><th>Player</th><th>Manager</th><th>League</th><th>Points</th></tr></thead><tbody>{standouts.map(player=><tr key={`${player.slug}-${player.id}`}><td><PlayerIdentity player={player} injury={player.injuryStatus} /></td><td><Link to={teamUrl(player.slug,player.teamId)}>{managerFor(player.slug,player.teamId)?.manager}</Link></td><td className={`league-label ${player.slug}`}>{LEAGUES.find(meta=>meta.slug===player.slug)?.name}</td><td className="numeric emphasis">{points(player.weekPoints)}</td></tr>)}</tbody></table></div></section>}
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
