import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  JFFL_CUP, LEAGUE_CUP, SUPER_BOWL, WEEKLY,
  careers, draftBuckets, draftSlots, eraMean, pairGames, parseArchive, rate, recordBook,
  scoringByYear, seriesTable, superBowlOverlap, titleYears, weekSlice,
  type ArchiveFile,
} from '../src/history/stats.ts';

const archive = parseArchive(JSON.parse(readFileSync(new URL('../src/history/archive.json', import.meta.url), 'utf8')) as ArchiveFile);
const years = scoringByYear(archive.games);
const titles = titleYears(archive.seasons);
const overlap = superBowlOverlap(titles);
const weekly = recordBook(archive.games, WEEKLY);
const cups = recordBook(archive.games, JFFL_CUP);

test('the archive stops before the unfinished 2026 season', () => {
  assert.equal(archive.games.some(game => game.season >= 2026), false);
  assert.equal(archive.seasons.some(season => season.season >= 2026), false);
  assert.equal(Math.min(...archive.seasons.map(season => season.season)), 2002);
  assert.equal(Math.min(...years.map(year => year.season)), 2003);
});

test('regular-season scoring jumps in 2013 and then stays near 88', () => {
  assert.equal(eraMean(archive.games, 2003, 2012), 65.4);
  assert.equal(eraMean(archive.games, 2013, 2025), 88.1);
  assert.equal(years.find(year => year.season === 2012)?.mean, 68.8);
  assert.equal(years.find(year => year.season === 2013)?.mean, 88.3);
});

test('the weekly record book does not treat two-week JFFL Cup totals as a week', () => {
  assert.equal(weekly.highest[0]?.team, 'Jeff');
  assert.equal(weekly.highest[0]?.score, 170);
  assert.equal(weekly.highest[0]?.season, 2021);
  assert.equal(cups.highest[0]?.team, 'Al');
  assert.equal(cups.highest[0]?.score, 275);
  assert.equal(weekly.closest.length, 99);
  assert.equal(weekly.ties.length, 60);
  assert.equal(weekly.blowouts[0]?.teamA ? Math.abs(weekly.blowouts[0].scoreA - weekly.blowouts[0].scoreB) : 0, 122);
});

test('the best regular-season record also wins that Superbowl in 7 of 42 leagues', () => {
  assert.deepEqual(overlap, { same: 7, leagues: 42 });
  const year = titles.find(item => item.season === 2019);
  const championship = year?.leagues.find(league => league.league === 'Championship');
  assert.deepEqual(championship?.seasonChamps, ['Michael']);
  assert.equal(championship?.superBowl, 'Brendan');
  assert.equal(championship?.same, false);
  assert.equal(year?.jffl, 'Reggie');
});

test('regular-season series keep ties out of the win columns', () => {
  const becky = seriesTable(archive.games).find(row => row.teamA === 'Becky' && row.teamB === 'Jeff');
  assert.deepEqual(becky && [becky.meetings, becky.winsA, becky.winsB, becky.ties], [14, 0, 14, 0]);
  const played = pairGames(archive.games, 'SeanT', 'Wayne');
  assert.equal(played.length, 25);
  assert.equal(played.every(game => game.type === 'Season'), true);
});

test('draft slot barely changes who wins the league until the back of the draft', () => {
  const buckets = draftBuckets(archive.seasons);
  assert.deepEqual(buckets.map(bucket => bucket.label), ['Pick 1', 'Picks 2–4', 'Picks 5–8', 'Pick 9 or later']);
  assert.equal(rate(buckets[0].titles, buckets[0].seasons), 9.8);
  assert.equal(rate(buckets[3].titles, buckets[3].seasons), 4.8);
  assert.ok(buckets[0].seasons < buckets[3].seasons);
});

test('every draft slot is listed, including picks after 8', () => {
  const slots = draftSlots(archive.seasons);
  assert.equal(slots[0]?.slot, 1);
  assert.deepEqual(slots.map(slot => slot.slot), slots.map((_, index) => index + 1));
  assert.ok(slots.some(slot => slot.slot === 10 && slot.seasons > 0));
  assert.equal(rate(slots[0].titles, slots[0].seasons), 9.8);
  const buckets = draftBuckets(archive.seasons);
  assert.equal(slots.reduce((sum, slot) => sum + slot.seasons, 0), buckets.reduce((sum, bucket) => sum + bucket.seasons, 0));
});

test('careers count 24-season managers and the 2019 undefeated season', () => {
  const rows = careers(archive.seasons);
  assert.equal(rows.filter(row => row.seasons === 24).length, 8);
  assert.equal(rows.find(row => row.team === 'Jeff')?.seasonTitles, 7);
  assert.equal(rows.find(row => row.team === 'Donna')?.jfflCups, 3);
  const michael = archive.seasons.find(row => row.season === 2019 && row.team === 'Michael' && row.league === 'Championship');
  assert.deepEqual(michael && [michael.wins, michael.losses, michael.ties, michael.rankSeason], [13, 0, 0, 1]);
});

test('week labels collapsed WK2 into week 2', () => {
  const week = weekSlice(archive.games, 2);
  assert.ok(week.games > 200);
  assert.equal(archive.games.some(game => game.type === 'Season' && game.week === null), false);
});

test('league cups and Superbowls stay out of the JFFL Cup book', () => {
  assert.equal(recordBook(archive.games, LEAGUE_CUP).games > 0, true);
  assert.equal(recordBook(archive.games, SUPER_BOWL).highest.every(line => line.type === 'Superbowl'), true);
  assert.equal(cups.highest.every(line => line.league === 'JFFL'), true);
});
