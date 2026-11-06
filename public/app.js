// Flyhigh Bots — progressive enhancement for the static pages (search, filters, sort, bundle finder, copy/share).
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeUrl = (u) => (/^https:\/\/x\.ai\/bot\/[A-Za-z0-9_-]+$/.test(u || '') ? u : null);
  const params = new URLSearchParams(location.search);
  let B = null; // bundles.json
  let sort = 'new', cat = 'all', q = params.get('q') || '';
  const chosen = new Set((params.get('p') || '').split(',').filter(Boolean));

  function toast(msg) {
    let t = $('#toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('on'), 2200);
  }
  async function copy(text, msg) {
    try { await navigator.clipboard.writeText(text); }
    catch { const a = document.createElement('textarea'); a.value = text; document.body.appendChild(a); a.select(); try { document.execCommand('copy'); } catch {} a.remove(); }
    toast(msg || 'Copied');
  }
  const isNew = (d) => d && Date.now() - new Date(d + 'T00:00:00Z').getTime() < 14 * 864e5;
  const card = (t, reason) => `<article class="card" data-id="${esc(t.id)}">
    <div class="card-main">
      <h3><a href="${esc(safeUrl(t.shareUrl))}" target="_blank" rel="noopener">${esc(t.name)}</a></h3>
      <div class="badges"><span class="badge">${esc(t.category)}</span>${isNew(t.dateAdded) ? '<span class="badge new">New</span>' : ''}</div>
      ${reason ? `<p class="reason">${esc(reason)}</p>` : ''}
      <p class="desc">${esc(reason ? t.summary : t.description)}</p>
    </div>
    <div class="side">
      ${!reason && t.image && /^https:\/\/x\.ai\//.test(t.image) ? `<img class="thumb" src="${esc(t.image)}" alt="${esc(t.name)} template preview" loading="lazy" width="168" height="88">` : ''}
      <a class="cta" href="${esc(safeUrl(t.shareUrl))}" target="_blank" rel="noopener">Use this template →</a>
    </div>
  </article>`;

  // ---------- all-templates list ----------
  function renderList() {
    const list = $('#list'); if (!list || !$('#search') || !B) return;
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    let items = B.templates.filter((t) => safeUrl(t.shareUrl))
      .filter((t) => cat === 'all' || t.category === cat)
      .filter((t) => { const h = `${t.name} ${t.description} ${t.category} ${(t.tags || []).join(' ')}`.toLowerCase(); return words.every((w) => h.includes(w)); });
    items.sort(sort === 'az' ? (a, b) => a.name.localeCompare(b.name) : (a, b) => (b.dateAdded || '').localeCompare(a.dateAdded || '') || a.name.localeCompare(b.name));
    list.innerHTML = items.map((t) => card(t)).join('');
    $('#nomatch').hidden = items.length > 0;
    $$('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.sort === sort));
    $$('#cats button').forEach((b) => b.classList.toggle('on', b.dataset.cat === cat));
  }

  // ---------- bundle finder ----------
  const STOP = new Set('i am im a an the and or for to of in on my me we our us with want need help some that this have has who what into from your just like also more about business work doing make get run would will can its it is are be do'.split(' '));
  const wordRe = (w) => new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`);
  function findBundle(text, personaIds) {
    const F = B.finder, weight = {};
    const add = (g, w) => { if (F.tags[g] && !(weight[g] >= w)) weight[g] = w; };
    const low = ` ${String(text || '').toLowerCase()} `;
    for (const p of F.personas) {
      const picked = personaIds.includes(p.id) || p.words.some((w) => wordRe(w).test(low));
      if (picked) p.tags.forEach((g, i) => add(g, Math.max(1.8, 3.2 - 0.35 * i)));
    }
    // what the visitor actually typed outweighs persona guesses
    for (const [g, v] of Object.entries(F.tags)) if (v.words.some((w) => wordRe(w).test(low))) add(g, 6);
    const tokens = [...new Set(low.split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !STOP.has(w)))];
    const live = B.templates.filter((t) => safeUrl(t.shareUrl));
    const freq = {}; live.forEach((t) => (t.tags || []).forEach((g) => { freq[g] = (freq[g] || 0) + 1; }));
    // niche templates (e.g. astrology) only show when the visitor asked for that niche
    const scored = live.filter((t) => !(t.tags || []).includes('astrology') || weight.astrology).map((t) => {
      const ws = (t.tags || []).filter((g) => weight[g]).sort((a, b) => weight[b] - weight[a] || freq[a] - freq[b]);
      let s = ws.length ? weight[ws[0]] + 0.35 * ws.slice(1).reduce((n, g) => n + weight[g], 0) : 0;
      // reason: the most specific strong match (rarer tags describe a template better)
      const rs = [...ws].sort((a, b) => weight[b] / Math.sqrt(freq[b]) - weight[a] / Math.sqrt(freq[a]));
      const hay = `${t.name} ${t.description}`.toLowerCase();
      const hits = tokens.filter((w) => hay.includes(w));
      s += Math.min(1.5, hits.length * 0.5);
      const reason = rs.length ? F.tags[rs[0]].reason : hits.length ? `Matches "${hits[0]}"` : '';
      return { t, s, reason };
    }).filter((x) => x.s >= 2.4).sort((a, b) => b.s - a.s || a.t.name.localeCompare(b.t.name));
    const top = scored[0]?.s || 0;
    return scored.filter((x) => x.s >= top * 0.45).slice(0, 8);
  }
  function shareLink(text, ids) {
    const p = new URLSearchParams(); if (text) p.set('for', text); if (ids.length) p.set('p', ids.join(','));
    return `${location.origin}/?${p}#finder`;
  }
  function runFinder(scroll) {
    const out = $('#finder-out'); if (!out || !B) return;
    const text = $('#finder-q').value.trim(), ids = [...chosen];
    if (!text && !ids.length) { out.innerHTML = '<p class="muted">Type what you want done, or tap a quick pick.</p>'; return; }
    const res = findBundle(text, ids);
    const link = shareLink(text, ids);
    history.replaceState(null, '', link.replace(location.origin, ''));
    if (!res.length) {
      out.innerHTML = `<p class="muted">Nothing matched yet. Try words like <i>newsletter</i>, <i>course</i>, <i>website</i>, <i>jobs</i> or <i>compliance</i>, or browse the <a href="#packs">ready-made packs</a>.</p>`;
      return;
    }
    out.innerHTML = `<div class="finder-head"><h3>Your bundle</h3><div class="finder-actions"><button type="button" class="ghost" id="copy-bundle">Copy all links</button><button type="button" class="cta" id="share-bundle">Share this bundle</button></div></div>
      <div class="list">${res.map((x) => card(x.t, x.reason + ':')).join('')}</div>`;
    out.dataset.links = JSON.stringify(res.map((x) => [x.t.name, x.t.shareUrl]));
    out.dataset.share = link;
    if (scroll) out.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  const linksText = (title, pairs, url) => `${title}\n${pairs.map(([n, u]) => `- ${n}: ${u}`).join('\n')}\n\nFree Grok Bot templates by Flyhigh: ${url}`;

  // ---------- events ----------
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.sort) { sort = b.dataset.sort; renderList(); }
    else if (b.dataset.cat) { cat = b.dataset.cat; renderList(); }
    else if (b.dataset.persona) { const id = b.dataset.persona; chosen.has(id) ? chosen.delete(id) : chosen.add(id); b.setAttribute('aria-pressed', chosen.has(id)); b.classList.toggle('on', chosen.has(id)); runFinder(false); }
    else if (b.id === 'copy-bundle') { const o = $('#finder-out'); copy(linksText('My Grok Bot bundle', JSON.parse(o.dataset.links || '[]'), o.dataset.share), 'Bundle links copied'); }
    else if (b.id === 'share-bundle') { const url = $('#finder-out').dataset.share; if (navigator.share) { try { await navigator.share({ title: 'My Grok Bot bundle', text: 'Free Grok Bot templates matched to what I do', url }); return; } catch {} } copy(url, 'Bundle link copied'); }
    else if (b.classList.contains('copy-pack')) {
      const go = () => { const p = (B?.packs || []).find((x) => x.slug === b.dataset.pack); if (p) copy(linksText(p.name, p.templates.map((t) => [t.name, t.shareUrl]), p.url), `${p.name} links copied`); };
      if (B) go(); else load().then(go);
    }
  });

  let loading;
  function load() {
    return loading ||= fetch('/bundles.json', { cache: 'no-cache' }).then((r) => r.json()).then((d) => { B = d; }).catch(() => {});
  }
  const form = $('#finder-form');
  if (form) {
    form.addEventListener('submit', (e) => { e.preventDefault(); runFinder(true); });
    $('#finder-q').value = params.get('for') || '';
    $$('.chip').forEach((c) => { const on = chosen.has(c.dataset.persona); c.classList.toggle('on', on); c.setAttribute('aria-pressed', on); });
  }
  const search = $('#search');
  if (search) { search.value = q; search.addEventListener('input', () => { q = search.value.trim(); renderList(); }); }
  load().then(() => {
    if (q) renderList();
    if (form && (params.get('for') || chosen.size)) runFinder(true);
  });
  // expose for testing
  window.FlyhighFinder = { findBundle: (t, p = []) => findBundle(t, p).map((x) => ({ name: x.t.name, score: x.s, reason: x.reason })), ready: () => load() };
})();

// 3D tilt + glare on pack cards (fine pointers only, off for reduced motion)
(() => {
  const mq = window.matchMedia;
  if (!mq || mq('(prefers-reduced-motion: reduce)').matches || !mq('(hover: hover) and (pointer: fine)').matches) return;
  document.querySelectorAll('[data-tilt]').forEach((el) => {
    let raf = 0;
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width; const y = (e.clientY - r.top) / r.height;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => { el.style.setProperty('--ry', `${(x - 0.5) * 9}deg`); el.style.setProperty('--rx', `${(0.5 - y) * 7}deg`); el.style.setProperty('--mx', `${x * 100}%`); el.style.setProperty('--my', `${y * 100}%`); });
    });
    el.addEventListener('pointerleave', () => { cancelAnimationFrame(raf); el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); });
  });
})();
