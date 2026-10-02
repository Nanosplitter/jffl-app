import type { ModelContent } from './askAgent.ts';
import type { Controls, Source } from './askTools.ts';
import type { ChartSpec } from './chartSpec.ts';

export interface ChartItem { id: string; spec: ChartSpec; warnings: string[]; controls?: Controls }
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  charts: ChartItem[];
  followUps: string[];
  error?: string;
}
export interface Stored {
  v: 1;
  messages: ChatMessage[];
  contents: ModelContent[];
  sources: Array<{ id: string; source: Source }>;
}

export const STORE_KEY = 'jffl.ask.chat.v1';
const MAX_STORED_CHARS = 1_500_000;

export function serialize(state: Omit<Stored, 'v'>): string | null {
  const text = JSON.stringify({ v: 1, ...state } satisfies Stored);
  return text.length > MAX_STORED_CHARS ? null : text;
}

export function deserialize(raw: string | null): Stored | null {
  if (!raw || raw.length > MAX_STORED_CHARS) return null;
  try {
    const value = JSON.parse(raw) as Partial<Stored> | null;
    if (!value || value.v !== 1 || !Array.isArray(value.messages) || !Array.isArray(value.contents) || !Array.isArray(value.sources)) return null;
    const messages = value.messages.filter((message): message is ChatMessage => !!message && (message.role === 'user' || message.role === 'assistant')
      && typeof message.text === 'string' && Array.isArray(message.charts) && Array.isArray(message.followUps));
    return { v: 1, messages, contents: value.contents as ModelContent[], sources: value.sources };
  } catch {
    return null;
  }
}
