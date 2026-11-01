"""Local preview of the design-system document, with an explicit asset allowlist."""

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parents[2]
FILES = frozenset({
    "/design-system.html",
    "/tokens.css",
    "/logo.svg",
    "/logo-dark.svg",
    "/logo-mark.svg",
    "/logo-mark-dark.svg",
    "/docs/design/showcase.css",
    "/docs/design/showcase.js",
    "/docs/design/assets/fonts.css",
    "/docs/design/assets/fonts/ibm-plex-sans-400-0.ttf",
    "/docs/design/assets/fonts/ibm-plex-sans-500-1.ttf",
    "/docs/design/assets/fonts/ibm-plex-sans-600-2.ttf",
    "/docs/design/assets/fonts/manrope-600-3.ttf",
    "/docs/design/assets/fonts/manrope-700-4.ttf",
    "/docs/design/assets/fonts/rubik-700.woff2",
})


class PreviewHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def send_head(self):
        path = urlsplit(self.path).path
        if path == "/":
            path = "/design-system.html"
        if path not in FILES or not (ROOT / path.lstrip("/")).is_file():
            self.send_error(404)
            return None
        self.path = path
        return super().send_head()

    def list_directory(self, path):
        self.send_error(404)
        return None

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    with ThreadingHTTPServer(("127.0.0.1", 100), PreviewHandler) as server:
        print("Design system: http://127.0.0.1:100/", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
