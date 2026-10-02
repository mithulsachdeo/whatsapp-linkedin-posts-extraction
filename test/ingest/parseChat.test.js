import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMessages } from '../../src/ingest/parseChat.js';

test('parses iOS format with seconds and AM/PM', () => {
  const messages = parseMessages('[30/09/26, 10:15:30 PM] Priya Sharma: hello there');
  assert.equal(messages.length, 1);
  assert.equal(messages[0].rawSender, 'Priya Sharma');
  assert.equal(messages[0].text, 'hello there');
  // 30 Sep 2026, 22:15:30 IST -> 16:45:30 UTC
  assert.equal(messages[0].timestamp, '2026-09-30T16:45:30.000Z');
});

test('parses Android format without seconds or AM/PM (24h clock)', () => {
  const messages = parseMessages('30/09/26, 22:15 - Priya Sharma: hello there');
  assert.equal(messages.length, 1);
  // 30 Sep 2026, 22:15 IST -> 16:45 UTC
  assert.equal(messages[0].timestamp, '2026-09-30T16:45:00.000Z');
});

test('stitches multi-line messages onto the preceding header', () => {
  const messages = parseMessages(['30/09/26, 10:15 - Priya Sharma: line one', 'line two', 'line three'].join('\n'));
  assert.equal(messages.length, 1);
  assert.equal(messages[0].text, 'line one\nline two\nline three');
});

test('skips a system/notice line and does not attribute it to a sender', () => {
  const messages = parseMessages(
    [
      '30/09/26, 09:00 - Messages and calls are end-to-end encrypted.',
      '30/09/26, 10:15 - Priya Sharma: hello',
    ].join('\n')
  );
  assert.equal(messages.length, 1);
  assert.equal(messages[0].rawSender, 'Priya Sharma');
});
