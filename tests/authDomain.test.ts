import assert from 'node:assert/strict';
import test from 'node:test';
import { authDomainForHost } from '../src/authDomain.ts';

test('uses the custom Hosting domain for live authentication', () => {
  assert.equal(authDomainForHost('jffl-live-colin.firebaseapp.com', 'jffl.org'), 'jffl.org');
});

test('keeps the configured Firebase auth domain away from the custom domain', () => {
  assert.equal(authDomainForHost('jffl-live-colin.firebaseapp.com', 'localhost'), 'jffl-live-colin.firebaseapp.com');
  assert.equal(authDomainForHost('jffl-live-colin.firebaseapp.com', 'jffl-live-colin.web.app'), 'jffl-live-colin.firebaseapp.com');
});
