#!/usr/bin/env python3
# Photo Sheet · build tests
# SPDX-License-Identifier: Apache-2.0
"""Checks the generated index.html against the TekiDeki rules.

    python3 tests/build_test.py
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import build as builder  # noqa: E402

checks = 0


def ok(condition: bool, message: str) -> None:
    global checks
    checks += 1
    if not condition:
        raise AssertionError(message)


def eq(actual, expected, message: str) -> None:
    global checks
    checks += 1
    if actual != expected:
        raise AssertionError(f"{message} (got {actual!r}, wanted {expected!r})")


html = (ROOT / "index.html").read_text(encoding="utf-8")
locales = json.loads((ROOT / "src" / "i18n" / "locales.json").read_text(encoding="utf-8"))

# ---------------------------------------------------------------- the document

ok(html.startswith("<!DOCTYPE html>"), "index.html starts with the doctype")
ok(html.rstrip().endswith("</html>"), "index.html ends with the closing html tag")
eq(html.count("<html "), 1, "one html element")
version_on_disk = (ROOT / "VERSION").read_text(encoding="utf-8").strip()
ok(f'<html lang="en" data-version="{version_on_disk}">' in html, "the page ships in English with the current version stamped")
ok(html.count("<style") == 2, "two style blocks: the page size rule and the app")
ok(html.count("<script") == 4, "four script openings: structured data plus the three app scripts")
ok(html.count("</script>") == 4, "four closing script tags")
ok(html.count("<script>") == 3, "three plain inline scripts")
ok('<script type="application/ld+json">' in html, "structured data is present")
ok('"@type":"WebApplication"' in html, "structured data describes a web app")

# no local or remote assets: the file is the whole app
ok('<link rel="stylesheet"' not in html, "no stylesheet link left")
ok(not re.search(r'<script src=', html), "no script src left")
ok('href="styles.css"' not in html, "no reference to styles.css")
ok(not re.search(r'(?:src|href)="https?://(?!tekideki\.github\.io|www\.apache\.org|schema\.org|paypal\.me|github\.com)', html),
   "no third party asset is referenced")
ok("fonts.googleapis" not in html and "cdn." not in html.replace("cdn.jsdelivr", ""), "no CDN or web font")

# ----------------------------------------------------------------- character set

for char, name in (("\u2014", "em dash"), ("\u2013", "en dash"), ("\ufeff", "byte order mark"), ("\ufffd", "replacement character")):
    ok(char not in html, f"index.html has no {name}")
ok("&nbsp;" not in html, "no non breaking space entity")

# ------------------------------------------------------------------- languages

for locale in ("en", "ro", "sr-latn", "sr-cyrl"):
    ok(f'<option value="{locale}">' in html, f"the selector lists {locale}")
ok(html.count("<option value=") == 4, "exactly four languages are offered")

for banned in ("de", "fr", "it", "es", "pt", "nl"):
    ok(f'<option value="{banned}">' not in html, f"no {banned} option")

payload = re.search(r"window\.TD_LOCALES = \{(.*)\n\};", html, re.S)
ok(payload is not None, "the locale payload is embedded")
for locale in ("en", "ro", "sr-latn", "sr-cyrl"):
    ok(f'  "{locale}":' in html, f"the payload carries {locale}")

keys = set(locales["en"])
eq(len(keys), 117, "the English locale has 117 keys")
for locale in ("ro", "sr-latn"):
    eq(set(locales[locale]), keys, f"{locale} has the same keys as English")

# Serbian Cyrillic must be Cyrillic everywhere, with the agreed exceptions
cyr = builder.transliterate
eq(cyr("Photo Sheet"), "Photo Sheet", "the product name stays Latin")
eq(cyr("35 x 45 mm"), "35 x 45 мм", "the size keeps the x and converts the unit")
eq(cyr("Poništi"), "Поништи", "a word with a caron round trips")
eq(cyr("ljubav"), "љубав", "the lj digraph is one letter")
eq(cyr("njiva"), "њива", "the nj digraph is one letter")
eq(cyr("džep"), "џеп", "the dž digraph is one letter")
eq(cyr("Šđčćž"), "Шђчћж", "every special letter maps")
eq(cyr("{count} fotografija"), "{count} фотографија", "placeholders survive")
eq(cyr("localStorage"), "localStorage", "the storage key stays Latin")
eq(cyr("300 dpi"), "300 dpi", "dpi is a kept term")

for key in sorted(locales["sr-latn"]):
    value = cyr(locales["sr-latn"][key])
    leftover = builder.leftovers(value)
    ok(not leftover, f"sr-cyrl.{key} is fully Cyrillic (left {sorted(leftover)})")
    ok(value.strip(), f"sr-cyrl.{key} is not empty")

# every generated locale value is non empty, dash free and Cyrillic where it must be
generated = builder.load_locales()
for locale in ("en", "ro", "sr-latn", "sr-cyrl"):
    for key, value in generated[locale].items():
        ok(isinstance(value, str) and value.strip(), f"{locale}.{key} is a non empty string")
        ok("\u2014" not in value and "\u2013" not in value, f"{locale}.{key} has no dash")
for key, value in generated["sr-cyrl"].items():
    ok(not builder.leftovers(value), f"sr-cyrl.{key} has no stray Latin letters")

# ------------------------------------------------------------------ the shell

ok("Photo Sheet" in html, "the app name appears")
ok('rel="manifest" href="manifest.json"' in html, "the manifest is linked")
ok('href="favicon.ico"' in html, "the favicon is linked")
ok('rel="apple-touch-icon"' in html, "the apple touch icon is linked")
ok('name="theme-color"' in html, "the theme colour is set")
ok('property="og:image"' in html, "an og image is declared")
ok('name="twitter:card"' in html, "the twitter card is declared")
ok('rel="canonical" href="https://tekideki.github.io/Photo-Sheet/"' in html, "the canonical url is right")
ok('@page' in html, "the page size rule is inlined")
ok('id="pageStyle"' in html, "the page size rule can be updated per paper size")
ok('id="printArea"' in html, "the print area exists")
ok('id="printImage"' in html, "the print image exists")
ok('id="fileInput"' in html and 'type="file"' in html, "the file input exists")

# privacy: no network calls in the app code
for statement in ("fetch(", "XMLHttpRequest", "navigator.sendBeacon", "WebSocket"):
    ok(statement not in html, f"the page never calls {statement}")
ok("localStorage.setItem" in html, "settings are stored locally")
ok("serviceWorker.register" in html, "the service worker is registered")

# the engine is pure: no DOM in photo.js
photo = (ROOT / "src" / "photo.js").read_text(encoding="utf-8")
for call in ("document.", "window.", "localStorage", "navigator."):
    ok(call not in photo, f"photo.js does not touch {call}")

# ------------------------------------------------------------------ determinism

first = builder.build()
second = builder.build()
eq(first, second, "two builds in a row are byte identical")
eq(first, html, "the committed index.html matches the sources")
ok("2026" in html, "the copyright year is present")
ok(re.search(r"data-version=\"\d+\"", html) is not None, "the version is stamped")

# the built file is valid enough to parse: no stray template marker
ok("<script src=" not in html, "no unprocessed script source")
ok("{{" not in html, "no template braces survive")

# ------------------------------------------------------------------ the repo

for name in ("README.md", "LICENSE", "NOTICE", ".nojekyll", "sw.js", "manifest.json",
             "favicon.ico", "apple-touch-icon.png", "VERSION"):
    ok((ROOT / name).exists(), f"{name} is committed")

funding = (ROOT / ".github" / "FUNDING.yml").read_text(encoding="utf-8")
eq(funding.strip(), "custom: ['https://paypal.me/TekiDeki']", "the funding file is exactly as the playbook says")

manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
ok(manifest.get("name") == "Photo Sheet", "the manifest names the app")
ok(len(manifest.get("icons", [])) >= 2, "the manifest has icons")
ok(manifest.get("start_url"), "the manifest has a start url")

sw = (ROOT / "sw.js").read_text(encoding="utf-8")
version = (ROOT / "VERSION").read_text(encoding="utf-8").strip()
ok(f"'{version}'" in sw, "the service worker carries the current version")
ok("CACHE" in sw, "the service worker has a cache name")

# screenshots required by the playbook
shots = ROOT / "screenshots"
ok((shots / "desktop.png").exists(), "the desktop screenshot exists")
ok((shots / "og.png").exists(), "the og image exists")

print(f"build_test.py · {checks}/{checks} checks passed")
