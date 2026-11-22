"""Static server for the UI tests that sends the same security headers as vercel.json,
so a Content-Security-Policy violation fails the tests. HSTS and upgrade-insecure-requests
are dropped because the tests run over plain http on localhost."""
import json, os, sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from functools import partial

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HEADERS = []
for rule in json.load(open(os.path.join(ROOT, 'vercel.json')))['headers']:
    for h in rule['headers']:
        if h['key'] == 'Strict-Transport-Security':
            continue
        v = h['value']
        if h['key'] == 'Content-Security-Policy':
            v = '; '.join(d for d in v.split('; ') if d != 'upgrade-insecure-requests')
        HEADERS.append((h['key'], v))

class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        for k, v in HEADERS:
            self.send_header(k, v)
        super().end_headers()
    def log_message(self, *a):
        pass

if __name__ == '__main__':
    ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1])), partial(Handler, directory=ROOT)).serve_forever()
