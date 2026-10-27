import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onRequest, type Request } from 'firebase-functions/v2/https';
import { answerExcerpt } from '../../src/socialPreview.ts';
import { handleGallery, handleImage, handlePage, type SocialStore } from './http.ts';

if (!getApps().length) initializeApp();

const leagues = new Set(['premier', 'championship', 'league-one']);

function store(): SocialStore {
  const db = getFirestore();
  return {
    async league(slug) {
      if (!leagues.has(slug)) return null;
      const snapshot = await db.collection('publicLeagues').doc(slug).get();
      return snapshot.exists ? snapshot.data() ?? null : null;
    },
    async roster(slug) {
      if (!leagues.has(slug)) return null;
      const snapshot = await db.collection('publicRosters').doc(slug).get();
      return snapshot.exists ? snapshot.data() ?? null : null;
    },
    async share(id) {
      if (!/^[A-Za-z0-9]{10,128}$/.test(id)) return null;
      const snapshot = await db.collection('shares').doc(id).get();
      if (!snapshot.exists) return null;
      const data = snapshot.data() ?? {};
      const messages = await snapshot.ref.collection('messages').limit(12).get().catch(() => null);
      const answer = messages?.docs.map(item => item.data()).filter(item => item.role === 'assistant' && typeof item.text === 'string').sort((a, b) => Number(a.order) - Number(b.order))[0];
      return { title: data.title, createdAt: data.createdAt, excerpt: answer ? answerExcerpt(String(answer.text)) : '' };
    },
    async liveWeek(season, week) {
      if (!Number.isInteger(season) || !Number.isInteger(week) || week < 1 || week > 18) return null;
      const snapshot = await db.collection('publicLiveWeeks').doc(`${season}-premier-${week}`).get();
      return snapshot.exists ? snapshot.data() ?? null : null;
    },
    async timeline(season, slug, week, past) {
      if (!leagues.has(slug) || !Number.isInteger(season) || !Number.isInteger(week) || week < 1 || week > 18) return null;
      const ref = past
        ? db.collection('publicLiveWeeks').doc(`${season}-${slug}-${week}`)
        : db.collection('publicLive').doc(slug);
      const snapshot = await ref.get();
      if (!snapshot.exists) return null;
      const data = snapshot.data() ?? {};
      if (data.week !== week || data.season !== season) return null;
      return { series: data.series ?? {}, games: data.games ?? {} };
    },
  };
}

function header(req: Request, name: string) {
  const value = req.header(name);
  return value?.split(',')[0]?.trim();
}

function searchOf(req: Request) {
  const query = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
  return query;
}

const region = 'us-east1' as const;

export const socialPage = onRequest({ region, memory: '256MiB', timeoutSeconds: 20, maxInstances: 5, concurrency: 20 }, async (req, res) => {
  const result = await handlePage(req.path, searchOf(req), header(req, 'x-forwarded-host') || header(req, 'host'), header(req, 'x-forwarded-proto'), store());
  res.set(result.headers).status(result.status).send(result.body);
});

export const socialImage = onRequest({ region, memory: '512MiB', timeoutSeconds: 20, maxInstances: 5, concurrency: 4 }, async (req, res) => {
  const target = typeof req.query.path === 'string' ? req.query.path : '/';
  const result = await handleImage(target, store());
  res.set(result.headers).status(result.status).send(result.body);
});

export const socialGallery = onRequest({ region, memory: '1GiB', timeoutSeconds: 60, maxInstances: 2, concurrency: 1 }, async (req, res) => {
  const result = await handleGallery(store(), 'Examples use the current public league snapshots.');
  res.set(result.headers).status(result.status).send(result.body);
});
