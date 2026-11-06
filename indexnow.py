# Pings IndexNow (Bing, Yandex, Seznam, Naver...) with every URL in public/sitemap.xml. Run after a production deploy.
import re, json, urllib.request, pathlib
p = pathlib.Path(__file__).parent / 'public' / 'sitemap.xml'
urls = re.findall(r'<loc>([^<]+)</loc>', p.read_text())
key = '7f3c9a1e5b2d4c8f9e0a6b1c2d3e4f5a'
body = json.dumps({"host": "flyhigh-bots.vercel.app", "key": key, "keyLocation": f"https://flyhigh-bots.vercel.app/{key}.txt", "urlList": urls}).encode()
r = urllib.request.urlopen(urllib.request.Request("https://api.indexnow.org/indexnow", data=body, headers={"Content-Type": "application/json; charset=utf-8"}))
print(r.status, len(urls), 'urls')
