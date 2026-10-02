import { RECIPES, type ChartSpec, type RecipeName } from './chartSpec.ts';
import { axisStyle, baseOption, emptyChart, esc, fmt, quantile, type BuildEnv, type Card, type ResolvedChart } from './chartKit.ts';
import { careers, pairGames, seriesTable, type HistoryGame } from './stats.ts';
import type { Cell } from './askTools.ts';

export const isRecipe = (type: string): type is RecipeName => (RECIPES as readonly string[]).includes(type);

const regularSeason = (games: HistoryGame[], from?: number, to?: number) => games.filter(game => game.type === 'Season' && (from === undefined || game.season >= from) && (to === undefined || game.season <= to));

function skeleton(spec: ChartSpec, extras: Partial<ResolvedChart>): ResolvedChart {
  return { kind: 'echarts', title: spec.title, subtitle: spec.subtitle, table: { columns: [], rows: [] }, summary: '', caveats: [], warnings: [], height: 340, datasetIds: [], ...extras };
}

function rivalryMatrix(spec: ChartSpec, env: BuildEnv): ResolvedChart {
  const { theme } = env;
  const p = spec.params ?? {};
  const games = regularSeason(env.archive.games, p.from, p.to);
  const rows = seriesTable(games);
  const totals = new Map<string, { meetings: number; wins: number; losses: number }>();
  for (const row of rows) {
    const a = totals.get(row.teamA) ?? { meetings: 0, wins: 0, losses: 0 };
    const b = totals.get(row.teamB) ?? { meetings: 0, wins: 0, losses: 0 };
    a.meetings += row.meetings; a.wins += row.winsA; a.losses += row.winsB;
    b.meetings += row.meetings; b.wins += row.winsB; b.losses += row.winsA;
    totals.set(row.teamA, a); totals.set(row.teamB, b);
  }
  const pool = p.managers?.length ? p.managers : [...totals.entries()].sort((a, b) => b[1].meetings - a[1].meetings).slice(0, 10).map(entry => entry[0]);
  const rate = (name: string) => { const t = totals.get(name); return t && t.wins + t.losses ? t.wins / (t.wins + t.losses) : 0; };
  const names = [...pool].sort((a, b) => rate(b) - rate(a));
  if (names.length < 2) return emptyChart(spec.title, 'Pick at least two managers to compare.');
  const find = (a: string, b: string) => {
    const [first, second] = [a, b].sort((x, y) => x.localeCompare(y));
    const row = rows.find(item => item.teamA === first && item.teamB === second);
    if (!row) return null;
    return a === first ? { wins: row.winsA, losses: row.winsB, ties: row.ties, meetings: row.meetings } : { wins: row.winsB, losses: row.winsA, ties: row.ties, meetings: row.meetings };
  };
  const data: Array<{ value: [number, number, number]; record: string; drill: string }> = [];
  const table: Cell[][] = [];
  names.forEach((rowName, rowIndex) => {
    const line: Cell[] = [rowName];
    names.forEach((colName, colIndex) => {
      const series = rowName === colName ? null : find(rowName, colName);
      const decided = series ? series.wins + series.losses : 0;
      if (series && decided > 0) {
        const value = Math.round(series.wins / decided * 1000) / 10;
        data.push({ value: [colIndex, rowIndex, value], record: `${rowName} ${series.wins}\u2013${series.losses} ${colName}${series.ties ? `, ${series.ties} tied` : ''} (${series.meetings} games)`, drill: `Show the full head-to-head history between ${rowName} and ${colName}` });
        line.push(value);
      } else line.push(null);
    });
    table.push(line);
  });
  const option = {
    ...baseOption(theme, { top: 8 }), legend: undefined,
    grid: { left: 8, right: 18, top: 8, bottom: 62, containLabel: true },
    tooltip: { ...baseOption(theme).tooltip, trigger: 'item', formatter: (params: { data: { record: string; value: [number, number, number] } }) => `${esc(params.data.record)}<br/><b>${fmt(params.data.value[2])}%</b> of decided games` },
    xAxis: { type: 'category', data: names, position: 'top', splitArea: { show: true }, ...axisStyle(theme, false), axisLabel: { color: theme.muted, interval: 0, rotate: names.length > 8 ? 40 : 0 } },
    yAxis: { type: 'category', data: names, inverse: true, splitArea: { show: true }, ...axisStyle(theme, false), axisLabel: { color: theme.muted, interval: 0 } },
    visualMap: { min: 0, max: 100, calculable: true, orient: 'horizontal', left: 'center', bottom: 4, textStyle: { color: theme.muted }, inRange: { color: [theme.dark ? '#ee7a72' : '#c8453d', theme.dark ? '#2a2d31' : '#f1f2f3', theme.accent] } },
    series: [{ type: 'heatmap', data, label: { show: names.length <= 11, color: theme.text, fontSize: 11, formatter: (params: { data: { value: [number, number, number] } }) => String(Math.round(params.data.value[2])) }, emphasis: { itemStyle: { borderColor: theme.text, borderWidth: 1 } } }],
  };
  const range = p.from || p.to ? ` for ${p.from ?? 2002} to ${p.to ?? 2025}` : '';
  return skeleton(spec, {
    option, height: Math.max(340, 120 + names.length * 34),
    table: { columns: ['Manager (row) vs column', ...names], rows: table },
    summary: `Head-to-head heatmap${range} for ${names.join(', ')}. Each cell is the row manager's regular-season win percentage against the column manager.`,
    caveats: ['Regular-season games only. Cells show the row manager\u2019s win percentage with ties left out. Blank cells mean no games.'],
  });
}

function seasonRace(spec: ChartSpec, env: BuildEnv): ResolvedChart {
  const { theme } = env;
  const p = spec.params ?? {};
  const season = p.season!;
  const league = p.league ?? (season < 2013 ? 'Combined' : 'Premier');
  const games = regularSeason(env.archive.games, season, season).filter(game => game.league === league && game.week !== null);
  if (!games.length) return emptyChart(spec.title, `No regular-season games are in the archive for ${league} in ${season}.`);
  const weeks = [...new Set(games.map(game => game.week as number))].sort((a, b) => a - b);
  const teams = [...new Set(games.flatMap(game => [game.teamA, game.teamB]))];
  const wins = new Map(teams.map(team => [team, 0]));
  const points = new Map(teams.map(team => [team, 0]));
  const ranks = new Map<string, Array<number | null>>(teams.map(team => [team, []]));
  for (const week of weeks) {
    for (const game of games.filter(item => item.week === week)) {
      wins.set(game.teamA, (wins.get(game.teamA) ?? 0) + (game.scoreA > game.scoreB ? 1 : game.scoreA === game.scoreB ? 0.5 : 0));
      wins.set(game.teamB, (wins.get(game.teamB) ?? 0) + (game.scoreB > game.scoreA ? 1 : game.scoreA === game.scoreB ? 0.5 : 0));
      points.set(game.teamA, (points.get(game.teamA) ?? 0) + game.scoreA);
      points.set(game.teamB, (points.get(game.teamB) ?? 0) + game.scoreB);
    }
    const order = [...teams].sort((a, b) => wins.get(b)! - wins.get(a)! || points.get(b)! - points.get(a)!);
    for (const team of teams) ranks.get(team)!.push(order.indexOf(team) + 1);
  }
  const highlight = new Set((p.managers ?? []).map(name => name.toLowerCase()));
  const final = [...teams].sort((a, b) => ranks.get(a)!.at(-1)! - ranks.get(b)!.at(-1)!);
  const option = {
    ...baseOption(theme, { top: 12 }), legend: undefined,
    grid: { left: 8, right: 96, top: 12, bottom: 12, containLabel: true },
    tooltip: { ...baseOption(theme).tooltip, trigger: 'axis', axisPointer: { type: 'line' }, order: 'valueAsc' },
    xAxis: { type: 'category', data: weeks.map(week => `W${week}`), boundaryGap: false, ...axisStyle(theme, false) },
    yAxis: { type: 'value', inverse: true, min: 1, max: teams.length, interval: 1, ...axisStyle(theme) },
    series: teams.map(team => {
      const faded = highlight.size > 0 && !highlight.has(team.toLowerCase());
      const color = env.color(team);
      return {
        type: 'line', name: team, data: ranks.get(team), symbolSize: 6, lineStyle: { width: highlight.size && !faded ? 4 : 2.5, color, opacity: faded ? 0.25 : 1 }, itemStyle: { color, opacity: faded ? 0.25 : 1 },
        endLabel: { show: true, formatter: '{a}', color: theme.text, opacity: faded ? 0.4 : 1 }, emphasis: { focus: 'series' },
      };
    }),
  };
  return skeleton(spec, {
    option, height: Math.max(340, 120 + teams.length * 26),
    table: { columns: ['Manager', ...weeks.map(week => `Week ${week}`)], rows: teams.map(team => [team, ...ranks.get(team)!]) },
    summary: `Standings rank by week for ${league} in ${season}. After week ${weeks.at(-1)}: ${final.slice(0, 5).map((team, index) => `${index + 1}. ${team}`).join(', ')}.`,
    caveats: ['Rank is by wins (ties count half), then total points scored, through each week. It can differ from the official final standings.'],
  });
}

function careerTimeline(spec: ChartSpec, env: BuildEnv): ResolvedChart {
  const { theme } = env;
  const name = spec.params!.manager!;
  const seasons = env.archive.seasons.filter(row => row.team === name).sort((a, b) => a.season - b.season);
  if (!seasons.length) return emptyChart(spec.title, `${name} has no seasons in the archive.`);
  const first = seasons[0].season; const last = seasons.at(-1)!.season;
  const years = Array.from({ length: last - first + 1 }, (_, index) => first + index);
  const by = new Map(seasons.map(row => [row.season, row]));
  const finish = years.map(year => by.get(year)?.rankSeason ?? null);
  const maxRank = Math.max(8, ...finish.filter((value): value is number => value !== null));
  const markers = (key: 'rankFinal' | 'cupRank' | 'jfflRank', labelText: string, symbol: string, color: string, size: number) => ({
    type: 'scatter', name: labelText, symbol, symbolSize: size, z: 5, itemStyle: { color, borderColor: theme.surface, borderWidth: 1.5 },
    data: years.map(year => { const row = by.get(year); return row && row[key] === 1 ? { value: row.rankSeason ?? null, drill: `Break down ${name}'s ${year} season` } : null; }),
  });
  const option = {
    ...baseOption(theme, { legend: true }),
    tooltip: {
      ...baseOption(theme).tooltip, trigger: 'axis', axisPointer: { type: 'line' },
      formatter: (params: Array<{ axisValue: string }>) => {
        const row = by.get(Number(params[0]?.axisValue));
        if (!row) return esc(params[0]?.axisValue);
        const parts = [`Finish ${row.rankSeason ?? '\u2014'} in ${row.league}`, row.wins != null ? `Record ${row.wins}\u2013${row.losses ?? '\u2014'}${row.ties ? `\u2013${row.ties}` : ''}` : '', row.rankFinal === 1 ? 'Won the Superbowl' : '', row.cupRank === 1 ? 'Won the league cup' : '', row.jfflRank === 1 ? 'Won the JFFL Cup' : '', row.draft != null ? `Drafted ${row.draft}` : ''].filter(Boolean);
        return `<b>${row.season}</b><br/>${parts.map(esc).join('<br/>')}`;
      },
    },
    xAxis: { type: 'category', data: years.map(String), boundaryGap: true, ...axisStyle(theme, false) },
    yAxis: { type: 'value', inverse: true, min: 1, max: maxRank, interval: 1, name: 'Regular-season finish', ...axisStyle(theme) },
    series: [
      { type: 'line', name: 'Regular-season finish', data: finish, connectNulls: false, symbolSize: 7, lineStyle: { width: 2.5, color: theme.palette[0] }, itemStyle: { color: theme.palette[0] } },
      markers('rankFinal', 'Superbowl', 'diamond', theme.palette[1], 20),
      markers('cupRank', 'League cup', 'triangle', theme.palette[2], 17),
      markers('jfflRank', 'JFFL Cup', 'rect', theme.palette[3], 16),
    ],
  };
  const career = careers(env.archive.seasons).find(row => row.team === name);
  const cards: Card[] = career ? [
    { label: 'Seasons', value: String(career.seasons), note: `${career.first} to ${career.last}` },
    { label: 'Season titles', value: String(career.seasonTitles) },
    { label: 'Superbowls', value: String(career.superBowls) },
    { label: 'League cups', value: String(career.leagueCups) },
    { label: 'JFFL Cups', value: String(career.jfflCups) },
  ] : [];
  return skeleton(spec, {
    option, cards, height: 360,
    table: { columns: ['Season', 'League', 'Finish', 'Superbowl', 'Cup', 'JFFL Cup', 'Wins', 'Losses', 'Draft'], rows: seasons.map(row => [row.season, row.league, row.rankSeason, row.rankFinal, row.cupRank, row.jfflRank, row.wins, row.losses, row.draft]) },
    summary: `${name}'s career from ${first} to ${last}: ${career ? `${career.seasonTitles} season titles, ${career.superBowls} Superbowls, ${career.leagueCups} league cups, ${career.jfflCups} JFFL Cups.` : ''}`,
    caveats: ['Rank 1 is first. A gap in the line means the archive has no finish for that year. Markers sit at that season\u2019s regular-season finish.'],
  });
}

function trophyWall(spec: ChartSpec, env: BuildEnv): ResolvedChart {
  const { theme } = env;
  const p = spec.params ?? {};
  let rows = careers(env.archive.seasons).map(row => ({ ...row, total: row.seasonTitles + row.superBowls + row.leagueCups + row.jfflCups }));
  if (p.managers?.length) rows = rows.filter(row => p.managers!.includes(row.team));
  rows = rows.sort((a, b) => b.total - a.total || a.team.localeCompare(b.team)).slice(0, p.managers?.length ? 16 : 15);
  if (!rows.length) return emptyChart(spec.title, 'No managers to show.');
  const kinds = [
    ['Season titles', 'seasonTitles', theme.palette[0]], ['Superbowls', 'superBowls', theme.palette[1]],
    ['League cups', 'leagueCups', theme.palette[2]], ['JFFL Cups', 'jfflCups', theme.palette[3]],
  ] as const;
  const option = {
    ...baseOption(theme, { legend: true }),
    tooltip: { ...baseOption(theme).tooltip, trigger: 'axis', axisPointer: { type: 'shadow' } },
    xAxis: { type: 'value', minInterval: 1, ...axisStyle(theme) },
    yAxis: { type: 'category', data: rows.map(row => row.team), inverse: true, ...axisStyle(theme, false), axisLabel: { color: theme.muted, interval: 0 } },
    series: kinds.map(([name, key, color]) => ({ type: 'bar', name, stack: 'trophies', barMaxWidth: 26, itemStyle: { color }, emphasis: { focus: 'series' }, data: rows.map(row => row[key]) })),
  };
  return skeleton(spec, {
    option, height: Math.max(280, 90 + rows.length * 28),
    table: { columns: ['Manager', ...kinds.map(kind => kind[0]), 'Total'], rows: rows.map(row => [row.team, row.seasonTitles, row.superBowls, row.leagueCups, row.jfflCups, row.total]) },
    summary: `Trophies by manager. ${rows.slice(0, 3).map(row => `${row.team} ${row.total}`).join(', ')} lead.`,
    caveats: ['Season titles are regular-season rank 1. League cups and the JFFL Cup start when those competitions began.'],
  });
}

function scoringDistribution(spec: ChartSpec, env: BuildEnv): ResolvedChart {
  const { theme } = env;
  const p = spec.params ?? {};
  const games = regularSeason(env.archive.games, p.from, p.to).filter(game => !p.league || game.league === p.league);
  const groups = p.managers?.length ? p.managers.slice(0, 4) : ['All managers'];
  const scores = new Map<string, number[]>();
  for (const group of groups) scores.set(group, []);
  for (const game of games) {
    if (!p.managers?.length) { scores.get('All managers')!.push(game.scoreA, game.scoreB); continue; }
    if (scores.has(game.teamA)) scores.get(game.teamA)!.push(game.scoreA);
    if (scores.has(game.teamB)) scores.get(game.teamB)!.push(game.scoreB);
  }
  const all = [...scores.values()].flat();
  if (!all.length) return emptyChart(spec.title, 'No regular-season scores match those filters.');
  const bin = p.bin ?? 10;
  const low = Math.floor(Math.min(...all) / bin) * bin;
  const high = Math.floor(Math.max(...all) / bin) * bin;
  const edges = Array.from({ length: (high - low) / bin + 1 }, (_, index) => low + index * bin);
  const share = groups.length > 1;
  const counts = new Map(groups.map(group => {
    const list = scores.get(group)!;
    return [group, edges.map(edge => { const n = list.filter(score => score >= edge && score < edge + bin).length; return share ? Math.round(n / Math.max(list.length, 1) * 1000) / 10 : n; })];
  }));
  const option = {
    ...baseOption(theme, { legend: share }),
    tooltip: { ...baseOption(theme).tooltip, trigger: 'axis', axisPointer: { type: 'shadow' } },
    xAxis: { type: 'category', data: edges.map(edge => `${edge}\u2013${edge + bin - 1}`), name: 'Score', nameLocation: 'middle', nameGap: 30, ...axisStyle(theme, false), nameTextStyle: { color: theme.muted, align: 'center' } },
    yAxis: { type: 'value', name: share ? '% of games' : 'Games', ...axisStyle(theme) },
    series: groups.map((group, index) => ({ type: 'bar', name: group, data: counts.get(group), barGap: '10%', barMaxWidth: 34, itemStyle: { color: p.managers?.length ? env.color(group) : theme.palette[index], borderRadius: [6, 6, 0, 0] }, emphasis: { focus: 'series' } })),
  };
  const cards: Card[] = groups.map(group => {
    const list = [...scores.get(group)!].sort((a, b) => a - b);
    const mean = list.length ? list.reduce((sum, value) => sum + value, 0) / list.length : null;
    return { label: group, value: mean === null ? '\u2014' : fmt(Math.round(mean * 10) / 10), note: list.length ? `mean, median ${fmt(quantile(list, 0.5))}, ${list.length} scores` : 'no scores' };
  });
  return skeleton(spec, {
    option, cards, height: 320,
    table: { columns: ['Score range', ...groups], rows: edges.map((edge, index) => [`${edge}\u2013${edge + bin - 1}`, ...groups.map(group => counts.get(group)![index])]) },
    summary: `Distribution of regular-season scores in ${bin}-point bins. ${cards.map(card => `${card.label}: mean ${card.value}`).join('. ')}.`,
    caveats: ['Single-week regular-season scores only. Cup totals are left out. 2002 has almost no weekly scores.'],
  });
}

function draftSlotCurve(spec: ChartSpec, env: BuildEnv): ResolvedChart {
  const { theme } = env;
  const metric = spec.params?.metric?.toLowerCase();
  const bySlot = new Map<number, { n: number; titles: number; top3: number }>();
  for (const season of env.archive.seasons) {
    if (season.draft == null || season.rankSeason == null) continue;
    const entry = bySlot.get(season.draft) ?? { n: 0, titles: 0, top3: 0 };
    entry.n += 1;
    if (season.rankSeason === 1) entry.titles += 1;
    if (season.rankSeason <= 3) entry.top3 += 1;
    bySlot.set(season.draft, entry);
  }
  const slots = [...bySlot.keys()].sort((a, b) => a - b);
  if (!slots.length) return emptyChart(spec.title, 'No draft data is available.');
  const pct = (count: number, n: number) => Math.round(count / n * 1000) / 10;
  const showTop3 = metric !== 'title';
  const showTitle = metric !== 'top3' && metric !== 'top_three';
  const tip = (slot: number) => { const e = bySlot.get(slot)!; return `Pick ${slot}: ${e.n} seasons, ${e.titles} titles, ${e.top3} top-3 finishes`; };
  const option = {
    ...baseOption(theme, { legend: true }),
    tooltip: { ...baseOption(theme).tooltip, trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (params: Array<{ axisValue: string; marker: string; seriesName: string; value: number }>) => `<b>${esc(tip(Number(params[0].axisValue)))}</b><br/>${params.map(item => `${item.marker} ${esc(item.seriesName)}: ${fmt(item.value)}%`).join('<br/>')}` },
    xAxis: { type: 'category', data: slots.map(String), name: 'Draft slot', nameLocation: 'middle', nameGap: 28, ...axisStyle(theme, false), nameTextStyle: { color: theme.muted, align: 'center' } },
    yAxis: { type: 'value', min: 0, name: '% of seasons', ...axisStyle(theme) },
    series: [
      ...(showTop3 ? [{ type: 'bar', name: 'Finished top 3', barMaxWidth: 28, data: slots.map(slot => ({ value: pct(bySlot.get(slot)!.top3, bySlot.get(slot)!.n), itemStyle: { color: theme.palette[0], opacity: bySlot.get(slot)!.n < 10 ? 0.4 : 1, borderRadius: [6, 6, 0, 0] } })) }] : []),
      ...(showTitle ? [{ type: 'line', name: 'Won the league', symbolSize: 8, lineStyle: { width: 2.5, color: theme.palette[1] }, itemStyle: { color: theme.palette[1] }, data: slots.map(slot => pct(bySlot.get(slot)!.titles, bySlot.get(slot)!.n)) }] : []),
    ],
  };
  return skeleton(spec, {
    option, height: 340,
    table: { columns: ['Draft slot', 'Seasons', 'Titles', 'Title %', 'Top 3', 'Top 3 %'], rows: slots.map(slot => { const e = bySlot.get(slot)!; return [slot, e.n, e.titles, pct(e.titles, e.n), e.top3, pct(e.top3, e.n)]; }) },
    summary: `Share of seasons that finished top 3 or won the league, by draft slot, across ${slots.length} slots.`,
    caveats: ['A season counts when both draft slot and regular-season rank are known. Slots with fewer than 10 seasons are faded because their rates swing a lot.'],
  });
}

function h2hScoreboard(spec: ChartSpec, env: BuildEnv): ResolvedChart {
  const { theme } = env;
  const { a, b } = spec.params!;
  const games = pairGames(env.archive.games, a!, b!);
  if (!games.length) return emptyChart(spec.title, `${a} and ${b} have no regular-season games in the archive.`);
  let aWins = 0; let bWins = 0; let ties = 0;
  const rows = games.map(game => {
    const aScore = game.teamA === a ? game.scoreA : game.scoreB;
    const bScore = game.teamA === a ? game.scoreB : game.scoreA;
    if (aScore === bScore) ties += 1; else if (aScore > bScore) aWins += 1; else bWins += 1;
    return { when: `${game.season} W${game.week}`, league: game.league, aScore, bScore, diff: aScore - bScore };
  });
  const option = {
    ...baseOption(theme, { zoom: rows.length > 24 }),
    tooltip: { ...baseOption(theme).tooltip, trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (params: Array<{ dataIndex: number }>) => { const row = rows[params[0].dataIndex]; return `<b>${esc(row.when)}</b> (${esc(row.league)})<br/>${esc(a)} ${fmt(row.aScore)}<br/>${esc(b)} ${fmt(row.bScore)}`; } },
    xAxis: { type: 'category', data: rows.map(row => row.when), ...axisStyle(theme, false), axisLabel: { color: theme.muted, hideOverlap: true, rotate: rows.length > 12 ? 45 : 0 } },
    yAxis: { type: 'value', name: `\u2191 ${a} ahead   ${b} ahead \u2193`, ...axisStyle(theme) },
    series: [{
      type: 'bar', barMaxWidth: 30,
      data: rows.map(row => ({ value: row.diff, itemStyle: { color: row.diff === 0 ? theme.muted : row.diff > 0 ? env.color(a!) : env.color(b!) }, drill: `Tell me about the ${row.when} game between ${a} and ${b}` })),
      markLine: { silent: true, symbol: 'none', lineStyle: { color: theme.muted, type: 'solid' }, label: { show: false }, data: [{ yAxis: 0 }] },
    }],
  };
  const cards: Card[] = [
    { label: `${a} wins`, value: String(aWins) }, { label: `${b} wins`, value: String(bWins) },
    { label: 'Ties', value: String(ties) }, { label: 'Meetings', value: String(games.length) },
  ];
  return skeleton(spec, {
    option, cards, height: 320,
    table: { columns: ['Game', 'League', a!, b!, 'Margin'], rows: rows.map(row => [row.when, row.league, row.aScore, row.bScore, row.diff]) },
    summary: `${a} versus ${b}: ${aWins}\u2013${bWins}${ties ? `\u2013${ties}` : ''} over ${games.length} regular-season meetings. Bars above zero are ${a} wins.`,
    caveats: ['Regular-season meetings only. Cup and Superbowl games are not included.'],
  });
}

export function buildRecipe(spec: ChartSpec, env: BuildEnv): ResolvedChart {
  switch (spec.type as RecipeName) {
    case 'rivalry_matrix': return rivalryMatrix(spec, env);
    case 'season_race': return seasonRace(spec, env);
    case 'career_timeline': return careerTimeline(spec, env);
    case 'trophy_wall': return trophyWall(spec, env);
    case 'scoring_distribution': return scoringDistribution(spec, env);
    case 'draft_slot_curve': return draftSlotCurve(spec, env);
    case 'h2h_scoreboard': return h2hScoreboard(spec, env);
    default: return emptyChart(spec.title, 'That chart recipe is not available.');
  }
}
