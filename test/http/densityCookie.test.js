// Per-device "layout" preference cookie (spec: the Index/Columns choice
// persists across navigation until changed again). Pure helpers, no DB
// involved -- same shape as readCookie.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDensity,
  densityFromCookieHeader,
  serializeDensityCookie,
  DENSITY_COOKIE_NAME,
} from '../../src/http/densityCookie.js';

test('parseDensity accepts "rows" and "cards"', () => {
  assert.equal(parseDensity('rows'), 'rows');
  assert.equal(parseDensity('cards'), 'cards');
});

test('parseDensity returns null for missing/unrecognized values', () => {
  assert.equal(parseDensity(undefined), null);
  assert.equal(parseDensity(''), null);
  assert.equal(parseDensity('garbage'), null);
});

test('densityFromCookieHeader finds the layout cookie among others', () => {
  const header = `postboard_admin=abc.def; ${DENSITY_COOKIE_NAME}=cards`;
  assert.equal(densityFromCookieHeader(header), 'cards');
});

test('densityFromCookieHeader returns null when the cookie is absent or malformed', () => {
  assert.equal(densityFromCookieHeader('other=1'), null);
  assert.equal(densityFromCookieHeader(undefined), null);
  assert.equal(densityFromCookieHeader(`${DENSITY_COOKIE_NAME}=garbage`), null);
});

test('serializeDensityCookie renders an HttpOnly, SameSite=Lax, long-lived cookie', () => {
  const header = serializeDensityCookie('cards');
  assert.match(header, new RegExp(`^${DENSITY_COOKIE_NAME}=cards;`));
  assert.match(header, /HttpOnly/);
  assert.match(header, /SameSite=Lax/);
  assert.match(header, /Path=\//);
  assert.match(header, /Max-Age=\d+/);
});
