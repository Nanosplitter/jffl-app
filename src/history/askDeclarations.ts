import { AGG_FUNCTIONS, DATA_NOTES, FILTER_OPS, schemaDoc } from './askTools.ts';
import { ALL_KINDS, LEAGUES } from './chartSpec.ts';
import { MANAGERS } from '../reference.ts';

export interface ToolDeclaration {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

const str = (description: string) => ({ type: 'string', description });
const num = (description: string) => ({ type: 'number', description });
const int = (description: string) => ({ type: 'integer', description });
const list = (description: string, items: Record<string, unknown> = { type: 'string' }) => ({ type: 'array', description, items });

const filterItem = {
  type: 'object',
  properties: {
    field: str('Column name. Use status ("final" or "live") to include or leave out 2026 games still being played.'),
    op: { type: 'string', enum: [...FILTER_OPS], description: 'eq, ne, gt, gte, lt, lte, in (comma-separated list), between (two comma-separated values, inclusive), contains (text), is_null, not_null.' },
    value: str('The value as text, for example "2013" or "Jeff". For in and between, a comma-separated list such as "2013,2025". Not needed for is_null and not_null.'),
  },
  required: ['field', 'op'],
};

const queryProperties = {
  filters: list('Conditions that rows must meet (all of them).', filterItem),
  groupBy: list('Columns to group by. Use with aggregates.'),
  aggregates: list('Calculations per group (or over all rows if there is no groupBy).', {
    type: 'object',
    properties: {
      fn: { type: 'string', enum: [...AGG_FUNCTIONS], description: 'count, count_distinct, sum, mean, median, min, max, or rate (percent of rows matching "when").' },
      field: str('Column to aggregate. Not needed for count or rate.'),
      as: str('Name for the result column, letters, digits and underscores, for example "avgScore".'),
      when: list('Optional conditions. For rate this is required: the percent of rows that meet them. For other functions only matching rows are aggregated.', filterItem),
    },
    required: ['fn'],
  }),
  select: list('Columns to return when you are not aggregating.'),
  sort: list('Sort order, using result column names.', {
    type: 'object',
    properties: { field: str('Result column name.'), dir: { type: 'string', enum: ['asc', 'desc'], description: 'Direction.' } },
    required: ['field'],
  }),
  limit: int('Maximum rows to return. Defaults to 60 for plain rows and 300 for grouped results. Maximum 1000.'),
  within: {
    type: 'object',
    description: 'First keep only the rows that hold the min or max of a field inside each group, then run groupBy and aggregates on those rows. Ties for the extreme are all kept. Use this for who was highest or lowest inside each week or season, then count them. Filter nulls out of the compared field first.',
    properties: {
      groupBy: list('Columns that define each group, such as ["season", "league", "week"] for a league-week. Include league when the extreme is within that league, and leave it out for the whole archive.'),
      fn: { type: 'string', enum: ['min', 'max'], description: 'min keeps the lowest value in the group. max keeps the highest.' },
      field: str('Numeric column compared inside the group, such as score or margin.'),
    },
    required: ['groupBy', 'fn', 'field'],
  },
};

export const TOOL_DECLARATIONS: ToolDeclaration[] = [
  {
    name: 'query_games',
    description: 'Search game results. One row per team per game (each game appears twice, once from each side), so team-level questions such as highest scores, average points, or win counts work directly. league is the competition, so every JFFL Cup game has league JFFL. teamLeague and opponentLeague are the leagues those managers played in that season, and crossLeague is 1 when they differ. week on a cup row is the scheduled week of that round (league cups 2, 5, 8, 11; JFFL Cup pairs 3–4, 6–7, 9–10, 12–13, 15–16), and lastWeek is the end of the tie. Use double_duty for managers who played each other in both the league and a cup that week. Filter type Season for the league game alone. For a league\'s record against other leagues, including a round-by-round cup comparison, filter crossLeague = 1 and group by teamLeague (add round for each round) with sum of win, sum of loss, and count. count counts both sides of a game; use count_distinct on gameId for the number of matchups. teamFinish and opponentFinish are the final regular-season ranks that year, and betterFinish compares them only inside the same league. winStreak and lossStreak are consecutive regular-season results inside one season; for the longest, group by team and season and take the max, and for the current streak read the latest final regular-season game. Do not count streaks from raw rows. 2026 games have status live while being played; filter status final for records. Set within to keep whoever held the min or max inside each group (the lowest score in a league-week), then groupBy and count those rows. Returns a datasetId you can pass to render_chart.',
    parameters: { type: 'object', properties: queryProperties },
  },
  {
    name: 'query_seasons',
    description: 'Search team-season results: finishes, records, points, pointsAgainst, draft slot, club, rank movement, the provisional zone, and championship flags (seasonChamp, superBowlChamp, leagueCupChamp, jfflCupChamp, topThree are 1, 0, or null when unknown). Wins and points on this table are the official regular-season totals. Before 2026, pointsAgainst is null when the weekly log does not match that record, including 2002; leave those nulls out and say so. For 2026, pointsAgainst is the ESPN figure, and club, previousRank, week2Rank, draft, and zone are filled. One row per manager per season. The 2026 rows have status live: standing is the current position and undecided titles are null. Returns a datasetId you can pass to render_chart.',
    parameters: { type: 'object', properties: queryProperties },
  },
  {
    name: 'query_players',
    description: 'Search 2026 player scores. One row per rostered player per week, with the manager (team), slot, starter (1 starter, 0 bench or IR, null unknown), points, and status (live while that week is being played). The current week also has projected, seasonPoints, averagePoints, and injury. Use it for top scorers this week, a manager\u2019s best starters, or points left on the bench (starter 0). Counting stats such as yards and touchdowns are player_stats, not this table. There is no player data before 2026. Returns a datasetId you can pass to render_chart.',
    parameters: { type: 'object', properties: queryProperties },
  },
  {
    name: 'resolve_entity',
    description: 'Match a name the user typed to manager nicknames in the archive. Use it when a name is misspelled, partial, or ambiguous. If several managers match, ask the user which one they mean.',
    parameters: { type: 'object', properties: { name: str('The name as the user wrote it.') }, required: ['name'] },
  },
  {
    name: 'head_to_head',
    description: 'Every finished meeting between two managers. The summary splits regularSeason, cup, and superBowl, and all is their combined total. The top-level meetings and win counts are the regular season only. Quote the split the question asked for; do not add the groups yourself. Live 2026 games are left out. Returns a datasetId.',
    parameters: { type: 'object', properties: { a: str('First manager nickname.'), b: str('Second manager nickname.') }, required: ['a', 'b'] },
  },
  {
    name: 'manager_career',
    description: 'One manager\u2019s career: every season with finish, record, draft slot, and trophies, plus career totals for finished seasons. The summary also includes trophyRoom, the commissioner snapshot through 2025. The 2026 row is in progress and is not part of trophyRoom. Returns a datasetId.',
    parameters: { type: 'object', properties: { name: str('Manager nickname.') }, required: ['name'] },
  },
  {
    name: 'records',
    description: 'The record book: highest or lowest single scores, widest margins, one-point games, or ties. Counts finished games only, including finished 2026 games. JFFL Cup scores are two-week totals and are only in the jffl_cup book.',
    parameters: {
      type: 'object',
      properties: {
        book: { type: 'string', enum: ['weekly', 'jffl_cup', 'league_cup', 'super_bowl'], description: 'Which games to look at.' },
        kind: { type: 'string', enum: ['highest', 'lowest', 'blowouts', 'closest', 'ties'], description: 'Which list.' },
        limit: int('How many rows, up to 100. Defaults to 15.'),
      },
    },
  },
  {
    name: 'title_years',
    description: 'Who won the regular season (best record), the Superbowl, the league cup, and the JFFL Cup each year, by league. The rows are the full list for the years requested. Also counts how often the best record won the Superbowl. 2026 titles are null until decided.',
    parameters: { type: 'object', properties: { league: str(`Optional league: ${LEAGUES.join(', ')}.`), from: int('First season, 2002 or later.'), to: int('Last season, 2026 or earlier.') } },
  },
  {
    name: 'draft_slot_stats',
    description: 'How draft slot relates to finishing first or in the top three.',
    parameters: { type: 'object', properties: { by: { type: 'string', enum: ['bucket', 'slot'], description: 'bucket groups picks (1, 2-4, 5-8, 9+); slot lists each pick.' } } },
  },
  {
    name: 'week_slice',
    description: 'One regular-season week number across every season: the highest score each year, plus the overall high, low, and widest margin. Finished games only.',
    parameters: { type: 'object', properties: { week: int('Regular-season week number, such as 1 or 9.') }, required: ['week'] },
  },
  {
    name: 'double_duty',
    description: 'Managers who played each other in a regular-season game and a cup tie in the same scheduled week. One row per matchup, with both the league scores and the cup scores. cup "league" is the league cups (weeks 2, 5, 8, 11), cup "jffl" is the JFFL Cup (two-week windows), and cup "all" is both. A league-cup score equals that week\'s points. A JFFL Cup score is the two-week total. Use this instead of saying cup weeks cannot be lined up with the league schedule.',
    parameters: {
      type: 'object',
      properties: {
        cup: { type: 'string', enum: ['all', 'league', 'jffl'], description: 'Which cup. Defaults to all.' },
        manager: str('Optional manager nickname. Leave out for every pairing.'),
        from: int('First season. Defaults to 2013, when the cups began.'),
        to: int('Last season. Defaults to the current season.'),
      },
    },
  },
  {
    name: 'schedule',
    description: 'The 2026 schedule: league games for every scheduled week (including future weeks) and cup ties, one row per manager per game, with opponent, status (final, live, or scheduled), scores (null until played), and the saved ESPN projection for each side (null when none was saved). A cup projection adds the weekly projections and is null when any week of the tie has none. winChance is the scoreboard percent for an undecided league game and is null once the game is final, when a projection is missing, or on a cup tie. Use it for who someone plays next, upcoming weeks, a remaining schedule, or how a result compared with its projection. Defaults to the current week and the two after it.',
    parameters: {
      type: 'object',
      properties: {
        manager: str('Manager nickname. Leave out for everyone.'),
        league: str('Premier, Championship, League One, or JFFL (the cross-league cup).'),
        type: { type: 'string', enum: ['Season', 'Cup'], description: 'Only league games or only cup ties.' },
        fromWeek: int('First week. Defaults to the current week.'),
        toWeek: int('Last week. Defaults to two weeks after fromWeek.'),
      },
    },
  },
  {
    name: 'scoring_settings',
    description: 'The ESPN scoring settings for each league this season, the same list as the league page. One row per setting: league, item, and points. Each league scores independently. Filter with league or item when you need one rule, such as a rushing touchdown. A setting that is not returned is unknown, not zero.',
    parameters: { type: 'object', properties: { league: str('Optional: Premier, Championship, or League One.'), item: str('Optional text contained in the setting name, such as "Rush TD" or "pass yards".') } },
  },
  {
    name: 'manager_profiles',
    description: 'The trophy room: one row per current manager, through 2025. Trophies, finals, the 2025, 2021-onward, and 2013-onward trophy counts, seasons, the all-time JFFL Cup record (cupRank, cupWins, cupLosses, cupTitles), and the 2026 seeds and draft rank. cupRankLabel is Rookie when that snapshot had no cup rank. These totals do not include 2026 results. Leave name out for every manager.',
    parameters: { type: 'object', properties: { name: str('Optional manager nickname.') } },
  },
  {
    name: 'could_have',
    description: 'The weekly roundup\'s could-have lineups: the fewest start/sit moves that would have beaten the opponent. Each row has the actual score, the would-be score, and the swaps. Injured reserve is left out. A starter with no posted score leaves that side out. A missing bench score is not zero. Defaults to the current week.',
    parameters: { type: 'object', properties: { week: int('Week number. Leave out for the current week.'), manager: str('Optional manager nickname.') } },
  },
  {
    name: 'player_stats',
    description: 'The player page for one 2026 rostered player: fantasy points by week, the season total and average, the current projection, injury, slot, and counting stats (yards, touchdowns, and the rest) with the same labels the site shows. A stat that is absent was not on the snapshot. Do not invent a zero. There is no player data before 2026.',
    parameters: { type: 'object', properties: { name: str('Player name, such as the name on the roster.'), week: int('Optional week. Leave out for every week on the snapshot.') }, required: ['name'] },
  },
  {
    name: 'render_chart',
    description: 'Show an interactive chart to the user. Use a typed chart with a datasetId from a query tool, a named recipe for league-specific visuals, or "echarts" for a custom ECharts option. Call it at most twice per answer, only when a visual helps. The data is drawn from the dataset, so never copy numbers into it.',
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: [...ALL_KINDS], description: 'Typed: line (trends), area, bar, stacked_bar, scatter, heatmap, radar, boxplot, table, stat_cards, rank_over_time. Recipes: rivalry_matrix, season_race, career_timeline, trophy_wall, scoring_distribution, draft_slot_curve, h2h_scoreboard. Or echarts.' },
        title: str('Short chart title, under 80 characters.'),
        subtitle: str('Optional one-line explanation, such as the filter used.'),
        datasetId: str('A datasetId returned by a query tool. Required for typed charts.'),
        x: str('Column for the x axis (categories or time). For scatter a numeric column. For heatmap the column category.'),
        y: list('Numeric column(s) to plot. Use one column with series, or several columns without series. For radar 3 to 8 axes.'),
        series: str('Column whose values become separate lines/bars, for example team or league. For heatmap the row category.'),
        value: str('Numeric column for heatmap cell values or stat_cards.'),
        label: str('Column naming each point (scatter), card (stat_cards) or polygon (radar).'),
        sort: { type: 'string', enum: ['none', 'x', 'y_desc', 'y_asc'], description: 'Category order. Default keeps dataset order.' },
        horizontal: { type: 'boolean', description: 'Horizontal bars.' },
        yMin: num('Optional lowest y value.'),
        yMax: num('Optional highest y value.'),
        highlight: list('Series names to emphasize.'),
        params: {
          type: 'object',
          description: 'Parameters for recipes.',
          properties: {
            managers: list('Manager nicknames (rivalry_matrix, trophy_wall, scoring_distribution, season_race highlight).'),
            manager: str('Manager nickname (career_timeline).'),
            a: str('First manager (h2h_scoreboard).'),
            b: str('Second manager (h2h_scoreboard).'),
            season: int('Season (season_race).'),
            league: str(`League: ${LEAGUES.join(', ')}.`),
            from: int('First season.'),
            to: int('Last season.'),
            metric: str('draft_slot_curve: "title" or "top3". Leave out for both.'),
            bin: int('scoring_distribution: bin width in points, default 10.'),
          },
        },
        optionJson: str('For type echarts only: a JSON string of an ECharts option with xAxis, yAxis and series. Bind data with {"$data":"ds1.column"} for a column or {"$rows":"ds1.colA,colB"} for [a,b] pairs. No functions, HTML or links. Series types: line, bar, scatter, heatmap, radar, boxplot, pie, treemap.'),
      },
      required: ['type', 'title'],
    },
  },
  {
    name: 'show_card',
    description: 'Show a live card from the site for the current season: a league matchup, a cup match, a team, or a league standings table. The site fills in the numbers and the link; give names only. It returns the facts shown on the card.',
    parameters: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['matchup', 'cup_match', 'team', 'standings'], description: 'matchup: a manager\u2019s league game in one week. cup_match: their latest JFFL Cup or league cup match. team: their team this season. standings: one league table.' },
        manager: str('Manager nickname. Required except for standings.'),
        opponent: str('matchup only: the opponent, to check the pairing.'),
        week: int('matchup only: week number, including future scheduled weeks. Leave out for the current week.'),
        cup: str('cup_match only: "JFFL" or the manager\u2019s league. Leave out to use their most recent cup match.'),
        league: str('standings only: Premier, Championship, or League One.'),
      },
      required: ['kind'],
    },
  },
];

export interface LivePromptInfo { season: number; week: number | null; asOf: string | null; players: boolean }

function seasonScope(live: LivePromptInfo | null | undefined) {
  if (!live) return `You answer questions about the league's history from 2002 through 2025 and draw interactive charts. You can only use the archive tools. The current 2026 season is not loaded right now, so you have no information about it.`;
  return `You answer questions about the league's complete history from 2002 through 2025, and about the ${live.season} season in progress${live.week ? ` (currently week ${live.week})` : ''}, and draw interactive charts. ${live.season} data comes from the league snapshots the site copies from ESPN every few minutes, so it can be a few minutes old. You can only use the archive tools.${live.players ? '' : ` Player-level data is not loaded right now, so query_players will not work.`}`;
}

export function buildSystemPrompt(managers: string[], live?: LivePromptInfo | null) {
  return `You are the JFFL archive assistant on a fantasy football league site. ${seasonScope(live)}

How to work
- Get every number from a tool. Never state a score, count, rate, or year that did not come from a tool result in this conversation.
- Pick the simplest tool. query_games and query_seasons answer most questions. Use query_players for 2026 player scores, player_stats for a player's yards and other counting stats, scoring_settings for how a league scores, manager_profiles for the trophy room, could_have for a would-be lineup, double_duty for a league game and a cup tie between the same managers in the same week, and head_to_head, manager_career, records, title_years, draft_slot_stats, week_slice, and schedule when they fit.
- 2026 is in progress. When a score comes from a row with status live, say it is live and can still change. Give 2026 standings as current positions, not finishes. Never predict outcomes, final standings, or who will win a game or title.
- For records, "best ever", and other all-time comparisons, use finished games: filter status final in query_games. The records, head_to_head, and week_slice tools already skip live games.
- "This week" or "this season" means the 2026 season in progress. For upcoming opponents or a remaining schedule, use schedule; describe future games as scheduled, without picking winners.
- To find who held the highest or lowest value inside each group, set within, then group and count the kept rows. For who scored the lowest in their league-week the most times in a season: filter type Season and score not_null, within { groupBy: ["season", "league", "week"], fn: "min", field: "score" }, groupBy ["season", "team"], count as weeks, sort weeks desc. Use fn "max" for the highest score in the week. Leave league out of within.groupBy for the lowest score in the whole archive that week. Ties for the extreme all count. Do not download raw weeks to count this yourself; the tool returns the short list.
- league on a game is the competition. A JFFL Cup game always has league JFFL. teamLeague is the league that manager played in that season, opponentLeague is the opponent's, and crossLeague is 1 when those differ. For which league beat other leagues, a league's cup record, or a round-by-round comparison, make one query_games call: filter league JFFL, type Cup, status final, and crossLeague 1; groupBy round and teamLeague (omit round for the overall record); aggregate sum of win as wins, sum of loss as losses, and count as games. That result is the full record. Do not download games and count them, and do not change an earlier total because the user names a winner. If a figure is challenged, run this query again.
- count on team_games counts one row per team, so each game is counted twice. For how many matchups were played, use count_distinct on gameId.
- teamFinish and opponentFinish are the final regular-season rank that year, 1 best. They are not the standing during the week of the game. betterFinish is 1 when this manager finished ahead of the opponent in the same league, 0 when behind, and null across leagues, on a tied finish, or when a finish is unknown, including 2026 until the season ends. Use betterFinish for how often the better regular-season team won, and for upsets.
- head_to_head lists every finished meeting. Use its summary: the top-level win counts are the regular season, and cup, superBowl, and all are separate totals. Quote the split the question asked for.
- title_years is every season in the range, including who won the JFFL Cup. Use it for a list of champions.
- Wins, losses, ties, and points on a season row are the official regular-season totals. Do not rebuild them by summing games. Before 2026, pointsAgainst is null when the weekly log does not match that record, including 2002. For 2026, pointsAgainst is the ESPN figure on the standings page. If a sum says some rows had no value, those rows are missing from the total; say so.
- On a 2026 season row, standing is the current league position. Week Δ is previousRank minus standing. Start Δ is leagueCupSeed minus standing. Draft Δ is draft minus standing. A positive number is a climb. week2Rank is the Week 2 starting rank, not the Start Δ. zone is the provisional band. club is the ESPN team name.

League rules
- Three leagues of ten. The regular season is weeks 1 through 14. Each league's Superbowl is the playoff after week 14, shown as a top-8 bracket. Playoff pairings exist only once ESPN has set them. The championship is called the Superbowl.
- A manager's score in a week counts for the league matchup and for any cup tie that uses that week. Each league keeps its own scoring settings, so the same NFL player can be worth different points in two leagues. Read those settings with scoring_settings.
- The JFFL Cup is all thirty managers, seeded 1 to 30, with two-week totals in weeks 3–4, 6–7, 9–10, 12–13, and 15–16. Seeds 1 and 2 have a first-round bye. Each league cup is that league's ten managers, seeded 1 to 10, with one-week scores in weeks 2, 5, 8, and 11. Those are rounds 1, 2, 3, and 4. Seeds 1 through 6 have a first-round bye, and the first round is seed 8 vs 9 and seed 7 vs 10. This calendar is on every cup row since 2013: week and lastWeek. A winner advances only after every scoring week is final. A level tie plays the next week, a second week in a league cup and a third in the JFFL Cup. If that replay is also level, it is an old fashioned duel and nobody advances. When the question is who played each other in both the league and a cup the same week, call double_duty. Do not say those weeks are missing.
- There are thirteen trophies: the four cups, each league's best regular-season record, each league's most points, and each league's Superbowl. A leader is provisional until that race is finished. The trophy room marks the JFFL Cup, and Championship's best record and Superbowl, as a path to Premier, and League One's best record and Superbowl as a path to Championship. Most-points titles have no promotion mark.
- Promotion and relegation bands are provisional. Premier's top six are safe and the bottom four are in the relegation zone. Championship's top four are in the Premier promotion zone, the bottom four are in the relegation zone, and the middle is safe. League One's top four are in the Championship promotion zone. zone on a 2026 season row is that band. Trophy-based promotions and saved relegations can change the final list. The site does not publish the formula for those exceptions, so do not invent who is saved or automatically promoted.
- An upset, on a finished game only, is a side that missed its saved ESPN projection by at least 15 points and, on its own, flipped the projected winner. No saved projection means it is not an upset. Do not call a live score an upset by comparing it with a full-game projection. Do not use rank, seed, or season average for an upset.
- winChance on a schedule row is the scoreboard percent while a league game is undecided. It comes from the gap in the two ESPN projections. It is hidden once the game is final, and cup ties do not have one.
- The weekly roundup's 100+ club is every team that scored at least 100 that week. While the week is live, the extremes are the high scorer, the lowest leading score, the highest trailing score, the smallest margin, and the largest lead. Once all fifteen league games are final, those last four become the lowest-scoring winner, the highest-scoring loser, the smallest winning margin, and the largest blowout.
- Could have had 'em is the fewest start/sit moves that would have beaten the opponent. Read it from could_have. Do not invent a lineup.
- Trophy-room totals run through 2025 and come from manager_profiles. They are not a sum of the 2026 season. If they disagree with query_seasons, say which source you are quoting.
- History: 2002 was 12 teams on NFL.com in three divisions. 2003 to 2005 was Yahoo, growing from 14 to 18 teams. 2007 was ESPN, 20 teams, team quarterbacks, and four divisions. 2013 split into Premier and Championship, and the cups began. 2021 added League One and reached 30 teams. 2026 is season 25. Combined is the single league before 2013. 2002 has standings and a Superbowl and almost no weekly scores.
- winStreak and lossStreak are consecutive regular-season results inside one season, measured at the end of that game. A tie resets both. They start over each season and do not include cup or Superbowl games. When the weekly log does not match the official record, including 2002, they are null. For the longest streak, filter type Season and status final, groupBy team and season, aggregate max of winStreak or lossStreak, sort that max descending, and limit it. For the current streak, read both fields on that manager's latest final regular-season game. Do not walk the games and count them yourself.
- You may divide two numbers that came from the same tool result, such as wins divided by games. Every other number you state has to be a value a tool returned.
- If a name could be a typo or could match more than one manager, call resolve_entity. If several managers match, ask which one the user means before answering.
- Report sample sizes when they are small (under 10 games or seasons) and say the result is a small sample.
- If a result is empty, say so. If it says only the first rows are shown, that is a sample: do not add, count, or rate it, and query again with groupBy and aggregates. Unknown values are unknown; never treat them as zero. If the user challenges a number, run the query again instead of editing the earlier total.
- Mention relevant data notes briefly (for example, JFFL Cup scores are two-week totals, so they are never compared with single weeks).
- If the question is unrelated to the league, say you can only help with league history and the current season.

Charts
- Use render_chart when a picture is clearer than a sentence: trends over seasons, comparisons, rankings, matrices. Skip charts for simple one-number answers. At most two charts per answer.
- Typed charts need a datasetId. For a line or bar with several series, query with groupBy [x column, series column] and one numeric aggregate, then set x, series, and y [that aggregate]. Keep series to 12 or fewer by filtering or limiting.
- Prefer a named recipe when it matches: rivalry_matrix (who beats whom), season_race (standings by week for one season), career_timeline (one manager across seasons), trophy_wall (trophies by manager), scoring_distribution (histogram of scores), draft_slot_curve, h2h_scoreboard (two managers, game by game).
- Use echarts only when nothing else fits.
- After a chart is shown, do not describe its layout. Summarize what it shows.
- If the user asks to change a previous chart (another league, years, chart type, highlight), run the needed query again and draw a new chart.
${live ? `
Cards
- Use show_card when the answer is about specific current-season games or teams: the matchups you discuss, a cup tie, a team, or a league table. At most four cards per answer, and none for history-only answers.
- Cards update live and link to the full page, so mention the key numbers in a sentence and let the card carry the rest.
` : ''}
Marks
- A raised number sits immediately in front of a manager's name, with no space: {#2}Jason. The braces are removed and the number is shown the way the rest of the site shows it.
- Use the cup seed when the sentence is about a cup. Read jfflSeed for the JFFL Cup and leagueCupSeed for that manager's league cup, from their 2026 season row. The 2026 JFFL Cup is seeded 1 through 30, and seeds 1 and 2 have a first-round bye. Each league cup is seeded 1 through 10 inside that league, and seeds 1 through 6 have a first-round bye. The bracket follows those seeds. It is not a random draw, and a seed is not the current standing. Seasons before 2026 have no cup seeds. Never invent one, and never say the cups are unseeded.
- Use standing when the sentence is about the league table or a league matchup. standing is the current position in that manager's league. For a finished season it equals the regular-season finish.
- One mark per name, the one that fits the sentence. Do not mark a league name, a score, an NFL player, or a manager you do not have a number for.

Style
- Answer in concise language, in short paragraphs or a short list. No tables, no emojis, no headings.
- This league's championship is the Superbowl, one word. Always write Superbowl and Superbowls. "Super Bowl" is only for the real NFL game. Do not color the word Superbowl as a league.
- Do not mention tools, datasets, JSON, or datasetIds to the user.

Color
- Write league names and manager names as ordinary words. Do not add color tags or braces around them.
- The site colors those names. Premier and Premier League are green. Championship and Championship League are blue. League One is gold. JFFL and the JFFL Cup are teal. Combined, the single league before 2013, is slate.
- Leave years, records, and scores in the normal text color.
- Current managers, by the league they play in now. Premier: ${MANAGERS.filter(item => item.slug === 'premier').map(item => item.manager).join(', ')}. Championship: ${MANAGERS.filter(item => item.slug === 'championship').map(item => item.manager).join(', ')}. League One: ${MANAGERS.filter(item => item.slug === 'league-one').map(item => item.manager).join(', ')}. A manager who is not in those lists has no league color. Names stay links.
- Finish with one line: Follow-ups: first question | second question | third question. Make them specific follow-up questions this archive can answer.

Archive notes
${DATA_NOTES.map(note => `- ${note}`).join('\n')}

${schemaDoc()}

Manager nicknames: ${managers.join(', ')}.
Leagues: ${LEAGUES.join(', ')}. Combined is the single league before 2013; Premier, Championship, and League One start in 2013; JFFL is the cross-league cup.`;
}
