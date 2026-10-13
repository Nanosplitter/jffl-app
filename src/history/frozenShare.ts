import { isCardSpec, type CardSpec } from './askCards.ts';
import type { ChatMessage } from './askStore.ts';
import { archiveStamp, packChart, usesLiveData, type SharedChart } from './share.ts';
import type { Session } from './askRuntime.ts';
import type { Archive } from './askTools.ts';

/** A chart recipe stored with a frozen share. Rows are not included. */
export interface FrozenChart {
  id: string;
  spec: SharedChart['spec'];
  sources: SharedChart['sources'];
  warnings: string[];
  controls?: SharedChart['controls'];
}

/** One turn of a frozen share. Later replies in the owner's chat do not change it. */
export interface FrozenMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  charts: FrozenChart[];
  cards: CardSpec[];
  order: number;
}

export interface FrozenShare {
  kind: 'thread' | 'message';
  title: string;
  archive: string;
  liveAsOf?: string;
  messages: FrozenMessage[];
}

const TITLE_MAX = 120;

export function shareTitle(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return 'Chat';
  return clean.length > TITLE_MAX ? `${clean.slice(0, TITLE_MAX - 1)}…` : clean;
}

function packCharts(message: ChatMessage, session: Session): FrozenChart[] {
  return message.charts.slice(0, 8).map(chart => {
    const packed = packChart(session, chart.spec, chart.controls);
    return {
      id: chart.id,
      spec: packed.spec,
      sources: packed.sources,
      warnings: chart.warnings,
      ...(packed.controls ? { controls: packed.controls } : {}),
    };
  });
}

/** Copies the messages as they stand. The full answer text is kept. */
export function freezeMessages(messages: ChatMessage[], session: Session, kind: 'thread' | 'message'): FrozenShare {
  const archive = session.ctx.archive;
  const live = archive.live?.asOf;
  const specs = messages.flatMap(message => message.charts.map(chart => chart.spec));
  const hasCards = messages.some(message => (message.cards?.length ?? 0) > 0);
  const first = messages.find(message => message.role === 'user')?.text ?? '';
  return {
    kind,
    title: shareTitle(first),
    archive: archiveStamp(archive),
    ...(live && (hasCards || usesLiveData(session, specs)) ? { liveAsOf: live } : {}),
    messages: messages.map((message, order) => ({
      id: message.id,
      role: message.role,
      text: message.text,
      charts: message.role === 'assistant' ? packCharts(message, session) : [],
      cards: (message.cards ?? []).map(card => card.spec).filter(isCardSpec).slice(0, 4),
      order,
    })),
  };
}

export function freezeMessage(question: string, answer: ChatMessage, session: Session): FrozenShare {
  const ask: ChatMessage = { id: `${answer.id}-q`, role: 'user', text: question, charts: [], followUps: [] };
  return freezeMessages([ask, answer], session, 'message');
}

/** Display messages plus a text transcript so a signed-in reader can continue in their own chat. */
export function chatFromFrozen(frozen: FrozenShare): { messages: ChatMessage[]; contents: Array<{ role: string; parts: Array<{ text: string }> }>; sources: Array<{ id: string; source: { tool: string; args: Record<string, unknown> } }> } {
  const messages: ChatMessage[] = frozen.messages.map(message => ({
    id: message.id,
    role: message.role,
    text: message.text,
    charts: message.charts.map(chart => ({
      id: chart.id,
      spec: chart.spec,
      warnings: chart.warnings,
      ...(chart.controls ? { controls: chart.controls } : {}),
    })),
    ...(message.cards.length ? { cards: message.cards.map((spec, index) => ({ id: `${message.id}-card-${index}`, spec })) } : {}),
    followUps: [],
  }));
  const contents = frozen.messages
    .filter(message => message.text.trim())
    .map(message => ({ role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.text }] }));
  const sources = frozen.messages.flatMap(message => message.charts.flatMap(chart => chart.sources));
  return { messages, contents, sources };
}

export function liveStamp(archive: Archive, frozen: FrozenShare) {
  return frozen.liveAsOf && frozen.liveAsOf !== archive.live?.asOf ? frozen.liveAsOf : undefined;
}
