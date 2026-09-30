"""Serve this repo on port 8080 for the Codespace preview.

Stops any web server already running from an earlier setup, then serves
the repo root with caching turned off, so the browser always shows the
latest files after a pull.
"""
import functools
import http.server
import os
import subprocess
import time

PORT = 8080
ROOT = os.path.dirname(os.path.abspath(__file__))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main():
    # An older Codespace setup ran "python3 -m http.server ... --directory harness".
    subprocess.run(["pkill", "-f", "http[.]server"], check=False)
    time.sleep(0.5)
    handler = functools.partial(NoCacheHandler, directory=ROOT)
    http.server.ThreadingHTTPServer.allow_reuse_address = True
    with http.server.ThreadingHTTPServer(("", PORT), handler) as httpd:
        print(f"Serving {ROOT} on port {PORT}. Leave this terminal open.")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
