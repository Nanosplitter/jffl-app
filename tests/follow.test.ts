import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseAnswer } from '../src/history/answerText.ts';
import { isFollowedName, isFollowedTeam, parseFollowed } from '../src/follow.ts';

test('a known manager matches by nickname and by team', () => {
  const followed = parseFollowed('championship:61', 'Michael');
  assert.ok(followed);
  assert.equal(isFollowedName(followed, 'Michael'), true);
  assert.equal(isFollowedName(followed, 'michael'), true);
  assert.equal(isFollowedName(followed, 'SeanH'), false);
  assert.equal(isFollowedTeam(followed, 'championship', '61'), true);
  assert.equal(isFollowedTeam(followed, 'premier', '61'), false);
  assert.equal(isFollowedTeam(null, 'championship', '61'), false);
});

test('a mismatched name and team is ignored', () => {
  assert.equal(parseFollowed('premier:16', 'Michael'), null);
  assert.equal(parseFollowed('nope:1', 'Jason'), null);
  assert.equal(parseFollowed('premier:16', ''), null);
});

test('an answer marks the followed manager and leaves everyone else', () => {
  const blocks = parseAnswer('Jason beat Michael in week 2.', 'Michael');
  const runs = blocks.flatMap(block => block.type === 'p' ? block.inline : block.items.flat());
  const michael = runs.find(run => run.text === 'Michael');
  const jason = runs.find(run => run.text === 'Jason');
  assert.equal(michael?.followed, true);
  assert.equal(jason?.followed, undefined);
  assert.equal(parseAnswer('Jason beat Michael.', null).some(block => block.type === 'p' && block.inline.some(run => run.followed)), false);
});
