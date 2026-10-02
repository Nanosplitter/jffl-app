import { createSession, datasetOf, restoreSources, validationEnv, type Session } from './askRuntime.ts';
import { createContext, isDataTool, runDataTool, type Archive, type Controls, type Source } from './askTools.ts';
import { datasetIdsOf, LAST_SEASON, FIRST_SEASON, LEAGUES, validateSpec, type ChartSpec } from './chartSpec.ts';

/**
 * Share links carry a recipe, not data. The fragment holds the chart spec and the queries that feed it; the receiving
 * browser rebuilds everything from the bundled archive, plus its own copy of the live league snapshots for the season
 * in progress. Nothing is stored on a server and no model call is made.
 * The fragment never reaches a server because browsers do not send it in requests.
 */

export const SHARE_VERSION = 1;
export const MAX_ENCODED = 8000;
const MAX_TEXT = 1200;
const MAX_CHARTS = 3;
const MAX_SOURCES = 8;
const MAX_ARGS_CHARS = 2500;
const TYPES = ['Season', 'Cup', 'Superbowl'];

export interface SharedChart { spec: ChartSpec; sources: Array<{ id: string; source: Source }>; controls?: Controls }
/** `l` is the live snapshot time, present only when a chart uses the season in progress. */
export interface SharePayload { v: 1; a: string; l?: string; q?: string; t?: string; c: SharedChart[] }

export const archiveStamp = (archive: Archive) => `${archive.games.length}-${archive.seasons.length}`;

// ---------- Binary packing ----------

const toBase64Url = (bytes: Uint8Array) => {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromBase64Url = (text: string) => {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new Error('Not a share link.');
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
};

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream, limit: number) {
  const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(stream).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) { await reader.cancel(); throw new Error('Share link is too large.'); }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length; }
  return out;
}

export async function encodeShare(payload: SharePayload): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(payload));
  const packed = await pipe(json, new CompressionStream('deflate-raw'), 1_000_000);
  const text = toBase64Url(packed);
  if (text.length > MAX_ENCODED) throw new Error('This chart is too large to share as a link.');
  return text;
}

// ---------- Validation ----------

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const int = (value: unknown, low: number, high: number) => (typeof value === 'number' && Number.isInteger(value) && value >= low && value <= high ? value : undefined);

export function cleanControls(raw: unknown): Controls | undefined {
  if (!isObject(raw)) return undefined;
  const controls: Controls = {};
  const from = int(raw.from, FIRST_SEASON, LAST_SEASON);
  const to = int(raw.to, FIRST_SEASON, LAST_SEASON);
  if (from !== undefined) controls.from = from;
  if (to !== undefined) controls.to = to;
  if (Array.isArray(raw.leagues)) { const leagues = raw.leagues.filter((item): item is string => typeof item === 'string' && (LEAGUES as readonly string[]).includes(item)); if (leagues.length) controls.leagues = [...new Set(leagues)]; }
  if (Array.isArray(raw.types)) { const types = raw.types.filter((item): item is string => typeof item === 'string' && TYPES.includes(item)); if (types.length) controls.types = [...new Set(types)]; }
  if (raw.excludeTwoWeek === true) controls.excludeTwoWeek = true;
  return Object.keys(controls).length ? controls : undefined;
}

export type Decoded = { ok: true; payload: SharePayload } | { ok: false; error: string };

const bad = (error: string): Decoded => ({ ok: false, error });

export async function decodeShare(text: string): Promise<Decoded> {
  const cleaned = text.trim().replace(/^#/, '');
  if (!cleaned) return bad('This link has no chart in it.');
  if (cleaned.length > MAX_ENCODED) return bad('This link is too large to be a valid share.');
  let raw: unknown;
  try {
    const bytes = await pipe(fromBase64Url(cleaned), new DecompressionStream('deflate-raw'), 200_000);
    raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return bad('This link is damaged or incomplete.');
  }
  if (!isObject(raw) || raw.v !== SHARE_VERSION) return bad('This link was made by a different version of the site.');
  if (typeof raw.a !== 'string' || raw.a.length > 40) return bad('This link is damaged or incomplete.');
  if (raw.l !== undefined && (typeof raw.l !== 'string' || raw.l.length > 40)) return bad('This link is damaged or incomplete.');
  if (!Array.isArray(raw.c) || !raw.c.length || raw.c.length > MAX_CHARTS) return bad('This link has no chart in it.');
  const charts: SharedChart[] = [];
  let sourceCount = 0;
  for (const item of raw.c) {
    if (!isObject(item) || !isObject(item.spec) || !Array.isArray(item.sources)) return bad('This link is damaged or incomplete.');
    const sources: SharedChart['sources'] = [];
    for (const entry of item.sources) {
      if (!isObject(entry) || typeof entry.id !== 'string' || !/^ds\d{1,4}$/.test(entry.id) || !isObject(entry.source)) return bad('This link is damaged or incomplete.');
      const { tool, args } = entry.source;
      if (typeof tool !== 'string' || !isDataTool(tool) || !isObject(args) || JSON.stringify(args).length > MAX_ARGS_CHARS) return bad('This link is damaged or incomplete.');
      sources.push({ id: entry.id, source: { tool, args } });
    }
    sourceCount += sources.length;
    charts.push({ spec: item.spec as unknown as ChartSpec, sources, controls: cleanControls(item.controls) });
  }
  if (sourceCount > MAX_SOURCES) return bad('This link has too much data in it.');
  return {
    ok: true,
    payload: {
      v: SHARE_VERSION, a: raw.a, c: charts,
      ...(typeof raw.l === 'string' && !Number.isNaN(Date.parse(raw.l)) ? { l: raw.l } : {}),
      ...(typeof raw.q === 'string' && raw.q.trim() ? { q: raw.q.slice(0, 300) } : {}),
      ...(typeof raw.t === 'string' && raw.t.trim() ? { t: raw.t.slice(0, MAX_TEXT) } : {}),
    },
  };
}

// ---------- Building ----------

export interface BuiltShare {
  session: Session;
  question?: string;
  text?: string;
  charts: Array<{ id: string; spec: ChartSpec; controls?: Controls; warnings: string[] }>;
  skipped: number;
  stale: boolean;
  /** When the link used live data: the snapshot time it was made from. The charts use this device's current snapshot. */
  liveAsOf?: string;
}

/** Re-validates every chart against the archive on this device. Anything that does not hold up is dropped. */
export function buildShare(archive: Archive, payload: SharePayload): BuiltShare {
  const session = createSession(archive);
  const charts: BuiltShare['charts'] = [];
  let skipped = 0;
  payload.c.forEach((item, index) => {
    // Each chart gets its own id space so identical ds ids from different chats cannot collide.
    const prefix = `ds${index + 1}0`;
    const mapping = new Map<string, string>();
    const entries = item.sources.map((entry, position) => { const id = `${prefix}${position}`; mapping.set(entry.id, id); return { id, source: entry.source }; });
    restoreSources(session, entries);
    const remapped = remap(item.spec, mapping);
    const result = validateSpec(remapped, validationEnv(session));
    const own = new Set(entries.map(entry => entry.id));
    if (!result.ok || datasetIdsOf(result.spec).some(id => !own.has(id))) { skipped += 1; return; }
    charts.push({ id: `shared-${index}`, spec: result.spec, controls: item.controls, warnings: result.warnings });
  });
  return { session, question: payload.q, text: payload.t, charts, skipped, stale: payload.a !== archiveStamp(archive), ...(payload.l ? { liveAsOf: payload.l } : {}) };
}

/** True when any dataset behind these charts would come out differently without the season in progress. */
export function usesLiveData(session: Session, specs: ChartSpec[]): boolean {
  if (!session.ctx.archive.live) return false;
  let historyOnly: ReturnType<typeof createContext> | undefined;
  return specs.some(spec => datasetIdsOf(spec).some(id => {
    const dataset = datasetOf(session, id);
    if (!dataset || !isDataTool(dataset.source.tool)) return false;
    historyOnly ??= createContext({ ...session.ctx.archive, live: null });
    const without = runDataTool(historyOnly, dataset.source.tool, dataset.source.args);
    return !without.ok || 'entity' in without || JSON.stringify(without.rows) !== JSON.stringify(dataset.rows);
  }));
}

function remap(spec: unknown, mapping: Map<string, string>): unknown {
  if (!isObject(spec)) return spec;
  const copy: Record<string, unknown> = { ...spec };
  if (typeof copy.datasetId === 'string') copy.datasetId = mapping.get(copy.datasetId) ?? copy.datasetId;
  const binding = /("\$(?:data|rows)"\s*:\s*")(ds\d{1,4})(?=\.)/g;
  const swap = (_all: string, head: string, id: string) => `${head}${mapping.get(id) ?? id}`;
  if (typeof copy.optionJson === 'string') copy.optionJson = copy.optionJson.replace(binding, swap);
  if (isObject(copy.option)) copy.option = JSON.parse(JSON.stringify(copy.option).replace(binding, swap));
  return copy;
}

/** Gathers what a chart needs to be rebuilt elsewhere. */
export function packChart(session: Session, spec: ChartSpec, controls?: Controls): SharedChart {
  const ids = datasetIdsOf(spec);
  const sources = ids.flatMap(id => { const source = session.sources.get(id); return source ? [{ id, source: { tool: source.tool, args: source.args } }] : []; });
  return { spec, sources, ...(controls && Object.keys(controls).length ? { controls } : {}) };
}

export function shareUrl(origin: string, encoded: string) {
  return `${origin}/archive/ask/share#${encoded}`;
}
