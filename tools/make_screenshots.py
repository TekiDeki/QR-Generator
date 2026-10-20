#!/usr/bin/env python3
"""Take the screenshots the README and the social card need.

    python3 tools/make_screenshots.py

Writes screenshots/desktop.png and screenshots/dark.png at scroll 0, and
screenshots/og.png at the 1200 x 630 the social card asks for.
"""

from __future__ import annotations

import socket
import threading
from contextlib import contextmanager
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "screenshots"


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args, **kwargs):
        pass


@contextmanager
def serve(directory: Path):
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    handler = partial(QuietHandler, directory=str(directory))
    server = ThreadingHTTPServer(("127.0.0.1", port), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{port}"
    finally:
        server.shutdown()
        server.server_close()


def fill(page, base: str) -> None:
    """A finished looking page, the state a person would actually screenshot."""
    page.goto(base + "/", wait_until="load")
    page.fill("#url", "freehtml.dev/sign")
    page.wait_for_timeout(350)


def main() -> None:
    OUT.mkdir(exist_ok=True)
    with serve(ROOT) as base, sync_playwright() as playwright:
        browser = playwright.chromium.launch()

        page = browser.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=2).new_page()
        fill(page, base)
        page.evaluate("() => window.scrollTo(0, 0)")
        page.screenshot(path=str(OUT / "desktop.png"))

        page.evaluate("""() => {
            document.documentElement.setAttribute('data-theme', 'dark');
            try { localStorage.setItem('qr-generator.theme', 'dark'); } catch (e) {}
        }""")
        page.reload(wait_until="load")
        fill(page, base)
        page.screenshot(path=str(OUT / "dark.png"))

        phone = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3,
                                     is_mobile=True, has_touch=True).new_page()
        phone.goto(base + "/", wait_until="load")
        phone.evaluate("() => window.scrollTo(0, 0)")
        phone.fill("#url", "freehtml.dev/sign")
        phone.wait_for_timeout(500)
        phone.screenshot(path=str(OUT / "phone.png"))

        card = browser.new_context(viewport={"width": 1200, "height": 630}, device_scale_factor=1).new_page()
        card.goto(base + "/", wait_until="load")
        card.evaluate("""() => {
            document.documentElement.setAttribute('data-theme', 'light');
            document.querySelector('.topbar').style.display = 'none';
            document.querySelector('.intro').style.display = 'none';
            document.querySelector('.claims').style.display = 'none';
            document.body.style.paddingTop = '18px';
        }""")
        card.fill("#url", "freehtml.dev")
        card.wait_for_timeout(400)
        card.screenshot(path=str(OUT / "og.png"))

        browser.close()
    print("screenshots written")


if __name__ == "__main__":
    main()
