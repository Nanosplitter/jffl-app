import { INK_ON_LIGHT, type Ink } from './history/answerText.ts';

const TEXT = '#151719';
const BOLD = '#000000';
const fill = (color: string) => `color:${color};-webkit-text-fill-color:${color};`;
const esc = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const paragraph = `margin:0 0 12px;font-family:Calibri,Arial,sans-serif;font-size:16px;line-height:1.45;${fill(TEXT)}background-color:transparent;`;
const small = `margin:0 0 12px;font-family:Calibri,Arial,sans-serif;font-size:14px;line-height:1.45;${fill(TEXT)}background-color:transparent;`;

const INK_SLUGS = new Set<string>(['premier', 'championship', 'league-one', 'jffl']);

export interface EmailName { name: string; slug: string }
export interface EmailSide { name: string; slug: string; mark: number | null; score: string; leading: boolean; miss: boolean; projected: string | null }
export interface EmailGame { sides: EmailSide[]; upset: boolean }
export interface EmailSection { title: string; ink: string; span: string | null; games: EmailGame[]; empty: string }
export interface EmailSwap { outName: string; outPoints: string; inName: string; inPoints: string }
export interface EmailSwing { manager: EmailName; opponent: EmailName; before: string; after: string; swaps: EmailSwap[] }
export interface EmailRow { rank: number; person: EmailName; score: string; result: string }
export interface EmailStandout { player: string; score: string; managers: EmailName[] }

/** Everything the weekly roundup email needs. Scores are already formatted; a missing score is an em dash, never zero. */
export interface WeeklyEmail {
  week: number;
  live: boolean;
  pageUrl: string;
  extremes: { label: string; text: string }[];
  hundred: { person: EmailName; score: string }[];
  leagues: EmailSection[];
  cups: EmailSection[];
  idleCups: { title: string; ink: string }[];
  cupCount: number;
  couldHave: EmailSwing[] | null;
  couldHaveEmpty: string | null;
  leaderboard: EmailRow[];
  starters: EmailStandout[];
  starterEmpty: string | null;
  bench: EmailStandout[];
  benchEmpty: string | null;
}

const bold = (inner: string) => `<b style="font-weight:bold;${fill(BOLD)}">${inner}</b>`;

function colored(name: string, slug: string) {
  const safe = esc(name);
  if (!INK_SLUGS.has(slug)) return safe;
  const ink = slug as Ink;
  return `<span class="ink-${ink}" style="${fill(INK_ON_LIGHT[ink])}">${safe}</span>`;
}

function person(item: EmailName) {
  return colored(item.name, item.slug);
}

function sideLabel(side: EmailSide) {
  const rank = side.mark == null ? '' : `${side.mark} `;
  return `${rank}${colored(side.name, side.slug)}`;
}

function scoreCell(side: EmailSide) {
  const text = esc(side.score);
  return side.leading ? bold(text) : text;
}

function gameNote(game: EmailGame) {
  const parts: string[] = [];
  if (game.upset) parts.push('Upset');
  const miss = game.sides.find(side => side.miss && side.projected);
  if (miss?.projected) parts.push(`${miss.name} proj ${miss.projected}`);
  return parts.join(' · ');
}

/** The idle-cup line on the page. Empty when every cup played. */
export function idleCupPlain(idleTitles: string[], cupCount: number) {
  if (!idleTitles.length) return '';
  if (idleTitles.length >= cupCount) return 'No cup matches this week.';
  return `No matches this week: ${idleTitles.join(', ')}.`;
}

function heading(title: string, ink: string) {
  return `<p style="${paragraph}">${bold(colored(title, ink))}</p>`;
}

function gamesTable(games: EmailGame[]) {
  const rows = games.map(game => {
    const [left, right] = [game.sides[0], game.sides[1]];
    const cells = [left, right].flatMap(side => side
      ? [`<td style="padding:4px 10px 4px 0;${fill(TEXT)}">${sideLabel(side)}</td>`, `<td style="padding:4px 16px 4px 0;text-align:right;${fill(TEXT)}">${scoreCell(side)}</td>`]
      : ['<td></td>', '<td></td>']);
    const note = gameNote(game);
    return `<tr>${cells.join('')}<td style="padding:4px 0;${fill(TEXT)}">${esc(note)}</td></tr>`;
  }).join('');
  return `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 16px;font-family:Calibri,Arial,sans-serif;font-size:15px;${fill(TEXT)}">${rows}</table>`;
}

function sectionBlock(section: EmailSection, html: string[], plain: string[]) {
  html.push(heading(section.title, section.ink));
  plain.push(section.title);
  if (section.span) {
    html.push(`<p style="${small}">${esc(section.span)}</p>`);
    plain.push(section.span);
  }
  if (!section.games.length) {
    html.push(`<p style="${small}">${esc(section.empty)}</p>`);
    plain.push(section.empty, '');
    return;
  }
  html.push(gamesTable(section.games));
  for (const game of section.games) {
    const sides = game.sides.map(side => `${side.mark == null ? '' : `${side.mark} `}${side.name} ${side.score}`.trim());
    const note = gameNote(game);
    plain.push(`${sides.join('    ')}${note ? `    ${note}` : ''}`);
  }
  plain.push('');
}

function nameList(items: EmailStandout['managers']) {
  return items.map(item => person(item)).join(', ');
}

/** HTML and plain text for pasting the weekly roundup into an email. */
export function renderWeeklyEmail(email: WeeklyEmail) {
  const html: string[] = [];
  const plain: string[] = [];
  const title = `JFFL Week ${email.week}`;
  const intro = email.live ? 'Live scores. Leads and scoring extremes remain provisional.' : 'Final ESPN scores.';
  html.push(`<p style="${paragraph}">${bold(esc(title))}</p>`);
  html.push(`<p style="${paragraph}">${esc(intro)}</p>`);
  plain.push(title, intro, '');
  for (const line of email.extremes) {
    html.push(`<p style="${small}">${bold(`${esc(line.label)}:`)} ${esc(line.text)}</p>`);
    plain.push(`${line.label}: ${line.text}`);
  }
  plain.push('');
  if (email.hundred.length) {
    html.push(`<p style="${small}">${bold('100+ club:')}</p>`);
    html.push(`<ul style="margin:0 0 16px;padding-left:22px;font-family:Calibri,Arial,sans-serif;font-size:15px;${fill(TEXT)}">${email.hundred.map(row => `<li style="${fill(TEXT)}">${person(row.person)} ${esc(row.score)}</li>`).join('')}</ul>`);
    plain.push('100+ club:', ...email.hundred.map(row => `- ${row.person.name} ${row.score}`), '');
  } else {
    html.push(`<p style="${small}">${bold('100+ club:')} none</p>`);
    plain.push('100+ club: none', '');
  }
  for (const section of email.leagues) sectionBlock(section, html, plain);
  for (const section of email.cups) sectionBlock(section, html, plain);
  const idle = idleCupPlain(email.idleCups.map(cup => cup.title), email.cupCount);
  if (idle) {
    const coloredIdle = email.idleCups.length >= email.cupCount
      ? esc(idle)
      : `No matches this week: ${email.idleCups.map((cup, index) => `${index ? ', ' : ''}${colored(cup.title, cup.ink)}`).join('')}.`;
    html.push(`<p style="${small}">${coloredIdle}</p>`);
    plain.push(idle, '');
  }
  if (email.leagues.some(section => section.games.some(game => game.upset)) || email.cups.some(section => section.games.some(game => game.upset))) {
    const note = 'An upset is a final result flipped by a score at least 15 points off its ESPN projection.';
    html.push(`<p style="${small}">${esc(note)}</p>`);
    plain.push(note, '');
  }
  html.push(heading('Could have had ’em', ''));
  plain.push('Could have had ’em');
  html.push(`<p style="${small}">Hindsight is always 20/20. The fewest start and bench moves that turn a loss or a tie into a win.</p>`);
  plain.push('Hindsight is always 20/20. The fewest start and bench moves that turn a loss or a tie into a win.');
  if (email.couldHaveEmpty || !email.couldHave?.length) {
    const empty = email.couldHaveEmpty ?? 'No one was a move or two away.';
    html.push(`<p style="${small}">${esc(empty)}</p>`);
    plain.push(empty, '');
  } else {
    for (const swing of email.couldHave) {
      html.push(`<p style="${small}">${person(swing.manager)} would have scored ${esc(swing.after)} instead of ${esc(swing.before)} against ${person(swing.opponent)}.</p>`);
      plain.push(`${swing.manager.name} would have scored ${swing.after} instead of ${swing.before} against ${swing.opponent.name}.`);
      for (const swap of swing.swaps) {
        const line = `Sit ${swap.outName} (${swap.outPoints}) for ${swap.inName} (${swap.inPoints}).`;
        html.push(`<p style="${small}">${esc(line)}</p>`);
        plain.push(line);
      }
    }
    plain.push('');
  }
  html.push(heading('Scoring leaderboard', ''));
  plain.push('Scoring leaderboard');
  if (email.leaderboard.length) {
    const body = email.leaderboard.map(row => `<tr><td style="padding:4px 10px 4px 0;${fill(TEXT)}">${row.rank}</td><td style="padding:4px 10px 4px 0;${fill(TEXT)}">${person(row.person)}</td><td style="padding:4px 10px 4px 0;text-align:right;${fill(TEXT)}">${esc(row.score)}</td><td style="padding:4px 0;${fill(TEXT)}">${esc(row.result)}</td></tr>`).join('');
    html.push(`<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 16px;font-family:Calibri,Arial,sans-serif;font-size:15px;${fill(TEXT)}"><thead><tr><th style="text-align:left;padding:4px 10px 4px 0;">#</th><th style="text-align:left;padding:4px 10px 4px 0;">Manager</th><th style="text-align:right;padding:4px 10px 4px 0;">Points</th><th style="text-align:left;padding:4px 0;">Matchup</th></tr></thead><tbody>${body}</tbody></table>`);
    plain.push(['#', 'Manager', 'Points', 'Matchup'].join('\t'), ...email.leaderboard.map(row => [row.rank, row.person.name, row.score, row.result].join('\t')), '');
  }
  const standouts = (title: string, rows: EmailStandout[], empty: string | null) => {
    html.push(heading(title, ''));
    plain.push(title);
    if (!rows.length) {
      const line = empty ?? 'No scores yet.';
      html.push(`<p style="${small}">${esc(line)}</p>`);
      plain.push(line, '');
      return;
    }
    for (const row of rows) {
      const managers = nameList(row.managers);
      html.push(`<p style="${small}">${esc(row.player)} ${bold(esc(row.score))}${managers ? ` · ${managers}` : ''}</p>`);
      plain.push(`${row.player} ${row.score}${row.managers.length ? ` · ${row.managers.map(item => item.name).join(', ')}` : ''}`);
    }
    plain.push('');
  };
  standouts('Top starting-player performances', email.starters, email.starterEmpty);
  standouts('Top bench performances', email.bench, email.benchEmpty);
  const closer = 'The smallest margin excludes tied games. Completed weeks use ESPN’s corrected scores; live-week winners and losers are shown as leaders and trailers.';
  html.push(`<p style="${small}">${esc(closer)}</p>`);
  html.push(`<p style="${paragraph}"><a href="${esc(email.pageUrl)}" style="color:#0b5cad;">Full roundup</a></p>`);
  plain.push(closer, '', `Full roundup: ${email.pageUrl}`);
  return { html: html.join(''), plain: plain.join('\n').replace(/\n{3,}/g, '\n\n').trim() };
}
