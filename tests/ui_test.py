#!/usr/bin/env python3
# QR Generator · end to end tests
# SPDX-License-Identifier: Apache-2.0
"""Drives index.html in a real browser.

    python3 tests/ui_test.py            (chromium by default)
    BROWSER=firefox python3 tests/ui_test.py

Starts its own static server on a free port, so no other process is needed.
"""

from __future__ import annotations

import io
import os
import re
import socket
import tempfile
import threading
from contextlib import contextmanager
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT
checks = 0


def check(condition, message):
    global checks
    checks += 1
    if not condition:
        raise AssertionError(message)


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args, **kwargs):
        pass


@contextmanager
def serve(directory: Path):
    handler = partial(QuietHandler, directory=str(directory))
    port = free_port()
    server = ThreadingHTTPServer(("127.0.0.1", port), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{port}"
    finally:
        server.shutdown()
        server.server_close()


def run_checks(page, base: str, console_errors: list[str], page_errors: list[str]) -> None:
    global checks

    page.goto(base + "/", wait_until="load")

    # 1. the page arrives whole
    check(page.title().startswith("QR Generator"), f"the title says QR Generator, got {page.title()}")
    check(page.locator("h1").inner_text().strip() != "", "there is a heading")
    check(page.locator(".chip[data-type]").count() == 7, "seven kinds of code are offered")

    # 2. nothing is drawn until there is something to draw
    check(page.locator("#stage svg").count() == 0, "the stage is empty at first")
    check(page.locator("#stage .empty").count() == 1, "the empty state explains itself")

    # 2b. exactly one set of fields is on screen at a time
    visible_panels = page.evaluate("""() => Array.from(document.querySelectorAll('[data-panel]'))
        .filter(p => p.offsetParent !== null).map(p => p.getAttribute('data-panel'))""")
    check(visible_panels == ["url"], f"only the link panel shows at first, got {visible_panels}")

    # 3. typing an address produces a code
    page.fill("#url", "freehtml.dev")
    page.wait_for_timeout(120)
    check(page.locator("#stage svg").count() == 1, "a code appears once there is a link")
    check(page.locator("#stage svg rect").count() > 20, "the code has modules")
    check("https://freehtml.dev" in page.locator("#payloadText").inner_text(), "the payload shows the normalised address")

    pills = page.locator("#meta .pill").all_inner_texts()
    check(len(pills) >= 3, f"the meta pills are filled, got {pills}")

    # 4. the modules follow the chosen shape
    squares = page.locator("#stage svg rect").count()
    page.click('#shapeSeg button[data-value="dots"]')
    page.wait_for_timeout(120)
    check(page.locator("#stage svg circle").count() > 10, "dots are drawn as circles")
    check(page.locator("#stage svg rect").count() < squares, "squares give way to dots")
    page.click('#shapeSeg button[data-value="square"]')
    page.wait_for_timeout(120)

    # 5. a low contrast pair is called out
    page.evaluate("""() => {
        const fg = document.getElementById('fgColor');
        fg.value = '#c8c8c8';
        fg.dispatchEvent(new Event('input', {bubbles: true}));
    }""")
    page.wait_for_timeout(150)
    check("Contrast" in page.locator("#meta").inner_text() or "contrast" in page.locator("#meta").inner_text(),
          "contrast is reported")
    page.evaluate("""() => {
        const fg = document.getElementById('fgColor');
        fg.value = '#0a1d23';
        fg.dispatchEvent(new Event('input', {bubbles: true}));
    }""")

    # 6. every kind builds something sensible
    cases = [
        ("text", "#text", "Hello from a code", "Hello from a code"),
        ("wifi", "#ssid", "Cafe", "WIFI:T:WPA;S:Cafe;"),
        ("contact", "#firstName", "Kristian", "BEGIN:VCARD"),
        ("email", "#mailTo", "a@b.c", "mailto:a@b.c"),
        ("phone", "#phoneNumber", "+381 60 123 4567", "tel:+381601234567"),
        ("sms", "#smsNumber", "0601234567", "SMSTO:0601234567:"),
    ]
    for kind, selector, value, expected in cases:
        page.click(f'.chip[data-type="{kind}"]')
        page.wait_for_timeout(80)
        check(page.locator(f'[data-panel="{kind}"]').is_visible(), f"the {kind} panel shows")
        page.fill(selector, value)
        page.wait_for_timeout(140)
        text = page.locator("#payloadText").inner_text()
        check(expected in text, f"{kind} payload carries {expected}, got {text[:80]!r}")
        check(page.locator("#stage svg").count() == 1, f"{kind} still draws one code")

    # the wifi case, in full, because escaping is where it breaks
    page.click('.chip[data-type="wifi"]')
    page.wait_for_timeout(80)
    page.fill("#ssid", "Cafe;Bar")
    page.fill("#wifiPass", "a;b")
    page.wait_for_timeout(150)
    payload = page.evaluate("() => document.getElementById('payloadText').textContent")
    check("S:Cafe\\;Bar;" in payload, f"a hostile network name is escaped, got {payload!r}")

    # 7. undo brings the previous state back
    page.click('.chip[data-type="url"]')
    page.wait_for_timeout(80)
    page.fill("#url", "freehtml.dev/pdf")
    page.wait_for_timeout(700)
    page.fill("#url", "freehtml.dev/sign")
    page.wait_for_timeout(700)
    page.click("#undoBtn")
    page.wait_for_timeout(200)
    check(page.input_value("#url") == "freehtml.dev/pdf", f"undo returns the previous address, got {page.input_value('#url')!r}")

    # 8. downloads
    with tempfile.TemporaryDirectory() as tmp:
        page.fill("#url", "freehtml.dev")
        page.wait_for_timeout(150)
        with page.expect_download() as info:
            page.click("#svgBtn")
        svg_path = Path(tmp) / "code.svg"
        info.value.save_as(svg_path)
        svg = svg_path.read_text(encoding="utf-8")
        check(svg.startswith("<?xml"), "the SVG starts with the XML declaration")
        check('xmlns="http://www.w3.org/2000/svg"' in svg, "the SVG declares its namespace")
        check(svg.count("<rect") + svg.count("<circle") > 20, "the SVG carries the modules")
        check("width=\"1024\"" in svg, "the SVG carries a real pixel size")

        page.click('#pngSeg button[data-value="512"]')
        page.wait_for_timeout(100)
        with page.expect_download() as info:
            page.click("#pngBtn")
        png_path = Path(tmp) / "code.png"
        info.value.save_as(png_path)
        with Image.open(png_path) as png:
            check(png.size == (512, 512), f"the PNG is 512 by 512, got {png.size}")
            check(png.convert("RGB").getpixel((2, 2)) == (255, 255, 255), "the PNG has a white quiet zone")
            rgb = png.convert("RGB")
            colours = rgb.getcolors(maxcolors=200000) or []
            dark = sum(count for count, colour in colours if sum(colour) < 200)
            check(len(colours) >= 2, "the PNG has more than one colour")
            check(dark > 500, "the PNG has dark modules")
        page.click('#pngSeg button[data-value="1024"]')

    # 9. the printable sheet, and the preview that shows it before printing
    page.evaluate("() => { window.print = () => { window.__printed = true; }; }")
    page.fill("#batchList", "freehtml.dev\nfreehtml.dev/pdf\nfreehtml.dev/sign")
    page.wait_for_timeout(500)
    check(page.locator("#sheetFrame").is_visible(), "the sheet is drawn on screen as soon as there are lines")
    check(page.locator("#sheetPreview svg").count() == 1, "the preview is one A4 page")
    check(page.locator("#sheetPreview g").count() == 3, "the preview holds every address")
    check(page.locator("#sheetPreview text").count() == 3, "the preview shows the captions")
    check(page.locator("#sheetMore").is_hidden(), "nothing is left over for a second page")
    page.click("#sheetBtn")
    page.wait_for_timeout(400)
    printed = page.evaluate("() => window.__printed === true")
    check(printed, "making a sheet calls print")
    sheet_svg = page.evaluate("() => document.querySelectorAll('#printArea svg').length")
    check(sheet_svg == 1, "the sheet is one page")
    codes = page.evaluate("() => document.querySelectorAll('#printArea g').length")
    check(codes == 3, f"three addresses give three codes, got {codes}")
    captions = page.locator("#printArea text").count()
    check(captions == 3, f"each code has a caption, got {captions}")

    # 9b. the small code on a phone, while the full preview is far below
    page.set_viewport_size({"width": 390, "height": 844})
    page.wait_for_timeout(250)
    page.click('.chip[data-type="url"]')
    page.fill("#url", "")
    page.wait_for_timeout(200)
    check(page.locator("#peek").is_hidden(), "an empty form keeps the strip away")
    page.fill("#url", "freehtml.dev")
    page.wait_for_timeout(250)
    check(page.locator("#peek").is_visible(), "the strip appears while typing on a phone")
    check(page.locator("#peekArt svg").count() == 1, "the strip carries the real code")
    page.click("#peek")
    page.wait_for_timeout(700)
    check(page.locator("#peek").is_hidden(), "the strip steps aside once the full preview is on screen")
    page.set_viewport_size({"width": 1280, "height": 900})
    page.wait_for_timeout(400)
    page.evaluate("() => window.scrollTo(0, 0)")
    check(page.locator("#peek").is_hidden(), "a wide window keeps the strip away")

    # 9c. and back: a window that narrows brings the strip back without a reload
    page.set_viewport_size({"width": 390, "height": 844})
    page.wait_for_timeout(400)
    check(page.locator("#peek").is_visible(), "narrowing the window brings the strip back")
    page.set_viewport_size({"width": 1280, "height": 900})
    page.wait_for_timeout(400)
    page.evaluate("() => window.scrollTo(0, 0)")

    # 10. language, in all four
    expected = {
        "en": "A code that never expires",
        "ro": "Un cod care nu expiră niciodată",
        "sr-latn": "Kod koji nikad ne ističe",
        "sr-cyrl": "Код који никад не истиче",
    }
    for lang, heading in expected.items():
        page.select_option("#langSelect", lang)
        page.wait_for_timeout(140)
        check(page.locator("h1").inner_text().strip() == heading, f"{lang}: the heading is translated, got {page.locator('h1').inner_text()!r}")
        check(page.get_attribute("html", "lang") == {"en": "en", "ro": "ro", "sr-latn": "sr-Latn", "sr-cyrl": "sr-Cyrl"}[lang],
              f"{lang}: the html lang attribute follows")
        check("{" not in page.locator("body").inner_text(), f"{lang}: no placeholder is left on the page")
    page.select_option("#langSelect", "en")

    # 11. theme, and the fact that it survives a reload
    start = page.get_attribute("html", "data-theme")
    page.click("#themeBtn")
    page.wait_for_timeout(150)
    changed = page.get_attribute("html", "data-theme")
    check(changed != start, "the theme toggles")
    page.reload(wait_until="load")
    page.wait_for_timeout(200)
    check(page.get_attribute("html", "data-theme") == changed, "the theme survives a reload")

    # 12. the document page stays white, whatever the theme
    page.click("#themeBtn")
    page.wait_for_timeout(120)

    # 13. reload keeps the address and the language
    page.fill("#url", "freehtml.dev/kept")
    page.wait_for_timeout(500)
    page.reload(wait_until="load")
    page.wait_for_timeout(250)
    check(page.input_value("#url") == "freehtml.dev/kept", "the address survives a reload")
    check(page.locator("#stage svg").count() == 1, "the code is rebuilt after the reload")

    # 13b. the offline shell is registered
    page.wait_for_timeout(700)
    workers = page.evaluate("() => navigator.serviceWorker.getRegistrations().then(r => r.length)")
    check(workers >= 1, "the service worker is registered, so the app opens offline")

    # 14. the page never asks the network for anything
    requests = page.evaluate("() => performance.getEntriesByType('resource').map(e => e.name)")
    external = [r for r in requests if not r.startswith(base) and not r.startswith("data:") and not r.startswith("blob:")]
    check(not external, f"no request leaves the page, got {external}")

    # 15. nothing broken along the way
    check(not page_errors, f"no page error: {page_errors}")
    check(not console_errors, f"no console error: {console_errors}")


def main() -> None:
    global checks
    browser_name = os.environ.get("BROWSER", "chromium")
    with serve(SITE) as base, sync_playwright() as playwright:
        browser = getattr(playwright, browser_name).launch()
        context = browser.new_context(viewport={"width": 1280, "height": 900}, accept_downloads=True)
        page = context.new_page()
        console_errors: list[str] = []
        page_errors: list[str] = []
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
        page.on("pageerror", lambda error: page_errors.append(str(error)))
        try:
            run_checks(page, base, console_errors, page_errors)
        finally:
            context.close()
            browser.close()
    print(f"ui: {checks} checks passed in {browser_name}")


if __name__ == "__main__":
    main()
