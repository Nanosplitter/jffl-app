import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FollowedNote, useAccount, useFollowed } from './account';
import { usePageLabel } from './BackLink';
import { ArchiveChart, useDarkMode } from './history/ArchiveChart';
import { chartTheme } from './history/archiveCharts';
import { baseOption, esc } from './history/chartKit';
import { useLive, useRosters, useSummaries } from './data';
import { isFollowedTeam } from './follow';
import { liveMatchChance, sideVariance, toOddsStarter, winChanceSeries, withNow } from './liveOdds';
import { matchdayMatches, matchFacts, matchTotal, playerBoard, windowMarkers, type BoardRow, type MatchdayMatch, type MatchFacts, type PlayerBoard } from './matchday';
import { PlayerIdentity } from './PlayerIdentity';
import { MANAGERS, leagueInk, managerFor } from './reference';
import { RankMark } from './RankMark';
import { LEAGUES, type LeagueSlug, type LiveGame, type RosteredPlayer, type Team } from './types';
import { Fresh, points } from './ui';
import type { SummaryMap } from './competitions';

type SideFilter = 'left' | 'right' | 'both';
type ChartMode = 'chance' | 'score';

const clockFormat = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit' });

function useNarrow(query: string) {
  const [on, setOn] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setOn(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);
  return on;
}

function projectedTotal(projected: number | null, offset: number) {
  if (projected == null || !Number.isFinite(projected) || !Number.isFinite(offset)) return null;
  return Math.round((projected + offset) * 100) / 100;
}

function stillOut(board: PlayerBoard) {
  const open = [...board.playing, ...board.yet.flatMap(group => group.players)];
  let total = 0;
  let any = false;
  for (const row of open) {
    if (row.player.projectedPoints == null) continue;
    any = true;
    total += row.player.projectedPoints * (1 - (row.status === 'yet' ? 0 : row.progress));
  }
  return { count: open.length, points: any ? Math.round(total * 100) / 100 : null };
}

function Scoreboard({ match, chance, leftRank, rightRank, leftLogo, rightLogo, pregameLeft, pregameRight, leftOut, rightOut }: {
  match: MatchdayMatch;
  chance: { left: number; right: number } | 'level' | null;
  leftRank: number | null;
  rightRank: number | null;
  leftLogo?: string | null;
  rightLogo?: string | null;
  pregameLeft: number | null;
  pregameRight: number | null;
  leftOut: { count: number; points: number | null };
  rightOut: { count: number; points: number | null };
}) {
  const leftTotal = matchTotal(match.left.score, match.left.offset);
  const rightTotal = match.right ? matchTotal(match.right.score, match.right.offset) : null;
  const leftProjected = projectedTotal(match.left.projected, match.left.offset);
  const rightProjected = match.right ? projectedTotal(match.right.projected, match.right.offset) : null;
  const odds = chance === 'level' ? { left: 50, right: 50 } : chance;
  const status = match.status === 'final' ? 'Final' : match.status === 'upcoming' ? 'Upcoming' : 'Live';
  const identity = (name: string, slug: LeagueSlug, rank: number | null, logo: string | null | undefined, align: 'left' | 'right', href: string) => <div className={`match-id ${align}`}>
    {logo && <img className="matchup-logo" src={logo} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={event => { event.currentTarget.hidden = true; }} />}
    <div className="match-id-copy">
      <Link className={`cup-manager ${leagueInk(slug)}`} to={href}><span><RankMark value={rank} />{name}</span></Link>
    </div>
  </div>;
  return <article className="match-board" aria-label={`${match.left.manager} vs ${match.right?.manager ?? 'bye'}`}>
    <div className="match-board-row">
      {identity(match.left.manager, match.left.slug, leftRank, leftLogo, 'left', `/league/${match.left.slug}/team/${match.left.teamId}`)}
      <div className="match-center-score"><strong className={leftTotal != null && rightTotal != null && leftTotal > rightTotal ? 'leading' : ''}>{points(leftTotal)}</strong><span aria-hidden="true">–</span><strong className={leftTotal != null && rightTotal != null && rightTotal > leftTotal ? 'leading' : ''}>{match.right ? points(rightTotal) : 'Bye'}</strong></div>
      {match.right ? identity(match.right.manager, match.right.slug, rightRank, rightLogo, 'right', `/league/${match.right.slug}/team/${match.right.teamId}`) : <div className="match-id right"><span className="muted">Bye</span></div>}
    </div>
    <p className="matchday-proj">
      <ProjectionSide current={leftProjected} earlier={pregameLeft} />
      <span>{status}</span>
      {match.right ? <ProjectionSide current={rightProjected} earlier={pregameRight} align="right" /> : <span>Bye</span>}
    </p>
    {odds && <div className="match-chance">
      <div className="duel-read"><span className={odds.left > odds.right ? 'lead' : ''}>{odds.left}%</span><span className="duel-label">Win chance</span><span className={odds.right > odds.left ? 'lead' : ''}>{odds.right}%</span></div>
      <div className="win-bar" role="img" aria-label={`${match.left.manager} ${odds.left} percent. ${match.right?.manager ?? 'Bye'} ${odds.right} percent.`}><span className={odds.left > odds.right ? 'favored' : ''} style={{ width: `${odds.left}%` }} /><span className={odds.right > odds.left ? 'favored' : ''} style={{ width: `${odds.right}%` }} /></div>
      <div className="matchday-remaining">{leftOut.count || rightOut.count ? <><RemainingSide out={leftOut} /><RemainingSide out={rightOut} align="right" /></> : <p className="cup-odds-note">Every starter has played.</p>}</div>
    </div>}
  </article>;
}

function ProjectionSide({ current, earlier, align }: { current: number | null; earlier: number | null; align?: 'right' }) {
  const moved = earlier != null && current != null && earlier !== current;
  return <span className={align === 'right' ? 'is-right' : ''} title={moved ? `The projection was ${points(earlier)} when tracking started` : undefined}>
    {current != null ? <><strong>{points(current)}</strong> projected</> : '—'}
    {moved && <small>was {points(earlier)}</small>}
  </span>;
}

function RemainingSide({ out, align }: { out: { count: number; points: number | null }; align?: 'right' }) {
  return <span className={align === 'right' ? 'is-right' : ''}>
    <strong>{out.count ? `${out.count} still to play` : 'All in'}</strong>
    <small>{out.count && out.points != null ? `${points(out.points)} projected points left` : 'No projected points left'}</small>
  </span>;
}

function chartOption(dark: boolean, mode: ChartMode, leftName: string, rightName: string, pointsIn: { t: number; chance: number; scoreLeft: number | null; scoreRight: number | null; projectedLeft: number | null; projectedRight: number | null }[], markers: { label: string; at: number }[]) {
  const { theme } = chartTheme(dark);
  const leftColor = theme.palette[0];
  const rightColor = theme.palette[1];
  const marker = markers.map(item => ({ xAxis: item.at, label: { formatter: item.label, color: theme.muted, fontSize: 10 } }));
  const tip = (time: number, rows: string[]) => `<div>${esc(clockFormat.format(time))}</div>${rows.map(row => `<div>${row}</div>`).join('')}`;
  if (mode === 'score') {
    const line = (name: string, color: string, dashed: boolean, value: (point: typeof pointsIn[number]) => number | null) => ({
      name, type: 'line' as const, showSymbol: false, connectNulls: false, color,
      lineStyle: { width: dashed ? 1.5 : 2, type: dashed ? 'dashed' as const : 'solid' as const },
      data: pointsIn.map(point => {
        const score = value(point);
        return score == null ? null : { value: [point.t * 1000, score] };
      }),
    });
    return {
      ...baseOption(theme, { legend: true, top: 36 }),
      tooltip: { ...baseOption(theme).tooltip, trigger: 'axis' as const, formatter: (params: { axisValue?: number; data?: { value?: [number, number] }; seriesName?: string; marker?: string }[]) => {
        const time = params.find(item => item.data?.value)?.data?.value?.[0];
        if (time == null) return '';
        return tip(time, params.filter(item => item.data?.value).map(item => `${item.marker ?? ''} ${esc(item.seriesName)} ${esc(item.data?.value?.[1])}`));
      } },
      xAxis: { type: 'time' as const, axisLabel: { color: theme.muted, hideOverlap: true } },
      yAxis: { type: 'value' as const, scale: true, axisLabel: { color: theme.muted } },
      series: [
        line(leftName, leftColor, false, point => point.scoreLeft),
        line(rightName, rightColor, false, point => point.scoreRight),
        line(`${leftName} proj`, leftColor, true, point => point.projectedLeft),
        line(`${rightName} proj`, rightColor, true, point => point.projectedRight),
      ],
    };
  }
  const last = pointsIn[pointsIn.length - 1];
  const spanStart = pointsIn[0].t * 1000;
  const spanEnd = last.t * 1000;
  const inWindow = marker.filter(item => item.xAxis >= spanStart && item.xAxis <= spanEnd);
  return {
    ...baseOption(theme, { top: 28 }),
    legend: undefined,
    tooltip: { ...baseOption(theme).tooltip, trigger: 'axis' as const, formatter: (params: { data?: { value?: [number, number]; point?: typeof pointsIn[number] } }[]) => {
      const item = params.find(entry => entry.data?.point);
      const point = item?.data?.point;
      if (!point) return '';
      return tip(point.t * 1000, [
        `${esc(leftName)} ${point.chance}% to win`,
        `${esc(rightName)} ${100 - point.chance}%`,
        `Score ${point.scoreLeft ?? '—'}–${point.scoreRight ?? '—'}`,
        `Projected ${point.projectedLeft ?? '—'}–${point.projectedRight ?? '—'}`,
      ]);
    } },
    xAxis: { type: 'time' as const, axisLabel: { color: theme.muted, hideOverlap: true } },
    yAxis: { type: 'value' as const, min: 0, max: 100, interval: 50, axisLabel: { color: theme.muted, formatter: '{value}%' } },
    series: [{
      name: leftName, type: 'line' as const, showSymbol: false, smooth: 0.2, color: leftColor,
      lineStyle: { width: 2.5, color: leftColor },
      areaStyle: { color: leftColor, opacity: 0.14 },
      markLine: { silent: true, symbol: 'none', lineStyle: { type: 'dashed' as const, color: theme.line }, label: { color: theme.muted, fontSize: 10 }, data: [{ yAxis: 50, label: { formatter: 'Even' } }, ...inWindow] },
      markPoint: { symbol: 'circle', symbolSize: 8, itemStyle: { color: leftColor }, label: { formatter: `${last.chance}%`, color: theme.text, fontWeight: 650, position: 'bottom' as const }, data: [{ coord: [spanEnd, last.chance] }] },
      data: pointsIn.map(point => ({ value: [point.t * 1000, point.chance], point })),
    }],
  };
}

function ChanceChart({ match, seriesLeft, seriesRight, leftStarters, rightStarters, games, now, markers }: {
  match: MatchdayMatch;
  seriesLeft: { t: number[]; s: (number | null)[]; p: (number | null)[] } | null;
  seriesRight: { t: number[]; s: (number | null)[]; p: (number | null)[] } | null;
  leftStarters: ReturnType<typeof toOddsStarter>[];
  rightStarters: ReturnType<typeof toOddsStarter>[];
  games: Record<string, LiveGame>;
  now: number;
  markers: { label: string; at: number }[];
}) {
  const dark = useDarkMode();
  const narrow = useNarrow('(max-width: 720px)');
  const [mode, setMode] = useState<ChartMode>('chance');
  const history = useMemo(() => {
    const left = withNow(seriesLeft, Math.floor(now / 1000), match.left.score, match.left.projected);
    const right = match.right ? withNow(seriesRight, Math.floor(now / 1000), match.right.score, match.right.projected) : null;
    return winChanceSeries(left, right, at => ({
      left: sideVariance(leftStarters, games, at, now, match.week),
      right: sideVariance(rightStarters, games, at, now, match.week),
    }), match.left.offset, match.right?.offset ?? 0);
  }, [games, leftStarters, match, now, rightStarters, seriesLeft, seriesRight]);
  const { theme } = chartTheme(dark);
  if (!match.right) return null;
  const option = history.length >= 2 ? chartOption(dark, mode, match.left.manager, match.right.manager, history, markers) : null;
  return <section className="matchday-chart" aria-label="Win chance over time">
    <div className="matchday-chart-head">
      <p className="chance-edge"><span style={{ background: theme.palette[0] }} />{match.left.manager}</p>
      <div className="matchday-toggle" role="group" aria-label="Chart">
        <button type="button" aria-pressed={mode === 'chance'} onClick={() => setMode('chance')}>Win chance</button>
        <button type="button" aria-pressed={mode === 'score'} onClick={() => setMode('score')}>Score</button>
      </div>
      <p className="chance-edge right"><span style={{ background: theme.palette[1] }} />{match.right.manager}</p>
    </div>
    <p className="matchday-chart-caption">{mode === 'chance' ? `${match.left.manager}'s chance to win. Above the Even line, ${match.left.manager} is favored.` : 'Solid lines are points scored. Dashed lines are the live projection.'}</p>
    {option ? <ArchiveChart option={option} summary={`${match.left.manager} win chance against ${match.right.manager} this week.`} height={narrow ? 220 : 280} /> : <p className="matchday-empty">History starts with the next update.</p>}
  </section>;
}

function PlayerLine({ row }: { row: BoardRow }) {
  const gap = row.gap != null && Math.abs(row.gap) >= 1 ? row.gap : null;
  const waiting = row.status === 'yet' || row.status === 'bye';
  const pace = gap == null ? null : gap > 0 ? `${points(gap)} ahead` : `${points(Math.abs(gap))} behind`;
  return <li className="matchday-player">
    <PlayerIdentity player={row.player} injury={row.player.injuryStatus} />
    <span className="matchday-player-score">
      <strong>{waiting ? points(row.player.projectedPoints) : points(row.player.weekPoints)}</strong>
      <small className={gap == null ? '' : gap > 0 ? 'up' : 'down'}>{waiting ? 'projected' : pace ?? (row.status === 'done' ? 'on pace' : '')}</small>
    </span>
    {row.detail && <span className="matchday-chip">{row.detail}</span>}
  </li>;
}

function BoardColumn({ rows }: { rows: BoardRow[] }) {
  if (!rows.length) return <span />;
  return <ul className="matchday-players">{rows.map(row => <PlayerLine key={row.player.id} row={row} />)}</ul>;
}

function PlayerColumns({ left, right, showLeft, showRight }: { left: BoardRow[]; right: BoardRow[]; showLeft: boolean; showRight: boolean }) {
  return <div className={`matchday-pair${showLeft && showRight ? '' : ' single'}`}>
    {showLeft && <BoardColumn rows={left} />}
    {showRight && <BoardColumn rows={right} />}
  </div>;
}

function Board({ left, right, showLeft, showRight, leftName, rightName }: {
  left: PlayerBoard;
  right: PlayerBoard | null;
  showLeft: boolean;
  showRight: boolean;
  leftName: string;
  rightName: string;
}) {
  const empty: PlayerBoard = { playing: [], above: [], below: [], yet: [], bye: [], done: [] };
  const other = right ?? empty;
  const both = showLeft && showRight;
  const finished = (rows: BoardRow[], direction: number) => rows.filter(row => row.status === 'done' && row.gap != null && Math.sign(row.gap) === direction);
  const close = (board: PlayerBoard) => board.done.filter(row => row.gap == null || Math.abs(row.gap) < 1);
  const yetWindows = [...new Set([...left.yet.map(group => group.window), ...other.yet.map(group => group.window)])];
  const sections: { title: string; left: BoardRow[]; right: BoardRow[] }[] = [
    { title: 'Playing now', left: left.playing, right: other.playing },
    { title: 'Beat their projection', left: finished(left.above, 1), right: finished(other.above, 1) },
    { title: 'Missed their projection', left: finished(left.below, -1), right: finished(other.below, -1) },
  ];
  return <div className="matchday-board">
    <div className={`matchday-pair matchday-board-names${both ? '' : ' single'}`}><span className={showLeft ? '' : 'matchday-hidden'}>{leftName}</span><span className={showRight ? '' : 'matchday-hidden'}>{rightName}</span></div>
    {sections.map(section => (section.left.length || section.right.length) ? <section key={section.title}><h3>{section.title}</h3><PlayerColumns left={section.left} right={section.right} showLeft={showLeft} showRight={showRight} /></section> : null)}
    {yetWindows.length > 0 && <section><h3>Yet to play</h3>{yetWindows.map(window => <div key={window}><p className="matchday-window">{window}</p><PlayerColumns left={left.yet.find(group => group.window === window)?.players ?? []} right={other.yet.find(group => group.window === window)?.players ?? []} showLeft={showLeft} showRight={showRight} /></div>)}</section>}
    {(left.bye.length || other.bye.length) > 0 && <section><h3>Bye</h3><PlayerColumns left={left.bye} right={other.bye} showLeft={showLeft} showRight={showRight} /></section>}
    {(close(left).length || close(other).length) > 0 && <section><h3>Finished near projection</h3><PlayerColumns left={close(left)} right={close(other)} showLeft={showLeft} showRight={showRight} /></section>}
  </div>;
}

function MatchInsights({ facts }: { facts: MatchFacts }) {
  if (!facts.catchup && !facts.swing && !facts.bench && !facts.lineup) return null;
  return <div className="matchday-insights">
    {facts.catchup && <article className="matchday-insight">
      <p className="eyebrow">{facts.catchup === 'level' ? 'Projection' : 'To catch the projection'}</p>
      <strong>{facts.catchup === 'level' ? 'Level' : points(facts.catchup.amount)}</strong>
      <p>{facts.catchup === 'level' ? 'Both sides are projected to finish even.' : `${facts.catchup.name} needs this many points above the current projection.`}</p>
    </article>}
    {facts.swing && <article className="matchday-insight">
      <p className="eyebrow">Widest range still out</p>
      <strong>{facts.swing.name}</strong>
      <div className="matchday-range" aria-label={`${facts.swing.name} usually varies by ${points(facts.swing.spread)} points`}><span>−{points(facts.swing.spread)}</span><span className="track" /><span>+{points(facts.swing.spread)}</span></div>
      <p>Usual weekly range. This player is still going.</p>
    </article>}
    {facts.bench && <article className="matchday-insight">
      <p className="eyebrow">Bench points</p>
      <div className="matchday-bench"><span>{facts.bench.leftName}<strong>{facts.bench.left == null ? '—' : points(facts.bench.left)}</strong></span>{facts.bench.rightName && <span>{facts.bench.rightName}<strong>{facts.bench.right == null ? '—' : points(facts.bench.right)}</strong></span>}</div>
      <p>Points scored by players who are not starting.</p>
    </article>}
    {facts.lineup && <article className="matchday-insight"><p className="eyebrow">A lineup that would have won</p><p>{facts.lineup}</p></article>}
  </div>;
}

function MatchSection({ match, players, games, liveSeries, now, filter, narrow, followed, teamFor }: {
  match: MatchdayMatch;
  players: Partial<Record<LeagueSlug, RosteredPlayer[]>>;
  games: Record<string, LiveGame>;
  liveSeries: (slug: LeagueSlug, teamId: string) => { t: number[]; s: (number | null)[]; p: (number | null)[] } | null;
  now: number;
  filter: SideFilter;
  narrow: boolean;
  followed: ReturnType<typeof useFollowed>;
  teamFor: (slug: LeagueSlug, teamId: string) => Team | null;
}) {
  const leftTeam = teamFor(match.left.slug, match.left.teamId);
  const rightTeam = match.right ? teamFor(match.right.slug, match.right.teamId) : null;
  const leftPlayers = (players[match.left.slug] ?? []).filter(player => player.teamId === match.left.teamId);
  const rightPlayers = match.right ? (players[match.right.slug] ?? []).filter(player => player.teamId === match.right!.teamId) : [];
  const leftStarters = leftPlayers.filter(player => player.group === 'starter');
  const rightStarters = rightPlayers.filter(player => player.group === 'starter');
  const leftBoard = playerBoard(leftStarters, games, now, match.week);
  const rightBoard = match.right ? playerBoard(rightStarters, games, now, match.week) : null;
  const chance = match.right ? liveMatchChance({
    left: { projected: match.left.projected, offset: match.left.offset, starters: leftStarters.map(player => toOddsStarter(player, match.week)), week: match.week },
    right: { projected: match.right.projected, offset: match.right.offset, starters: rightStarters.map(player => toOddsStarter(player, match.week)), week: match.week },
    games, now,
  }) : null;
  const seriesLeft = liveSeries(match.left.slug, match.left.teamId);
  const seriesRight = match.right ? liveSeries(match.right.slug, match.right.teamId) : null;
  const facts = matchFacts({
    leftName: match.left.manager,
    rightName: match.right?.manager ?? '',
    leftProjected: projectedTotal(match.left.projected, match.left.offset),
    rightProjected: match.right ? projectedTotal(match.right.projected, match.right.offset) : null,
    leftPlayers, rightPlayers, leftTeamId: match.left.teamId, rightTeamId: match.right?.teamId ?? null,
    games, now, week: match.week, final: match.status === 'final',
    leftScore: match.left.score, rightScore: match.right?.score ?? null,
    leftTotal: matchTotal(match.left.score, match.left.offset),
    rightTotal: match.right ? matchTotal(match.right.score, match.right.offset) : null,
  });
  const showLeft = !narrow || filter !== 'right';
  const showRight = !narrow || filter !== 'left';
  const markers = windowMarkers([...leftStarters, ...rightStarters].map(player => ({ kickoff: player.kickoff ?? games[player.proTeam]?.kickoff })));
  const onLeft = isFollowedTeam(followed, match.left.slug, match.left.teamId);
  return <section className="matchday-match" id={`matchday-${match.id}`}>
    <header className="matchday-match-head"><p className="eyebrow">{match.status === 'final' ? 'FINAL' : match.status === 'upcoming' ? 'UPCOMING' : 'LIVE'} <span>/</span> WEEK {match.week}</p><h2><Link to={match.href}>{match.label}</Link></h2><p className={onLeft ? 'followed-name' : ''}>{match.left.manager}<FollowedNote on={onLeft} />{match.right ? ` vs ${match.right.manager}` : ' · Bye'}</p></header>
    <div className="matchday-layout">
      <div className="matchday-main">
        <Scoreboard match={match} chance={chance} leftRank={leftTeam?.rank ?? null} rightRank={rightTeam?.rank ?? null} leftLogo={leftTeam?.logoUrl} rightLogo={rightTeam?.logoUrl} pregameLeft={seriesLeft?.p[0] != null ? projectedTotal(seriesLeft.p[0], match.left.offset) : null} pregameRight={match.right && seriesRight?.p[0] != null ? projectedTotal(seriesRight.p[0], match.right.offset) : null} leftOut={stillOut(leftBoard)} rightOut={stillOut(rightBoard ?? { playing: [], above: [], below: [], yet: [], bye: [], done: [] })} />
        <ChanceChart match={match} seriesLeft={seriesLeft} seriesRight={seriesRight} leftStarters={leftStarters.map(player => toOddsStarter(player, match.week))} rightStarters={rightStarters.map(player => toOddsStarter(player, match.week))} games={games} now={now} markers={markers} />
        <MatchInsights facts={facts} />
      </div>
      <Board left={leftBoard} right={rightBoard} showLeft={showLeft} showRight={showRight && !!match.right} leftName={match.left.manager} rightName={match.right?.manager ?? 'Bye'} />
    </div>
  </section>;
}

function ManagerPicker() {
  const { setFollowed } = useAccount();
  const [choice, setChoice] = useState('');
  return <section className="page-intro"><div><p className="eyebrow">MATCHDAY</p><h1>Your matchday</h1><p className="intro-copy">Follow a manager to watch every match they play this week.</p></div>
    <div className="follow-prompt-actions">
      <label>Manager
        <select value={choice} onChange={event => setChoice(event.target.value)}>
          <option value="">Choose a manager</option>
          {(['premier', 'championship', 'league-one'] as const).map(slug => <optgroup key={slug} label={slug === 'league-one' ? 'League One' : slug === 'premier' ? 'Premier' : 'Championship'}>
            {MANAGERS.filter(item => item.slug === slug).map(item => <option key={item.key} value={item.key}>{item.manager}</option>)}
          </optgroup>)}
        </select>
      </label>
      <button type="button" className="button" disabled={!choice} onClick={() => { const manager = MANAGERS.find(item => item.key === choice); if (manager) void setFollowed({ key: manager.key, name: manager.manager }); }}>Follow</button>
    </div>
  </section>;
}

export function MatchdayPage() {
  const params = useParams();
  const account = useAccount();
  const followed = useFollowed();
  const routed = params.slug != null || params.teamId != null;
  const manager = routed ? managerFor(params.slug ?? '', params.teamId ?? '') ?? null : followed ? managerFor(followed.key.split(':')[0] ?? '', followed.key.split(':')[1] ?? '') ?? null : null;
  const summaries = useSummaries();
  const data: SummaryMap = {};
  for (const meta of LEAGUES) {
    const summary = summaries[meta.slug].data;
    if (summary) data[meta.slug] = summary;
  }
  const matches = manager ? matchdayMatches(data, manager.slug, manager.teamId) : [];
  const slugs = [...new Set(matches.flatMap(match => [match.left.slug, match.right?.slug].filter((slug): slug is LeagueSlug => !!slug)))];
  const watch = slugs.length ? slugs : manager ? [manager.slug] : [];
  const rosters = useRosters(watch);
  const live = useLive(watch);
  const narrow = useNarrow('(max-width: 720px)');
  const [filter, setFilter] = useState<SideFilter>('both');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer); }, []);
  usePageLabel(manager ? `${manager.manager} matchday` : 'Matchday');
  const players = Object.fromEntries(watch.map(slug => [slug, rosters[slug]?.data?.players ?? []])) as Partial<Record<LeagueSlug, RosteredPlayer[]>>;
  const games = Object.assign({}, ...watch.map(slug => live[slug]?.data?.games ?? {})) as Record<string, LiveGame>;
  const summary = manager ? summaries[manager.slug] : undefined;

  if (routed && !manager) return <p className="notice">Manager not found. <Link to="/matchday">Your matchday</Link></p>;
  if (!routed && !account.ready) return <p className="notice">Loading…</p>;
  if (!routed && !account.user) return <section className="page-intro"><div><p className="eyebrow">MATCHDAY</p><h1>Your matchday</h1><p className="intro-copy">Sign in and follow a manager to watch their week on one page.</p><button type="button" className="button" onClick={() => void account.signIn()}>Sign in</button></div></section>;
  if (!routed && !manager) return <ManagerPicker />;
  if (!manager) return null;
  if (!summary?.data) return <p className="notice">{summary?.error ? 'League data is temporarily unavailable.' : 'Loading league data…'}</p>;

  const you = isFollowedTeam(followed, manager.slug, manager.teamId);
  const teamFor = (slug: LeagueSlug, id: string) => data[slug]?.teams.find(team => team.id === id) ?? null;
  return <div className="matchday">
    <section className="page-intro"><div><p className="eyebrow">{summary.data.leagueName.toUpperCase()} <span>/</span> WEEK {summary.data.week}</p><h1>{you ? <span className="followed-name">{manager.manager}</span> : manager.manager}<FollowedNote on={you} /></h1><p className="intro-copy">Every match this week. <Link to={`/league/${manager.slug}/team/${manager.teamId}`}>Team page</Link></p></div></section>
    {summary?.data && <p className="competition-updates"><Fresh data={summary.data} error={summary.error} /></p>}
    {matches.length > 1 && <nav className="matchday-jumps" aria-label="Matches">{matches.map(match => <a key={match.id} href={`#matchday-${match.id}`}>{match.label}</a>)}</nav>}
    {narrow && matches.some(match => match.right) && <div className="matchday-toggle" role="group" aria-label="Which lineup">
      <button type="button" aria-pressed={filter === 'left'} onClick={() => setFilter('left')}>{you ? 'You' : manager.manager}</button>
      <button type="button" aria-pressed={filter === 'right'} onClick={() => setFilter('right')}>Opponent</button>
      <button type="button" aria-pressed={filter === 'both'} onClick={() => setFilter('both')}>Both</button>
    </div>}
    {matches.length ? matches.map(match => <MatchSection key={match.id} match={match} players={players} games={games} liveSeries={(slug, teamId) => live[slug]?.data?.series?.[teamId] ?? null} now={now} filter={filter} narrow={narrow} followed={followed} teamFor={teamFor} />) : <p className="notice">No matchup is scheduled for this week.</p>}
    <p className="source-note">Win chance uses ESPN’s live projection. Each starter still playing keeps a share of their usual weekly range. Scores refresh about every three minutes.</p>
  </div>;
}
