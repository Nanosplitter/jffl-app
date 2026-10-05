import { MANAGERS } from '../reference.ts';

/**
 * Turns model text into safe blocks. Paragraphs, simple lists, bold, and a fixed set of color
 * tags are recognized. Every other character, including HTML, stays plain text.
 */
export const INKS = ['premier', 'championship', 'league-one', 'jffl', 'combined', 'red', 'purple', 'orange'] as const;
export type Ink = (typeof INKS)[number];

/** Light-background colors, for email paste. Dark mode uses the matching rules in ask-styles.css. */
export const INK_ON_LIGHT: Record<Ink, string> = {
  premier: '#4f7a22',
  championship: '#4c76a2',
  'league-one': '#8f5e16',
  jffl: '#0d7377',
  combined: '#5c656b',
  red: '#a03e36',
  purple: '#6d4b8a',
  orange: '#9a5a12',
};

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
function paintWords(runs: Inline[], words: Array<[RegExp, Ink]>): Inline[] {
  const painted: Inline[] = [];
  for (const run of runs) {
    if (run.color) { painted.push(run); continue; }
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
    for (const hit of hits) {
      if (hit.start < at) continue;
      if (hit.start > at) painted.push({ text: run.text.slice(at, hit.start), bold: run.bold });
      painted.push({ text: run.text.slice(hit.start, hit.end), bold: run.bold, color: hit.ink });
      at = hit.end;
    }
    if (at < run.text.length) painted.push({ text: run.text.slice(at), bold: run.bold });
  }
  return painted;
}

const paintLeagues = (runs: Inline[]) => paintWords(runs, LEAGUE_WORDS);
const paintManagers = (runs: Inline[]) => paintWords(runs, MANAGER_WORDS);

export interface Inline { text: string; bold: boolean; color?: Ink }
export type Block = { type: 'p'; inline: Inline[] } | { type: 'ul'; items: Inline[][] };

const isInk = (name: string): name is Ink => INK_SET.has(name);

/** True when a closing tag of this name exists, counting nested copies. Tag case does not matter. */
function hasClose(text: string, from: number, name: string) {
  let depth = 1;
  for (let index = from; index < text.length;) {
    const tag = /^\{(\/?)([a-zA-Z][a-zA-Z-]*)\}/.exec(text.slice(index));
    if (tag && tag[2].toLowerCase() === name) {
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

/** Drops closed color tags and records where each color applies. Unclosed or unknown tags stay as text. */
function stripInks(text: string): { text: string; spans: Array<{ start: number; end: number; ink: Ink }> } {
  let out = '';
  const spans: Array<{ start: number; end: number; ink: Ink }> = [];
  const stack: Array<{ ink: Ink; at: number }> = [];
  for (let index = 0; index < text.length;) {
    const tag = /^\{(\/?)([a-zA-Z][a-zA-Z-]*)\}/.exec(text.slice(index));
    const name = tag?.[2].toLowerCase();
    if (tag && name && isInk(name)) {
      if (tag[1]) {
        if (stack[stack.length - 1]?.ink === name) {
          const open = stack.pop()!;
          spans.push({ start: open.at, end: out.length, ink: name });
          index += tag[0].length;
          continue;
        }
      } else if (hasClose(text, index + tag[0].length, name)) {
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

export function inlineOf(text: string): Inline[] {
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
  return paintManagers(paintLeagues(runs));
}

export function parseAnswer(text: string): Block[] {
  const blocks: Block[] = [];
  let list: Inline[][] | null = null;
  let paragraph: string[] = [];
  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: 'p', inline: inlineOf(paragraph.join(' ')) });
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
      (list ??= []).push(inlineOf(bullet[1]));
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();
  return blocks;
}
