// IngestionAdapter boundary (spec: "ingestion sits behind a replaceable
// IngestionAdapter interface"). An adapter's job is purely to turn an
// uploaded file's raw bytes into decoded chat text + a content hash --
// everything downstream (parsing, extraction, dedup, storage) is adapter-
// agnostic and lives in ingest.js. A future permitted source (e.g.
// folder-watch) reuses WhatsAppTxtAdapter directly; a genuinely different
// source would implement this same `load(buffer, filename)` shape.
import { createHash } from 'node:crypto';
import { extractFirstTxtFile, isZip } from './zip.js';

/**
 * @typedef {{ text: string, contentHash: string, sourceFilename: string|null }} LoadedExport
 */

export const WhatsAppTxtAdapter = {
  /**
   * @param {Buffer} buffer raw uploaded file bytes (.txt or .zip)
   * @param {string} [filename] original upload filename, used as a hint only
   * @returns {LoadedExport}
   */
  load(buffer, filename) {
    const contentHash = createHash('sha256').update(buffer).digest('hex');

    if (isZip(buffer) || (filename && filename.toLowerCase().endsWith('.zip'))) {
      const entry = extractFirstTxtFile(buffer);
      if (!entry) throw new Error('No .txt chat export found inside the uploaded .zip');
      return { text: decodeText(entry.content), contentHash, sourceFilename: entry.filename };
    }

    return { text: decodeText(buffer), contentHash, sourceFilename: filename ?? null };
  },
};

function decodeText(buffer) {
  // Strip a UTF-8 BOM if present; WhatsApp exports occasionally include one.
  let text = buffer.toString('utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return text;
}
