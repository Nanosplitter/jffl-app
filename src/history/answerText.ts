/** Turns model text into safe blocks. Only paragraphs, simple lists, and bold are recognized; everything else stays plain text. */
export interface Inline { text: string; bold: boolean }
export type Block = { type: 'p'; inline: Inline[] } | { type: 'ul'; items: Inline[][] };

export function inlineOf(text: string): Inline[] {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, index) => ({ text: part, bold: index % 2 === 1 })).filter(part => part.text);
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
