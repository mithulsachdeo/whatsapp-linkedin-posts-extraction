// Unit tests for the IST (Asia/Kolkata, UTC+5:30) calendar-day <-> UTC
// instant conversion the date-range filter and its picker bounds depend on.
// Mirrors src/ingest/parseChat.js's IST-wall-clock-to-UTC convention.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseIstCalendarDate,
  istDayStartUtc,
  istDayEndUtc,
  utcToIstCalendarDate,
} from '../../src/query/istDateRange.js';

test('parseIstCalendarDate accepts a well-formed YYYY-MM-DD string', () => {
  assert.deepEqual(parseIstCalendarDate('2026-09-15'), { year: 2026, month: 9, day: 15 });
});

test('parseIstCalendarDate rejects malformed strings', () => {
  assert.equal(parseIstCalendarDate('15-09-2026'), null);
  assert.equal(parseIstCalendarDate('2026/09/15'), null);
  assert.equal(parseIstCalendarDate('not-a-date'), null);
  assert.equal(parseIstCalendarDate(''), null);
  assert.equal(parseIstCalendarDate(undefined), null);
});

test('parseIstCalendarDate rejects a calendar date that does not exist', () => {
  assert.equal(parseIstCalendarDate('2026-02-30'), null);
  assert.equal(parseIstCalendarDate('2026-13-01'), null);
});

test('istDayStartUtc converts the start of an IST calendar day to its UTC instant', () => {
  // 2026-09-15T00:00:00.000+05:30 -> 2026-09-14T18:30:00.000Z
  assert.equal(istDayStartUtc('2026-09-15'), '2026-09-14T18:30:00.000Z');
});

test('istDayEndUtc converts the end of an IST calendar day to its UTC instant', () => {
  // 2026-09-15T23:59:59.999+05:30 -> 2026-09-15T18:29:59.999Z
  assert.equal(istDayEndUtc('2026-09-15'), '2026-09-15T18:29:59.999Z');
});

test('istDayStartUtc and istDayEndUtc return null for a malformed value', () => {
  assert.equal(istDayStartUtc('bogus'), null);
  assert.equal(istDayEndUtc('bogus'), null);
});

test('utcToIstCalendarDate expresses a UTC instant as its IST calendar date', () => {
  // 00:30 IST on 2026-09-15 is stored as 2026-09-14T19:00:00.000Z.
  assert.equal(utcToIstCalendarDate('2026-09-14T19:00:00.000Z'), '2026-09-15');
  // 23:30 IST on 2026-09-14 is stored as 2026-09-14T18:00:00.000Z.
  assert.equal(utcToIstCalendarDate('2026-09-14T18:00:00.000Z'), '2026-09-14');
});

test('utcToIstCalendarDate returns null for a null/undefined input', () => {
  assert.equal(utcToIstCalendarDate(null), null);
  assert.equal(utcToIstCalendarDate(undefined), null);
});
