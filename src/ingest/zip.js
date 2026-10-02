// Minimal ZIP reader: just enough to pull the chat .txt out of a WhatsApp
// "Export chat" .zip. No third-party dependency -- the ZIP central-directory
// format is simple and stable, and Node's built-in zlib already provides
// raw-deflate inflation, so a hand-rolled reader avoids pulling in a package
// for a handful of well-documented binary reads.
import zlib from 'node:zlib';

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIR_SIGNATURE = 0x02014b50;
const LOCAL_HEADER_SIGNATURE = 0x04034b50;

/**
 * @param {Buffer} buffer a .zip file's raw bytes
 * @returns {string|null} the name of the first .txt entry found, or null
 */
export function findFirstTxtEntryName(buffer) {
  const entry = findFirstTxtEntry(buffer);
  return entry?.filename ?? null;
}

/**
 * Extracts the first .txt file found inside a .zip buffer.
 * @param {Buffer} buffer
 * @returns {{ filename: string, content: Buffer }|null}
 */
export function extractFirstTxtFile(buffer) {
  const entry = findFirstTxtEntry(buffer);
  if (!entry) return null;
  return { filename: entry.filename, content: readEntryData(buffer, entry) };
}

export function isZip(buffer) {
  return buffer.length >= 4 && buffer.readUInt32LE(0) === LOCAL_HEADER_SIGNATURE;
}

function findFirstTxtEntry(buffer) {
  for (const entry of listCentralDirectoryEntries(buffer)) {
    if (entry.filename.toLowerCase().endsWith('.txt')) return entry;
  }
  return null;
}

function listCentralDirectoryEntries(buffer) {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  if (eocdOffset === -1) throw new Error('Not a valid ZIP file: End Of Central Directory record not found');

  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirOffset = buffer.readUInt32LE(eocdOffset + 16);

  const entries = [];
  let offset = centralDirOffset;
  for (let i = 0; i < entryCount; i++) {
    if (buffer.readUInt32LE(offset) !== CENTRAL_DIR_SIGNATURE) {
      throw new Error('Not a valid ZIP file: central directory entry signature mismatch');
    }
    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const filenameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const filename = buffer.toString('utf8', offset + 46, offset + 46 + filenameLength);

    entries.push({ filename, compressionMethod, compressedSize, localHeaderOffset });
    offset += 46 + filenameLength + extraLength + commentLength;
  }
  return entries;
}

function readEntryData(buffer, entry) {
  const base = entry.localHeaderOffset;
  if (buffer.readUInt32LE(base) !== LOCAL_HEADER_SIGNATURE) {
    throw new Error('Not a valid ZIP file: local file header signature mismatch');
  }
  const nameLength = buffer.readUInt16LE(base + 26);
  const extraLength = buffer.readUInt16LE(base + 28);
  const dataStart = base + 30 + nameLength + extraLength;
  const compressed = buffer.subarray(dataStart, dataStart + entry.compressedSize);

  if (entry.compressionMethod === 0) return Buffer.from(compressed); // stored
  if (entry.compressionMethod === 8) return zlib.inflateRawSync(compressed); // deflate
  throw new Error(`Unsupported ZIP compression method: ${entry.compressionMethod}`);
}

function findEndOfCentralDirectory(buffer) {
  const maxCommentLength = 0xffff;
  const searchStart = Math.max(0, buffer.length - 22 - maxCommentLength);
  for (let offset = buffer.length - 22; offset >= searchStart; offset--) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) return offset;
  }
  return -1;
}
