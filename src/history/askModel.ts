import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { getAI, getGenerativeModel, GoogleAIBackend, ThinkingLevel, type Content } from 'firebase/ai';
import { fetchAndActivate, getRemoteConfig, getValue } from 'firebase/remote-config';
import { getAiFirebaseApp } from '../firebaseApp';
import type { ModelLike } from './askAgent.ts';
import { buildSystemPrompt, TOOL_DECLARATIONS } from './askDeclarations.ts';

/** Remote Config defaults. Changing them in the Firebase console takes effect without a deploy. */
export const REMOTE_DEFAULTS = {
  ask_enabled: true,
  ask_model: 'gemini-3.8-flash',
  ask_thinking: 'low',
  ask_max_output_tokens: 2048,
} as const;

export interface Assistant { model: ModelLike; modelName: string; mock: boolean }

export class AssistantUnavailable extends Error {
  constructor(message: string) { super(message); this.name = 'AssistantUnavailable'; }
}

const THINKING: Record<string, string | undefined> = {
  minimal: ThinkingLevel.MINIMAL, low: ThinkingLevel.LOW, medium: ThinkingLevel.MEDIUM, high: ThinkingLevel.HIGH, default: undefined,
};

async function readRemote(app: NonNullable<ReturnType<typeof getAiFirebaseApp>>) {
  const values = { ...REMOTE_DEFAULTS } as { ask_enabled: boolean; ask_model: string; ask_thinking: string; ask_max_output_tokens: number };
  try {
    const config = getRemoteConfig(app);
    config.defaultConfig = { ...REMOTE_DEFAULTS };
    config.settings.minimumFetchIntervalMillis = 60 * 60 * 1000;
    config.settings.fetchTimeoutMillis = 4000;
    await fetchAndActivate(config);
    values.ask_enabled = getValue(config, 'ask_enabled').asBoolean();
    values.ask_model = getValue(config, 'ask_model').asString() || REMOTE_DEFAULTS.ask_model;
    values.ask_thinking = getValue(config, 'ask_thinking').asString() || REMOTE_DEFAULTS.ask_thinking;
    values.ask_max_output_tokens = getValue(config, 'ask_max_output_tokens').asNumber() || REMOTE_DEFAULTS.ask_max_output_tokens;
  } catch {
    // A failed fetch keeps the defaults; the kill switch only works when Remote Config is reachable.
  }
  return values;
}

/**
 * Connects to Gemini through Firebase AI Logic. The browser never holds a Gemini key: requests go through Firebase,
 * protected by App Check and the project's quotas.
 */
export async function loadAssistant(managers: string[]): Promise<Assistant> {
  const app = getAiFirebaseApp();
  if (!app) {
    if (import.meta.env.DEV) {
      const { createMockModel } = await import('./askMock.ts');
      return { model: createMockModel(), modelName: 'local-mock', mock: true };
    }
    throw new AssistantUnavailable('The assistant is not set up on this site yet.');
  }
  if (import.meta.env.DEV && import.meta.env.VITE_ASK_MOCK === 'true') {
    const { createMockModel } = await import('./askMock.ts');
    return { model: createMockModel(), modelName: 'local-mock', mock: true };
  }

  const siteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined;
  if (!siteKey && !import.meta.env.DEV) throw new AssistantUnavailable('The assistant is not set up on this site yet.');

  const remote = await readRemote(app);
  if (!remote.ask_enabled) throw new AssistantUnavailable('The assistant is paused right now. Please check back later.');

  if (siteKey) {
    if (import.meta.env.DEV) (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN || true;
    try {
      initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(siteKey), isTokenAutoRefreshEnabled: true });
    } catch {
      // Already initialized in this page session.
    }
  }

  const level = THINKING[remote.ask_thinking.toLowerCase()];
  const generative = getGenerativeModel(getAI(app, { backend: new GoogleAIBackend() }), {
    model: remote.ask_model,
    systemInstruction: buildSystemPrompt(managers),
    tools: [{ functionDeclarations: TOOL_DECLARATIONS as never }],
    generationConfig: {
      maxOutputTokens: Math.min(Math.max(remote.ask_max_output_tokens, 512), 8192),
      ...(level ? { thinkingConfig: { thinkingLevel: level as never } } : {}),
    },
  });

  const model: ModelLike = {
    async generateContentStream(request, options) {
      const result = await generative.generateContentStream({ contents: request.contents as unknown as Content[] }, options?.signal ? { signal: options.signal } : undefined);
      return { stream: result.stream as AsyncIterable<never>, response: result.response as Promise<never> };
    },
  };
  return { model, modelName: remote.ask_model, mock: false };
}
