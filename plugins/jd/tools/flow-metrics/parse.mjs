const unquote = (v) => v.trim().replace(/^(["'])(.*)\1$/, '$2');

const splitRow = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

const isSeparator = (line) => /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test(line.trim());

export function parseFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text ?? '');
  const out = {};
  if (!m) return out;
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z][\w-]*):(.*)$/.exec(line);
    if (kv) out[kv[1]] = unquote(kv[2]);
  }
  return out;
}

export function parseTable(text, heading) {
  const lines = (text ?? '').split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === `## ${heading}` || l.trim() === heading);
  if (start < 0) return [];
  let i = start + 1;
  while (i < lines.length && !lines[i].trim().startsWith('|')) {
    if (/^#{1,6}\s/.test(lines[i])) return [];
    i++;
  }
  if (i >= lines.length) return [];
  const headers = splitRow(lines[i]);
  const rows = [];
  for (i += 1; i < lines.length && lines[i].trim().startsWith('|'); i++) {
    if (isSeparator(lines[i])) continue;
    const cells = splitRow(lines[i]);
    if (cells.every((c) => c === '')) continue;
    rows.push(Object.fromEntries(headers.map((h, k) => [h, cells[k] ?? ''])));
  }
  return rows;
}

function riskTier(brief) {
  const m = /^\|\s*Risk tier\s*\|\s*([^|]*?)\s*\|/im.exec(brief ?? '');
  if (!m) return '';
  const first = /^[A-Za-z]+/.exec(m[1].replace(/^[^A-Za-z]+/, ''));
  return first ? first[0].toLowerCase() : '';
}

export function parseFeature({ feature, brief, report }) {
  const fm = parseFrontmatter(feature);
  const attempts = Number(fm.featureFixAttempts);
  return {
    id: fm.id ?? '',
    title: fm.title ?? '',
    status: fm.status ?? '',
    pluginVersion: fm.pluginVersion || 'before-0.39',
    tier: riskTier(brief),
    approvedAt: fm.approvedAt ?? '',
    briefRevisions: parseTable(feature, 'Brief revisions').map((r) => ({ date: r.Date ?? '', reason: r.Reason ?? '' })),
    reworks: parseTable(report, 'Rework history:').map((r) => ({ round: r.Round ?? '', date: r.Date ?? '', reason: r.Reason ?? '' })),
    stops: parseTable(feature, 'Stops').map((r) => ({ date: r.Date ?? '', step: r.Step ?? '', reason: r.Reason ?? '' })),
    featureFixAttempts: Number.isFinite(attempts) ? attempts : 0,
  };
}
