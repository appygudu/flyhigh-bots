# Flyhigh Bots — https://flyhigh-bots.vercel.app

Static site listing ONLY Grok Bot templates created by Flyhigh. Data lives in `public/templates.json`.

All templates and packs are free. Support is optional.

## How templates are discovered (`update.mjs`)
1. `sources.json` → `shareLinks` (manual list of https://x.ai/bot/<id> links; always checked).
2. Grok Bots Directory public API: `https://grokbotsdirectory.com/api/v1/search?q=Flyhigh` (indexes share links posted on X).
3. Official marketplace https://x.ai/bot/marketplace (+ category pages): entries whose creatorName is "Flyhigh".

Every candidate is verified by fetching `https://x.ai/bot/<id>` and requiring og:title to end with " by Flyhigh".
Name/description/image come from the live share page. Category: `sources.json.categories[id]` or `defaultCategory`.
If a fetch fails, the last verified entry is kept (no data is invented). `exclude` hides ids.

## Adding a template discovery can't see
Append its `https://x.ai/bot/<id>` link to `sources.json.shareLinks` (optionally a category), then run `./update.sh`.

## Site build
- `build.mjs` generates everything in `public/` from `public/templates.json`: index.html (finder, packs, static template list, FAQ, support, JSON-LD), `packs/<slug>.html`, `bundles.json`, `llms.txt`, `llms-full.txt`, `sitemap.xml`, `robots.txt`, IndexNow key file. `update.mjs` calls it automatically.
- Tags/personas/packs/FAQ/support URLs live at the top of `build.mjs`.
- `public/og.png` is a static image (not regenerated).
- Deploys on Vercel as a static site (no build step required if you upload `public/` contents).
- After a production deploy: `python3 indexnow.py`.

## Local update
```bash
./update.sh
```

## Ownership
Templates shown are Flyhigh's. This repo hosts the showcase site source only.
