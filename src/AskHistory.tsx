import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Check, Copy, RotateCcw, Send, Square } from 'lucide-react';
import { ArchiveNav } from './ArchiveNav';
import { ChartView, useDarkMode, type ChartHandle } from './AskCharts';
import { aiConfigured } from './firebaseApp';
import { parseAnswer } from './history/answerText.ts';
import { history } from './history/archive.ts';
import { AgentAborted, fitHistory, runAgent, splitFollowUps, trimHistory, turnCount, type ModelContent } from './history/askAgent.ts';
import { checkLimits, DAILY_KEY, friendlyError, MAX_INPUT_CHARS, readDaily } from './history/askGuards.ts';
import { createSession, restoreSources, validationEnv, type Session } from './history/askRuntime.ts';
import { deserialize, serialize, STORE_KEY, type ChartItem, type ChatMessage } from './history/askStore.ts';
import type { Assistant } from './history/askModel.ts';
import { DARK_THEME, LIGHT_THEME, createColorMap } from './history/chartKit.ts';
import { validateSpec } from './history/chartSpec.ts';
import { copyEmail, renderEmail } from './history/emailCopy.ts';
import { archiveStamp, buildShare, decodeShare, encodeShare, packChart, shareUrl, type BuiltShare } from './history/share.ts';
import type { Controls } from './history/askTools.ts';

const STARTERS = [
  { title: 'Specific', items: ['Who has won the most Super Bowls?', 'What is the highest single-week score ever?', 'What is Becky\u2019s record against Jeff?'] },
  { title: 'Big picture', items: ['How has scoring changed over the years?', 'Does draft position matter for winning titles?', 'How often does the best regular-season record win the Super Bowl?'] },
  { title: 'Make me a chart', items: ['Chart the average score per season for each league', 'Who beats whom in the Premier league since 2013?', 'Show Jeff\u2019s career as a timeline'] },
];

const uid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const read = (storage: Storage | undefined, key: string) => { try { return storage?.getItem(key) ?? null; } catch { return null; } };
const write = (storage: Storage | undefined, key: string, value: string | null) => { try { if (value === null) storage?.removeItem(key); else storage?.setItem(key, value); } catch { /* storage can be blocked */ } };

function useColorMap(dark: boolean) {
  const palette = useRef(dark ? DARK_THEME.palette : LIGHT_THEME.palette);
  palette.current = dark ? DARK_THEME.palette : LIGHT_THEME.palette;
  return useMemo(() => createColorMap(() => palette.current), []);
}

function Answer({ text }: { text: string }) {
  return <div className="ask-answer">{parseAnswer(text).map((block, index) => block.type === 'p'
    ? <p key={index}>{block.inline.map((part, position) => part.bold ? <strong key={position}>{part.text}</strong> : part.text)}</p>
    : <ul key={index}>{block.items.map((item, position) => <li key={position}>{item.map((part, spot) => part.bold ? <strong key={spot}>{part.text}</strong> : part.text)}</li>)}</ul>)}</div>;
}

function ShareBox({ url, onCopy }: { url: string; onCopy: () => void }) {
  return <div className="ask-sharebox">
    <label>Link to this answer<input readOnly value={url} onFocus={event => event.currentTarget.select()} /></label>
    <button type="button" onClick={onCopy}><Copy size={15} aria-hidden="true" />Copy</button>
    <p>The link holds the chart recipe, not your chat. Anyone with it sees the same charts, rebuilt from the archive.</p>
  </div>;
}

function CopyForEmail({ question, text, chartIds, handles, onDone }: {
  question: string; text: string; chartIds: string[]; handles: Map<string, ChartHandle>; onDone: (message: string) => void;
}) {
  const copy = async () => {
    const pieces = [];
    for (const id of chartIds) {
      const shot = await handles.get(id)?.snapshot();
      if (shot) pieces.push(shot);
    }
    const rendered = renderEmail({ question, answer: text, pieces });
    try {
      const ok = await copyEmail(rendered.html, rendered.plain);
      onDone(ok ? 'Copied. Paste it into the email.' : 'Could not copy. Try again.');
    } catch {
      onDone('Could not copy. Try again.');
    }
  };
  return <button type="button" className="ask-email-copy" onClick={() => void copy()}><Copy size={15} aria-hidden="true" />Copy</button>;
}

export function AskPage() {
  const dark = useDarkMode();
  const color = useColorMap(dark);
  const navigate = useNavigate();
  const location = useLocation();
  const [session, setSession] = useState<Session>(() => createSession(history));
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [mock, setMock] = useState(false);
  const [shareLink, setShareLink] = useState<{ id: string; url: string } | null>(null);
  const contents = useRef<ModelContent[]>([]);
  const assistant = useRef<Assistant | null>(null);
  const busyRef = useRef(false);
  const lastSent = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const restored = useRef(false);
  const lastUser = useRef<HTMLDivElement | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const handledPrompt = useRef<string | null>(null);
  const chartHandles = useRef(new Map<string, ChartHandle>());
  const unavailable = !aiConfigured && !import.meta.env.DEV;

  // Restore this tab's chat. Charts are validated again, so stored data can never bypass the checks.
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const saved = deserialize(read(typeof sessionStorage === 'undefined' ? undefined : sessionStorage, STORE_KEY));
    if (!saved) return;
    const next = createSession(history);
    restoreSources(next, saved.sources);
    const env = validationEnv(next);
    const cleaned = saved.messages.map(message => ({
      ...message,
      charts: message.charts.flatMap((chart): ChartItem[] => { const result = validateSpec(chart.spec, env); return result.ok ? [{ ...chart, spec: result.spec, warnings: result.warnings }] : []; }),
    }));
    contents.current = saved.contents;
    setSession(next);
    setMessages(cleaned);
  }, []);

  useEffect(() => {
    if (busy || !restored.current) return;
    const text = serialize({ messages, contents: contents.current, sources: [...session.sources].map(([id, source]) => ({ id, source })) });
    write(typeof sessionStorage === 'undefined' ? undefined : sessionStorage, STORE_KEY, messages.length ? text : null);
  }, [messages, busy, session]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  // Bring a new question into view; do not chase the streaming answer.
  const asked = messages.filter(message => message.role === 'user').length;
  useEffect(() => {
    if (asked) lastUser.current?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [asked]);

  const patch = useCallback((id: string, change: Partial<ChatMessage> | ((message: ChatMessage) => Partial<ChatMessage>)) => {
    setMessages(previous => previous.map(message => (message.id === id ? { ...message, ...(typeof change === 'function' ? change(message) : change) } : message)));
  }, []);

  const send = useCallback(async (raw: string) => {
    const text = raw.trim();
    const now = Date.now();
    const daily = readDaily(read(typeof localStorage === 'undefined' ? undefined : localStorage, DAILY_KEY), now);
    const check = checkLimits({ input: text, now, lastSentAt: lastSent.current, turns: turnCount(contents.current), todayCount: daily.count, busy: busyRef.current });
    if (!check.ok) { setNotice(check.reason); return; }
    setNotice(null);
    setShareLink(null);
    lastSent.current = now;
    busyRef.current = true;
    setBusy(true);
    write(typeof localStorage === 'undefined' ? undefined : localStorage, DAILY_KEY, JSON.stringify({ day: daily.day, count: daily.count + 1 }));
    const answerId = uid();
    setMessages(previous => [...previous, { id: uid(), role: 'user', text, charts: [], followUps: [] }, { id: answerId, role: 'assistant', text: '', charts: [], followUps: [] }]);
    setDraft('');
    const controller = new AbortController();
    abort.current = controller;
    try {
      setNote('Connecting to the assistant');
      if (!assistant.current) {
        const { loadAssistant } = await import('./history/askModel.ts');
        assistant.current = await loadAssistant(session.managers);
        setMock(assistant.current.mock);
      }
      contents.current = fitHistory(trimHistory(contents.current));
      let stepText = '';
      setNote('Thinking');
      const result = await runAgent({
        model: assistant.current.model, session, contents: contents.current, message: text, signal: controller.signal,
        onEvent: event => {
          if (event.type === 'step') { stepText = ''; patch(answerId, { text: '' }); }
          else if (event.type === 'text') { stepText += event.delta; patch(answerId, { text: splitFollowUps(stepText).answer }); }
          else if (event.type === 'tool') setNote(event.note);
          else patch(answerId, message => ({ charts: [...message.charts, { id: event.id, spec: event.spec, warnings: event.warnings }] }));
        },
      });
      const { answer, followUps } = splitFollowUps(result.text);
      patch(answerId, { text: answer || (result.charts.length ? 'Here is the chart.' : 'I could not put together an answer. Try asking it another way.'), followUps });
    } catch (error) {
      if (controller.signal.aborted || error instanceof AgentAborted) patch(answerId, { error: 'Stopped.' });
      else patch(answerId, { error: error instanceof Error && error.name === 'AssistantUnavailable' ? error.message : friendlyError(error) });
    } finally {
      busyRef.current = false;
      abort.current = null;
      setBusy(false);
      setNote('');
    }
  }, [session, patch]);

  // A chart in a shared link can hand a question over to this page.
  useEffect(() => {
    const prompt = (location.state as { prompt?: string } | null)?.prompt;
    if (!prompt || handledPrompt.current === prompt || unavailable) return;
    handledPrompt.current = prompt;
    navigate(location.pathname, { replace: true, state: null });
    window.setTimeout(() => { void send(prompt); }, 50);
  }, [location, navigate, send, unavailable]);

  const reset = () => {
    abort.current?.abort();
    contents.current = [];
    setSession(createSession(history));
    setMessages([]);
    setNotice(null);
    setShareLink(null);
    write(typeof sessionStorage === 'undefined' ? undefined : sessionStorage, STORE_KEY, null);
    input.current?.focus();
  };

  const shareMessage = useCallback(async (message: ChatMessage, question: string, chartId: string, controls: Controls) => {
    try {
      const charts = message.charts.map(chart => packChart(session, chart.spec, chart.id === chartId ? controls : chart.controls));
      const encoded = await encodeShare({ v: 1, a: archiveStamp(history), q: question.slice(0, 300), t: message.text.slice(0, 1200), c: charts });
      const url = shareUrl(window.location.origin, encoded);
      setShareLink({ id: message.id, url });
      try { await navigator.clipboard.writeText(url); setToast('Link copied'); } catch { setToast('Link ready. Copy it below.'); }
    } catch (error) {
      setToast(error instanceof Error ? error.message : 'Could not make a link.');
    }
  }, [session]);

  const onKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(draft); }
  };

  const lastAssistant = [...messages].reverse().find(message => message.role === 'assistant');
  const lastUserIndex = messages.map(message => message.role).lastIndexOf('user');

  return <div className="ask-page">
    <ArchiveNav />
    <section className="page-intro"><div><p className="eyebrow">League archive</p><h1>Ask the archive</h1><p className="intro-copy">Ask about 24 seasons of JFFL history in your own words. The assistant looks the answer up in the archive and can draw a chart you can adjust.</p></div></section>

    {unavailable && <p className="notice" role="status">The assistant is not switched on for this site yet. The archive pages and any shared links still work.</p>}
    {mock && <p className="notice" role="status">Local test assistant: canned wording, real archive numbers. It is only available in development.</p>}

    <div className="ask-thread">
      {messages.length === 0 && <div className="ask-empty-state">
        <h2>Try a question</h2>
        <p>Answers come only from the league archive (2002 to 2025). Questions are sent to Google’s Gemini through Firebase, so please do not include personal details.</p>
        {STARTERS.map(group => <div key={group.title} className="ask-starter-group">
          <h3>{group.title}</h3>
          <div className="ask-starters">{group.items.map(item => <button key={item} type="button" disabled={busy || unavailable} onClick={() => void send(item)}>{item}</button>)}</div>
        </div>)}
      </div>}

      {messages.map((message, index) => {
        if (message.role === 'user') return <div key={message.id} className="ask-msg user" ref={index === lastUserIndex ? lastUser : undefined}><div className="ask-bubble-user"><span className="sr-only">You asked: </span>{message.text}</div></div>;
        const question = messages[index - 1]?.text ?? '';
        const streaming = busy && message.id === lastAssistant?.id;
        return <div key={message.id} className="ask-msg assistant">
          <div className="ask-msg-head">
            <span className="ask-label">Archive assistant</span>
          </div>
          {streaming && !message.text && <p className="ask-progress">{note || 'Working'}…</p>}
          {message.text && <Answer text={message.text} />}
          {streaming && message.text && note && note !== 'Thinking' && <p className="ask-progress">{note}…</p>}
          {message.charts.length > 0 && <div className="ask-charts">{message.charts.map(chart => <ChartView
            key={chart.id} ref={handle => { if (handle) chartHandles.current.set(chart.id, handle); else chartHandles.current.delete(chart.id); }}
            spec={chart.spec} session={session} color={color} dark={dark} initialControls={chart.controls}
            onAsk={busy ? undefined : text => void send(text)} onShare={controls => void shareMessage(message, question, chart.id, controls)} />)}</div>}
          {shareLink?.id === message.id && <ShareBox url={shareLink.url} onCopy={() => { void navigator.clipboard?.writeText(shareLink.url).then(() => setToast('Link copied'), () => setToast('Copy it from the box.')); }} />}
          {message.error && <p className="ask-error" role="alert">{message.error}</p>}
          {!streaming && message.id === lastAssistant?.id && message.followUps.length > 0 && <div className="ask-chips" aria-label="Suggested follow-up questions">
            {message.followUps.map(item => <button key={item} type="button" disabled={busy} onClick={() => void send(item)}>{item}</button>)}
          </div>}
          {!streaming && (message.text || message.charts.length > 0) && <CopyForEmail question={question} text={message.text} chartIds={message.charts.map(chart => chart.id)} handles={chartHandles.current} onDone={setToast} />}
        </div>;
      })}
    </div>

    <p className="sr-only" role="status">{busy ? `${note || 'Working'}` : messages.length ? 'Answer ready' : ''}</p>
    {toast && <div className="ask-toast" role="status">{toast}</div>}

    <div className="ask-composer">
      {notice && <p className="ask-error" role="alert">{notice}</p>}
      <form onSubmit={event => { event.preventDefault(); void send(draft); }}>
        <label className="sr-only" htmlFor="ask-input">Your question</label>
        <textarea id="ask-input" ref={input} value={draft} rows={1} maxLength={MAX_INPUT_CHARS + 50} disabled={unavailable}
          placeholder={messages.length ? 'Ask a follow-up, or change the chart\u2026' : 'Ask about titles, scores, rivalries, drafts\u2026'}
          onChange={event => setDraft(event.target.value)} onKeyDown={onKey} />
        {busy
          ? <button type="button" className="button" onClick={() => abort.current?.abort()}><Square size={15} aria-hidden="true" />Stop</button>
          : <button type="submit" className="button" disabled={!draft.trim() || unavailable}><Send size={15} aria-hidden="true" />Ask</button>}
      </form>
      <div className="ask-composer-meta">
        <span>Enter to send, Shift+Enter for a new line.</span>
        {messages.length > 0 && <button type="button" onClick={reset}><RotateCcw size={12} aria-hidden="true" /> New chat</button>}
      </div>
    </div>
  </div>;
}

export function AskSharePage() {
  const dark = useDarkMode();
  const color = useColorMap(dark);
  const navigate = useNavigate();
  const { hash } = useLocation();
  const [state, setState] = useState<{ status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; built: BuiltShare }>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    decodeShare(hash).then(result => {
      if (cancelled) return;
      if (!result.ok) { setState({ status: 'error', message: result.error }); return; }
      const built = buildShare(history, result.payload);
      setState(built.charts.length ? { status: 'ready', built } : { status: 'error', message: 'None of the charts in this link could be rebuilt.' });
    });
    return () => { cancelled = true; };
  }, [hash]);

  const built = state.status === 'ready' ? state.built : null;
  return <div className="ask-page">
    <ArchiveNav />
    <section className="page-intro"><div>
      <p className="eyebrow">Shared from Ask the archive</p>
      <h1>{built?.question || 'Shared chart'}</h1>
      <p className="intro-copy">These charts were rebuilt from the league archive on your device. Nothing was sent to the assistant to show this page.</p>
    </div></section>
    {state.status === 'loading' && <div className="waiting" role="status">Opening shared chart…</div>}
    {state.status === 'error' && <div className="ask-thread"><p className="ask-error" role="alert">{state.message}</p><div className="ask-share-bar"><Link className="button" to="/archive/ask">Ask your own question</Link></div></div>}
    {built && <div className="ask-thread">
      {built.stale && <p className="notice">This link was made from an earlier version of the archive, so numbers may differ slightly.</p>}
      {built.skipped > 0 && <p className="notice">{built.skipped} chart{built.skipped === 1 ? '' : 's'} in this link could not be rebuilt and {built.skipped === 1 ? 'was' : 'were'} left out.</p>}
      {built.text && <div><Answer text={built.text} /><p className="source-note">The written summary comes from the link and has not been checked. The charts below are rebuilt from the archive.</p></div>}
      <div className="ask-charts">{built.charts.map(chart => <ChartView key={chart.id} spec={chart.spec} session={built.session} color={color} dark={dark} initialControls={chart.controls}
        onAsk={prompt => navigate('/archive/ask', { state: { prompt } })} />)}</div>
      <div className="ask-share-bar"><Link className="button" to="/archive/ask"><Check size={15} aria-hidden="true" />Ask your own question</Link></div>
    </div>}
  </div>;
}
