#!/usr/bin/env node
// Refreshes public/templates.json with Flyhigh's published Grok Bot templates.
// Discovery: sources.json shareLinks + Grok Bots Directory search + official marketplace scan.
// Verification: each candidate's public page https://x.ai/bot/<id> must have og:title ending "by <creatorName>".
import fs from 'node:fs';
import path from 'node:path';
const dir = path.dirname(new URL(import.meta.url).pathname);
const src = JSON.parse(fs.readFileSync(path.join(dir, 'sources.json'), 'utf8'));
const outFile = path.join(dir, 'public', 'templates.json');
const creator = src.creatorName;
const UA = { 'user-agent': 'Mozilla/5.0 (FlyhighBots updater)' };
const log = (...a) => console.error('[update]', ...a);

const idFrom = (s) => {
  if (!s) return null;
  const m = String(s).match(/(?:x\.ai\/bot\/|[?&]id=)([A-Za-z0-9_-]{10,})/);
  return m ? m[1] : null;
};
const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
async function get(url) {
  const r = await fetch(url, { headers: UA, redirect: 'follow' });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
}

const candidates = new Map(); // lowercase id -> original-case id
const add = (id, how) => { if (id && !candidates.has(id.toLowerCase())) { candidates.set(id.toLowerCase(), id); log('candidate', id, 'via', how); } };
for (const l of src.shareLinks || []) add(idFrom(l), 'sources.json');

// 1) Grok Bots Directory public search API
try {
  const j = JSON.parse(await get(`https://grokbotsdirectory.com/api/v1/search?q=${encodeURIComponent(creator)}&limit=100`));
  for (const r of j.results || []) {
    // share_url there is lower-cased; recover original case from x_content when possible
    const low = idFrom(r.share_url);
    const orig = (String(r.x_content || '').match(/x\.ai\/bot\/([A-Za-z0-9_-]{10,})/g) || []).map(idFrom).find((x) => x && x.toLowerCase() === low);
    add(orig || null, 'grokbotsdirectory');
  }
} catch (e) { log('directory search failed:', e.message); }

// 2) Official marketplace (curated) — look for templates whose creatorName matches
try {
  const pages = ['', 'design', 'engineering', 'from-grok-bot-team', 'marketing', 'operations', 'personal', 'product', 'recruiting-people', 'sales'];
  for (const p of pages) {
    const s = (await get(`https://x.ai/bot/marketplace/${p}`)).replace(/\\"/g, '"');
    for (const m of s.matchAll(/"creatorName":"([^"]*)"[^{}]*?"addHref":"\/bot\/([A-Za-z0-9_-]+)"/g)) {
      if (m[1].trim().toLowerCase() === creator.toLowerCase()) add(m[2], 'marketplace');
    }
  }
} catch (e) { log('marketplace scan failed:', e.message); }

// Verify + read metadata from the live share page
let prev = [];
try { prev = JSON.parse(fs.readFileSync(outFile, 'utf8')).templates || []; } catch {}
const prevById = new Map(prev.map((t) => [t.id, t]));
const today = new Date().toISOString().slice(0, 10);
const out = [];
for (const id of candidates.values()) {
  if ((src.exclude || []).includes(id)) continue;
  try {
    const html = await get(`https://x.ai/bot/${id}`);
    const meta = (p) => { const m = html.match(new RegExp(`<meta (?:property|name)="${p}" content="([^"]*)"`)); return m ? decode(m[1]) : ''; };
    const title = meta('og:title');
    const suffix = ` by ${creator}`;
    if (!title.toLowerCase().endsWith(suffix.toLowerCase())) { log('SKIP (not by', creator + '):', id, JSON.stringify(title)); continue; }
    const name = title.slice(0, -suffix.length).trim();
    const old = prevById.get(id);
    out.push({
      id,
      name,
      description: (() => { const og = meta('og:description') || meta('description'); const m = html.match(/by [^<]*<\/p><p title="([^"]*)"/); const full = m ? decode(m[1]) : ''; return full && full.length >= og.replace(/\.\.\.$|…$/, '').length ? full : og; })(),
      category: (src.categories || {})[id] || old?.category || src.defaultCategory || 'Productivity',
      shareUrl: `https://x.ai/bot/${id}`,
      image: meta('og:image') || null,
      dateAdded: old?.dateAdded || today,
    });
    log('OK', id, name);
  } catch (e) {
    // keep previously verified entry if the page is temporarily unreachable
    const old = prevById.get(id);
    if (old) { out.push(old); log('kept previous (fetch failed):', id, e.message); } else log('fetch failed:', id, e.message);
  }
}
out.sort((a, b) => (b.dateAdded || '').localeCompare(a.dateAdded || '') || a.name.localeCompare(b.name));
const data = { creator, updatedAt: new Date().toISOString(), templates: out };
const before = JSON.stringify(prev);
fs.writeFileSync(outFile, JSON.stringify(data, null, 2) + '\n');
const changed = before !== JSON.stringify(out);
// Regenerate index.html, pack pages, bundles.json, llms.txt, sitemap.xml, robots.txt from templates.json.
const { build } = await import('./build.mjs');
await build();
console.log(JSON.stringify({ changed, count: out.length, ids: out.map((t) => t.id) }));
