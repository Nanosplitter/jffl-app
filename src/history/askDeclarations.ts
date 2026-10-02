import { AGG_FUNCTIONS, DATA_NOTES, FILTER_OPS, schemaDoc } from './askTools.ts';
import { ALL_KINDS, LEAGUES } from './chartSpec.ts';

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
    description: 'Search game results. One row per team per game (each game appears twice, once from each side), so team-level questions such as highest scores, average points, or win counts work directly. 2026 games have status live while being played; filter status final for records. Set within to keep whoever held the min or max inside each group (the lowest score in a league-week), then groupBy and count those rows. Returns a datasetId you can pass to render_chart.',
    parameters: { type: 'object', properties: queryProperties },
  },
  {
    name: 'query_seasons',
    description: 'Search team-season results: finishes, records, points, draft slot, and championship flags (seasonChamp, superBowlChamp, leagueCupChamp, jfflCupChamp, topThree are 1, 0, or null when unknown). One row per manager per season. The 2026 rows have status live: standing is the current position and undecided titles are null. Returns a datasetId you can pass to render_chart.',
    parameters: { type: 'object', properties: queryProperties },
  },
  {
    name: 'query_players',
    description: 'Search 2026 player scores. One row per rostered player per week, with the manager (team), slot, starter (1 starter, 0 bench or IR, null unknown), points, and status (live while that week is being played). Use it for top scorers this week, a manager\u2019s best starters, or points left on the bench (starter 0). There is no player data before 2026. Returns a datasetId you can pass to render_chart.',
    parameters: { type: 'object', properties: queryProperties },
  },
  {
    name: 'resolve_entity',
    description: 'Match a name the user typed to manager nicknames in the archive. Use it when a name is misspelled, partial, or ambiguous. If several managers match, ask the user which one they mean.',
    parameters: { type: 'object', properties: { name: str('The name as the user wrote it.') }, required: ['name'] },
  },
  {
    name: 'head_to_head',
    description: 'Regular-season history between two managers: every finished meeting plus wins, losses, and ties. Live 2026 games are left out. Returns a datasetId.',
    parameters: { type: 'object', properties: { a: str('First manager nickname.'), b: str('Second manager nickname.') }, required: ['a', 'b'] },
  },
  {
    name: 'manager_career',
    description: 'One manager\u2019s career: every season with finish, record, draft slot, and trophies, plus career totals for finished seasons. The 2026 row is in progress. Returns a datasetId.',
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
    description: 'Who won the regular season (best record), the Super Bowl, the league cup, and the JFFL Cup each year, by league. Also counts how often the best record won the Super Bowl. 2026 titles are null until decided.',
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
- Pick the simplest tool. query_games and query_seasons answer most questions. Use query_players for 2026 player scores, and head_to_head, manager_career, records, title_years, draft_slot_stats, and week_slice when they fit.
- 2026 is in progress. When a score comes from a row with status live, say it is live and can still change. Give 2026 standings as current positions, not finishes. Never predict outcomes, final standings, or who will win a game or title.
- For records, "best ever", and other all-time comparisons, use finished games: filter status final in query_games. The records, head_to_head, and week_slice tools already skip live games.
- "This week" or "this season" means the 2026 season in progress.
- To find who held the highest or lowest value inside each group, set within, then group and count the kept rows. For who scored the lowest in their league-week the most times in a season: filter type Season and score not_null, within { groupBy: ["season", "league", "week"], fn: "min", field: "score" }, groupBy ["season", "team"], count as weeks, sort weeks desc. Use fn "max" for the highest score in the week. Leave league out of within.groupBy for the lowest score in the whole archive that week. Ties for the extreme all count. Do not download raw weeks to count this yourself; the tool returns the short list.
- If a name could be a typo or could match more than one manager, call resolve_entity. If several managers match, ask which one the user means before answering.
- Report sample sizes when they are small (under 10 games or seasons) and say the result is a small sample.
- If a result is empty or truncated, say so. Unknown values are unknown; never treat them as zero.
- Mention relevant data notes briefly (for example, JFFL Cup scores are two-week totals, so they are never compared with single weeks).
- If the question is unrelated to the league, say you can only help with league history and the current season.

Charts
- Use render_chart when a picture is clearer than a sentence: trends over seasons, comparisons, rankings, matrices. Skip charts for simple one-number answers. At most two charts per answer.
- Typed charts need a datasetId. For a line or bar with several series, query with groupBy [x column, series column] and one numeric aggregate, then set x, series, and y [that aggregate]. Keep series to 12 or fewer by filtering or limiting.
- Prefer a named recipe when it matches: rivalry_matrix (who beats whom), season_race (standings by week for one season), career_timeline (one manager across seasons), trophy_wall (trophies by manager), scoring_distribution (histogram of scores), draft_slot_curve, h2h_scoreboard (two managers, game by game).
- Use echarts only when nothing else fits.
- After a chart is shown, do not describe its layout. Summarize what it shows.
- If the user asks to change a previous chart (another league, years, chart type, highlight), run the needed query again and draw a new chart.

Style
- Answer in plain, concise language, in short paragraphs or a short list. No tables, no emojis, no headings.
- Do not mention tools, datasets, JSON, or datasetIds to the user.
- Finish with one line: Follow-ups: first question | second question | third question. Make them specific follow-up questions this archive can answer.

Archive notes
${DATA_NOTES.map(note => `- ${note}`).join('\n')}

${schemaDoc()}

Manager nicknames: ${managers.join(', ')}.
Leagues: ${LEAGUES.join(', ')}. Combined is the single league before 2013; Premier, Championship, and League One start in 2013; JFFL is the cross-league cup.`;
}
