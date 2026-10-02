import { parseAnswer, type Inline } from './answerText.ts';
import type { Cell } from './askTools.ts';

/** A chart reduced to something an email can hold: a picture, a small table, or both. */
export interface EmailPiece {
  title: string;
  subtitle?: string;
  image?: string | null;
  imageWidth?: number;
  cards?: Array<{ label: string; value: string; note?: string }>;
  table?: { columns: string[]; rows: Cell[][] } | null;
  caveats?: string[];
  /** Live cards copy as text plus a link to the page, since their numbers keep changing. */
  link?: { href: string; text: string };
}

const TABLE_ROWS = 40;

const esc = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

const inlineHtml = (parts: Inline[]) => parts.map(part => part.bold ? `<b>${esc(part.text)}</b>` : esc(part.text)).join('');
const inlinePlain = (parts: Inline[]) => parts.map(part => part.text).join('');

const paragraphStyle = 'margin:0 0 12px;font-family:Calibri,Arial,sans-serif;font-size:16px;line-height:1.45;color:#151719;background-color:transparent;';
const mutedStyle = 'margin:0 0 12px;font-family:Calibri,Arial,sans-serif;font-size:14px;line-height:1.45;color:#62686d;background-color:transparent;';

function tableHtml(columns: string[], rows: Cell[][]) {
  const shown = rows.slice(0, TABLE_ROWS);
  const head = columns.map(column => `<th style="text-align:left;padding:6px 10px;border:1px solid #d9dcdf;font-weight:600;background-color:transparent;color:#151719;">${esc(column)}</th>`).join('');
  const body = shown.map(row => `<tr>${row.map(cell => {
    const numeric = typeof cell === 'number';
    const text = cell === null || cell === undefined ? '' : String(cell);
    return `<td style="padding:6px 10px;border:1px solid #d9dcdf;background-color:transparent;color:#151719;${numeric ? 'text-align:right;' : ''}">${esc(text)}</td>`;
  }).join('')}</tr>`).join('');
  const note = rows.length > shown.length ? `<p style="${mutedStyle}">Showing ${shown.length} of ${rows.length} rows.</p>` : '';
  return `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 12px;font-family:Calibri,Arial,sans-serif;font-size:14px;color:#151719;"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>${note}`;
}

function tablePlain(columns: string[], rows: Cell[][]) {
  const shown = rows.slice(0, TABLE_ROWS);
  const lines = [columns.join('\t'), ...shown.map(row => row.map(cell => (cell === null || cell === undefined ? '' : String(cell))).join('\t'))];
  if (rows.length > shown.length) lines.push(`Showing ${shown.length} of ${rows.length} rows.`);
  return lines.join('\n');
}

/** HTML and plain text for pasting an answer into an email. Pictures are embedded data URLs. */
export function renderEmail(input: { question?: string; answer: string; pieces: EmailPiece[] }) {
  const html: string[] = [];
  const plain: string[] = [];
  const pushParagraph = (text: string, style = paragraphStyle) => {
    html.push(`<p style="${style}">${text}</p>`);
  };
  if (input.question?.trim()) {
    pushParagraph(`<b>${esc(input.question.trim())}</b>`);
    plain.push(input.question.trim(), '');
  }
  for (const block of parseAnswer(input.answer)) {
    if (block.type === 'p') {
      pushParagraph(inlineHtml(block.inline));
      plain.push(inlinePlain(block.inline), '');
    } else {
      html.push(`<ul style="margin:0 0 12px;padding-left:22px;font-family:Calibri,Arial,sans-serif;font-size:16px;line-height:1.45;color:#151719;background-color:transparent;">${block.items.map(item => `<li style="background-color:transparent;color:#151719;">${inlineHtml(item)}</li>`).join('')}</ul>`);
      plain.push(...block.items.map(item => `- ${inlinePlain(item)}`), '');
    }
  }
  for (const piece of input.pieces) {
    pushParagraph(`<b>${esc(piece.title)}</b>`);
    plain.push(piece.title);
    if (piece.subtitle) {
      pushParagraph(esc(piece.subtitle), mutedStyle);
      plain.push(piece.subtitle);
    }
    if (piece.cards?.length) {
      for (const card of piece.cards) {
        const note = card.note ? ` (${esc(card.note)})` : '';
        pushParagraph(`<b>${esc(card.label)}:</b> ${esc(card.value)}${note}`);
        plain.push(`${card.label}: ${card.value}${card.note ? ` (${card.note})` : ''}`);
      }
    }
    if (piece.image) {
      const width = Math.max(280, Math.min(piece.imageWidth ?? 960, 1200));
      html.push(`<p style="margin:0 0 12px;background-color:transparent;"><img src="${esc(piece.image)}" alt="" width="${width}" style="max-width:100%;height:auto;display:block;border:0;background-color:transparent;" /></p>`);
    } else if (!piece.table && !piece.cards?.length && !piece.link) {
      pushParagraph('The chart could not be copied.', mutedStyle);
      plain.push('The chart could not be copied.');
    }
    if (piece.table && piece.table.columns.length && piece.table.rows.length) {
      html.push(tableHtml(piece.table.columns, piece.table.rows));
      plain.push(tablePlain(piece.table.columns, piece.table.rows));
    }
    if (piece.link) {
      pushParagraph(`<a href="${esc(piece.link.href)}" style="color:#0b5cad;">${esc(piece.link.text)}</a>`);
      plain.push(`${piece.link.text}: ${piece.link.href}`);
    }
    for (const caveat of piece.caveats ?? []) {
      pushParagraph(esc(caveat), mutedStyle);
      plain.push(caveat);
    }
    plain.push('');
  }
  return { html: html.join(''), plain: plain.join('\n').replace(/\n{3,}/g, '\n\n').trim() };
}

/** Copies rich text plus pictures. Must run from a click or key press. */
export async function copyEmail(html: string, plain: string): Promise<boolean> {
  const host = document.createElement('div');
  host.id = 'email-copy-host';
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:1200px;background-color:transparent;color:#151719;';
  host.innerHTML = html;
  const paint = document.createElement('style');
  paint.textContent = '#email-copy-host, #email-copy-host * { background: none !important; background-color: transparent !important; background-image: none !important; box-shadow: none !important; color: #151719 !important; }';
  document.head.appendChild(paint);
  document.body.appendChild(host);
  const pending = [...host.querySelectorAll('img')].filter(img => !img.complete);
  await Promise.all(pending.map(img => new Promise<void>(resolve => {
    img.addEventListener('load', () => resolve(), { once: true });
    img.addEventListener('error', () => resolve(), { once: true });
  })));
  const root = document.documentElement;
  const previous = {
    htmlBg: root.style.background, htmlColor: root.style.color,
    bodyBg: document.body.style.background, bodyColor: document.body.style.color,
  };
  root.style.background = 'transparent';
  root.style.color = '#151719';
  document.body.style.background = 'transparent';
  document.body.style.color = '#151719';
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(host);
  selection?.removeAllRanges();
  selection?.addRange(range);
  let copied = false;
  try { copied = document.execCommand('copy'); } catch { copied = false; }
  selection?.removeAllRanges();
  host.remove();
  paint.remove();
  root.style.background = previous.htmlBg;
  root.style.color = previous.htmlColor;
  document.body.style.background = previous.bodyBg;
  document.body.style.color = previous.bodyColor;
  if (copied) return true;
  if (!navigator.clipboard?.write) return false;
  await navigator.clipboard.write([new ClipboardItem({
    'text/html': new Blob([html], { type: 'text/html' }),
    'text/plain': new Blob([plain], { type: 'text/plain' }),
  })]);
  return true;
}
