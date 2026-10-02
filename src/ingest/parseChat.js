// WhatsApp "Without Media" export parser. Auto-detects iOS vs Android line
// format and date order (dd/mm vs mm/dd), stitches multi-line messages onto
// the preceding header line, and skips system/notice lines (membership
// changes, encryption notices, etc.) that WhatsApp timestamps but which carry
// no "Sender: message" shape.
//
// Canonical timezone is IST (Asia/Kolkata, UTC+5:30) per the spec -- exports
// carry local wall-clock time with no zone, so every parsed timestamp is
// treated as IST and converted to a UTC ISO string for storage, matching the
// convention the rest of the schema already uses.
const IST_OFFSET_MINUTES = 5 * 60 + 30;

// iOS: [dd/mm/yy, h:mm:ss AM] Sender: msg
const IOS_HEADER = /^\[(\d{1,2})\/(\d{1,2})\/(\d{2,4}),\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?\]\s(.*)$/;
// Android: dd/mm/yy, h:mm - Sender: msg (also tolerates seconds / AM-PM)
const ANDROID_HEADER = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4}),\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?\s[-–]\s(.*)$/;

/**
 * @param {string} text raw decoded export text
 * @returns {Array<{ timestamp: string, rawSender: string, text: string }>}
 *   System/notice lines (no "Sender: message" shape) are skipped entirely
 *   and never produce a message record.
 */
export function parseMessages(text) {
  const lines = normalize(text).split('\n');

  const headers = [];
  for (const line of lines) {
    const m = matchHeader(line);
    if (m) headers.push(m);
  }
  const dateOrder = detectDateOrder(headers);

  const messages = [];
  let current = null;

  for (const line of lines) {
    const m = matchHeader(line);
    if (m) {
      if (current) messages.push(current);
      current = null;

      const { day, month } = resolveDayMonth(m, dateOrder);
      const senderSplit = splitSenderAndMessage(m.rest);
      if (!senderSplit) {
        // System/notice line (e.g. "X added Y", encryption notice) -- no
        // "Sender: message" shape, so there is nothing to attribute. Skip.
        continue;
      }
      const timestamp = toIsoUtc({
        day,
        month,
        year: resolveYear(m.year),
        hour: m.hour,
        minute: m.minute,
        second: m.second ?? 0,
        ampm: m.ampm,
      });
      current = { timestamp, rawSender: senderSplit.sender, text: senderSplit.message };
    } else if (current) {
      // Continuation of a multi-line message.
      current.text += '\n' + line;
    }
    // Lines before the first header (or stray blank lines) are dropped.
  }
  if (current) messages.push(current);

  return messages;
}

function normalize(text) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[  ]/g, ' '); // narrow no-break / no-break space -> regular space
}

function matchHeader(line) {
  const ios = IOS_HEADER.exec(line);
  if (ios) {
    const [, a, b, year, hour, minute, second, ampm, rest] = ios;
    return { a: Number(a), b: Number(b), year, hour: Number(hour), minute: Number(minute), second: second ? Number(second) : undefined, ampm, rest };
  }
  const android = ANDROID_HEADER.exec(line);
  if (android) {
    const [, a, b, year, hour, minute, second, ampm, rest] = android;
    return { a: Number(a), b: Number(b), year, hour: Number(hour), minute: Number(minute), second: second ? Number(second) : undefined, ampm, rest };
  }
  return null;
}

// A message line is "Sender: message text"; a system/notice line has no
// such colon-delimited sender prefix (e.g. "Messages and calls are
// end-to-end encrypted...", "Priya added Arjun").
function splitSenderAndMessage(rest) {
  const idx = rest.indexOf(': ');
  if (idx === -1) return null;
  const sender = rest.slice(0, idx).trim();
  const message = rest.slice(idx + 2);
  if (!sender) return null;
  return { sender, message };
}

function detectDateOrder(headers) {
  for (const h of headers) {
    if (h.a > 12) return 'dmy';
    if (h.b > 12) return 'mdy';
  }
  return 'dmy'; // default: WhatsApp's non-US default, matches this community's exports
}

function resolveDayMonth(h, dateOrder) {
  return dateOrder === 'mdy' ? { day: h.b, month: h.a } : { day: h.a, month: h.b };
}

function resolveYear(rawYear) {
  const year = Number(rawYear);
  return rawYear.length <= 2 ? 2000 + year : year;
}

function toIsoUtc({ day, month, year, hour, minute, second, ampm }) {
  let hour24 = hour;
  if (ampm) {
    const isPm = ampm.toLowerCase() === 'pm';
    hour24 = hour % 12;
    if (isPm) hour24 += 12;
  }
  const istMillis = Date.UTC(year, month - 1, day, hour24, minute, second);
  const utcMillis = istMillis - IST_OFFSET_MINUTES * 60 * 1000;
  return new Date(utcMillis).toISOString();
}
