# Serves the extension folder for the screenshot / QA harness: every *.html under the repo root gets
# store/shots/mock-chrome.js injected first, so popup.html and sidepanel.html run outside Chrome.
# Run: python store/shots/serve.py [port]   then open http://localhost:8765/store/shots/compose.html?n=1
import http.server, os, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
INJECT = b'<head>\n  <script src="/store/shots/mock-chrome.js"></script>'


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        path = self.path.split("?")[0]
        if path in ("/popup.html", "/sidepanel.html"):
            with open(os.path.join(ROOT, path.lstrip("/")), "rb") as f:
                body = f.read().replace(b"<head>", INJECT, 1)
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def guess_type(self, path):
        if str(path).endswith(".js"):
            return "text/javascript"
        return super().guess_type(path)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
