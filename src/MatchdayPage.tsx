import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAccount, useFollowed } from './account';
import { usePageLabel } from './BackLink';
import { ArchiveChart, useDarkMode } from './history/ArchiveChart';
import { chartTheme } from './history/archiveCharts';
import { baseOption, esc } from './history/chartKit';
import { useLive, useLiveWeek, useRosters, useSummaries } from './data';
import { isFollowedTeam } from './follow';
import { finalsNote } from './finalsRematch';
import { useFinishedSeriesGames } from './useSeriesGames';
import { historicalStarters } from './lineups';
import { collapseGaps, forecastEnd, liveMatchChance, openVariance, recordedProjection, scoreChartScale, scoreLine, sideVariance, toOddsStarter, winChanceSeries, withNow } from './liveOdds';
import { matchdayMatches, matchFacts, matchTotal, playerBoard, pointSpan, pointsStillOut, windowMarkers, type BoardRow, type MatchdayMatch, type MatchFacts, type PlayerBoard } from './matchday';
import { PlayerIdentity } from './PlayerIdentity';
import { MANAGERS, leagueInk, managerFor } from './reference';
import { RankMark } from './RankMark';
import { LEAGUES, type LeagueSlug, type LiveGame, type RosteredPlayer, type Team, type WeekLineup } from './types';
import { Fresh, points } from './ui';
import type { SummaryMap } from './competitions';

type SideFilter = 'left' | 'right' | 'both';
type ChartMode = 'chance' | 'score';

const clockFormat = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit' });
const axisClock = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric' });

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

function Scoreboard({ match, chance, leftRank, rightRank, leftLogo, rightLogo, leftOut, rightOut }: {
  match: MatchdayMatch;
  chance: { left: number; right: number } | 'level' | null;
  leftRank: number | null;
  rightRank: number | null;
  leftLogo?: string | null;
  rightLogo?: string | null;
  leftOut: { count: number; low: number | null; high: number | null };
  rightOut: { count: number; low: number | null; high: number | null };
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
      <ProjectionSide current={leftProjected} />
      <span>{status}</span>
      {match.right ? <ProjectionSide current={rightProjected} align="right" /> : <span>Bye</span>}
    </p>
    {odds && <div className="match-chance">
      <div className="duel-read"><span className={odds.left > odds.right ? 'lead' : ''}>{odds.left}%</span><span className="duel-label">Win chance</span><span className={odds.right > odds.left ? 'lead' : ''}>{odds.right}%</span></div>
      <div className="win-bar" role="img" aria-label={`${match.left.manager} ${odds.left} percent. ${match.right?.manager ?? 'Bye'} ${odds.right} percent.`}><span className={odds.left > odds.right ? 'favored' : ''} style={{ width: `${odds.left}%` }} /><span className={odds.right > odds.left ? 'favored' : ''} style={{ width: `${odds.right}%` }} /></div>
      <div className="matchday-remaining">{leftOut.count || rightOut.count ? <><RemainingSide out={leftOut} /><RemainingSide out={rightOut} align="right" /></> : <p className="cup-odds-note">Every starter has played.</p>}</div>
    </div>}
  </article>;
}

function ProjectionSide({ current, align }: { current: number | null; align?: 'right' }) {
  return <span className={align === 'right' ? 'is-right' : ''}>
    {current != null ? <><strong>{points(current)}</strong> projected</> : '—'}
  </span>;
}

function RemainingSide({ out, align }: { out: { count: number; low: number | null; high: number | null }; align?: 'right' }) {
  const range = out.low != null && out.high != null ? `${points(out.low)}–${points(out.high)} points left` : null;
  return <span className={align === 'right' ? 'is-right' : ''}>
    <strong>{out.count ? `${out.count} still to play` : 'All in'}</strong>
    <small>{out.count && range ? range : 'No projected points left'}</small>
  </span>;
}

function chartOption(dark: boolean, mode: ChartMode, leftName: string, rightName: string, pointsIn: { t: number; chance: number; scoreLeft: number | null; scoreRight: number | null; projectedLeft: number | null; projectedRight: number | null }[], markers: { label: string; at: number }[], outlook: { end: number; leftSd: number; rightSd: number } | null) {
  const { theme } = chartTheme(dark);
  const leftColor = theme.palette[0];
  const rightColor = theme.palette[1];
  const warp = collapseGaps(pointsIn.map(point => point.t * 1000));
  const marker = markers.map(item => ({ xAxis: warp.toX(item.at), label: { formatter: item.label, color: theme.muted, fontSize: 10 } }));
  const tip = (time: number, rows: string[]) => `<div>${esc(clockFormat.format(time))}</div>${rows.map(row => `<div>${row}</div>`).join('')}`;
  if (mode === 'score') {
    const last = pointsIn[pointsIn.length - 1];
    const nowMs = last.t * 1000;
    const endMs = outlook && outlook.end > nowMs + 60_000 ? outlook.end : nowMs;
    const nowW = warp.toX(nowMs);
    const scale = scoreChartScale(warp.toX(pointsIn[0].t * 1000), nowW, nowW + (endMs - nowMs));
    const plot = (time: number) => scale.toX(warp.toX(time));
    const real = (x: number) => warp.fromX(scale.fromX(x));
    const quiet = { axisLine: { show: false }, axisTick: { show: false }, splitLine: { show: false } };
    const scored = (name: string, color: string, value: (point: typeof pointsIn[number]) => number | null) => ({
      name, type: 'line' as const, showSymbol: false, connectNulls: false, color, z: 3,
      lineStyle: { width: 2.5 },
      data: pointsIn.flatMap(point => {
        const score = value(point);
        return score == null ? [] : [{ value: [plot(point.t * 1000), score] as [number, number] }];
      }),
    });
    const projected = (name: string, color: string, score: number | null, finish: number | null) => score == null || finish == null || endMs <= nowMs ? [] : [{
      name: `${name} projected`, type: 'line' as const, showSymbol: false, color, z: 2,
      lineStyle: { width: 1.5, type: 'dashed' as const },
      data: [{ value: [plot(nowMs), score] as [number, number] }, { value: [plot(endMs), finish] as [number, number] }],
    }];
    const cone = (stack: string, color: string, score: number | null, finish: number | null, sd: number) => {
      if (score == null || finish == null || sd < 0.5 || endMs <= nowMs) return [];
      const hidden = { symbol: 'none' as const, silent: true, legendHoverLink: false, lineStyle: { opacity: 0 }, tooltip: { show: false }, emphasis: { disabled: true } };
      return [
        { ...hidden, name: `${stack} low`, type: 'line' as const, stack, data: [[plot(nowMs), score], [plot(endMs), finish - sd]], areaStyle: { opacity: 0 } },
        { ...hidden, name: `${stack} span`, type: 'line' as const, stack, data: [[plot(nowMs), 0], [plot(endMs), sd * 2]], areaStyle: { color, opacity: 0.35 } },
      ];
    };
    const base = baseOption(theme, { top: 8 });
    return {
      ...base,
      legend: undefined,
      grid: { ...base.grid, top: 8, bottom: 4 },
      tooltip: { ...base.tooltip, trigger: 'axis' as const, axisPointer: { type: 'line' as const, lineStyle: { color: theme.muted, type: 'dashed' as const } }, formatter: (params: { axisValue?: number; data?: { value?: [number, number] } | [number, number]; seriesName?: string; marker?: string }[]) => {
        const axisTime = params.map(item => item.axisValue).find(value => value != null);
        if (axisTime == null) return '';
        const time = real(axisTime);
        const future = time > nowMs + 30_000;
        if (future) {
          const bands = [
            { name: leftName, color: leftColor, score: last.scoreLeft, finish: last.projectedLeft, sd: outlook?.leftSd ?? 0 },
            { name: rightName, color: rightColor, score: last.scoreRight, finish: last.projectedRight, sd: outlook?.rightSd ?? 0 },
          ];
          const span = Math.max(endMs - nowMs, 1);
          const place = Math.min(1, Math.max(0, (time - nowMs) / span));
          const shown = (value: number) => {
            const rounded = Math.round(value * 10) / 10;
            return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
          };
          const dot = (color: string) => `<span style="display:inline-block;margin-right:4px;border-radius:10px;width:10px;height:10px;background-color:${esc(color)}"></span>`;
          return tip(time, bands.flatMap(band => {
            if (band.score == null || band.finish == null || band.sd < 0.5) return [];
            const at = (end: number) => band.score! + (end - band.score!) * place;
            const marker = params.find(item => item.seriesName === `${band.name} projected`)?.marker || dot(band.color);
            return [
              `${marker} ${esc(band.name)} projected ${shown(at(band.finish))}`,
              `${marker} Low ${shown(at(band.finish - band.sd))} · High ${shown(at(band.finish + band.sd))}`,
            ];
          }));
        }
        const rows = params.filter(item => item.seriesName && !item.seriesName.includes('range') && !item.seriesName.endsWith(' projected') && item.data);
        return tip(time, rows.map(item => {
          const value = Array.isArray(item.data) ? item.data[1] : item.data?.value?.[1];
          return `${item.marker ?? ''} ${esc(item.seriesName)} ${esc(value)}`;
        }));
      } },
      xAxis: { type: 'time' as const, ...(scale.compressed ? { min: scale.min, max: scale.max } : {}), axisLabel: { color: theme.muted, hideOverlap: true, formatter: (value: number) => axisClock.format(real(value)) }, ...quiet },
      yAxis: { type: 'value' as const, scale: true, axisLabel: { color: theme.muted }, ...quiet },
      series: [
        ...cone('left-range', leftColor, last.scoreLeft, last.projectedLeft, outlook?.leftSd ?? 0),
        ...cone('right-range', rightColor, last.scoreRight, last.projectedRight, outlook?.rightSd ?? 0),
        scored(leftName, leftColor, point => point.scoreLeft),
        scored(rightName, rightColor, point => point.scoreRight),
        ...projected(leftName, leftColor, last.scoreLeft, last.projectedLeft),
        ...projected(rightName, rightColor, last.scoreRight, last.projectedRight),
      ],
    };
  }
  const last = pointsIn[pointsIn.length - 1];
  const spanStart = pointsIn[0].t * 1000;
  const spanEnd = last.t * 1000;
  const inWindow = marker.filter(item => item.xAxis >= warp.toX(spanStart) && item.xAxis <= warp.toX(spanEnd));
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
    xAxis: { type: 'time' as const, axisLabel: { color: theme.muted, hideOverlap: true, formatter: (value: number) => axisClock.format(warp.fromX(value)) } },
    yAxis: { type: 'value' as const, min: 0, max: 100, interval: 50, axisLabel: { color: theme.muted, formatter: '{value}%' }, splitLine: { show: false }, axisTick: { show: false } },
    series: [{
      name: leftName, type: 'line' as const, showSymbol: false, smooth: 0.2, color: leftColor,
      lineStyle: { width: 2.5, color: leftColor },
      areaStyle: { color: leftColor, opacity: 0.14 },
      markLine: { silent: true, symbol: 'none', lineStyle: { type: 'dashed' as const, color: theme.line }, label: { color: theme.muted, fontSize: 10 }, data: [{ yAxis: 50, label: { formatter: 'Even' } }, ...inWindow] },
      markPoint: { symbol: 'circle', symbolSize: 8, itemStyle: { color: leftColor }, label: { formatter: `${last.chance}%`, color: theme.text, fontWeight: 650, position: 'bottom' as const }, data: [{ coord: [warp.toX(spanEnd), last.chance] }] },
      data: pointsIn.map(point => ({ value: [warp.toX(point.t * 1000), point.chance], point })),
    }],
  };
}

function ChanceChart({ match, seriesLeft, seriesRight, leftStarters, rightStarters, games, now, markers, final }: {
  final?: boolean;
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
  const replay = final && !recordedProjection(seriesLeft) && !recordedProjection(seriesRight);
  const history = useMemo(() => {
    const left = final ? seriesLeft : withNow(seriesLeft, Math.floor(now / 1000), match.left.score, match.left.projected);
    const right = match.right ? final ? seriesRight : withNow(seriesRight, Math.floor(now / 1000), match.right.score, match.right.projected) : null;
    return winChanceSeries(left, right, at => ({
      left: sideVariance(leftStarters, games, at, now, match.week),
      right: sideVariance(rightStarters, games, at, now, match.week),
    }), match.left.offset, match.right?.offset ?? 0);
  }, [final, games, leftStarters, match, now, rightStarters, seriesLeft, seriesRight]);
  const scores = useMemo(
    () => scoreLine(seriesLeft, seriesRight, match.left.offset, match.right?.offset ?? 0),
    [match.left.offset, match.right, seriesLeft, seriesRight],
  );
  const outlook = useMemo(() => final ? null : ({
    end: Math.max(forecastEnd(leftStarters, games, now, match.week), forecastEnd(rightStarters, games, now, match.week)),
    leftSd: Math.sqrt(openVariance(leftStarters, games, now, match.week)),
    rightSd: Math.sqrt(openVariance(rightStarters, games, now, match.week)),
  }), [final, games, leftStarters, match.week, now, rightStarters]);
  const { theme } = chartTheme(dark);
  if (!match.right) return null;
  const chanceReady = history.length >= 2;
  const scoreReady = (replay ? scores : history).length >= 2;
  const height = narrow ? 200 : 240;
  const empty = final ? 'No score history was recorded for this week.' : 'History starts with the next update.';
  const card = (mode: ChartMode, title: string, ready: boolean, points: typeof history) => <section className="matchday-chart" aria-label={title}>
    <h3 className="matchday-chart-title">{title}</h3>
    {ready
      ? <ArchiveChart option={chartOption(dark, mode, match.left.manager, match.right!.manager, points, markers, outlook)} summary={`${match.left.manager} against ${match.right!.manager}: ${title}.`} height={height} />
      : <p className="matchday-empty">{mode === 'chance' && replay && scoreReady ? 'Win chance wasn\u2019t recorded for this week.' : empty}</p>}
    {mode === 'score' && replay && ready && <p className="source-note">Rebuilt from the play-by-play. The line ends on the official score.</p>}
    <div className="matchday-chart-names">
      <p className="chance-edge"><span style={{ background: theme.palette[0] }} />{match.left.manager}</p>
      <p className="chance-edge"><span style={{ background: theme.palette[1] }} />{match.right!.manager}</p>
    </div>
  </section>;
  return <div className="matchday-charts">
    {card('chance', 'Win chance', chanceReady, history)}
    {card('score', 'Score', scoreReady, replay ? scores : history)}
  </div>;
}

function PlayerLine({ row }: { row: BoardRow }) {
  const gap = row.gap != null && Math.abs(row.gap) >= 1 ? row.gap : null;
  const waiting = row.status === 'yet' || row.status === 'bye';
  const pace = gap == null ? null : gap > 0 ? `${points(gap)} ahead` : `${points(Math.abs(gap))} behind`;
  return <li className="matchday-player">
    <PlayerIdentity player={row.player} injury={row.player.injuryStatus} />
    <span className="matchday-player-score">
      <strong>{waiting ? points(row.player.projectedPoints) : points(row.player.weekPoints)}</strong>
      <small className={gap == null ? '' : gap > 0 ? 'up' : 'down'}>{waiting ? 'projected' : pace ?? (row.status === 'done' && row.player.projectedPoints != null ? 'on pace' : '')}</small>
    </span>
    {row.detail && <span className="matchday-chip">{row.detail}</span>}
    <RangeBar span={pointSpan(row)} quiet={row.status === 'done' || row.status === 'bye'} />
  </li>;
}

function RangeBar({ span, quiet }: { span: { low: number; high: number; center: number } | null; quiet?: boolean }) {
  if (!span) return null;
  const low = points(span.low);
  const high = points(span.high);
  return <span className={`matchday-range compact${quiet ? ' quiet' : ''}`} title={quiet ? 'Usual weekly points' : 'Where this player can still finish'} aria-label={`${quiet ? 'Usual points' : 'Can finish'} from ${low} to ${high}, expected ${points(span.center)}`}>
    <span>{low}</span>
    <span className="track-col"><span className="track" /><span className="matchday-range-mid">{points(span.center)}</span></span>
    <span>{high}</span>
  </span>;
}

function BoardColumn({ rows, name, side }: { rows: BoardRow[]; name: string; side: 'left' | 'right' }) {
  if (!rows.length) return <span />;
  return <div className={`matchday-column side-${side}`}>
    <p className="matchday-column-name">{name}</p>
    <ul className="matchday-players">{rows.map(row => <PlayerLine key={row.player.id} row={row} />)}</ul>
  </div>;
}

function PlayerColumns({ left, right, showLeft, showRight, leftName, rightName }: { left: BoardRow[]; right: BoardRow[]; showLeft: boolean; showRight: boolean; leftName: string; rightName: string }) {
  return <div className={`matchday-pair${showLeft && showRight ? '' : ' single'}`}>
    {showLeft && <BoardColumn rows={left} name={leftName} side="left" />}
    {showRight && <BoardColumn rows={right} name={rightName} side="right" />}
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
  const playing = { title: 'Playing now', left: left.playing, right: other.playing };
  const later: { title: string; left: BoardRow[]; right: BoardRow[] }[] = [
    { title: 'Beat their projection', left: finished(left.above, 1), right: finished(other.above, 1) },
    { title: 'Missed their projection', left: finished(left.below, -1), right: finished(other.below, -1) },
  ];
  const block = (section: { title: string; left: BoardRow[]; right: BoardRow[] }) => (section.left.length || section.right.length)
    ? <section key={section.title}><h3>{section.title}</h3><PlayerColumns left={section.left} right={section.right} showLeft={showLeft} showRight={showRight} leftName={leftName} rightName={rightName} /></section>
    : null;
  return <div className="matchday-board">
    <div className={`matchday-pair matchday-board-names${both ? '' : ' single'}`}><span className={showLeft ? 'side-left' : 'matchday-hidden'}>{leftName}</span><span className={showRight ? 'side-right' : 'matchday-hidden'}>{rightName}</span></div>
    {block(playing)}
    {yetWindows.length > 0 && <section><h3>Yet to play</h3>{yetWindows.map(window => <div key={window}><p className="matchday-window">{window}</p><PlayerColumns left={left.yet.find(group => group.window === window)?.players ?? []} right={other.yet.find(group => group.window === window)?.players ?? []} showLeft={showLeft} showRight={showRight} leftName={leftName} rightName={rightName} /></div>)}</section>}
    {later.map(block)}
    {(left.bye.length || other.bye.length) > 0 && <section><h3>Bye</h3><PlayerColumns left={left.bye} right={other.bye} showLeft={showLeft} showRight={showRight} leftName={leftName} rightName={rightName} /></section>}
    {(close(left).length || close(other).length) > 0 && <section><h3>On pace</h3><PlayerColumns left={close(left)} right={close(other)} showLeft={showLeft} showRight={showRight} leftName={leftName} rightName={rightName} /></section>}
  </div>;
}

function MatchInsights({ facts }: { facts: MatchFacts }) {
  if (!facts.catchup && !facts.swing && !facts.bench && !facts.lineup) return null;
  return <div className="matchday-insights">
    {facts.catchup && <article className="matchday-insight">
      <p className="eyebrow">{facts.catchup === 'level' ? 'Projection' : `What ${facts.catchup.name} needs to win`}</p>
      <strong>{facts.catchup === 'level' ? 'Level' : points(facts.catchup.amount)}</strong>
      <p>{facts.catchup === 'level' ? 'Both sides are projected to finish even.' : 'This many points better than predicted.'}</p>
    </article>}
    {facts.swing && <article className="matchday-insight">
      <p className="eyebrow">Widest range still out</p>
      <strong>{facts.swing.name}</strong>
      <div className="matchday-range" aria-label={`${facts.swing.name} can finish between ${points(facts.swing.low)} and ${points(facts.swing.high)}`}><span>{points(facts.swing.low)}</span><span className="track" /><span>{points(facts.swing.high)}</span></div>
      <p>Where this player can still finish.</p>
    </article>}
    {facts.bench && <article className="matchday-insight">
      <p className="eyebrow">Bench points</p>
      <div className="matchday-bench"><span>{facts.bench.leftName}<strong>{facts.bench.left == null ? '—' : points(facts.bench.left)}</strong></span>{facts.bench.rightName && <span>{facts.bench.rightName}<strong>{facts.bench.right == null ? '—' : points(facts.bench.right)}</strong></span>}</div>
      <p>Points scored by players who are not starting.</p>
    </article>}
    {facts.lineup && <article className="matchday-insight"><p className="eyebrow">A lineup that would have won</p><p>{facts.lineup}</p></article>}
  </div>;
}

function pastBoard(starters: RosteredPlayer[]): PlayerBoard {
  const done = starters.map(player => ({ player, status: 'done' as const, gap: null, progress: 1, spread: 0, detail: 'Final', window: '' }));
  return { playing: [], above: [], below: [], yet: [], bye: [], done };
}

function PastBoardView({ left, right, showLeft, showRight, leftName, rightName }: { left: BoardRow[]; right: BoardRow[]; showLeft: boolean; showRight: boolean; leftName: string; rightName: string }) {
  return <div className="matchday-board">
    <div className={`matchday-pair matchday-board-names${showLeft && showRight ? '' : ' single'}`}><span className={showLeft ? 'side-left' : 'matchday-hidden'}>{leftName}</span><span className={showRight ? 'side-right' : 'matchday-hidden'}>{rightName}</span></div>
    <section><h3>Final lineups</h3>{left.length || right.length ? <PlayerColumns left={left} right={right} showLeft={showLeft} showRight={showRight} leftName={leftName} rightName={rightName} /> : <p className="matchday-empty">Lineups for this week are not published yet.</p>}</section>
  </div>;
}

function MatchSection({ match, players, games, liveSeries, now, filter, narrow, teamFor, lineups }: {
  match: MatchdayMatch;
  lineups?: Partial<Record<LeagueSlug, WeekLineup[] | undefined>> | null;
  players: Partial<Record<LeagueSlug, RosteredPlayer[]>>;
  games: Record<string, LiveGame>;
  liveSeries: (slug: LeagueSlug, teamId: string) => { t: number[]; s: (number | null)[]; p: (number | null)[] } | null;
  now: number;
  filter: SideFilter;
  narrow: boolean;
  teamFor: (slug: LeagueSlug, teamId: string) => Team | null;
}) {
  const leftTeam = teamFor(match.left.slug, match.left.teamId);
  const played = useFinishedSeriesGames();
  const history = match.right ? finalsNote(match.left.manager, match.right.manager, 'latest', played) : null;
  if (lineups) {
    const startersFor = (slug: LeagueSlug, teamId: string) => historicalStarters(lineups[slug], teamId, match.week) ?? [];
    const rightSide = match.right;
    const leftStarters = startersFor(match.left.slug, match.left.teamId);
    const rightStarters = rightSide ? startersFor(rightSide.slug, rightSide.teamId) : [];
    const noOut = { count: 0, low: null, high: null };
    const unscored = (rows: RosteredPlayer[]) => rows.map(row => toOddsStarter({ ...row, weekPoints: null }, match.week));
    const pastMarkers = windowMarkers([...leftStarters, ...rightStarters].map(player => ({ kickoff: games[player.proTeam]?.kickoff })));
    return <section className="matchday-match" id={`matchday-${match.id}`}>
      <header className="matchday-match-head"><p className="eyebrow">FINAL <span>/</span> WEEK {match.week}</p><h2><Link to={match.href}>{match.label}</Link></h2><p>{match.left.manager}{rightSide ? ` vs ${rightSide.manager}` : ' · Bye'}</p>{history && <Link className="finals-note" to={history.href}>{history.text}</Link>}</header>
      <div className="matchday-layout">
        <div className="matchday-main">
          <Scoreboard match={{ ...match, left: { ...match.left, projected: null }, right: rightSide && { ...rightSide, projected: null } }} chance={null} leftRank={leftTeam?.rank ?? null} rightRank={(rightSide ? teamFor(rightSide.slug, rightSide.teamId) : null)?.rank ?? null} leftLogo={leftTeam?.logoUrl} rightLogo={rightSide ? teamFor(rightSide.slug, rightSide.teamId)?.logoUrl : null} leftOut={noOut} rightOut={noOut} />
          <ChanceChart final match={match} seriesLeft={liveSeries(match.left.slug, match.left.teamId)} seriesRight={rightSide ? liveSeries(rightSide.slug, rightSide.teamId) : null} leftStarters={unscored(leftStarters)} rightStarters={unscored(rightStarters)} games={games} now={now} markers={pastMarkers} />
        </div>
        <PastBoardView left={pastBoard(leftStarters).done} right={pastBoard(rightStarters).done} showLeft={!narrow || filter !== 'right'} showRight={(!narrow || filter !== 'left') && !!rightSide} leftName={match.left.manager} rightName={rightSide?.manager ?? 'Bye'} />
      </div>
    </section>;
  }
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
  return <section className="matchday-match" id={`matchday-${match.id}`}>
    <header className="matchday-match-head"><p className="eyebrow">{match.status === 'final' ? 'FINAL' : match.status === 'upcoming' ? 'UPCOMING' : 'LIVE'} <span>/</span> WEEK {match.week}</p><h2><Link to={match.href}>{match.label}</Link></h2><p>{match.left.manager}{match.right ? ` vs ${match.right.manager}` : ' · Bye'}</p>{history && <Link className="finals-note" to={history.href}>{history.text}</Link>}</header>
    <div className="matchday-layout">
      <div className="matchday-main">
        <Scoreboard match={match} chance={chance} leftRank={leftTeam?.rank ?? null} rightRank={rightTeam?.rank ?? null} leftLogo={leftTeam?.logoUrl} rightLogo={rightTeam?.logoUrl} leftOut={pointsStillOut(leftBoard)} rightOut={pointsStillOut(rightBoard ?? { playing: [], above: [], below: [], yet: [], bye: [], done: [] })} />
        <ChanceChart match={match} seriesLeft={seriesLeft} seriesRight={seriesRight} leftStarters={leftStarters.map(player => toOddsStarter(player, match.week))} rightStarters={rightStarters.map(player => toOddsStarter(player, match.week))} games={games} now={now} markers={markers} />
        <MatchInsights facts={facts} />
      </div>
      <Board left={leftBoard} right={rightBoard} showLeft={showLeft} showRight={showRight && !!match.right} leftName={match.left.manager} rightName={match.right?.manager ?? 'Bye'} />
    </div>
  </section>;
}

function ManagerOptions() {
  return LEAGUES.map(meta => <optgroup key={meta.slug} label={meta.name}>
    {MANAGERS.filter(item => item.slug === meta.slug).map(item => <option key={item.key} value={`${item.slug}/${item.teamId}`}>{item.manager}</option>)}
  </optgroup>);
}

function ManagerSwitch({ slug, teamId, week }: { slug: LeagueSlug; teamId: string; week: number | null }) {
  const navigate = useNavigate();
  const search = week == null ? '' : `?week=${week}`;
  return <label className="matchday-switch">Manager
    <select value={`${slug}/${teamId}`} onChange={event => navigate(`/matchday/${event.target.value}${search}`)}>
      <ManagerOptions />
    </select>
  </label>;
}

function MatchdayDirectory({ followedKey }: { followedKey: string | null }) {
  const yours = followedKey ? managerFor(followedKey.split(':')[0] ?? '', followedKey.split(':')[1] ?? '') : null;
  return <div className="matchday">
    <section className="page-intro"><div><p className="eyebrow">MATCHDAY</p><h1>Matchday</h1><p className="intro-copy">Pick a manager to see every match they play this week.</p></div></section>
    {yours && <Link className="matchday-strip" to={`/matchday/${yours.slug}/${yours.teamId}`}><span><span className="eyebrow">Your matchday</span><strong className={leagueInk(yours.slug)}>{yours.manager}</strong></span></Link>}
    <div className="matchday-directory">
      {LEAGUES.map(meta => <section key={meta.slug}><h2 className={leagueInk(meta.slug)}>{meta.name}</h2><ul>
        {MANAGERS.filter(item => item.slug === meta.slug).map(item => <li key={item.key}><Link className={item.key === followedKey ? 'is-you' : ''} to={`/matchday/${item.slug}/${item.teamId}`}>{item.manager}</Link></li>)}
      </ul></section>)}
    </div>
  </div>;
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
  const [search, setSearch] = useSearchParams();
  const currentWeek = manager ? data[manager.slug]?.week ?? 0 : 0;
  const asked = Number(search.get('week'));
  const selected = Number.isInteger(asked) && asked >= 1 && asked < currentWeek ? asked : currentWeek;
  const past = currentWeek > 0 && selected < currentWeek;
  const season = manager ? data[manager.slug]?.season ?? null : null;
  const matches = manager ? matchdayMatches(data, manager.slug, manager.teamId, selected) : [];
  const slugs = [...new Set(matches.flatMap(match => [match.left.slug, match.right?.slug].filter((slug): slug is LeagueSlug => !!slug)))];
  const watch = slugs.length ? slugs : manager ? [manager.slug] : [];
  const rosters = useRosters(watch);
  const live = useLive(watch);
  const liveWeek = useLiveWeek(watch, past ? season : null, past ? selected : null);
  const narrow = useNarrow('(max-width: 720px)');
  const [filter, setFilter] = useState<SideFilter>('both');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30_000); return () => window.clearInterval(timer); }, []);
  usePageLabel(manager ? `${manager.manager} matchday` : 'Matchday');
  const players = Object.fromEntries(watch.map(slug => [slug, rosters[slug]?.data?.players ?? []])) as Partial<Record<LeagueSlug, RosteredPlayer[]>>;
  const timeline = past ? liveWeek : live;
  const games = Object.assign({}, ...watch.map(slug => timeline[slug]?.data?.games ?? {})) as Record<string, LiveGame>;
  const lineups = past ? Object.fromEntries(watch.map(slug => [slug, rosters[slug]?.data?.weeklyLineups])) as Partial<Record<LeagueSlug, WeekLineup[] | undefined>> : null;
  const summary = manager ? summaries[manager.slug] : undefined;

  if (routed && !manager) return <p className="notice">Manager not found. <Link to="/matchday">All managers</Link></p>;
  if (!routed && !account.ready) return <p className="notice">Loading…</p>;
  if (!routed && !manager) return <MatchdayDirectory followedKey={followed?.key ?? null} />;
  if (!manager) return null;
  if (!summary?.data) return <p className="notice">{summary?.error ? 'League data is temporarily unavailable.' : 'Loading league data…'}</p>;

  const you = isFollowedTeam(followed, manager.slug, manager.teamId);
  const teamFor = (slug: LeagueSlug, id: string) => data[slug]?.teams.find(team => team.id === id) ?? null;
  return <div className="matchday">
    <section className="page-intro"><div><p className="eyebrow">{summary.data.leagueName.toUpperCase()} <span>/</span> WEEK {selected}</p><h1>{manager.manager}</h1><p className="intro-copy">Every match {past ? `in week ${selected}` : 'this week'}. <Link to={`/league/${manager.slug}/team/${manager.teamId}`}>Team page</Link></p></div><div className="matchday-selectors"><ManagerSwitch slug={manager.slug} teamId={manager.teamId} week={past ? selected : null} /><label className="matchday-switch">Week
      <select value={selected} onChange={event => { const next = Number(event.target.value); setSearch(next >= currentWeek ? {} : { week: String(next) }); }}>
        {Array.from({ length: currentWeek }, (_, index) => currentWeek - index).map(week => <option key={week} value={week}>{week === currentWeek ? `Week ${week} (current)` : `Week ${week}`}</option>)}
      </select>
    </label></div></section>
    {summary?.data && !past && <p className="competition-updates"><Fresh data={summary.data} error={summary.error} /></p>}
    {matches.length > 1 && <nav className="matchday-jumps" aria-label="Matches">{matches.map(match => <a key={match.id} href={`#matchday-${match.id}`}>{match.label}</a>)}</nav>}
    {narrow && matches.some(match => match.right) && <div className="matchday-toggle" role="group" aria-label="Which lineup">
      <button type="button" aria-pressed={filter === 'left'} onClick={() => setFilter('left')}>{you ? 'You' : manager.manager}</button>
      <button type="button" aria-pressed={filter === 'right'} onClick={() => setFilter('right')}>Opponent</button>
      <button type="button" aria-pressed={filter === 'both'} onClick={() => setFilter('both')}>Both</button>
    </div>}
    {matches.length ? matches.map(match => <MatchSection key={match.id} match={match} players={players} games={games} liveSeries={(slug, teamId) => timeline[slug]?.data?.series?.[teamId] ?? null} now={now} filter={filter} narrow={narrow} teamFor={teamFor} lineups={lineups} />) : <p className="notice">No matchup is scheduled for this week.</p>}
    {!past && <p className="source-note">Win chance uses ESPN’s live projection. The swing left is each starter’s own weekly range, shrunk by how much of the game is left and by points already on the board. It reaches 100 only when the other side has nothing left to play. Scores refresh about every three minutes.</p>}
    {past && <p className="source-note">A week that was recorded live keeps its win chance. A week that was not shows a score line rebuilt from the NFL play-by-play, ending on the official total.</p>}
  </div>;
}
