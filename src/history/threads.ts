import { collection, doc, getDoc, getDocs, getFirestore, limit, onSnapshot, orderBy, query, writeBatch, type Unsubscribe } from 'firebase/firestore';
import { getFirebaseApp } from '../firebaseApp';
import { fitHistory, type ModelContent } from './askAgent.ts';
import { isCardSpec, type CardItem } from './askCards.ts';
import type { ChartItem, ChatMessage } from './askStore.ts';
import type { Source } from './askTools.ts';
import { chatFromFrozen, type FrozenChart, type FrozenMessage, type FrozenShare } from './frozenShare.ts';
import type { Session } from './askRuntime.ts';
import { packChart } from './share.ts';

export interface ThreadSummary { id: string; title: string; preview: string; updatedAt: string }

export interface LoadedThread {
  messages: ChatMessage[];
  contents: ModelContent[];
  sources: Array<{ id: string; source: Source }>;
}

const db = () => {
  const app = getFirebaseApp();
  return app ? getFirestore(app) : null;
};

const titleOf = (messages: ChatMessage[]) => {
  const text = (messages.find(message => message.role === 'user')?.text ?? 'Chat').replace(/\s+/g, ' ').trim() || 'Chat';
  return text.length > 120 ? `${text.slice(0, 119)}…` : text;
};

const previewOf = (messages: ChatMessage[]) => {
  const text = ([...messages].reverse().find(message => message.role === 'user')?.text ?? '').replace(/\s+/g, ' ').trim();
  return text.slice(0, 160);
};

function chartRecord(message: ChatMessage, session: Session) {
  if (message.role !== 'assistant') return [];
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

function messageRecord(message: ChatMessage, order: number, session: Session) {
  const cards = (message.cards ?? []).map(card => card.spec).filter(isCardSpec).slice(0, 4);
  return {
    role: message.role,
    text: message.text.slice(0, 400_000),
    charts: chartRecord(message, session),
    followUps: message.followUps.slice(0, 6),
    order,
    ...(cards.length ? { cards } : {}),
    ...(message.error ? { error: message.error.slice(0, 500) } : {}),
  };
}

function asChart(value: unknown): { chart: ChartItem; sources: Array<{ id: string; source: Source }> } | null {
  if (!value || typeof value !== 'object') return null;
  const chart = value as Partial<FrozenChart>;
  if (typeof chart.id !== 'string' || !chart.spec || !Array.isArray(chart.sources)) return null;
  return {
    chart: {
      id: chart.id,
      spec: chart.spec,
      warnings: Array.isArray(chart.warnings) ? chart.warnings.filter((item): item is string => typeof item === 'string') : [],
      ...(chart.controls ? { controls: chart.controls } : {}),
    },
    sources: sourceList(chart.sources),
  };
}

function asMessage(id: string, value: unknown): { message: ChatMessage & { order: number }; sources: Array<{ id: string; source: Source }> } | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<FrozenMessage & { followUps?: unknown; error?: unknown }>;
  if ((raw.role !== 'user' && raw.role !== 'assistant') || typeof raw.text !== 'string') return null;
  const packed = Array.isArray(raw.charts) ? raw.charts.flatMap(chart => { const item = asChart(chart); return item ? [item] : []; }) : [];
  const cards = Array.isArray(raw.cards) ? raw.cards.filter(isCardSpec).slice(0, 4).map((spec, index): CardItem => ({ id: `${id}-card-${index}`, spec })) : [];
  const followUps = Array.isArray(raw.followUps) ? raw.followUps.filter((item): item is string => typeof item === 'string').slice(0, 6) : [];
  return {
    message: {
      id,
      role: raw.role,
      text: raw.text,
      charts: packed.map(item => item.chart),
      ...(cards.length ? { cards } : {}),
      followUps,
      ...(typeof raw.error === 'string' ? { error: raw.error } : {}),
      order: typeof raw.order === 'number' ? raw.order : 0,
    },
    sources: packed.flatMap(item => item.sources),
  };
}

function sourceList(value: unknown): Array<{ id: string; source: Source }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const entry = item as { id?: unknown; source?: { tool?: unknown; args?: unknown } };
    if (typeof entry.id !== 'string' || !entry.source || typeof entry.source.tool !== 'string' || !entry.source.args || typeof entry.source.args !== 'object') return [];
    return [{ id: entry.id, source: { tool: entry.source.tool, args: entry.source.args as Record<string, unknown> } }];
  });
}

export async function saveThread(uid: string, threadId: string, messages: ChatMessage[], contents: ModelContent[], sources: Array<{ id: string; source: Source }>, session: Session) {
  const store = db();
  if (!store) throw new Error('Sign-in is not available.');
  const threadRef = doc(store, 'users', uid, 'threads', threadId);
  const batch = writeBatch(store);
  batch.set(threadRef, { title: titleOf(messages), preview: previewOf(messages), updatedAt: new Date().toISOString() });
  messages.forEach((message, order) => batch.set(doc(threadRef, 'messages', message.id), messageRecord(message, order, session)));
  batch.set(doc(threadRef, 'state', 'transcript'), { contents: fitHistory(contents, 800_000), sources });
  await batch.commit();
}

export async function loadThread(uid: string, threadId: string): Promise<LoadedThread | null> {
  const store = db();
  if (!store) return null;
  const threadRef = doc(store, 'users', uid, 'threads', threadId);
  const thread = await getDoc(threadRef);
  if (!thread.exists()) return null;
  const [messagesSnap, transcript] = await Promise.all([
    getDocs(collection(threadRef, 'messages')),
    getDoc(doc(threadRef, 'state', 'transcript')),
  ]);
  const parsed = messagesSnap.docs.flatMap(item => { const message = asMessage(item.id, item.data()); return message ? [message] : []; });
  parsed.sort((a, b) => a.message.order - b.message.order);
  const data = transcript.data();
  return {
    messages: parsed.map(({ message: { order: _order, ...message } }) => message),
    contents: Array.isArray(data?.contents) ? data.contents as ModelContent[] : [],
    sources: [...sourceList(data?.sources), ...parsed.flatMap(item => item.sources)],
  };
}

export function watchThreads(uid: string, receive: (threads: ThreadSummary[]) => void): Unsubscribe {
  const store = db();
  if (!store) return () => {};
  const threads = query(collection(store, 'users', uid, 'threads'), orderBy('updatedAt', 'desc'), limit(50));
  return onSnapshot(threads, snapshot => {
    receive(snapshot.docs.map(item => {
      const data = item.data();
      return {
        id: item.id,
        title: typeof data.title === 'string' ? data.title : 'Chat',
        preview: typeof data.preview === 'string' ? data.preview : '',
        updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : '',
      };
    }));
  }, () => receive([]));
}

export async function deleteThread(uid: string, threadId: string) {
  const store = db();
  if (!store) return;
  const threadRef = doc(store, 'users', uid, 'threads', threadId);
  const messages = await getDocs(collection(threadRef, 'messages'));
  const refs = [...messages.docs.map(item => item.ref), doc(threadRef, 'state', 'transcript'), threadRef];
  for (let index = 0; index < refs.length; index += 400) {
    const batch = writeBatch(store);
    refs.slice(index, index + 400).forEach(ref => batch.delete(ref));
    await batch.commit();
  }
}

function shareMessageRecord(message: FrozenMessage) {
  return {
    role: message.role,
    text: message.text.slice(0, 400_000),
    charts: message.charts.slice(0, 8),
    order: message.order,
    ...(message.cards.length ? { cards: message.cards } : {}),
  };
}

/** Writes a public frozen copy. The id is the whole secret. */
export async function publishShare(uid: string, frozen: FrozenShare): Promise<string> {
  const store = db();
  if (!store) throw new Error('Sign in to share a saved chat.');
  const shareRef = doc(collection(store, 'shares'));
  await writeBatch(store).set(shareRef, {
    owner: uid,
    kind: frozen.kind,
    title: frozen.title,
    createdAt: new Date().toISOString(),
    archive: frozen.archive,
    ...(frozen.liveAsOf ? { liveAsOf: frozen.liveAsOf } : {}),
  }).commit();
  const messages = writeBatch(store);
  frozen.messages.forEach(message => messages.set(doc(shareRef, 'messages', message.id), shareMessageRecord(message)));
  await messages.commit();
  return shareRef.id;
}

export async function loadShare(shareId: string): Promise<(FrozenShare & { owner: string }) | null> {
  const store = db();
  if (!store) return null;
  const shareRef = doc(store, 'shares', shareId);
  const share = await getDoc(shareRef);
  if (!share.exists()) return null;
  const data = share.data();
  if ((data.kind !== 'thread' && data.kind !== 'message') || typeof data.owner !== 'string' || typeof data.title !== 'string' || typeof data.archive !== 'string') return null;
  const messagesSnap = await getDocs(collection(shareRef, 'messages'));
  const messages = messagesSnap.docs.flatMap(item => {
    const parsed = asMessage(item.id, item.data());
    if (!parsed) return [];
    const charts = Array.isArray(item.data().charts) ? item.data().charts.flatMap((chart: unknown) => {
      const packed = asChart(chart);
      if (!packed) return [];
      return [{ id: packed.chart.id, spec: packed.chart.spec, warnings: packed.chart.warnings, sources: packed.sources.map(entry => ({ id: entry.id, source: entry.source })), ...(packed.chart.controls ? { controls: packed.chart.controls } : {}) }];
    }) : [];
    return [{
      id: parsed.message.id,
      role: parsed.message.role,
      text: parsed.message.text,
      charts,
      cards: parsed.message.cards?.map(card => card.spec) ?? [],
      order: parsed.message.order,
    }];
  }).sort((a, b) => a.order - b.order);
  return {
    owner: data.owner,
    kind: data.kind,
    title: data.title,
    archive: data.archive,
    ...(typeof data.liveAsOf === 'string' ? { liveAsOf: data.liveAsOf } : {}),
    messages,
  };
}

export async function deleteShare(uid: string, shareId: string) {
  const store = db();
  if (!store) return;
  const shareRef = doc(store, 'shares', shareId);
  const share = await getDoc(shareRef);
  if (!share.exists() || share.data().owner !== uid) return;
  const messages = await getDocs(collection(shareRef, 'messages'));
  const batch = writeBatch(store);
  messages.docs.forEach(item => batch.delete(item.ref));
  batch.delete(shareRef);
  await batch.commit();
}

/** Copies a frozen share into a new private thread. It does not write into the owner's chat. */
export async function continueShare(uid: string, frozen: FrozenShare): Promise<string> {
  const store = db();
  if (!store) throw new Error('Sign in to keep this chat.');
  const copied = chatFromFrozen(frozen);
  const threadRef = doc(collection(store, 'users', uid, 'threads'));
  const batch = writeBatch(store);
  batch.set(threadRef, { title: frozen.title, preview: previewOf(copied.messages), updatedAt: new Date().toISOString() });
  copied.messages.forEach((message, order) => {
    const cards = message.cards?.map(card => card.spec) ?? [];
    batch.set(doc(threadRef, 'messages', message.id), {
      role: message.role,
      text: message.text,
      charts: frozen.messages.find(item => item.id === message.id)?.charts ?? [],
      followUps: [],
      order,
      ...(cards.length ? { cards } : {}),
    });
  });
  batch.set(doc(threadRef, 'state', 'transcript'), { contents: copied.contents, sources: copied.sources });
  await batch.commit();
  return threadRef.id;
}
