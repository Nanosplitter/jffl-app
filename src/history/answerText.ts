import { MANAGERS } from '../reference.ts';

/**
 * Turns model text into safe blocks. Paragraphs, simple lists, bold, and a fixed set of color
 * tags are recognized. Every other character, including HTML, stays plain text.
 */
export const INKS = ['premier', 'championship', 'league-one', 'jffl', 'combined'] as const;
export type Ink = (typeof INKS)[number];

/** Light-background colors, for email paste. Dark mode uses the matching rules in ask-styles.css. */
export const INK_ON_LIGHT: Record<Ink, string> = {
  premier: '#4f7a22',
  championship: '#4c76a2',
  'league-one': '#8f5e16',
  jffl: '#0d7377',
  combined: '#5c656b',
};

/** Older answers used these for comparisons. The tags are removed and never shown. */
const DROPPED_INKS = new Set(['red', 'purple', 'orange']);

const INK_SET = new Set<string>(INKS);

/** Longest first, so "Premier League" is not painted as "Premier" plus an ordinary "League". */
const LEAGUE_WORDS: Array<[RegExp, Ink]> = [
  [/(?<![\w-])Premier League(?![\w-])/gi, 'premier'],
  [/(?<![\w-])Championship League(?![\w-])/gi, 'championship'],
  [/(?<![\w-])League One(?![\w-])/gi, 'league-one'],
  [/(?<![\w-])JFFL Cup(?![\w-])/gi, 'jffl'],
  [/(?<![\w-])Premier(?![\w-])/gi, 'premier'],
  [/(?<![\w-])Championship(?![\w-])/gi, 'championship'],
  [/(?<![\w-])Combined(?![\w-])/gi, 'combined'],
  [/(?<![\w-])JFFL(?![\w-])/gi, 'jffl'],
];

const escapeName = (name: string) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Current managers, longest first, so a longer nickname is never read as a shorter one. */
const MANAGER_WORDS: Array<[RegExp, Ink]> = [...MANAGERS]
  .sort((a, b) => b.manager.length - a.manager.length)
  .map(item => [new RegExp(`(?<![\\w-])${escapeName(item.manager)}(?![\\w-])`, 'gi'), item.slug]);

/** Colors a phrase the model left plain. A phrase the model already colored is left alone. */
function paintWords(runs: Inline[], words: Array<[RegExp, Ink]>, replace = false): Inline[] {
  const painted: Inline[] = [];
  for (const run of runs) {
    if (run.color && !replace) { painted.push(run); continue; }
    const hits: Array<{ start: number; end: number; ink: Ink }> = [];
    for (const [pattern, ink] of words) {
      for (const match of run.text.matchAll(pattern)) {
        const start = match.index ?? 0;
        const end = start + match[0].length;
        // An unclosed tag such as "{premier}" is still text. Do not paint the name inside the braces.
        if (start > 0 && (run.text[start - 1] === '{' || run.text[start - 1] === '/')) continue;
        if (hits.some(hit => start < hit.end && end > hit.start)) continue;
        hits.push({ start, end, ink });
      }
    }
    hits.sort((a, b) => a.start - b.start);
    let at = 0;
    const carry = (text: string, color: Ink | undefined): Inline => color ? { text, bold: run.bold, color } : { text, bold: run.bold };
    for (const hit of hits) {
      if (hit.start < at) continue;
      if (hit.start > at) painted.push(carry(run.text.slice(at, hit.start), run.color));
      painted.push(carry(run.text.slice(hit.start, hit.end), hit.ink));
      at = hit.end;
    }
    if (at < run.text.length) painted.push(carry(run.text.slice(at), run.color));
  }
  return painted;
}

const paintLeagues = (runs: Inline[]) => paintWords(runs, LEAGUE_WORDS);
const paintManagers = (runs: Inline[]) => paintWords(runs, MANAGER_WORDS, true);

export interface Inline { text: string; bold: boolean; color?: Ink; mark?: boolean; followed?: boolean }

/** Marks a run that is exactly the followed manager's nickname. */
function markFollowed(runs: Inline[], name?: string | null): Inline[] {
  const folded = name?.trim().toLowerCase();
  if (!folded) return runs;
  return runs.map(run => (run.text.trim().toLowerCase() === folded ? { ...run, followed: true } : run));
}

/** A raised place number, 1 through 40. Anything else stays ordinary text. */
const MARK = /\{#(\d{1,2})\}/g;

function splitMarks(runs: Inline[]): Inline[] {
  const out: Inline[] = [];
  for (const run of runs) {
    let at = 0;
    let hit = false;
    for (const match of run.text.matchAll(MARK)) {
      const n = Number(match[1]);
      const start = match.index ?? 0;
      if (n < 1 || n > 40) continue;
      hit = true;
      if (start > at) out.push({ ...run, text: run.text.slice(at, start) });
      out.push({ text: String(n), bold: false, mark: true });
      at = start + match[0].length;
    }
    if (!hit) out.push(run);
    else if (at < run.text.length) out.push({ ...run, text: run.text.slice(at) });
  }
  return out.filter(run => run.mark || run.text);
}
export type Block = { type: 'p'; inline: Inline[] } | { type: 'ul'; items: Inline[][] };

const isInk = (name: string): name is Ink => INK_SET.has(name);

/** True when some later color tag can close this one. The close name does not have to match. */
function hasInkClose(text: string, from: number) {
  let depth = 1;
  for (let index = from; index < text.length;) {
    const tag = /^\{(\/?)([a-zA-Z][a-zA-Z-]*)\}/.exec(text.slice(index));
    const name = tag?.[2].toLowerCase();
    if (tag && name && isInk(name)) {
      if (tag[1]) {
        depth -= 1;
        if (depth === 0) return true;
      } else depth += 1;
      index += tag[0].length;
      continue;
    }
    index += 1;
  }
  return false;
}

/**
 * Drops color tags and records where each color applies. A close tag ends the nearest open
 * color, even when the model wrote a different name on the close. A stray close tag is removed.
 * An unclosed tag, and any unknown tag, stays as text.
 */
function stripInks(text: string): { text: string; spans: Array<{ start: number; end: number; ink: Ink }> } {
  let out = '';
  const spans: Array<{ start: number; end: number; ink: Ink }> = [];
  const stack: Array<{ ink: Ink; at: number }> = [];
  for (let index = 0; index < text.length;) {
    const tag = /^\{(\/?)([a-zA-Z][a-zA-Z-]*)\}/.exec(text.slice(index));
    const name = tag?.[2].toLowerCase();
    if (tag && name && DROPPED_INKS.has(name)) {
      index += tag[0].length;
      continue;
    }
    if (tag && name && isInk(name)) {
      if (tag[1]) {
        const open = stack.pop();
        if (open) spans.push({ start: open.at, end: out.length, ink: open.ink });
        index += tag[0].length;
        continue;
      } else if (hasInkClose(text, index + tag[0].length)) {
        stack.push({ ink: name, at: out.length });
        index += tag[0].length;
        continue;
      }
    }
    out += text[index];
    index += 1;
  }
  return { text: out, spans };
}

export function inlineOf(text: string, followedName?: string | null): Inline[] {
  const painted = stripInks(text);
  const source = painted.text;
  const boldAt = new Array<boolean>(source.length).fill(false);
  const hide = new Array<boolean>(source.length).fill(false);
  for (const match of source.matchAll(/\*\*(.+?)\*\*/g)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    hide[start] = hide[start + 1] = hide[end - 2] = hide[end - 1] = true;
    for (let index = start + 2; index < end - 2; index += 1) boldAt[index] = true;
  }
  const colorAt = new Array<Ink | undefined>(source.length);
  const spans = [...painted.spans].sort((a, b) => (b.end - b.start) - (a.end - a.start));
  for (const span of spans) {
    for (let index = span.start; index < span.end; index += 1) colorAt[index] = span.ink;
  }
  const runs: Inline[] = [];
  let buf = '';
  let bold = false;
  let color: Ink | undefined;
  const flush = () => {
    if (!buf) return;
    runs.push(color ? { text: buf, bold, color } : { text: buf, bold });
    buf = '';
  };
  for (let index = 0; index < source.length; index += 1) {
    if (hide[index]) continue;
    const nextBold = boldAt[index];
    const nextColor = colorAt[index];
    if (buf && (nextBold !== bold || nextColor !== color)) flush();
    bold = nextBold;
    color = nextColor;
    buf += source[index];
  }
  flush();
  return markFollowed(splitMarks(paintManagers(paintLeagues(runs))), followedName);
}

export function parseAnswer(text: string, followedName?: string | null): Block[] {
  const blocks: Block[] = [];
  let list: Inline[][] | null = null;
  let paragraph: string[] = [];
  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: 'p', inline: inlineOf(paragraph.join(' '), followedName) });
    paragraph = [];
  };
  const flushList = () => {
    if (list) blocks.push({ type: 'ul', items: list });
    list = null;
  };
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    const bullet = /^(?:[-*\u2022]|\d+[.)])\s+(.+)$/.exec(line);
    if (!line) { flushParagraph(); flushList(); continue; }
    if (bullet) {
      flushParagraph();
      (list ??= []).push(inlineOf(bullet[1], followedName));
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();
  return blocks;
}
