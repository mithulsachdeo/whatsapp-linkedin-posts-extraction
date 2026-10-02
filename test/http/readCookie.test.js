// Per-device read/archive cookie (spec): pure helpers, no DB involved.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseReadIds,
  readIdsFromCookieHeader,
  addReadId,
  removeReadId,
  serializeReadCookie,
  READ_COOKIE_NAME,
  MAX_COOKIE_VALUE_BYTES,
} from '../../src/http/readCookie.js';

test('parseReadIds parses a comma-joined list', () => {
  assert.deepEqual(parseReadIds('3,5,9'), [3, 5, 9]);
});

test('parseReadIds returns an empty array for missing/empty input', () => {
  assert.deepEqual(parseReadIds(undefined), []);
  assert.deepEqual(parseReadIds(''), []);
});

test('parseReadIds drops malformed entries rather than throwing', () => {
  assert.deepEqual(parseReadIds('3,oops,9,-1,4.5'), [3, 9]);
});

test('readIdsFromCookieHeader finds the read_posts cookie among others', () => {
  const header = `postboard_admin=abc.def; ${READ_COOKIE_NAME}=1,2,3`;
  assert.deepEqual(readIdsFromCookieHeader(header), [1, 2, 3]);
});

test('readIdsFromCookieHeader returns [] when the cookie is absent', () => {
  assert.deepEqual(readIdsFromCookieHeader('other=1'), []);
  assert.deepEqual(readIdsFromCookieHeader(undefined), []);
});

test('addReadId appends a new id', () => {
  assert.deepEqual(addReadId([1, 2], 3), [1, 2, 3]);
});

test('addReadId moves an already-present id to the end instead of duplicating', () => {
  assert.deepEqual(addReadId([1, 2, 3], 1), [2, 3, 1]);
});

test('removeReadId removes just that id, preserving order of the rest', () => {
  assert.deepEqual(removeReadId([1, 2, 3], 2), [1, 3]);
});

test('removeReadId is a no-op when the id is not present', () => {
  assert.deepEqual(removeReadId([1, 2], 99), [1, 2]);
});

test('addReadId drops the OLDEST ids once the cookie would exceed the byte budget', () => {
  // Build a list that already fills the byte budget.
  let ids = [];
  let id = 1;
  while (Buffer.byteLength(ids.join(','), 'utf8') < MAX_COOKIE_VALUE_BYTES) {
    ids.push(id++);
  }
  const oldestBeforeTrim = ids[0];
  const grown = addReadId(ids, id);

  assert.ok(Buffer.byteLength(grown.join(','), 'utf8') <= MAX_COOKIE_VALUE_BYTES);
  assert.ok(grown.includes(id), 'the just-added id must survive the trim');
  assert.ok(!grown.includes(oldestBeforeTrim), 'the oldest id should be the one dropped');
});

test('serializeReadCookie renders a compact, HttpOnly, SameSite=Lax, long-lived cookie', () => {
  const header = serializeReadCookie([1, 2, 3]);
  assert.match(header, new RegExp(`^${READ_COOKIE_NAME}=1,2,3;`));
  assert.match(header, /HttpOnly/);
  assert.match(header, /SameSite=Lax/);
  assert.match(header, /Path=\//);
  assert.match(header, /Max-Age=\d+/);
});
