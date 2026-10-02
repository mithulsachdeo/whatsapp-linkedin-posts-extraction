import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WhatsAppTxtAdapter } from '../../src/ingest/adapter.js';
import { buildMinimalZip } from '../helpers/zip.js';

test('loads a plain .txt upload as-is', () => {
  const buffer = Buffer.from('30/09/26, 10:15 - Priya Sharma: hello', 'utf8');
  const loaded = WhatsAppTxtAdapter.load(buffer, 'chat.txt');
  assert.equal(loaded.text, '30/09/26, 10:15 - Priya Sharma: hello');
  assert.equal(loaded.contentHash.length, 64); // sha256 hex
});

test('extracts the chat .txt from a .zip upload', () => {
  const chatText = '30/09/26, 10:15 - Priya Sharma: hello';
  const zipBuffer = buildMinimalZip('WhatsApp Chat with Group.txt', chatText);

  const loaded = WhatsAppTxtAdapter.load(zipBuffer, 'export.zip');
  assert.equal(loaded.text, chatText);
  assert.equal(loaded.sourceFilename, 'WhatsApp Chat with Group.txt');
});

test('the same file content produces the same hash regardless of filename', () => {
  const a = WhatsAppTxtAdapter.load(Buffer.from('same text', 'utf8'), 'a.txt');
  const b = WhatsAppTxtAdapter.load(Buffer.from('same text', 'utf8'), 'b.txt');
  assert.equal(a.contentHash, b.contentHash);
});
