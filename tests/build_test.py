#!/usr/bin/env python3
# QR Generator · build tests
# SPDX-License-Identifier: Apache-2.0
"""Checks the generated QR Generator page against the TekiDeki rules.

    python3 tests/build_test.py
"""
from __future__ import annotations

import json
import re
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
version = (ROOT / "VERSION").read_text(encoding="utf-8").strip()

# ---------------------------------------------------------------- the document

ok(html.startswith("<!DOCTYPE html>"), "index.html starts with the doctype")
ok(html.rstrip().endswith("</html>"), "index.html ends with the closing html tag")
eq(html.count("<html "), 1, "one html element")
ok(f'<html lang="en" data-version="{version}">' in html, "English shell with the current version")
eq(html.count("<style"), 4, "app, small-screen, touch-target and install styles")
eq(html.count("<script"), 7, "structured data plus six inline scripts")
eq(html.count("</script>"), 7, "seven closing script tags")
eq(html.count("<script>"), 6, "six plain inline scripts")
ok('<script type="application/ld+json">' in html, "structured data is present")
ok('"@type":"WebApplication"' in html, "structured data describes a web app")
ok(f"QR Generator {version} · single file build" in html, "the build comment carries the version")

# The generated file is the whole application, not a page with missing assets.
ok('<link rel="stylesheet"' not in html, "no stylesheet link remains")
ok(not re.search(r"<script src=", html), "no script src remains")
ok('href="styles.css"' not in html, "no reference to styles.css remains")
ok(not re.search(r'(?:src|href)="https?://(?!tekideki\.github\.io|www\.apache\.org|schema\.org|paypal\.me|github\.com)', html),
   "no third-party asset is referenced")
ok("fonts.googleapis" not in html and "cdn.jsdelivr" not in html, "no CDN or web font")
for marker in ('src/styles.css', 'src/qr.js', 'src/payload.js', 'src/app.js'):
    ok(marker not in html, f"no unprocessed reference to {marker}")

# ----------------------------------------------------------------- characters

for char, name in (("\u2014", "em dash"), ("\u2013", "en dash"), ("\ufeff", "byte order mark"), ("\ufffd", "replacement character")):
    ok(char not in html, f"index.html has no {name}")
ok("&nbsp;" not in html, "no non-breaking-space entity")

# ------------------------------------------------------------------- languages

lang_match = re.search(r'<select id="langSelect".*?</select>', html, re.S)
ok(lang_match is not None, "the language selector exists")
lang_block = lang_match.group(0) if lang_match else ""
eq(lang_block.count("<option value="), 4, "exactly four languages are offered")
for locale in builder.ALL_LOCALES:
    ok(f'<option value="{locale}">' in lang_block, f"the selector lists {locale}")
    ok(f'  "{locale}":' in html, f"the embedded locale payload carries {locale}")
for banned in ("de", "fr", "it", "es", "pt", "nl"):
    ok(f'<option value="{banned}">' not in lang_block, f"no {banned} option")

keys = set(locales["en"])
eq(len(keys), 109, "the English locale has 109 keys")
for locale in ("ro", "sr-latn"):
    eq(set(locales[locale]), keys, f"{locale} has the same keys as English")

cyr = builder.transliterate
eq(cyr("QR Generator"), "QR Generator", "the product name stays Latin")
eq(cyr("WiFi, SVG, PNG, vCard, URL"), "WiFi, SVG, PNG, vCard, URL", "technical terms stay Latin")
eq(cyr("35 x 45 mm"), "35 x 45 мм", "the size keeps x and converts the unit")
eq(cyr("Poništi"), "Поништи", "a word with a caron round trips")
eq(cyr("ljubav"), "љубав", "the lj digraph is one letter")
eq(cyr("njiva"), "њива", "the nj digraph is one letter")
eq(cyr("džep"), "џеп", "the dž digraph is one letter")
eq(cyr("Šđčćž"), "Шђчћж", "every special letter maps")
eq(cyr("{count} fotografija"), "{count} фотографија", "placeholders survive")
eq(cyr("localStorage"), "localStorage", "the storage key stays Latin")

generated = builder.load_locales()
for locale in builder.ALL_LOCALES:
    eq(set(generated[locale]), keys, f"generated {locale} has the complete key set")
    for key, value in generated[locale].items():
        ok(isinstance(value, str) and value.strip() and "\u2014" not in value and "\u2013" not in value,
           f"{locale}.{key} is non-empty and dash-free")
for key in sorted(keys):
    value = cyr(locales["sr-latn"][key])
    eq(value, generated["sr-cyrl"][key], f"sr-cyrl.{key} matches the transliteration")
    ok(not builder.leftovers(value), f"sr-cyrl.{key} has no stray Latin letters")

# ------------------------------------------------------------------ the shell

ok("QR Generator" in html, "the app name appears")
ok('rel="manifest" href="manifest.json"' in html, "the manifest is linked")
ok('href="favicon.ico"' in html, "the favicon is linked")
ok('rel="apple-touch-icon"' in html, "the apple touch icon is linked")
ok('name="theme-color"' in html, "the theme colour is set")
ok('property="og:image"' in html, "an og image is declared")
ok('name="twitter:card"' in html, "the twitter card is declared")
ok('rel="canonical" href="https://tekideki.github.io/QR-Generator/"' in html, "the canonical URL is right")
for element_id in ("stage", "url", "svgBtn", "pngBtn", "batchList", "sheetPreview", "printArea",
                   "logoInput", "logoRemove", "langSelect", "themeBtn", "peek", "td-install-button"):
    ok(f'id="{element_id}"' in html, f"#{element_id} exists")
for payload_type in ("url", "text", "wifi", "contact", "email", "phone", "sms"):
    ok(f'data-type="{payload_type}"' in html, f"the {payload_type} payload is offered")
for size in ("512", "1024", "2048"):
    ok(f'data-value="{size}"' in html, f"the {size} px PNG option exists")
ok('@page' in html and 'a4Sheet' in html, "the printable A4 sheet is included")
ok('id="ecran-mic"' in html and 'id="tinte-44"' in html, "the shared mobile rules are inlined")
ok(':not(.key):not([hidden])' in html, "touch-target display rules exclude hidden controls")
ok('[hidden] { display: none !important; }' in html, "hidden elements stay hidden")
ok('id="td-install-section"' in html and '#td-install-section[hidden]' in html, "the install component is inline and hideable")

# Privacy and the pure payload engine.
for statement in ("fetch(", "XMLHttpRequest", "navigator.sendBeacon", "WebSocket"):
    ok(statement not in html, f"the page never calls {statement}")
ok("localStorage.setItem" in html, "settings are stored locally")
ok("serviceWorker.register" in html, "the service worker is registered")
payload = (ROOT / "src" / "payload.js").read_text(encoding="utf-8")
for call in ("document.", "window.", "localStorage", "navigator.", "fetch("):
    ok(call not in payload, f"payload.js does not touch {call}")

# ---------------------------------------------------------------- determinism

first = builder.build()
second = builder.build()
eq(first, second, "two builds in a row are byte-identical")
eq(first, html, "the committed index.html matches the sources")
ok("2026" in html, "the copyright year is present")
ok("{{" not in html, "no template braces survive")

# -------------------------------------------------------------------- the repo

for name in ("README.md", "LICENSE", "NOTICE", ".nojekyll", "sw.js", "manifest.json",
             "favicon.ico", "apple-touch-icon.png", "VERSION", "src/install.html"):
    ok((ROOT / name).exists(), f"{name} is committed")
for name in ("desktop.png", "phone.png", "dark.png", "og.png"):
    ok((ROOT / "screenshots" / name).exists(), f"screenshots/{name} is committed")

funding = (ROOT / ".github" / "FUNDING.yml").read_text(encoding="utf-8")
eq(funding.strip(), "custom: ['https://paypal.me/TekiDeki']", "the funding file is unchanged")
manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
eq(manifest.get("name"), "QR Generator", "the manifest names the app")
eq(manifest.get("start_url"), "./", "the manifest uses a relative start URL")
eq(manifest.get("scope"), "./", "the manifest uses a relative scope")
eq(manifest.get("display"), "standalone", "the manifest supports standalone display")
ok(len(manifest.get("icons", [])) == 4, "the manifest has four icons")
for icon in manifest["icons"]:
    ok((ROOT / icon["src"]).is_file(), f"manifest icon {icon['src']} exists")

sw = (ROOT / "sw.js").read_text(encoding="utf-8")
sw_version = re.search(r"var VERSION = '(\d+)';", sw)
ok(sw_version is not None, "the service worker has a numeric cache version")
ok(sw_version is not None and int(sw_version.group(1)) >= 2, "the cache is bumped for the mobile hidden fix")
ok("var CACHE = 'qr-generator-v' + VERSION;" in sw, "the cache name follows the app")
for asset in ("./index.html", "./manifest.json", "./favicon.ico", "./apple-touch-icon.png",
              "./icons/icon.svg", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-512-maskable.png"):
    ok(f"'{asset}'" in sw, f"the offline shell caches {asset}")

print(f"build_test.py · {checks}/{checks} checks passed")
