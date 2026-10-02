import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';

/** Whether the public Firebase web configuration is present. These values are public client config, not secrets. */
export const firebaseConfigured = !!import.meta.env.VITE_FIREBASE_PROJECT_ID;

let app: FirebaseApp | null = null;

/** One shared Firebase app for Firestore and the assistant. Returns null when the site has no Firebase config (local snapshot mode). */
export function getFirebaseApp(): FirebaseApp | null {
  if (!firebaseConfigured) return null;
  app ??= getApps()[0] ?? initializeApp({
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  });
  return app;
}

/** Whether the assistant has a Firebase project to talk to (a dedicated AI project, or the main one). */
export const aiConfigured = !!import.meta.env.VITE_AI_FIREBASE_PROJECT_ID || firebaseConfigured;

let aiApp: FirebaseApp | null = null;

/**
 * Firebase app used only for AI Logic, App Check, and Remote Config of the assistant. When VITE_AI_FIREBASE_* is set
 * it is a separate project (so Gemini billing and quotas live there); otherwise it is the main app. Public client config.
 */
export function getAiFirebaseApp(): FirebaseApp | null {
  if (!import.meta.env.VITE_AI_FIREBASE_PROJECT_ID) return getFirebaseApp();
  aiApp ??= getApps().find(existing => existing.name === 'ai') ?? initializeApp({
    apiKey: import.meta.env.VITE_AI_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_AI_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_AI_FIREBASE_PROJECT_ID,
    appId: import.meta.env.VITE_AI_FIREBASE_APP_ID,
  }, 'ai');
  return aiApp;
}
