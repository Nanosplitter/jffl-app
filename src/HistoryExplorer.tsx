import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArchiveNav } from './ArchiveNav';
import { history } from './history/archive.ts';
import { ArchiveChart, useDarkMode } from './history/ArchiveChart.tsx';
import { careerSeasons, draftGroups, h2hMargins, horizontalBars, scoringLine, seasonLine, seriesBars, stackedBars } from './history/archiveCharts.ts';
import { esc } from './history/chartKit.ts';
import {
  JFFL_CUP, LEAGUE_CUP, SUPER_BOWL, WEEKLY,
  careers, draftBuckets, draftSlots, eraMean, rate, recordBook, roundLabel,
  scoringByYear, seriesTable, superBowlOverlap, titleYears, weekSlice,
  type HistoryGame, type HistorySeason, type ScoreLine, type TitleLeague,
} from './history/stats.ts';
import { leagueInk, leagueOfManager, leagueSlug } from './reference';
import { points } from './ui';
import { usePageLabel } from './BackLink';

const dash = '\u2013';
const managerUrl = (name: string) => `/archive/managers/${encodeURIComponent(name)}`;
const names = careers(history.seasons).map(row => row.team).sort((a, b) => a.localeCompare(b));
const years = scoringByYear(history.games);
const titleBook = titleYears(history.seasons);
const overlap = superBowlOverlap(titleBook);
const careerBook = careers(history.seasons);
const series = seriesTable(history.games);
const drafts = draftBuckets(history.seasons);
const draftPositions = draftSlots(history.seasons).filter(slot => slot.slot >= 1 && slot.slot <= 10);
const mostPlayed = series.slice(0, 8);

function InkName({ name }: { name: string }) {
  return <span className={leagueInk(leagueOfManager(name))}>{name}</span>;
}

function Shell({ eyebrow, title, copy, children }: { eyebrow: string; title: ReactNode; copy: string; children: ReactNode }) {
  return <>
    <ArchiveNav />
    <section className="page-intro"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="intro-copy">{copy}</p></div></section>
    {children}
  </>;
}

function gameText(game: HistoryGame) {
  if (game.scoreA === game.scoreB) return `${game.teamA} ${points(game.scoreA)}, ${game.teamB} ${points(game.scoreB)}`;
  const homeWon = game.scoreA > game.scoreB;
  const winner = homeWon ? game.teamA : game.teamB;
  const win = homeWon ? game.scoreA : game.scoreB;
  const loser = homeWon ? game.teamB : game.teamA;
  const lose = homeWon ? game.scoreB : game.scoreA;
  return `${winner} ${points(win)}, ${loser} ${points(lose)}`;
}

function place(game: HistoryGame) {
  return `${game.season} ${game.league} ${roundLabel(game)}`;
}

const SCORING_SUMMARY = 'Mean regular-season score by year. About 65 points from 2003 to 2012, then about 88 from 2013 through 2025. Hover a year for its mean score and game count.';

function ScoringChart() {
  const dark = useDarkMode();
  const option = useMemo(() => scoringLine(dark, years), [dark]);
  return <>
    <ArchiveChart option={option} summary={SCORING_SUMMARY} height={420} />
    <p className="source-note">Mean of both teams’ scores in regular-season games. The vertical line is 2013, when the single league split. Cup totals are not included. Axis is points, starting at zero.</p>
  </>;
}

function scoreTip(row: ScoreLine) {
  return `<b>${esc(row.team)} ${points(row.score)}</b><br/>vs ${esc(row.opponent)} ${points(row.opponentScore)}<br/>${row.season} ${esc(row.league)} ${esc(roundLabel(row))}`;
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const value = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return Math.round(value * 10) / 10;
}

function gapLabel(value: number, typical: number) {
  const gap = Math.round(value - typical);
  if (gap === 0) return 'even';
  return `${gap > 0 ? '+' : '\u2212'}${Math.abs(gap)}`;
}

function uniqueLabels(labels: string[]) {
  const seen = new Map<string, number>();
  return labels.map(label => {
    const count = seen.get(label) ?? 0;
    seen.set(label, count + 1);
    return count ? `${label} (${count + 1})` : label;
  });
}

function useCompactChart() {
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 720px)').matches);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 720px)');
    const update = () => setCompact(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return compact;
}

function recordChartHeight(count: number) {
  return Math.max(420, 80 + count * 54);
}

function keepReference(compact: boolean, value: number | null, values: number[]) {
  if (value == null) return false;
  const peak = Math.max(0, ...values);
  return !(compact && peak > 0 && value > peak * 1.75);
}

function recordBarOptions(compact: boolean, wideRoom: number, reference: { value: number; name: string; label: string; tip: string } | null, values: number[]) {
  return {
    fontSize: compact ? 15 : 16,
    barMaxWidth: 36,
    nameWidth: compact ? 150 : 270,
    labelInside: compact,
    room: wideRoom,
    ...(reference && keepReference(compact, reference.value, values) ? { reference } : {}),
  };
}

function ScoreChart({ rows, caption }: { rows: ScoreLine[]; caption: string }) {
  const dark = useDarkMode();
  const compact = useCompactChart();
  const typical = median(rows.map(row => row.score));
  const option = useMemo(() => {
    const shown = rows.slice(0, 12);
    return horizontalBars(dark, uniqueLabels(shown.map(row => `${row.team} vs ${row.opponent} · ${row.season}`)), shown.map(row => ({
      value: row.score,
      url: managerUrl(row.team),
      label: typical === null ? points(row.score) : `${points(row.score)}  ${gapLabel(row.score, typical)}`,
      tip: scoreTip(row),
    })), recordBarOptions(compact, 176, typical === null ? null : { value: typical, name: 'Typical score', label: points(typical), tip: `Median of every score in these games: <b>${points(typical)}</b>` }, shown.map(row => row.score)));
  }, [compact, dark, rows, typical]);
  const count = Math.min(12, rows.length) + (keepReference(compact, typical, rows.slice(0, 12).map(row => row.score)) ? 1 : 0);
  const summary = `${caption}. ${rows.slice(0, 12).map(row => `${row.team} ${points(row.score)} against ${row.opponent} in ${row.season}`).join('. ')}.${typical === null ? '' : ` A typical score in these games is ${points(typical)}.`} `;
  return <section className="archive-list">
    <h2>{caption}</h2>
    <div className="chart-panel"><ArchiveChart option={option} summary={summary} height={recordChartHeight(count)} /></div>
    {typical !== null && <p className="source-note">Each label is the score, then how far it sits from a typical score, the median of every score in these games.</p>}
  </section>;
}

function MarginChart({ games, caption }: { games: HistoryGame[]; caption: string }) {
  const dark = useDarkMode();
  const compact = useCompactChart();
  const decided = useMemo(() => games.filter(game => game.scoreA !== game.scoreB), [games]);
  const typical = median(decided.map(game => Math.abs(game.scoreA - game.scoreB)));
  const option = useMemo(() => {
    const shown = decided.slice(0, 12);
    return horizontalBars(dark, uniqueLabels(shown.map(game => {
      const homeWon = game.scoreA > game.scoreB;
      return `${homeWon ? game.teamA : game.teamB} vs ${homeWon ? game.teamB : game.teamA} · ${game.season}`;
    })), shown.map(game => {
      const margin = Math.abs(game.scoreA - game.scoreB);
      const homeWon = game.scoreA > game.scoreB;
      return {
        value: margin,
        url: managerUrl(homeWon ? game.teamA : game.teamB),
        label: `${points(homeWon ? game.scoreA : game.scoreB)}\u2013${points(homeWon ? game.scoreB : game.scoreA)}  ${typical === null ? '' : gapLabel(margin, typical)}`.trim(),
        tip: `<b>Margin ${points(margin)}</b><br/>${esc(gameText(game))}<br/>${esc(place(game))}`,
      };
    }), recordBarOptions(compact, 210, typical === null ? null : { value: typical, name: 'Typical margin', label: points(typical), tip: `Median margin of decided games in this set: <b>${points(typical)}</b>` }, shown.map(game => Math.abs(game.scoreA - game.scoreB))));
  }, [compact, dark, decided, typical]);
  const count = Math.min(12, decided.length) + (keepReference(compact, typical, decided.slice(0, 12).map(game => Math.abs(game.scoreA - game.scoreB))) ? 1 : 0);
  return <section className="archive-list">
    <h2>{caption}</h2>
    {count ? <>
      <div className="chart-panel"><ArchiveChart option={option} summary={`${caption}. Bar length is the margin. A typical decided margin in these games is ${typical === null ? 'unknown' : points(typical)}.`} height={recordChartHeight(count)} /></div>
      {typical !== null && <p className="source-note">Bar length is the margin. Each label is the score, then how far that margin sits from a typical decided game.</p>}
    </> : <p className="empty-inline">None.</p>}
  </section>;
}

function GameLevelChart({ games, caption, mode, typical }: { games: HistoryGame[]; caption: string; mode: 'close' | 'tie'; typical: number | null }) {
  const dark = useDarkMode();
  const compact = useCompactChart();
  const option = useMemo(() => {
    const shown = [...games].sort((a, b) => Math.max(b.scoreA, b.scoreB) - Math.max(a.scoreA, a.scoreB) || b.season - a.season).slice(0, 12);
    return horizontalBars(dark, uniqueLabels(shown.map(game => `${game.teamA} vs ${game.teamB} · ${game.season}`)), shown.map(game => {
      const high = Math.max(game.scoreA, game.scoreB);
      const low = Math.min(game.scoreA, game.scoreB);
      return {
        value: high,
        url: managerUrl(game.scoreA >= game.scoreB ? game.teamA : game.teamB),
        label: `${points(high)}\u2013${points(low)}  ${typical === null ? '' : gapLabel(high, typical)}`.trim(),
        tip: `<b>${esc(gameText(game))}</b><br/>${esc(place(game))}`,
      };
    }), recordBarOptions(compact, 210, typical === null ? null : { value: typical, name: 'Typical score', label: points(typical), tip: `Median score in this whole set: <b>${points(typical)}</b>` }, shown.map(game => Math.max(game.scoreA, game.scoreB))));
  }, [compact, dark, games, typical]);
  const listed = [...games].sort((a, b) => Math.max(b.scoreA, b.scoreB) - Math.max(a.scoreA, a.scoreB) || b.season - a.season).slice(0, 12);
  const shownCount = listed.length + (keepReference(compact, typical, listed.map(game => Math.max(game.scoreA, game.scoreB))) ? 1 : 0);
  const what = mode === 'tie' ? 'ties' : 'games decided by one point';
  return <section className="archive-list">
    <h2>{caption}</h2>
    {games.length ? <>
      <div className="chart-panel"><ArchiveChart option={option} summary={`${caption}. ${games.length} ${what}. Showing the ${Math.min(12, games.length)} highest scoring. A typical score in these games is ${typical === null ? 'unknown' : points(typical)}.`} height={recordChartHeight(shownCount)} /></div>
      {typical !== null && <p className="source-note">{games.length} {what}. These are the highest scoring. Each label is the score, then how far it sits from a typical score for the whole set, {points(typical)}.</p>}
    </> : null}
  </section>;
}

export function ArchivePage() {
  usePageLabel('Archive');
  const early = eraMean(history.games, 2003, 2012);
  const later = eraMean(history.games, 2013, 2025);
  const high = recordBook(history.games, WEEKLY).highest[0];
  const jeffBecky = headToHead('Jeff', 'Becky');
  return <Shell eyebrow="2002–2025 / COMMISSIONER’S WORKBOOK" title="League archive" copy="Every played game through 2025. Weekly scores, titles, rivalries, careers, and the draft.">
    <div className="recap-metrics">
      <article><p className="eyebrow">PLAYED GAMES</p><strong>{history.games.length.toLocaleString('en-US')}</strong><span>With both scores. 2026 is still in progress.</span></article>
      <article><p className="eyebrow">WEEKLY SCORING</p><strong>{early} to {later}</strong><span>Mean points, 2003–2012, then 2013–2025.</span></article>
      <article><p className="eyebrow">SEASON AND SUPERBOWL</p><strong>{overlap.same} of {overlap.leagues}</strong><span>Leagues where the best record also won the Superbowl.</span></article>
    </div>
    <div className="section-heading"><h2>Regular-season scoring</h2></div>
    <ScoringChart />
    <div className="section-heading"><h2>Explore</h2></div>
    <nav className="archive-links" aria-label="Archive sections">
      <Link to="/archive/records"><strong>Record book</strong><span>Weekly high is {high ? `${high.team} ${points(high.score)} in ${high.season}` : '—'}. JFFL Cup totals are listed separately because they add two weeks.</span></Link>
      <Link to="/archive/titles"><strong>Three titles</strong><span>Season rank, Superbowl, and cup. The best record won the Superbowl in {overlap.same} of {overlap.leagues} leagues.</span></Link>
      <Link to="/archive/rivals"><strong>Head-to-head</strong><span>{jeffBecky.played.length ? `Jeff is ${jeffBecky.winsLeft}${dash}${jeffBecky.winsRight} against Becky across every match.` : 'Every match, including playoffs and cups.'}</span></Link>
      <Link to="/archive/managers"><strong>Managers</strong><span>{careerBook.filter(row => row.seasons === 24).length} managers have a season in every year since 2002.</span></Link>
      <Link to="/archive/draft"><strong>Draft</strong><span>Picks 1 through 8 win the league about 10% of the time. Pick 9 or later wins it about 5%.</span></Link>
      <Link to="/archive/weeks"><strong>Week in history</strong><span>Weeks 1 through 14, across every finished season that played that week.</span></Link>
    </nav>
    <p className="source-note">Built from the commissioner workbook’s game log and team-season table. Combined is the single league before 2013. Names are the workbook’s nicknames.</p>
  </Shell>;
}

const BOOKS = [
  { id: 'weekly', label: 'Weekly', note: 'One regular-season week. This is the list for a single-week record.', pick: WEEKLY },
  { id: 'jffl', label: 'JFFL Cup', note: 'These rows are two-week totals. A 275 here is not a bigger week than a 170.', pick: JFFL_CUP },
  { id: 'league', label: 'League cups', note: 'Premier, Championship, and League One cup games.', pick: LEAGUE_CUP },
  { id: 'bowl', label: 'Superbowl', note: 'Playoff games, including the final.', pick: SUPER_BOWL },
] as const;

export function RecordsPage() {
  usePageLabel('Record book');
  const [bookId, setBookId] = useState<(typeof BOOKS)[number]['id']>('weekly');
  const book = BOOKS.find(item => item.id === bookId) ?? BOOKS[0];
  const board = useMemo(() => recordBook(history.games, book.pick), [book]);
  const typicalScore = median(board.highest.map(row => row.score));
  return <Shell eyebrow="THROUGH 2025 / SCORES" title="Record book" copy={book.note}>
    <div className="history-tabs" role="group" aria-label="Record book">{BOOKS.map(item => <button key={item.id} type="button" className={item.id === book.id ? 'active' : ''} aria-pressed={item.id === book.id} onClick={() => setBookId(item.id)}>{item.label}</button>)}</div>
    <p className="archive-count">{board.games.toLocaleString('en-US')} games · {board.ties.length} ties · {board.closest.length} decided by one point</p>
    <ScoreChart key={`${book.id}-high`} rows={board.highest} caption="Highest scores" />
    <ScoreChart key={`${book.id}-low`} rows={board.lowest} caption="Lowest scores" />
    <MarginChart key={`${book.id}-blow`} games={board.blowouts} caption="Widest margins" />
    {board.closest.length > 0 && <GameLevelChart key={`${book.id}-close`} games={board.closest} caption="Decided by one point" mode="close" typical={typicalScore} />}
    {board.ties.length > 0 && <GameLevelChart key={`${book.id}-ties`} games={board.ties} caption="Ties" mode="tie" typical={typicalScore} />}
  </Shell>;
}

const LEAGUE_ORDER = ['Combined', 'Premier', 'Championship', 'League One'];
const RACE_NAME = { record: 'Best record', bowl: 'Superbowl', cup: 'League cup' } as const;
type Race = keyof typeof RACE_NAME;

function racePhrase(races: Race[]) {
  const words = races.map(race => RACE_NAME[race]);
  if (words.length === 1) return words[0];
  if (words.length === 2) return `${words[0]} and ${words[1]}`;
  return `${words[0]}, ${words[1]}, and ${words[2]}`;
}

const seasonIndex = new Map(history.seasons.map(row => [`${row.season}\0${row.team}`, row]));

function seasonFact(row: HistorySeason) {
  const record = `${row.wins ?? '—'}${dash}${row.losses ?? '—'}${row.ties ? `${dash}${row.ties}` : ''}`;
  const scoring = [`${points(row.points)} points`];
  if (row.pointsPerWeek != null) scoring.push(`${row.pointsPerWeek.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} per week`);
  const races = [
    row.rankSeason != null ? `Finish ${row.rankSeason}` : '',
    row.rankFinal != null ? `Superbowl ${row.rankFinal}` : '',
    row.cupRank != null ? `Cup ${row.cupRank}` : '',
    row.jfflRank != null ? `JFFL rank ${row.jfflRank}` : '',
    row.draft != null ? `Draft ${row.draft}` : '',
  ].filter(Boolean);
  return { record, scoring: scoring.join(' · '), races };
}

function SeasonTip({ season, name }: { season: number; name: string }) {
  const row = seasonIndex.get(`${season}\0${name}`);
  if (!row) return null;
  const fact = seasonFact(row);
  return <span className="title-tip" aria-hidden="true">
    <span className="title-tip-record">{fact.record}</span>
    <span>{fact.scoring}</span>
    {fact.races.length ? <span className="title-tip-facts">{fact.races.map(race => <span key={race}>{race}</span>)}</span> : null}
  </span>;
}

function titleLanes(league: TitleLeague) {
  const slots: Array<{ race: Race; names: string[] }> = [
    { race: 'record', names: league.seasonChamps },
    { race: 'bowl', names: league.superBowl ? [league.superBowl] : [] },
    { race: 'cup', names: league.cup ? [league.cup] : [] },
  ];
  const lanes: Array<{ names: string[]; races: Race[]; span: number }> = [];
  for (const slot of slots) {
    const prev = lanes[lanes.length - 1];
    const name = slot.names.length === 1 ? slot.names[0] : null;
    const prevName = prev && prev.names.length === 1 ? prev.names[0] : null;
    if (name && prevName && name === prevName) {
      prev.races.push(slot.race);
      prev.span += 1;
    } else lanes.push({ names: slot.names, races: [slot.race], span: 1 });
  }
  return lanes;
}

function TitlesBoard() {
  const seasons = [...titleBook].reverse();
  return <div className="titles">
    <ol className="title-years">
      {seasons.map(year => <li className="title-year" key={year.season}>
        <header className="title-year-bar">
          <strong>{year.season}</strong>
          {year.jffl && <p className="title-jffl"><span>JFFL Cup</span><Link to={managerUrl(year.jffl)}><InkName name={year.jffl} /><SeasonTip season={year.season} name={year.jffl} /></Link></p>}
        </header>
        <div className="title-columns title-columns-head">
          <span />
          <span>Best record</span>
          <span>Superbowl</span>
          <span>League cup</span>
        </div>
        <div className="title-leagues">
          {[...year.leagues].sort((a, b) => LEAGUE_ORDER.indexOf(a.league) - LEAGUE_ORDER.indexOf(b.league)).map(league => <div className="title-columns" key={league.league}>
            <span className="title-league-name">{league.league}</span>
            {titleLanes(league).map(lane => {
              const phrase = racePhrase(lane.races);
              const wide = lane.span > 1;
              const spanClass = wide ? ` title-span-${lane.span}` : '';
              if (!lane.names.length) return <span className={`title-winner empty${spanClass}`} key={lane.races[0]}><span className="sr-only">No {phrase.toLowerCase()}</span><span className="title-race" aria-hidden="true">No {phrase.toLowerCase()}</span><span className="title-dash" aria-hidden="true">—</span></span>;
              const raceLabel = <span className="title-race" aria-hidden="true">{phrase}</span>;
              const ink = leagueInk(leagueSlug(league.league));
              if (lane.names.length === 1) return <Link className={`title-winner${wide ? ' wide' : ''}${spanClass}`} key={lane.names[0]} to={managerUrl(lane.names[0])}>
                <span className="sr-only">{phrase}. </span>
                <span className={ink}>{lane.names[0]}</span>
                {wide ? <small aria-hidden="true">{phrase}</small> : raceLabel}
                <SeasonTip season={year.season} name={lane.names[0]} />
              </Link>;
              return <div className={`title-winner${spanClass}`} key={lane.races.join('-')}>
                <span className="sr-only">{phrase}. </span>
                {raceLabel}
                {lane.names.map(name => <Link key={name} to={managerUrl(name)}><span className={ink}>{name}</span><SeasonTip season={year.season} name={name} /></Link>)}
              </div>;
            })}
          </div>)}
        </div>
      </li>)}
    </ol>
  </div>;
}

export function TitlesPage() {
  usePageLabel('Titles');
  return <Shell eyebrow="2002–2025 / THREE RACES" title="Titles" copy="The regular-season winner, the Superbowl champion, and the league cup champion are often three different managers.">
    <div className="archive-stats"><span><strong>{overlap.same}</strong> of {overlap.leagues} Superbowls won by that league’s top record</span></div>
    <TitlesBoard />
    <p className="source-note">Each column is a race. A name stretched across columns won each of those races. The same name in two separate columns won both, with someone else in between. Hover a name for that season’s record, points, and finishes. In 2006, Brendan and Tom both sit at rank 1. JFFL Cup begins in 2013 and is listed once for the year. League cups begin when that league does. 2002 has standings and a Superbowl, and almost no weekly scores.</p>
  </Shell>;
}

export function RivalsPage() {
  usePageLabel('Head-to-head');
  const [left, setLeft] = useState('SeanT');
  const [right, setRight] = useState('Wayne');
  const lopsided = useMemo(() => [...series].filter(item => item.meetings >= 10 && item.winsA + item.winsB > 0)
    .sort((a, b) => Math.max(b.winsA, b.winsB) / (b.winsA + b.winsB) - Math.max(a.winsA, a.winsB) / (a.winsA + a.winsB) || b.meetings - a.meetings)
    .slice(0, 8), []);
  const choosePair = (pair: [string, string]) => {
    setLeft(pair[0]);
    setRight(pair[1]);
    document.querySelector('h1')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const match = headToHead(left, right);
  const marginGames = match.played.filter(game => !isJfflCup(game));
  const notes = pairNotes(marginGames, match.played, left, right);
  return <Shell eyebrow="EVERY MATCH / THROUGH 2025" title="Head-to-head" copy="Every match counts in the series, including playoffs and cups. JFFL Cup scores cover two weeks, so they are in the points and out of the margins.">
    <div className="filters">
      <label>First manager<select aria-label="First manager" value={left} onChange={event => setLeft(event.target.value)}>{names.map(name => <option key={name}>{name}</option>)}</select></label>
      <label>Second manager<select aria-label="Second manager" value={right} onChange={event => setRight(event.target.value)}>{names.map(name => <option key={name}>{name}</option>)}</select></label>
    </div>
    {left === right ? <p className="empty-inline">Choose two different managers.</p> : <>
      <div className="recap-metrics">
        <article><p className="eyebrow">MEETINGS</p><strong>{match.played.length}</strong><span>{match.ties ? `${match.ties} ${match.ties === 1 ? 'tie' : 'ties'}` : 'No ties'}</span></article>
        <article><p className="eyebrow">SERIES</p><strong>{match.played.length ? seriesRecord(match.winsLeft, match.winsRight, match.ties) : `0${dash}0`}</strong><span>{match.played.length ? seriesLead(left, right, match.winsLeft, match.winsRight) : 'They have not played.'}</span></article>
        <article><p className="eyebrow">POINTS</p><strong>{match.played.length ? `${points(match.leftPoints)}${dash}${points(match.rightPoints)}` : `0${dash}0`}</strong><span>{match.played.length ? pointsNote(left, right, match.leftPoints, match.rightPoints) : 'They have not played.'}</span></article>
        {notes.length ? <ul className="pair-notes">{notes.map(note => <li key={`${note.label}-${note.when}-${note.detail}`}><strong>{note.label}</strong><span className="pair-when">{note.when}</span><span className="pair-score">{note.detail}</span></li>)}</ul> : null}
      </div>
      {marginGames.length ? <PairChart left={left} right={right} games={marginGames} /> : <p className="empty-inline">No single-week games between <InkName name={left} /> and <InkName name={right} />. JFFL Cup scores cover two weeks, so they are not on the margin chart.</p>}
    </>}
    <div className="section-heading"><h2>Most played, regular season</h2></div>
    <SeriesChart rows={mostPlayed} mode="meetings" onSelect={choosePair} summary="The eight most played regular-season series, by number of meetings. Each label shows the meeting count, who leads, and the record. Select a matchup to open it above." />
    <div className="section-heading"><h2>Most one-sided regular-season series, at least 10 games</h2></div>
    <SeriesChart rows={lopsided} mode="share" onSelect={choosePair} summary="The most one-sided regular-season series with at least 10 games. Bar length is the leader's share of decided games. Each label shows that share, who leads, and the record. Select a matchup to open it above." />
  </Shell>;
}

function isJfflCup(game: HistoryGame) {
  return game.type === 'Cup' && game.league === 'JFFL';
}

function headToHead(left: string, right: string) {
  const played = history.games.filter(game => left !== right && (game.teamA === left && game.teamB === right || game.teamA === right && game.teamB === left))
    .sort((a, b) => a.season - b.season || (a.type === 'Season' ? 0 : a.type === 'Cup' ? 1 : 2) - (b.type === 'Season' ? 0 : b.type === 'Cup' ? 1 : 2) || (a.week ?? 0) - (b.week ?? 0) || a.round.localeCompare(b.round));
  let winsLeft = 0;
  let winsRight = 0;
  let ties = 0;
  let leftPoints = 0;
  let rightPoints = 0;
  for (const game of played) {
    const leftScore = game.teamA === left ? game.scoreA : game.scoreB;
    const rightScore = game.teamA === left ? game.scoreB : game.scoreA;
    leftPoints += leftScore;
    rightPoints += rightScore;
    if (leftScore === rightScore) ties += 1;
    else if (leftScore > rightScore) winsLeft += 1;
    else winsRight += 1;
  }
  return { played, winsLeft, winsRight, ties, leftPoints, rightPoints };
}

function seriesLead(left: string, right: string, winsLeft: number, winsRight: number) {
  if (winsLeft === winsRight) return <><InkName name={left} /> and <InkName name={right} /> are level</>;
  return winsLeft > winsRight ? <><InkName name={left} /> leads <InkName name={right} /></> : <><InkName name={right} /> leads <InkName name={left} /></>;
}

function seriesRecord(winsLeft: number, winsRight: number, ties: number) {
  const base = `${Math.max(winsLeft, winsRight)}${dash}${Math.min(winsLeft, winsRight)}`;
  return ties ? `${base}${dash}${ties}` : base;
}

function pointsNote(left: string, right: string, leftPoints: number, rightPoints: number) {
  if (leftPoints === rightPoints) return <><InkName name={left} /> and <InkName name={right} /> scored the same</>;
  const leader = leftPoints > rightPoints ? left : right;
  return <><InkName name={left} /> · <InkName name={right} />. <InkName name={leader} /> scored {points(Math.abs(leftPoints - rightPoints))} more</>;
}

function managerMargin(game: HistoryGame, name: string) {
  return game.teamA === name ? game.scoreA - game.scoreB : game.scoreB - game.scoreA;
}

function scoreText(game: HistoryGame) {
  const [highName, highScore, lowName, lowScore] = game.scoreA >= game.scoreB
    ? [game.teamA, game.scoreA, game.teamB, game.scoreB] as const
    : [game.teamB, game.scoreB, game.teamA, game.scoreA] as const;
  return `${highName} ${points(highScore)}, ${lowName} ${points(lowScore)}`;
}

function marginLabel(game: HistoryGame) {
  const year = String(game.season).slice(2);
  if (game.type === 'Season') return `${year}w${game.week ?? ''}`;
  if (game.type === 'Superbowl') return `${year} SB`;
  return `${year} cup`;
}

function whenLabel(game: HistoryGame) {
  const place = `${game.season} ${game.league}`;
  if (game.type !== 'Season' && game.round.endsWith('Final')) return place;
  return `${place} ${roundLabel(game)}`;
}

function finalLabel(game: HistoryGame) {
  if (game.type === 'Superbowl') return 'Superbowl';
  return game.league === 'JFFL' ? 'JFFL Cup final' : `${game.league} cup final`;
}

function pairNotes(marginGames: HistoryGame[], played: HistoryGame[], left: string, right: string) {
  const notes: { label: string; when: string; detail: string }[] = [];
  const postseason = played.filter(game => game.type === 'Superbowl' || game.type === 'Cup' && game.round.endsWith('Final'))
    .sort((a, b) => b.season - a.season || b.round.localeCompare(a.round));
  for (const game of postseason) notes.push({ label: finalLabel(game), when: whenLabel(game), detail: scoreText(game) });
  if (!marginGames.length) return notes;
  const closestMargin = Math.min(...marginGames.map(game => Math.abs(game.scoreA - game.scoreB)));
  const closest = marginGames.filter(game => Math.abs(game.scoreA - game.scoreB) === closestMargin)
    .sort((a, b) => a.season - b.season || (a.week ?? 0) - (b.week ?? 0))[0];
  const marginText = (margin: number) => margin === 0 ? 'Tied' : `${points(margin)} ${margin === 1 ? 'point' : 'points'}`;
  if (closest) notes.push({ label: 'Closest', when: whenLabel(closest), detail: `${scoreText(closest)} · ${marginText(closestMargin)}` });
  for (const name of [left, right]) {
    const best = marginGames.filter(game => managerMargin(game, name) > 0)
      .sort((a, b) => managerMargin(b, name) - managerMargin(a, name) || b.season - a.season || (b.week ?? 0) - (a.week ?? 0))[0];
    if (!best || managerMargin(best, name) === closestMargin) continue;
    const margin = managerMargin(best, name);
    notes.push({ label: `${name}'s biggest win`, when: whenLabel(best), detail: `${scoreText(best)} · ${marginText(margin)}` });
  }
  return notes;
}

function PairChart({ left, right, games }: { left: string; right: string; games: HistoryGame[] }) {
  const dark = useDarkMode();
  const option = useMemo(() => h2hMargins(dark, left, games.map(marginLabel), games.map(game => {
    const leftScore = game.teamA === left ? game.scoreA : game.scoreB;
    const rightScore = game.teamA === left ? game.scoreB : game.scoreA;
    const event = game.type === 'Season' ? `${game.season} week ${game.week ?? '—'}` : `${game.season} ${game.type === 'Superbowl' ? 'Superbowl' : `${game.league} cup`}`;
    return {
      value: leftScore - rightScore,
      tip: `<b>${event}</b> · ${esc(game.league)}<br/>${esc(left)} ${points(leftScore)}, ${esc(right)} ${points(rightScore)}`,
    };
  })), [dark, left, right, games]);
  return <div className="chart-panel chart-scroll"><ArchiveChart option={option} summary={`${left} versus ${right}. Each bar is ${left}'s single-week margin, including playoffs and league cups. JFFL Cup games are left off because their scores cover two weeks. Bars above zero are wins for ${left}.`} height={460} /></div>;
}

function SeriesChart({ rows, mode, summary, onSelect }: { rows: typeof series; mode: 'meetings' | 'share'; summary: string; onSelect?: (pair: [string, string]) => void }) {
  const dark = useDarkMode();
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 720px)').matches);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 720px)');
    const update = () => setCompact(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  const option = useMemo(() => seriesBars(dark, rows, mode, compact), [dark, rows, mode, compact]);
  return <div className="chart-panel"><ArchiveChart option={option} summary={summary} onSelect={onSelect} height={Math.max(340, 88 + rows.length * 58)} /></div>;
}

function titleTotal(row: { seasonTitles: number; superBowls: number; leagueCups: number; jfflCups: number }) {
  return row.seasonTitles + row.superBowls + row.leagueCups + row.jfflCups;
}

function careerRate(row: { wins: number; losses: number }) {
  const decided = row.wins + row.losses;
  return decided ? Math.round(row.wins / decided * 1000) / 10 : null;
}

export function ManagersPage() {
  usePageLabel('Managers');
  const [search, setSearch] = useState('');
  const dark = useDarkMode();
  const query = search.trim().toLowerCase();
  const matches = useMemo(() => careerBook.filter(row => row.team.toLowerCase().includes(query)), [query]);
  const ranked = useMemo(() => {
    const sorted = [...matches].sort((a, b) => titleTotal(b) - titleTotal(a) || b.seasons - a.seasons || a.team.localeCompare(b.team));
    return query ? sorted : sorted.filter(row => titleTotal(row) > 0);
  }, [matches, query]);
  const option = useMemo(() => {
    const fallback = dark
      ? ['#0076b6', '#b0b7bc', '#f4f5f6', '#3ec0f0']
      : ['#0076b6', '#5c656b', '#1a1d1f', '#1496d4'];
    const style = getComputedStyle(document.documentElement);
    const colors = ['--title-season', '--title-super', '--title-cup', '--title-jffl'].map((name, index) => style.getPropertyValue(name).trim() || fallback[index]);
    const parts = [
      { name: 'Season title', color: colors[0], values: ranked.map(row => row.seasonTitles) },
      { name: 'Superbowl', color: colors[1], values: ranked.map(row => row.superBowls) },
      { name: 'League cup', color: colors[2], values: ranked.map(row => row.leagueCups) },
      { name: 'JFFL Cup', color: colors[3], values: ranked.map(row => row.jfflCups) },
    ];
    return stackedBars(dark, ranked.map(row => row.team), parts, {
      labels: ranked.map(row => `${titleTotal(row)} in ${row.seasons}`),
      tips: ranked.map(row => {
        const total = titleTotal(row);
        const rate = careerRate(row);
        return `<b>${esc(row.team)}</b><br/>${total} titles in ${row.seasons} seasons, ${row.first}${dash}${row.last}<br/>${row.wins}${dash}${row.losses}${row.ties ? `${dash}${row.ties}` : ''}${rate === null ? '' : ` · ${rate}%`}<br/>${row.seasonTitles} season titles · ${row.superBowls} Superbowls<br/>${row.leagueCups} league cups · ${row.jfflCups} JFFL Cups`;
      }),
      urls: ranked.map(row => managerUrl(row.team)),
      room: 112,
      fontSize: 15,
      visible: ranked.length,
    });
  }, [dark, ranked]);
  const summary = ranked.map(row => { const total = titleTotal(row); return `${row.team}: ${total} ${total === 1 ? 'title' : 'titles'} in ${row.seasons} seasons`; }).join('. ');
  return <Shell eyebrow="2002–2025 / CAREERS" title="Managers" copy="Each bar is split by title. The label is the total and how many seasons it took.">
    <div className="filters"><label className="search-field"><span className="sr-only">Search managers</span><input aria-label="Search managers" placeholder="Search managers" value={search} onChange={event => setSearch(event.target.value)} /></label></div>
    {ranked.length ? <div className="chart-panel"><ArchiveChart option={option} summary={summary} height={Math.max(280, 72 + ranked.length * 42)} /></div> : <p className="empty-inline">No managers match that search.</p>}
    <p className="source-note">Everyone with at least one title is listed. Search finds any manager, including those with none. Select a name to open that career. Win rate leaves ties out and shows when you hover.</p>
  </Shell>;
}

export function ManagerArchivePage() {
  const params = useParams();
  const name = params.name ? decodeURIComponent(params.name) : '';
  usePageLabel(name || null);
  const career = careerBook.find(row => row.team === name);
  const seasons = useMemo(() => history.seasons.filter(row => row.team === name), [name]);
  const weeklyHigh = recordBook(history.games.filter(game => game.teamA === name || game.teamB === name), WEEKLY).highest.find(line => line.team === name);
  if (!career) return <Shell eyebrow="LEAGUE ARCHIVE" title="Manager not found" copy="That name is not in the workbook through 2025."><p><Link to="/archive/managers">All managers</Link></p></Shell>;
  const label = (count: number, singular: string, plural: string) => `${count} ${count === 1 ? singular : plural}`;
  return <Shell eyebrow={`${career.first}–${career.last} / ${career.seasons} SEASONS`} title={<InkName name={career.team} />} copy={`${label(career.seasonTitles, 'season title', 'season titles')}, ${label(career.superBowls, 'Superbowl', 'Superbowls')}, ${label(career.leagueCups, 'league cup', 'league cups')}, ${label(career.jfflCups, 'JFFL Cup', 'JFFL Cups')}.`}>
    <div className="recap-metrics">
      <article><p className="eyebrow">RECORD</p><strong>{career.wins}{dash}{career.losses}{career.ties ? `${dash}${career.ties}` : ''}</strong><span>Regular-season games in the team-season table.</span></article>
      <article><p className="eyebrow">WEEKLY HIGH</p><strong>{weeklyHigh ? points(weeklyHigh.score) : '—'}</strong><span>{weeklyHigh ? `${weeklyHigh.season} ${weeklyHigh.league} ${roundLabel(weeklyHigh)} vs ${weeklyHigh.opponent}` : 'No weekly score'}</span></article>
    </div>
    <CareerChart seasons={seasons} />
    <p className="source-note">Bars are season points. The line is regular-season finish, with 1 at the top. Hover a season for the record, Superbowl rank, cup rank, and draft slot. A blank finish means the workbook left that race empty.</p>
  </Shell>;
}

function CareerChart({ seasons }: { seasons: typeof history.seasons }) {
  const dark = useDarkMode();
  const ordered = useMemo(() => [...seasons].sort((a, b) => a.season - b.season || a.league.localeCompare(b.league)), [seasons]);
  const option = useMemo(() => careerSeasons(dark, ordered.map(row => ({
    season: String(row.season),
    points: row.points,
    finish: row.rankSeason,
    tip: `<b>${row.season} ${esc(row.league)}</b><br/>${row.wins ?? '—'}${dash}${row.losses ?? '—'}${row.ties ? `${dash}${row.ties}` : ''}<br/>Finish ${row.rankSeason ?? '—'} · Superbowl ${row.rankFinal ?? '—'} · Cup ${row.cupRank ?? '—'}<br/>${points(row.points)} points · draft ${row.draft ?? '—'}`,
  }))), [dark, ordered]);
  return <ArchiveChart option={option} summary={`Career by season. Points are bars. Finish is the line, with 1 at the top.`} height={420} />;
}

function slotTip(slot: { slot: number; seasons: number; titles: number; topThree: number }) {
  if (!slot.seasons) return `<b>Pick ${slot.slot}</b><br/>No seasons with both a draft slot and a finish.`;
  return `<b>Pick ${slot.slot}</b><br/>${slot.seasons} seasons<br/>${slot.titles} won the league, ${rate(slot.titles, slot.seasons)}%<br/>${slot.topThree} finished top 3, ${rate(slot.topThree, slot.seasons)}%`;
}

export function DraftPage() {
  usePageLabel('Draft');
  const dark = useDarkMode();
  const option = useMemo(() => draftGroups(
    dark,
    draftPositions.map(slot => String(slot.slot)),
    draftPositions.map(slot => ({ value: rate(slot.titles, slot.seasons), tip: slotTip(slot) })),
    draftPositions.map(slot => ({ value: rate(slot.topThree, slot.seasons), tip: slotTip(slot) })),
  ), [dark]);
  const summary = draftPositions.map(slot => `Pick ${slot.slot}: ${rate(slot.titles, slot.seasons)}% won the league, ${rate(slot.topThree, slot.seasons)}% top 3, from ${slot.seasons} seasons`).join('. ');
  return <Shell eyebrow="2003–2025 / WHERE THEY FINISHED" title="Draft slot" copy="Picks 1 through 10. Blue is how often that pick won the league. Orange is how often it finished in the top 3.">
    <div className="chart-card"><ArchiveChart option={option} summary={summary} height={520} /></div>
    <p className="source-note">A season counts when the workbook has both a draft slot and a numeric season rank. Top 3 means finish 1, 2, or 3 in that league. Hover a pick for how many seasons it covers. Picks after 10 are left off this chart.</p>
  </Shell>;
}

function WeekHighChart({ highs, week }: { highs: ScoreLine[]; week: number }) {
  const dark = useDarkMode();
  const option = useMemo(() => seasonLine(dark, highs.map(row => String(row.season)), highs.map(row => ({
    value: row.score, url: managerUrl(row.team), tip: scoreTip(row),
  })), { min: 0, zoom: true }), [dark, highs]);
  return <ArchiveChart option={option} summary={`Week ${week} high score by season. Hover a year for the manager, opponent, and score.`} height={380} />;
}

export function WeekHistoryPage() {
  usePageLabel('Week in history');
  const [week, setWeek] = useState(5);
  const board = useMemo(() => weekSlice(history.games, week), [week]);
  const highs = useMemo(() => {
    const byYear = new Map<number, ScoreLine>();
    for (const line of board.highest) if (!byYear.has(line.season)) byYear.set(line.season, line);
    return [...byYear.values()].sort((a, b) => a.season - b.season);
  }, [board]);
  const high = board.highest[0];
  const low = board.lowest[0];
  const blowout = board.blowouts[0];
  return <Shell eyebrow="REGULAR SEASON / WEEKS 1–14" title={`Week ${week} in history`} copy="The same week number across finished seasons. Early years did not always play all 14 weeks.">
    <label className="week-picker">Choose week<select aria-label="Choose week" value={week} onChange={event => setWeek(Number(event.target.value))}>{Array.from({ length: 14 }, (_, index) => <option key={index} value={index + 1}>Week {index + 1}</option>)}</select></label>
    <div className="recap-metrics">
      <article><p className="eyebrow">HIGH SCORE</p><strong>{high ? <><InkName name={high.team} /> {points(high.score)}</> : '—'}</strong><span>{high ? `${high.season} ${high.league}` : 'No games'}</span></article>
      <article><p className="eyebrow">LOW SCORE</p><strong>{low ? <><InkName name={low.team} /> {points(low.score)}</> : '—'}</strong><span>{low ? `${low.season} ${low.league}` : 'No games'}</span></article>
      <article><p className="eyebrow">WIDEST MARGIN</p><strong>{blowout ? points(Math.abs(blowout.scoreA - blowout.scoreB)) : '—'}</strong><span>{blowout ? `${gameText(blowout)} · ${blowout.season}` : 'No decided games'}</span></article>
    </div>
    <div className="section-heading"><h2>High score each season</h2></div>
    <WeekHighChart highs={highs} week={week} />
    <p className="source-note">{board.games} games in week {week}. One label in the workbook said WK2; those games are included in week 2.</p>
  </Shell>;
}
