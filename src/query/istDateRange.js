// IST (Asia/Kolkata, UTC+5:30) calendar-day <-> UTC-instant conversion for the
// dashboard's date-range filter and its picker bounds. Mirrors the convention
// src/ingest/parseChat.js already uses for stored timestamps: a date picked by
// a human is a wall-clock IST calendar day, converted to UTC for comparison
// against (and display from) the UTC ISO strings in sharing_events/posts.
const IST_OFFSET_MINUTES = 5 * 60 + 30;

/**
 * Parses a strict YYYY-MM-DD string into its calendar parts, rejecting
 * anything that isn't that exact shape or isn't a real calendar date (e.g.
 * 2026-02-30) -- used so a malformed ?from/?to value is ignored rather than
 * silently normalized or thrown on.
 * @param {unknown} value
 * @returns {{ year: number, month: number, day: number } | null}
 */
export function parseIstCalendarDate(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  // Date.UTC normalizes out-of-range values (e.g. month 13, day 30 of Feb)
  // instead of erroring, so round-trip the parts through it to detect that.
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    return null;
  }
  return { year, month, day };
}

/**
 * The UTC instant for 00:00:00.000 IST on the given calendar day -- the
 * inclusive lower bound for a "from" date filter.
 * @param {unknown} value a YYYY-MM-DD string
 * @returns {string | null} UTC ISO-8601 string, or null if value is malformed
 */
export function istDayStartUtc(value) {
  const d = parseIstCalendarDate(value);
  if (!d) return null;
  const istMillis = Date.UTC(d.year, d.month - 1, d.day, 0, 0, 0, 0);
  return new Date(istMillis - IST_OFFSET_MINUTES * 60 * 1000).toISOString();
}

/**
 * The UTC instant for 23:59:59.999 IST on the given calendar day -- the
 * inclusive upper bound for a "to" date filter.
 * @param {unknown} value a YYYY-MM-DD string
 * @returns {string | null} UTC ISO-8601 string, or null if value is malformed
 */
export function istDayEndUtc(value) {
  const d = parseIstCalendarDate(value);
  if (!d) return null;
  const istMillis = Date.UTC(d.year, d.month - 1, d.day, 23, 59, 59, 999);
  return new Date(istMillis - IST_OFFSET_MINUTES * 60 * 1000).toISOString();
}

/**
 * Expresses a stored UTC ISO timestamp as the YYYY-MM-DD IST calendar date it
 * falls on -- used to express MIN/MAX(message_timestamp) as date-picker
 * min/max bounds.
 * @param {string | null | undefined} isoUtc
 * @returns {string | null}
 */
export function utcToIstCalendarDate(isoUtc) {
  if (!isoUtc) return null;
  const istMillis = new Date(isoUtc).getTime() + IST_OFFSET_MINUTES * 60 * 1000;
  const d = new Date(istMillis);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
