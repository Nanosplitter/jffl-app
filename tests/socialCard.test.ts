import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { renderPreviewPng } from '../functions-social/src/card.ts';
import { resolvePreview } from '../src/socialPreview.ts';
import type { LeagueSummary } from '../src/types.ts';

test('renders a 1200 by 630 preview and survives a missing logo', async () => {
  const home = await renderPreviewPng(resolvePreview('/'));
  const homeInfo = await sharp(home).metadata();
  assert.equal(homeInfo.format, 'png');
  assert.equal(homeInfo.width, 1200);
  assert.equal(homeInfo.height, 630);
  assert.ok(home.byteLength > 5000);

  const match = resolvePreview('/league/premier/match/1', '', { leagues: { premier: pendingMatch() } });
  match.sides[0].logoUrl = 'https://a.espncdn.com/not-a-logo.png';
  const png = await renderPreviewPng(match, { 'https://a.espncdn.com/not-a-logo.png': null });
  const info = await sharp(png).metadata();
  assert.equal(info.width, 1200);
  assert.equal(info.height, 630);
  assert.equal(match.sides[0].score, null);

  const square = await renderPreviewPng(resolvePreview('/'), {}, 'square');
  const squareInfo = await sharp(square).metadata();
  assert.equal(squareInfo.width, 1200);
  assert.equal(squareInfo.height, 1200);
});

function pendingMatch(): LeagueSummary {
  return {
    schemaVersion: 1, leagueId: '831337', slug: 'premier', leagueName: 'Premier League', season: 2026, week: 7,
    updatedAt: '2026-10-26T00:00:00.000Z', lastAttemptAt: '2026-10-26T00:00:00.000Z', refreshStatus: 'ok',
    teams: [
      { id: '16', name: 'Hot Machete', abbreviation: 'JAY', rank: 1, wins: 4, losses: 2, ties: null, pointsFor: 640, pointsAgainst: 610, rosterCount: 16, logoUrl: 'https://a.espncdn.com/not-a-logo.png' },
      { id: '34', name: 'Hockeytown', abbreviation: 'DON', rank: 2, wins: 4, losses: 2, ties: null, pointsFor: 620, pointsAgainst: 600, rosterCount: 16 },
    ],
    matchups: [],
    weeklyMatchups: [{ id: '1', week: 7, status: 'pending', homeTeamId: '34', awayTeamId: '16', homeScore: null, awayScore: null, homeProjected: null, awayProjected: null }],
    scoring: [],
  };
}
