// Configured folder-watch sources (ticket #9, spec: "poll a configured
// local/cloud-synced folder ... each watched folder maps to a configured
// group"). Configured via the WATCHED_FOLDERS env var (a JSON array of
// {"path","groupId"} objects) rather than a GROUPS-style hardcoded list
// (groups.js), since the set of local/cloud-synced directories to watch is
// inherently per-deployment, not a fixed project fact. Unset/absent means
// folder-watch is off and manual browser upload is the only ingestion path.
export function loadWatchedFolders(env = process.env) {
  const raw = env.WATCHED_FOLDERS;
  if (!raw) return [];

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('WATCHED_FOLDERS must be valid JSON: an array of {"path","groupId"} objects');
  }
  if (!Array.isArray(parsed)) {
    throw new Error('WATCHED_FOLDERS must be a JSON array of {"path","groupId"} objects');
  }

  return parsed.map((entry, i) => {
    if (!entry || typeof entry.path !== 'string' || typeof entry.groupId !== 'string') {
      throw new Error(`WATCHED_FOLDERS[${i}] must be an object of the shape {"path": string, "groupId": string}`);
    }
    return { path: entry.path, groupId: entry.groupId };
  });
}
