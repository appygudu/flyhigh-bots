#!/usr/bin/env node
// Generates every derived file of the Flyhigh Bots site from public/templates.json:
//   public/index.html (static, crawlable list + finder + packs + FAQ + JSON-LD), public/packs/<slug>.html,
//   public/bundles.json, public/llms.txt, public/llms-full.txt, public/sitemap.xml, public/robots.txt, IndexNow key file.
// No network, no dependencies. Runs locally (update.mjs calls it) AND on Vercel as the build command,
// so a deploy only needs templates.json + this file + app.js + styles.css.
import fs from 'node:fs';
import path from 'node:path';

const dir = path.dirname(new URL(import.meta.url).pathname);
const pub = path.join(dir, 'public');

// ---------------- config ----------------
const SITE = 'https://flyhigh-bots.vercel.app';
const DONATE_URL = 'https://www.paypal.com/ncp/payment/RQ7LNE92YYMZU'; // Flyhigh's own pay-what-you-want support link (PayPal, payer sets the amount in USD). Don't call it a donation in copy (payment providers reserve that for non-profits).
// Support buttons, shown side by side. To add the India link later, append e.g.
// { label: 'Support this work (UPI / India)', url: 'https://...cashfree...', provider: 'Cashfree', currency: 'INR' }
const SUPPORT_LINKS = [
  { label: 'Support this work (PayPal)', url: DONATE_URL, provider: 'PayPal', currency: 'USD' },
].filter(l => l.url);
const INDEXNOW_KEY = '7f3c9a1e5b2d4c8f9e0a6b1c2d3e4f5a';
const CREATOR = 'Flyhigh';
const OG_IMAGE = `${SITE}/og.png`;

// Tag vocabulary. re = how a template earns the tag (matched on name+description+category).
// words = what a visitor might type. reason = shown in the finder ("<reason>: <summary>").
const TAGS = {
  jobs:        { re: /\bjobs?\b|resume|naukri|linkedin|easy apply/, words: ['job', 'jobs', 'resume', 'cv', 'hiring', 'interview', 'apply', 'applications', 'job seeker', 'career', 'naukri', 'linkedin', 'unemployed', 'fresher'], reason: 'Speeds up your job hunt' },
  immigration: { re: /immigra|visa|abroad|overseas|permanent-settlement/, words: ['visa', 'immigration', 'abroad', 'overseas', 'relocate', 'relocation', 'move abroad', 'pr', 'permanent residence', 'migrate', 'international jobs'], reason: 'Plans your move abroad' },
  course:      { re: /online (video )?courses|online courses|udemy|lecture|instructor/, words: ['course', 'courses', 'udemy', 'teach', 'teacher', 'tutor', 'instructor', 'lecture', 'lectures', 'training', 'educator', 'edtech', 'coach', 'coaching'], reason: 'Builds and ships your courses' },
  workshop:    { re: /workshop|bootcamp|buildathon|webinar/, words: ['workshop', 'workshops', 'webinar', 'bootcamp', 'cohort', 'live class', 'masterclass', 'event', 'buildathon', 'coach', 'coaching'], reason: 'Launches paid live workshops' },
  book:        { re: /\bbooks?\b|kdp|kindle|\bauthor/, words: ['book', 'books', 'author', 'writer', 'write', 'kindle', 'kdp', 'novel', 'publish', 'publishing', 'ebook', 'ebooks'], reason: 'Turns your know-how into a book' },
  products:    { re: /digital[- ]product|ebooks?|study guides?|\bkits?\b|storefront|gumroad|payhip|topmate|instamojo/, words: ['digital product', 'digital products', 'ebook', 'ebooks', 'templates', 'gumroad', 'payhip', 'topmate', 'instamojo', 'sell online', 'passive income', 'side hustle', 'study guide', 'printables', 'notion'], reason: 'Helps you make and sell digital products' },
  research:    { re: /research|what to sell|demand, competition/, words: ['research', 'niche', 'idea', 'ideas', 'what to sell', 'market', 'demand', 'validate', 'trend', 'trends'], reason: 'Finds what is worth selling' },
  social:      { re: /instagram|\breels?\b|youtube|\bx posting|posting schedule|social banners|audience/, words: ['social', 'social media', 'instagram', 'insta', 'reels', 'youtube', 'x', 'twitter', 'tweets', 'followers', 'audience', 'influencer', 'content', 'posts', 'creator', 'tiktok'], reason: 'Keeps your social feeds busy' },
  video:       { re: /film|music-video|music video|\breels?\b|lyric|youtube/, words: ['video', 'videos', 'film', 'reel', 'reels', 'youtube', 'music', 'song', 'musician', 'singer', 'animation', 'shorts'], reason: 'Makes videos for you' },
  newsletter:  { re: /newsletter|subscriber/, words: ['newsletter', 'email list', 'subscribers', 'substack', 'email marketing', 'digest', 'news'], reason: 'Runs your newsletter' },
  ads:         { re: /google ads|demand gen|\bads\b/, words: ['ads', 'advertising', 'google ads', 'ppc', 'paid ads', 'leads', 'lead generation', 'campaign', 'campaigns', 'performance marketing'], reason: 'Runs your ads with your approval' },
  promotion:   { re: /promot|quora|medium posts|directory listings|soft-sells/, words: ['promote', 'promotion', 'marketing', 'launch', 'visibility', 'traffic', 'grow', 'growth', 'brand', 'branding', 'reach', 'publicity'], reason: 'Gets your launch seen for free' },
  website:     { re: /website|\bsites?\b|landing page|web apps?/, words: ['website', 'site', 'web', 'landing page', 'webpage', 'online presence', 'wordpress', 'shopify', 'domain', 'blog'], reason: 'Looks after your website' },
  seo:         { re: /\bseo\b/, words: ['seo', 'google ranking', 'rank on google', 'search engine', 'organic traffic'], reason: 'Helps your site get found' },
  qa:          { re: /\bqa\b|broken links|bug report/, words: ['qa', 'testing', 'test', 'bugs', 'broken links', 'quality', 'audit', 'check my site'], reason: 'Catches bugs before customers do' },
  security:    { re: /security|breach|\bcsp\b|attacks/, words: ['security', 'secure', 'hack', 'hacked', 'breach', 'cyber', 'cybersecurity', 'malware', 'safety', 'protect'], reason: 'Keeps your site and accounts safer' },
  payments:    { re: /payment gateway|razorpay|cashfree|stripe|checkout|payment links/, words: ['payment', 'payments', 'razorpay', 'cashfree', 'stripe', 'paypal', 'checkout', 'accept payments', 'gateway', 'store', 'shop', 'ecommerce', 'e-commerce'], reason: 'Gets you ready to take payments' },
  compliance:  { re: /complian|regulation|\blaw\b|legal|policy pages|grievance/, words: ['compliance', 'legal', 'law', 'lawyer', 'lawyers', 'advocate', 'attorney', 'solicitor', 'law firm', 'regulation', 'regulatory', 'gdpr', 'dpdp', 'privacy', 'policy', 'policies', 'governance', 'risk', 'audit', 'contract', 'contracts', 'ca', 'chartered accountant', 'consultant'], reason: 'Handles compliance and legal groundwork' },
  legal:       { re: /legal counsel|legal requests|law enforcement|data protection officer|dpdp|gdpr|litigation|lawyers|contracts?\b|legal research|legal questions|general counsel|\bclos?\b|case law|\bndas?\b/, words: ['lawyer', 'lawyers', 'legal', 'law firm', 'attorney', 'advocate', 'solicitor', 'counsel', 'general counsel', 'contract', 'contracts', 'nda', 'ndas', 'legal research', 'case law', 'litigation', 'agreement', 'agreements', 'terms and conditions'], reason: 'Does the legal work with you' },
  astrology:   { re: /astrolog|kundli|rashi/, words: ['astrology', 'astrologer', 'kundli', 'horoscope', 'jyotish', 'tarot', 'numerology', 'vastu', 'spiritual', 'rashi'], reason: 'Runs your astrology website' },
  productivity:{ re: /chief of staff|several grok bots/, words: ['productivity', 'organise', 'organize', 'manage bots', 'many bots', 'assistant', 'chief of staff', 'busy', 'overwhelmed', 'delegate', 'operations', 'founder', 'ceo'], reason: 'Keeps all your bots on track' },
  apps:        { re: /web apps|prototypes?/, words: ['app', 'apps', 'prototype', 'mvp', 'build an app', 'saas', 'tool', 'developer', 'developers'], reason: 'Builds small apps and prototypes' },
  outreach:    { re: /cold-outreach|outreach/, words: ['outreach', 'cold email', 'cold emails', 'clients', 'client', 'lead', 'agency', 'freelancer', 'freelance', 'sales', 'b2b'], reason: 'Fixes outreach that is not landing clients' },
  trading:     { re: /\bstocks?\b|\bcrypto\b|bitcoin|trading|trade journal|watchlist|pre-market/, words: ['trading', 'trade', 'trades', 'stock', 'stocks', 'crypto', 'cryptocurrency', 'bitcoin', 'btc', 'ethereum', 'eth', 'share market', 'equity', 'equities', 'forex', 'trader', 'invest', 'investing', 'investment', 'portfolio', 'watchlist', 'options'], reason: 'Researches stocks and crypto with you' },
  income:      { re: /income|money/, words: ['money', 'income', 'earn', 'monetize', 'monetise', 'revenue', 'side income', 'make money'], reason: 'Turns your expertise into income' },
};

// Quick-pick chips. Tags listed first weigh more.
const PERSONAS = [
  { id: 'lawyer', label: 'Lawyer', words: ['lawyer', 'lawyers', 'advocate', 'attorney', 'solicitor', 'law firm', 'legal', 'counsel', 'barrister', 'law practice'], tags: ['legal', 'compliance', 'security', 'newsletter', 'website', 'book'] },
  { id: 'creator', label: 'Creator', words: ['creator', 'creators', 'influencer', 'youtuber', 'content creator', 'artist', 'musician', 'writer'], tags: ['social', 'video', 'newsletter', 'promotion', 'products', 'book'] },
  { id: 'coach', label: 'Coach', words: ['coach', 'coaching', 'mentor', 'trainer', 'consultant', 'therapist', 'teacher', 'tutor'], tags: ['workshop', 'course', 'ads', 'newsletter', 'book', 'social'] },
  { id: 'ecommerce', label: 'E-commerce', words: ['ecommerce', 'e-commerce', 'online store', 'shop', 'shopify', 'd2c', 'dropshipping', 'store', 'seller', 'retail'], tags: ['payments', 'ads', 'website', 'qa', 'security', 'seo', 'promotion'] },
  { id: 'agency', label: 'Agency', words: ['agency', 'agencies', 'freelancer', 'freelance', 'studio', 'consultancy', 'marketing agency', 'services business'], tags: ['outreach', 'ads', 'website', 'qa', 'seo', 'security', 'social', 'productivity'] },
  { id: 'jobseeker', label: 'Job seeker', words: ['job seeker', 'job hunting', 'looking for a job', 'looking for job', 'job search', 'unemployed', 'fresher', 'graduate', 'switch jobs', 'career change'], tags: ['jobs', 'immigration'] },
  { id: 'courseseller', label: 'Course seller', words: ['course seller', 'sell courses', 'online courses', 'udemy', 'edtech', 'instructor', 'educator'], tags: ['course', 'workshop', 'research', 'ads', 'promotion', 'products'] },
  { id: 'astrologer', label: 'Astrologer', words: ['astrologer', 'astrology', 'jyotish', 'kundli', 'horoscope', 'tarot', 'numerology', 'vastu'], tags: ['astrology', 'payments', 'social', 'video', 'newsletter', 'ads'] },
  { id: 'startup', label: 'Startup', words: ['startup', 'start-up', 'founder', 'saas', 'small business', 'smb', 'mvp', 'new business'], tags: ['website', 'payments', 'ads', 'security', 'promotion', 'apps', 'newsletter', 'productivity'] },
];

// Curated packs. A template joins a pack when it carries any of the pack's tags (more matches rank higher).
const PACKS = [
  { slug: 'creator-launch', name: 'Creator Launch Pack', tagline: 'Grow an audience and launch to it.', description: 'For creators who want steady posts, videos and a newsletter, plus a free launch push for whatever they make next.', tags: ['social', 'video', 'newsletter', 'promotion'], max: 7 },
  { slug: 'digital-product-business', name: 'Digital Product Business Pack', tagline: 'Find it, make it, list it, get paid.', description: 'Research what to sell, mass-produce original digital products, list them on creator storefronts and get payments live.', tags: ['products', 'research', 'income'], excludeTags: ['trading'], max: 7 },
  { slug: 'course-creator', name: 'Course Creator Pack', tagline: 'From idea to published course and live workshop.', description: 'Pick a course topic with real demand, build and upload the course, run live workshops and turn it into a book.', tags: ['course', 'workshop', 'research', 'book'], excludeTags: ['compliance', 'trading'], max: 7 },
  { slug: 'career-job-hunt', name: 'Career & Job Hunt Pack', tagline: 'Daily applications and a plan for working abroad.', description: 'Apply to jobs every day with your saved resumes, and build a realistic plan for visas and overseas roles.', tags: ['jobs', 'immigration'], max: 6 },
  { slug: 'website-launch-growth', name: 'Website Launch & Growth Pack', tagline: 'Launch a site that works, gets paid and gets found.', description: 'QA your site, harden it, get a payment gateway approved, keep watch for security issues and run ads once it is ready.', tags: ['qa', 'security', 'seo', 'website', 'ads', 'payments'], excludeTags: ['astrology'], max: 7 },
  { slug: 'marketing-autopilot', name: 'Marketing on Autopilot Pack', tagline: 'Posts, newsletters, ads and promotion that keep running.', description: 'A newsletter that writes itself, social posting on a schedule, ads with weekly reports and free-channel promotion, all with your approval on anything public or paid.', tags: ['newsletter', 'ads', 'social', 'promotion'], max: 7 },
  { slug: 'finance-trading', name: 'Finance & Trading Pack', tagline: 'Research markets and keep a clean trade journal.', description: 'For traders and investors who want pre-market briefs, watchlist alerts, stock and crypto research, trade plans and a journal — without replacing their broker.', tags: ['trading'], max: 6 },
  { slug: 'compliance-legal', name: 'Compliance & Legal Pack', tagline: 'Source-checked compliance work and a safer site.', description: 'Build compliance kits checked against official sources, get policy pages ready for payment approval, and keep your site and accounts safer.', tags: ['legal', 'compliance', 'security'], max: 10 },
];

// Pack cover art (public/packs/img/<slug>.webp, -640.webp, -og.jpg) + accent colours
const PACK_LOOK = {
  'creator-launch': { c1: '#e879f9', c2: '#22d3ee', alt: 'Glass rocket lifting off beside a glowing megaphone with neon sound rings in deep space' },
  'digital-product-business': { c1: '#f59e0b', c2: '#8b5cf6', alt: 'Floating glass product boxes ringed by an orbit of amber light in deep space' },
  'course-creator': { c1: '#2dd4bf', c2: '#8b5cf6', alt: 'Glass graduation cap hovering over a holographic video player with film frames' },
  'career-job-hunt': { c1: '#38bdf8', c2: '#34d399', alt: 'Glass briefcase in front of a glowing wireframe globe with neon flight paths' },
  'website-launch-growth': { c1: '#22d3ee', c2: '#a3e635', alt: 'Glass browser window with a rocket launching out of it toward rising growth bars' },
  'marketing-autopilot': { c1: '#c084fc', c2: '#f472b6', alt: 'Glowing autopilot orb sending out neon signal waves with floating envelopes and chat bubbles' },
  'compliance-legal': { c1: '#a78bfa', c2: '#38bdf8', alt: 'Glass scales of justice above a crystal shield next to a glowing sealed document' },
  'finance-trading': { c1: '#34d399', c2: '#fbbf24', alt: 'Glass Ethereum coin ringed by neon candlestick charts in deep space' },
};
const packImg = (slug, v = '') => `/packs/img/${slug}${v}`;
const avatarHue = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
const initials = (n) => n.replace(/&/g, ' ').split(/\s+/).filter((w) => /^[A-Za-z0-9]/.test(w)).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
const avatars = (members) => `<ul class="avatars" aria-label="Templates in this pack">${members.map((t) => `<li class="av" style="--h:${avatarHue(t.name)}" title="${esc(t.name)}"><span aria-hidden="true">${esc(initials(t.name))}</span><span class="sr">${esc(t.name)}</span></li>`).join('')}</ul>`;

const FAQ = [
  ['What is a Grok Bot template?', 'A ready-made setup for a Grok Bot: its skills, instructions and routines. Adding a template gives you your own copy of that bot, which you can then customise.'],
  ['Are these templates free?', 'Yes. Every template and every pack here is free to add. Running a bot uses your normal Grok Bot plan.'],
  ['Do I have to pay or support to use a template or pack?', 'No. All templates and packs are free. Support is optional, and nothing here depends on it: every template link opens directly, with no payment step in between. If you want to give back, the pay-what-you-want support link is at the bottom of the page.'],
  ['How do I use a template?', 'Tap "Use this template". It opens the template on x.ai, where you add it to your Grok Bot and answer a few setup questions. The bot then starts working for you.'],
  ['Will a bot post, pay or submit things without asking me?', 'These templates are written to ask for your yes before anything goes public, costs money or gets submitted. Each description says what it does on its own.'],
  ['Do the templates contain anyone\'s personal data?', 'No. Each template is a generic copy with no logins, accounts or personal details. You connect your own accounts after you add it.'],
  ['How do I find the right templates for my business?', 'Use "Find your bundle": describe what you want done and what kind of business you run, or tap a quick pick such as Lawyer, Creator or Startup. You get a matched bundle with a reason for each pick, and a link you can share.'],
  ['Who makes these templates?', 'Every template on this site is built and published by Flyhigh. New templates appear here automatically after they are published.'],
];

// ---------------- helpers ----------------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeShare = (u) => /^https:\/\/x\.ai\/bot\/[A-Za-z0-9_-]+$/.test(u || '');
const summary = (d) => { const s = String(d || '').split(/(?<=[.!?])\s+/)[0] || ''; return s.length > 150 ? s.slice(0, 147).replace(/\s+\S*$/, '') + '…' : s; };
const isNew = (d, now) => d && now - new Date(d + 'T00:00:00Z').getTime() < 14 * 864e5;
const write = (rel, s) => { const f = path.join(pub, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
const ld = (o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`;

export function build() {
  const data = JSON.parse(fs.readFileSync(path.join(pub, 'templates.json'), 'utf8'));
  const now = Date.now();
  const tpls = (data.templates || []).filter((t) => safeShare(t.shareUrl)).map((t) => {
    const hay = `${t.name} ${t.description} ${t.category}`.toLowerCase();
    const tags = Object.entries(TAGS).filter(([, v]) => v.re.test(hay)).map(([k]) => k);
    return { ...t, tags, summary: summary(t.description) };
  });
  const byNewest = [...tpls].sort((a, b) => (b.dateAdded || '').localeCompare(a.dateAdded || '') || a.name.localeCompare(b.name));
  const packs = PACKS.map((p) => {
    // weighted: earlier pack tags count more, so the most on-topic templates lead the pack
    const members = tpls.map((t) => ({ t, n: p.tags.reduce((s, g, i) => s + (t.tags.includes(g) ? p.tags.length - i : 0), 0) }))
      .filter((x) => x.n > 0 && !(p.excludeTags || []).some((g) => x.t.tags.includes(g)))
      .sort((a, b) => b.n - a.n || a.t.name.localeCompare(b.t.name))
      .slice(0, p.max).map((x) => x.t);
    const reasonFor = (t) => { const g = p.tags.find((x) => t.tags.includes(x)); return g ? TAGS[g].reason : ''; };
    return { ...p, url: `${SITE}/packs/${p.slug}`, members, reasonFor };
  }).filter((p) => p.members.length >= 1);
  const updated = data.updatedAt || new Date().toISOString();
  const lastmod = updated.slice(0, 10);

  // ---------- bundles.json (public, reusable by EdgeBefore) ----------
  const bundles = {
    schemaVersion: 1,
    creator: CREATOR,
    site: SITE,
    updatedAt: updated,
    donateUrl: DONATE_URL || null,
    supportLinks: SUPPORT_LINKS,
    packs: packs.map((p) => ({
      slug: p.slug, name: p.name, tagline: p.tagline, description: p.description, url: p.url, free: true,
      ...(PACK_LOOK[p.slug] ? { image: `${SITE}${packImg(p.slug, '.webp')}`, imageJpg: `${SITE}${packImg(p.slug, '-og.jpg')}`, imageAlt: PACK_LOOK[p.slug].alt } : {}),
      templateIds: p.members.map((t) => t.id),
      templates: p.members.map((t) => ({ id: t.id, name: t.name, category: t.category, shareUrl: t.shareUrl, reason: p.reasonFor(t), summary: t.summary })),
    })),
    templates: byNewest.map((t) => ({ id: t.id, name: t.name, category: t.category, shareUrl: t.shareUrl, image: t.image, dateAdded: t.dateAdded, description: t.description, summary: t.summary, tags: t.tags })),
    finder: {
      tags: Object.fromEntries(Object.entries(TAGS).map(([k, v]) => [k, { reason: v.reason, words: v.words }])),
      personas: PERSONAS,
      shareParam: 'for',
    },
  };
  write('bundles.json', JSON.stringify(bundles, null, 2) + '\n');

  // ---------- shared page bits ----------
  const head = ({ title, desc, url, extra = '', ogImage = OG_IMAGE, ogAlt = 'Flyhigh Bots: free Grok Bot templates that do the work for you' }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Flyhigh Bots">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${ogImage}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(ogAlt)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${ogImage}">
<meta name="theme-color" content="#0b0d12">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="alternate" type="application/json" href="/bundles.json" title="Templates and packs (JSON)">
<link rel="alternate" type="text/plain" href="/llms.txt" title="LLM summary">
<link rel="stylesheet" href="/styles.css">
${extra}
</head>`;
  const header = `<header class="top">
  <a class="brand" href="/"><span class="logo" aria-hidden="true">✈</span> Flyhigh Bots</a>
  <nav class="nav" aria-label="Main">
    <a href="/#finder">Find your bundle</a><a href="/#packs">Packs</a><a href="/#templates">Templates</a><a href="/#faq">FAQ</a><a href="/#support" class="nav-support">Support</a>
  </nav>
</header>`;
  const footer = `<footer class="foot">
  <div class="foot-cols">
    <div><b>Flyhigh Bots</b><p>Only templates created by Flyhigh are listed. New ones appear here automatically after they're published.</p></div>
    <div><b>Packs</b><ul>${packs.map((p) => `<li><a href="/packs/${p.slug}">${esc(p.name)}</a></li>`).join('')}</ul></div>
    <div><b>More</b><ul><li><a href="/#finder">Find your bundle</a></li><li><a href="/#support">Support this work</a></li><li><a href="https://www.edgebefore.com/bots.html">Also on EdgeBefore</a></li><li><a href="/llms.txt">llms.txt</a></li><li><a href="/bundles.json">bundles.json</a></li></ul></div>
  </div>
  <p class="small">Updated <time datetime="${esc(updated)}">${esc(lastmod)}</time></p>
</footer>`;
  const card = (t, reason) => `<article class="card" data-id="${esc(t.id)}">
  <div class="card-main">
    <span class="card-av" style="--h:${avatarHue(t.name)}" aria-hidden="true">${esc(initials(t.name))}</span>
    <h3><a href="${esc(t.shareUrl)}" target="_blank" rel="noopener">${esc(t.name)}</a></h3>
    <div class="badges"><span class="badge">${esc(t.category)}</span>${isNew(t.dateAdded, now) ? '<span class="badge new">New</span>' : ''}</div>
    ${reason ? `<p class="reason">${esc(reason)}</p>` : ''}
    <p class="desc">${esc(t.description)}</p>
  </div>
  <div class="side">
    ${t.image && /^https:\/\/x\.ai\//.test(t.image) ? `<img class="thumb" src="${esc(t.image)}" alt="${esc(t.name)} template preview" loading="lazy" width="168" height="88">` : ''}
    <a class="cta" href="${esc(t.shareUrl)}" target="_blank" rel="noopener">Use this template →</a>
  </div>
</article>`;
  const packCard = (p) => { const L = PACK_LOOK[p.slug] || { c1: '#8b5cf6', c2: '#22d3ee', alt: '' }; const hasImg = !!PACK_LOOK[p.slug]; return `<article class="pack" id="pack-${p.slug}" style="--c1:${L.c1};--c2:${L.c2}" data-tilt>
  <div class="pack-glow" aria-hidden="true"></div>
  <a class="pack-media${hasImg ? '' : ' pack-media-fallback'}" href="/packs/${p.slug}" tabindex="-1">
    ${hasImg ? `<img src="${packImg(p.slug, '-640.webp')}" srcset="${packImg(p.slug, '-640.webp')} 640w, ${packImg(p.slug, '.webp')} 1280w" sizes="(max-width: 720px) 100vw, 360px" alt="${esc(L.alt)}" width="640" height="360" loading="lazy" decoding="async">` : `<span class="pack-media-ph" aria-hidden="true"></span>`}
    <span class="free-badge">Free</span>
  </a>
  <div class="pack-body">
    <h3><a href="/packs/${p.slug}">${esc(p.name)}</a></h3>
    <p class="tagline">${esc(p.tagline)}</p>
    ${avatars(p.members)}
    <ul class="pack-list">${p.members.map((t) => `<li><span class="pl-name"><i class="dot" style="--h:${avatarHue(t.name)}" aria-hidden="true"></i>${esc(t.name)}</span><a href="${esc(t.shareUrl)}" target="_blank" rel="noopener" aria-label="Use ${esc(t.name)}">Use</a></li>`).join('')}</ul>
    <div class="pack-actions"><a class="cta pack-open" href="/packs/${p.slug}">Open pack →</a><button type="button" class="ghost copy-pack" data-pack="${p.slug}">Copy all links</button></div>
  </div>
</article>`; };

  const swApp = (t) => ({ '@type': 'SoftwareApplication', name: t.name, description: t.description, url: t.shareUrl, image: t.image || undefined, applicationCategory: 'BusinessApplication', applicationSubCategory: t.category, operatingSystem: 'Web', isAccessibleForFree: true, offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, author: { '@type': 'Person', name: CREATOR }, datePublished: t.dateAdded });

  // ---------- index.html ----------
  const cats = [...new Set(tpls.map((t) => t.category))].sort();
  const title = 'Flyhigh Bots: free Grok Bot templates and bundles that do the work for you';
  const desc = 'Free, ready-to-use Grok Bot templates by Flyhigh for job hunting, courses, digital products, websites, compliance, newsletters, ads and social media. Find the right bundle for your business in seconds.';
  const jsonld = [
    { '@context': 'https://schema.org', '@type': 'WebSite', name: 'Flyhigh Bots', url: SITE + '/', description: desc, publisher: { '@type': 'Person', name: CREATOR }, potentialAction: { '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: `${SITE}/?q={search_term_string}#templates` }, 'query-input': 'required name=search_term_string' } },
    { '@context': 'https://schema.org', '@type': 'ItemList', name: 'Grok Bot templates by Flyhigh', itemListOrder: 'https://schema.org/ItemListOrderDescending', numberOfItems: byNewest.length, itemListElement: byNewest.map((t, i) => ({ '@type': 'ListItem', position: i + 1, item: swApp(t) })) },
    { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
  ];
  const index = `${head({ title, desc, url: SITE + '/', extra: jsonld.map(ld).join('\n') })}
<body>
${header}
<main>
  <section class="hero">
    <p class="kicker">Free Grok Bot templates</p>
    <h1>Bots that do the work for you.</h1>
    <p class="sub">Every template here is built and published by Flyhigh. Tell us what you do and get a ready-made bundle, or pick a single bot and add it to your Grok Bot in one tap.</p>
    <div class="hero-actions"><a class="cta" href="#finder">Find my bundle</a><a class="ghost" href="#templates">Browse all templates</a></div>
  </section>

  <section id="finder" class="finder" aria-labelledby="finder-h">
    <h2 id="finder-h">Find your bundle</h2>
    <p class="muted">Describe what you want done and what kind of business you run. We match it to the templates that fit, with a reason for each.</p>
    <form id="finder-form" class="finder-form" action="/" method="get">
      <label for="finder-q" class="sr">Your purpose and business</label>
      <textarea id="finder-q" name="for" rows="2" placeholder="e.g. I'm a lawyer and want a newsletter, a compliance kit and a safer website"></textarea>
      <div class="chips" role="group" aria-label="Quick picks">${PERSONAS.map((p) => `<button type="button" class="chip" data-persona="${p.id}" aria-pressed="false">${esc(p.label)}</button>`).join('')}</div>
      <button class="cta" type="submit">Build my bundle</button>
    </form>
    <div id="finder-out" class="finder-out" aria-live="polite"></div>
  </section>

  <section id="packs" aria-labelledby="packs-h">
    <h2 id="packs-h">Ready-made packs</h2>
    <p class="muted">Free bundles of templates that work well together. New templates join the right packs automatically.</p>
    <div class="packs">${packs.map(packCard).join('\n')}</div>
  </section>

  <section id="templates" aria-labelledby="templates-h">
    <h2 id="templates-h">All templates</h2>
    <div class="controls">
      <label for="search" class="sr">Search templates</label>
      <input id="search" type="search" placeholder="Search templates (e.g. newsletter, Udemy, SEO)" autocomplete="off">
      <div class="tabs" role="tablist"><button role="tab" data-sort="new" class="on">Newest</button><button role="tab" data-sort="az">A–Z</button></div>
      <div class="cats" id="cats"><button data-cat="all" class="on">All</button>${cats.map((c) => `<button data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div>
    </div>
    <div id="list" class="list">
${byNewest.map((t) => card(t)).join('\n')}
    </div>
    <p id="nomatch" class="muted" hidden>No templates match that yet. Try another word, or use the bundle finder above.</p>
  </section>

  <section id="how" aria-labelledby="how-h">
    <h2 id="how-h">How it works in 3 steps</h2>
    <ol class="steps">
      <li><b>Pick</b><span>Use the bundle finder, open a pack, or search the full list.</span></li>
      <li><b>Add</b><span>Tap "Use this template". It opens on x.ai, where you add it to your Grok Bot.</span></li>
      <li><b>Set up and relax</b><span>Answer a few setup questions and connect your own accounts. The bot gets to work and asks before anything public or paid.</span></li>
    </ol>
  </section>

  <section id="faq" aria-labelledby="faq-h">
    <h2 id="faq-h">FAQ</h2>
    ${FAQ.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n    ')}
  </section>

  <section id="support" class="support" aria-labelledby="support-h">
    <h2 id="support-h">Support this work</h2>
    <p>Every template here is free. If they save you time, you can pay what you want to support this work. It funds the research behind new bots and helps keep making the best bot experience for people.</p>
    ${SUPPORT_LINKS.length ? `<div class="support-links">${SUPPORT_LINKS.map(l => `<a class="cta support-btn" href="${esc(l.url)}" target="_blank" rel="noopener" data-provider="${esc(l.provider)}">${esc(l.label)}</a>`).join('')}</div><p class="support-note"><b>All templates and packs are free. Support is optional.</b></p><p class="muted small">Pay what you want. PayPal lets you choose the amount (USD).</p>` : '<p class="muted small">A pay-what-you-want link is coming soon. Sharing a bundle with someone who needs it helps too.</p>'}
  </section>
</main>
${footer}
<script src="/app.js" defer></script>
</body>
</html>
`;
  write('index.html', index);

  // ---------- pack pages ----------
  for (const p of packs) {
    const ptitle = `${p.name}: free Grok Bot templates by Flyhigh`;
    const pdesc = `${p.tagline} ${p.description}`.slice(0, 300);
    const pld = [
      { '@context': 'https://schema.org', '@type': 'ItemList', name: p.name, description: p.description, url: p.url, numberOfItems: p.members.length, itemListElement: p.members.map((t, i) => ({ '@type': 'ListItem', position: i + 1, item: swApp(t) })) },
      { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Flyhigh Bots', item: SITE + '/' }, { '@type': 'ListItem', position: 2, name: 'Packs', item: SITE + '/#packs' }, { '@type': 'ListItem', position: 3, name: p.name, item: p.url }] },
    ];
    const L = PACK_LOOK[p.slug] || { c1: '#8b5cf6', c2: '#22d3ee', alt: '' };
    const hasImg = !!PACK_LOOK[p.slug];
    const preload = hasImg ? `\n<link rel="preload" as="image" href="${packImg(p.slug, '.webp')}" fetchpriority="high">` : '';
    write(`packs/${p.slug}.html`, `${head({ title: ptitle, desc: pdesc, url: p.url, extra: pld.map(ld).join('\n') + preload, ogImage: hasImg ? SITE + packImg(p.slug, '-og.jpg') : OG_IMAGE, ogAlt: L.alt || undefined })}
<body>
${header}
<main>
  <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Flyhigh Bots</a> › <a href="/#packs">Packs</a> › <span>${esc(p.name)}</span></nav>
  <section class="pack-hero${hasImg ? '' : ' pack-hero-fallback'}" style="--c1:${L.c1};--c2:${L.c2}">
    ${hasImg ? `<img class="pack-hero-img" src="${packImg(p.slug, '.webp')}" srcset="${packImg(p.slug, '-640.webp')} 640w, ${packImg(p.slug, '.webp')} 1280w" sizes="(max-width: 1040px) 100vw, 1040px" alt="${esc(L.alt)}" width="1280" height="720" fetchpriority="high" decoding="async">` : `<div class="pack-hero-img pack-media-ph" aria-hidden="true"></div>`}
    <div class="pack-hero-text">
      <p class="kicker"><span class="free-badge">Free</span> Pack</p>
      <h1 class="grad">${esc(p.name)}</h1>
      <p class="sub">${esc(p.tagline)} ${esc(p.description)}</p>
      ${avatars(p.members)}
      <div class="hero-actions"><button type="button" class="cta copy-pack" data-pack="${p.slug}">Copy all links</button><a class="ghost" href="/#finder">Build a custom bundle</a></div>
    </div>
  </section>
  <section class="list fancy" style="--c1:${L.c1};--c2:${L.c2}" aria-label="Templates in this pack">
${p.members.map((t) => card(t, p.reasonFor(t))).join('\n')}
  </section>
  <section aria-labelledby="other-h"><h2 id="other-h">Other packs</h2><ul class="other-packs">${packs.filter((x) => x !== p).map((x) => { const has = !!PACK_LOOK[x.slug]; return `<li style="--c1:${(PACK_LOOK[x.slug] || {}).c1 || '#8b5cf6'};--c2:${(PACK_LOOK[x.slug] || {}).c2 || '#22d3ee'}"><a href="/packs/${x.slug}">${has ? `<img src="${packImg(x.slug, '-640.webp')}" alt="" width="640" height="360" loading="lazy" decoding="async">` : `<span class="pack-media-ph" aria-hidden="true"></span>`}<b>${esc(x.name)}</b><span class="muted">${esc(x.tagline)}</span></a></li>`; }).join('')}</ul></section>
</main>
${footer}
<script src="/app.js" defer></script>
</body>
</html>
`);
  }

  // ---------- llms.txt / llms-full.txt ----------
  const llms = `# Flyhigh Bots

> Free, ready-to-use Grok Bot templates built and published by Flyhigh. Each template is a generic, ready-made Grok Bot setup (skills, instructions, routines) that anyone can add to their own Grok Bot from its x.ai link. No personal data is included in any template.

Site: ${SITE}/
Machine-readable list of templates and packs: ${SITE}/bundles.json
Full descriptions: ${SITE}/llms-full.txt
Updated: ${updated}

## Templates
${byNewest.map((t) => `- [${t.name}](${t.shareUrl}): ${t.summary} (Category: ${t.category})`).join('\n')}

## Packs (free bundles)
${packs.map((p) => `- [${p.name}](${p.url}): ${p.tagline} Includes ${p.members.map((t) => t.name).join(', ')}.`).join('\n')}

## Optional
- [Bundle finder](${SITE}/#finder): describe your purpose and business, get a matched bundle. Shareable as ${SITE}/?for=<your words>#finder
- [Also listed on EdgeBefore](https://www.edgebefore.com/bots.html)
`;
  write('llms.txt', llms);
  const llmsFull = `# Flyhigh Bots: full template catalogue

> Free Grok Bot templates built and published by Flyhigh. To use one, open its x.ai link and add it to your Grok Bot. All templates and packs are free to add; running a bot uses the user's own Grok Bot plan.

Site: ${SITE}/
Updated: ${updated}

${byNewest.map((t) => `## ${t.name}

- Link: ${t.shareUrl}
- Category: ${t.category}
- Topics: ${t.tags.join(', ') || 'general'}
- Added: ${t.dateAdded}
- Packs: ${packs.filter((p) => p.members.includes(t)).map((p) => p.name).join(', ') || 'none'}

${t.description}
`).join('\n')}
# Packs

${packs.map((p) => `## ${p.name}

- Page: ${p.url}
- ${p.tagline} ${p.description}
${p.members.map((t) => `- ${t.name}: ${t.shareUrl} (${p.reasonFor(t)})`).join('\n')}
`).join('\n')}
# FAQ

${FAQ.map(([q, a]) => `## ${q}\n\n${a}\n`).join('\n')}`;
  write('llms-full.txt', llmsFull);

  // ---------- sitemap / robots / IndexNow key ----------
  const urls = [[SITE + '/', '1.0'], ...packs.map((p) => [p.url, '0.8']), [SITE + '/llms.txt', '0.3'], [SITE + '/llms-full.txt', '0.3']];
  write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(([u, p]) => `  <url><loc>${u}</loc><lastmod>${lastmod}</lastmod><changefreq>daily</changefreq><priority>${p}</priority></url>`).join('\n')}
</urlset>
`);
  const aiBots = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-User', 'Claude-SearchBot', 'anthropic-ai', 'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Googlebot', 'Bingbot', 'Applebot', 'Applebot-Extended', 'CCBot', 'meta-externalagent', 'Amazonbot', 'DuckAssistBot', 'cohere-ai', 'MistralAI-User', 'YouBot', 'xAI-Bot', 'GrokBot'];
  write('robots.txt', `# Flyhigh Bots welcomes search engines and AI assistants.
${aiBots.map((b) => `User-agent: ${b}\nAllow: /\n`).join('\n')}
User-agent: *
Allow: /

Sitemap: ${SITE}/sitemap.xml
`);
  write(`${INDEXNOW_KEY}.txt`, INDEXNOW_KEY);

  return { templates: tpls.length, packs: packs.map((p) => `${p.slug}:${p.members.length}`) };
}

export const config = { SITE, INDEXNOW_KEY };

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  console.error('[build]', JSON.stringify(build()));
}
