/** Friendly, client-side limits. They are courtesy limits: real protection is App Check, Firebase AI quotas, and budget alerts. */
export const MAX_INPUT_CHARS = 500;
export const MAX_TURNS = 20;
export const COOLDOWN_MS = 2500;
export const DAILY_SOFT_LIMIT = 40;
export const DAILY_KEY = 'jffl.ask.daily';

export type LimitCheck = { ok: true } | { ok: false; reason: string };

export interface LimitState {
  input: string;
  now: number;
  lastSentAt: number;
  turns: number;
  todayCount: number;
  busy: boolean;
}

export function checkLimits(state: LimitState): LimitCheck {
  const text = state.input.trim();
  if (!text) return { ok: false, reason: 'Type a question first.' };
  if (state.busy) return { ok: false, reason: 'Hold on, I am still working on the last question.' };
  if (text.length > MAX_INPUT_CHARS) return { ok: false, reason: `Please keep questions under ${MAX_INPUT_CHARS} characters.` };
  if (state.turns >= MAX_TURNS) return { ok: false, reason: 'This conversation is getting long. Start a new chat to keep going.' };
  if (state.now - state.lastSentAt < COOLDOWN_MS) return { ok: false, reason: 'One moment before the next question.' };
  if (state.todayCount >= DAILY_SOFT_LIMIT) return { ok: false, reason: 'You have asked a lot of questions today. Please come back tomorrow.' };
  return { ok: true };
}

export const dayStamp = (now: number) => new Date(now).toISOString().slice(0, 10);

export interface DailyCount { day: string; count: number }

export function readDaily(raw: string | null, now: number): DailyCount {
  const today = dayStamp(now);
  try {
    const parsed = JSON.parse(raw ?? 'null') as Partial<DailyCount> | null;
    if (parsed && parsed.day === today && typeof parsed.count === 'number' && parsed.count >= 0) return { day: today, count: Math.floor(parsed.count) };
  } catch { /* fall through */ }
  return { day: today, count: 0 };
}

const text = (error: unknown) => {
  if (!error) return '';
  const parts = [error instanceof Error ? error.message : String(error)];
  const code = (error as { code?: unknown } | null)?.code;
  if (typeof code === 'string') parts.push(code);
  const status = (error as { customErrorData?: { status?: unknown } } | null)?.customErrorData?.status;
  if (typeof status === 'number' || typeof status === 'string') parts.push(String(status));
  return parts.join(' ').toLowerCase();
};

/** Plain-language messages. Never includes raw error text, which can carry request details. */
export function friendlyError(error: unknown): string {
  const message = text(error);
  if (/429|quota|resource.?exhausted|rate.?limit|too many/.test(message)) return 'The assistant is busy or has reached its daily limit. Please try again in a little while. The rest of the archive still works.';
  if (/app.?check|403|permission|forbidden|unauthenticated|401|api.?key|not.?enabled|disabled/.test(message)) return 'The assistant is not available from this browser right now.';
  if (/safety|blocked|prohibited|recitation/.test(message)) return 'I cannot answer that one. Try asking about the league archive in different words.';
  if (/network|fetch|offline|failed to load|timeout|timed out/.test(message)) return 'The connection dropped. Check your internet and try again.';
  if (/not.?found|404|model/.test(message)) return 'The assistant is being updated. Please try again later.';
  return 'Something went wrong while answering. Please try again.';
}
