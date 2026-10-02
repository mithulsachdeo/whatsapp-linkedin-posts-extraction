import { test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { WhatsAppTxtAdapter } from '../../src/ingest/adapter.js';

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

// Builds a single-entry, stored (uncompressed)-or-deflated ZIP file by hand
// so the test has no dependency on a zip-writing library.
function buildMinimalZip(filename, content) {
  const nameBuf = Buffer.from(filename, 'utf8');
  const contentBuf = Buffer.from(content, 'utf8');
  const compressed = zlib.deflateRawSync(contentBuf);
  const method = 8; // deflate

  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0);
  localHeader.writeUInt16LE(20, 4); // version needed
  localHeader.writeUInt16LE(0, 6); // flags
  localHeader.writeUInt16LE(method, 8);
  localHeader.writeUInt16LE(0, 10); // mod time
  localHeader.writeUInt16LE(0, 12); // mod date
  localHeader.writeUInt32LE(0, 14); // crc32 (unchecked by our reader)
  localHeader.writeUInt32LE(compressed.length, 18);
  localHeader.writeUInt32LE(contentBuf.length, 22);
  localHeader.writeUInt16LE(nameBuf.length, 26);
  localHeader.writeUInt16LE(0, 28); // extra length

  const localEntry = Buffer.concat([localHeader, nameBuf, compressed]);

  const centralHeader = Buffer.alloc(46);
  centralHeader.writeUInt32LE(0x02014b50, 0);
  centralHeader.writeUInt16LE(20, 4); // version made by
  centralHeader.writeUInt16LE(20, 6); // version needed
  centralHeader.writeUInt16LE(0, 8); // flags
  centralHeader.writeUInt16LE(method, 10);
  centralHeader.writeUInt16LE(0, 12); // mod time
  centralHeader.writeUInt16LE(0, 14); // mod date
  centralHeader.writeUInt32LE(0, 16); // crc32
  centralHeader.writeUInt32LE(compressed.length, 20);
  centralHeader.writeUInt32LE(contentBuf.length, 24);
  centralHeader.writeUInt16LE(nameBuf.length, 28);
  centralHeader.writeUInt16LE(0, 30); // extra length
  centralHeader.writeUInt16LE(0, 32); // comment length
  centralHeader.writeUInt16LE(0, 34); // disk number start
  centralHeader.writeUInt16LE(0, 36); // internal attrs
  centralHeader.writeUInt32LE(0, 38); // external attrs
  centralHeader.writeUInt32LE(0, 42); // local header offset

  const centralEntry = Buffer.concat([centralHeader, nameBuf]);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(1, 8); // entries on this disk
  eocd.writeUInt16LE(1, 10); // total entries
  eocd.writeUInt32LE(centralEntry.length, 12); // central dir size
  eocd.writeUInt32LE(localEntry.length, 16); // central dir offset
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([localEntry, centralEntry, eocd]);
}
