"""Inspect the MC JS Widget bundle to see why it crashes on load.

Run in the Codespace terminal:  python3 tools/widget_probe.py
Then copy everything it prints and paste it back.

It downloads the widget the same way MC's embed code does, then prints:
- the start of the bundle, where a UMD bundle lists the libraries it
  expects the host page to provide (e.g. global.moment, global.React)
- the code around each "defineLocale", where the crash happens
"""
import json
import re
import sys
import urllib.request

LOADER = "https://demo.iriscrm.com/web-form/bundle"
ORIGIN = "https://silver-space-lamp-wrxwqgpgr4q435r4w-8080.app.github.dev"


def get(url):
    req = urllib.request.Request(url, headers={"Origin": ORIGIN, "Referer": ORIGIN + "/odyssey/", "User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", "replace")


def main():
    config = json.loads(get(LOADER))
    print("Loader response:", json.dumps(config)[:500])
    url = config.get("url")
    if not url:
        sys.exit("No bundle url in the loader response.")
    js = get(url)
    print("Bundle:", url, f"({len(js):,} characters)")
    print("\n--- Start of bundle (UMD header) ---")
    print(js[:1500])
    print("\n--- Libraries the bundle may expect as globals ---")
    for name in sorted(set(re.findall(r"(?:global|globalThis|self|window|this)\.([A-Za-z_$][\w$]*)", js[:5000]))):
        print(" ", name)
    print("\n--- Code around defineLocale (first 3) ---")
    for m in list(re.finditer(r"defineLocale", js))[:3]:
        print("...", js[max(0, m.start() - 400):m.end() + 200].replace("\n", " "), "...\n")
    print("Mentions of 'moment':", js.count("moment"), "| 'dayjs':", js.count("dayjs"))


if __name__ == "__main__":
    main()
