/* QR Generator · TekiDeki - interface
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2026 Kristian Mario Miskovic (TekiDeki)
 *
 * No framework, no network, no cookies. Everything typed here stays in this
 * tab: the payload is built from the fields, the code is drawn from that
 * string, and only the settings are kept in localStorage.
 */
(function () {
  'use strict';

  var payloadApi = window.QRPayload;
  var LOCALES = window.TD_LOCALES || {};
  var LANGS = ['en', 'ro', 'sr-latn', 'sr-cyrl'];
  var HTML_LANG = { en: 'en', ro: 'ro', 'sr-latn': 'sr-Latn', 'sr-cyrl': 'sr-Cyrl' };
  var STORAGE_KEY = 'qr-generator.v1';
  var THEME_KEY = 'qr-generator.theme';
  var MARGIN = 4;          /* quiet zone, in modules, as the specification asks */
  var MAX_HISTORY = 40;

  var state = {
    language: 'en',
    theme: 'light',
    type: 'url',
    url: '',
    text: '',
    ssid: '',
    password: '',
    security: 'WPA',
    hidden: false,
    firstName: '',
    lastName: '',
    org: '',
    contactPhone: '',
    contactEmail: '',
    website: '',
    mailTo: '',
    subject: '',
    mailBody: '',
    phoneNumber: '',
    smsNumber: '',
    smsText: '',
    fg: '#0a1d23',
    bg: '#ffffff',
    shape: 'square',
    eye: 'square',
    ecc: 'M',
    png: 1024,
    logo: '',
    logoName: '',
    columns: '3',
    sheetCaption: true,
    history: []
  };

  var el = {};
  var lastQr = null;
  var saveTimer = null;
  var pushTimer = null;
  var lastSaved = '{}';
  var lastPeek = false;

  /* -------------------------------------------------------------- utilities */

  function $(id) { return document.getElementById(id); }

  function t(key, vars) {
    var pack = LOCALES[state.language] || LOCALES.en || {};
    var text = pack[key];
    if (text === undefined) text = (LOCALES.en || {})[key];
    if (text === undefined) return key;
    if (vars) {
      Object.keys(vars).forEach(function (name) {
        text = text.split('{' + name + '}').join(String(vars[name]));
      });
    }
    return text;
  }

  function toast(message) {
    el.toast.textContent = message;
    el.toast.classList.add('on');
    clearTimeout(el.toastTimer);
    el.toastTimer = setTimeout(function () { el.toast.classList.remove('on'); }, 2200);
  }

  /* ------------------------------------------------------- theme and language */

  function paintTheme() {
    document.documentElement.setAttribute('data-theme', state.theme);
    el.themeBtn.setAttribute('aria-label', t('themeToggle'));
    el.themeBtn.title = t('themeToggle');
  }

  function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(THEME_KEY, state.theme); } catch (e) {}
    paintTheme();
    save();
  }

  function applyLang(lang) {
    if (LANGS.indexOf(lang) === -1) lang = 'en';
    state.language = lang;
    var pack = LOCALES[lang] || {};
    document.documentElement.setAttribute('lang', HTML_LANG[lang]);
    document.querySelectorAll('[data-i18n]').forEach(function (node) {
      var value = pack[node.getAttribute('data-i18n')];
      if (value !== undefined) node.textContent = value;
    });
    document.querySelectorAll('[data-i18n-title]').forEach(function (node) {
      var value = pack[node.getAttribute('data-i18n-title')];
      if (value !== undefined) { node.title = value; node.setAttribute('aria-label', value); }
    });
    document.querySelectorAll('[data-i18n-aria-label]').forEach(function (node) {
      var value = pack[node.getAttribute('data-i18n-aria-label')];
      if (value !== undefined) node.setAttribute('aria-label', value);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function (node) {
      var value = pack[node.getAttribute('data-i18n-placeholder')];
      if (value !== undefined) node.setAttribute('placeholder', value);
    });
    el.langSelect.value = lang;
    document.title = t('pageTitle');
    render();
  }

  /* ------------------------------------------------------------- persistence */

  function snapshot() {
    var copy = {};
    Object.keys(state).forEach(function (key) {
      if (key !== 'history') copy[key] = state[key];
    });
    return copy;
  }

  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot())); } catch (e) {}
    }, 220);
  }

  function load() {
    var raw = null;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) { return; }
    if (!raw) return;
    var data;
    try { data = JSON.parse(raw); } catch (e) { return; }
    if (!data || typeof data !== 'object') return;
    Object.keys(state).forEach(function (key) {
      if (key !== 'history' && Object.prototype.hasOwnProperty.call(data, key)) {
        var value = data[key];
        if (typeof value === typeof state[key]) state[key] = value;
      }
    });
  }

  /* ------------------------------------------------------------------ undo */

  /* Undo keeps the state as it was before each change. The change itself
   * happens first, so the previous copy is taken from lastSaved, which always
   * holds the state as the user last saw it. */
  function pushHistory() {
    clearTimeout(pushTimer);
    pushTimer = setTimeout(commit, 450);
  }

  function commit() {
    var now = snapshot();
    var text = JSON.stringify(now);
    if (text === lastSaved) return;
    state.history.push(JSON.parse(lastSaved));
    if (state.history.length > MAX_HISTORY) state.history.shift();
    lastSaved = text;
    paintUndo();
  }

  function undo() {
    flushHistory();
    if (!state.history.length) return;
    var previous = state.history.pop();
    Object.keys(previous).forEach(function (key) {
      if (key !== 'history') state[key] = previous[key];
    });
    lastSaved = JSON.stringify(snapshot());
    paintFields();
    paintControls();
    paintUndo();
    render();
    save();
  }

  function flushHistory() {
    clearTimeout(pushTimer);
    pushTimer = null;
  }

  function paintUndo() {
    el.undoBtn.disabled = state.history.length === 0;
  }

  /* ------------------------------------------------------------------ fields */

  var FIELD_MAP = {
    url: 'url',
    text: 'text',
    ssid: 'ssid',
    wifiPass: 'password',
    security: 'security',
    hiddenNet: 'hidden',
    firstName: 'firstName',
    lastName: 'lastName',
    org: 'org',
    contactPhone: 'contactPhone',
    contactEmail: 'contactEmail',
    website: 'website',
    mailTo: 'mailTo',
    subject: 'subject',
    mailBody: 'mailBody',
    phoneNumber: 'phoneNumber',
    smsNumber: 'smsNumber',
    smsText: 'smsText'
  };

  function paintFields() {
    Object.keys(FIELD_MAP).forEach(function (id) {
      var node = $(id);
      var key = FIELD_MAP[id];
      if (!node) return;
      if (node.type === 'checkbox') node.checked = Boolean(state[key]);
      else node.value = state[key] == null ? '' : state[key];
    });
    document.querySelectorAll('[data-panel]').forEach(function (panel) {
      panel.hidden = panel.getAttribute('data-panel') !== state.type;
    });
    document.querySelectorAll('.chip[data-type]').forEach(function (chip) {
      chip.setAttribute('aria-pressed', String(chip.getAttribute('data-type') === state.type));
    });
  }

  function paintControls() {
    el.fgColor.value = state.fg;
    el.bgColor.value = state.bg;
    segSet(el.shapeSeg, state.shape);
    segSet(el.eyeSeg, state.eye);
    segSet(el.eccSeg, state.ecc);
    segSet(el.pngSeg, String(state.png));
    el.columns.value = state.columns;
    el.sheetCaption.checked = state.sheetCaption;
    if (state.logo) {
      el.logoThumb.src = state.logo;
      el.logoThumb.hidden = false;
      el.logoRemove.hidden = false;
    } else {
      el.logoThumb.hidden = true;
      el.logoRemove.hidden = true;
    }
  }

  function segSet(container, value) {
    if (!container) return;
    container.querySelectorAll('button[data-value]').forEach(function (button) {
      button.setAttribute('aria-pressed', String(button.getAttribute('data-value') === value));
    });
  }

  /* --------------------------------------------------------------- the code */

  function currentPayload() {
    return payloadApi.build(state);
  }

  function makeQr(text) {
    qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
    var code = qrcode(0, state.ecc);
    code.addData(text);
    code.make();
    return code;
  }

  function modulesOf(code) {
    var n = code.getModuleCount();
    var grid = [];
    for (var row = 0; row < n; row += 1) {
      var line = [];
      for (var col = 0; col < n; col += 1) line.push(code.isDark(row, col));
      grid.push(line);
    }
    return grid;
  }

  function inEye(row, col, n) {
    return (row < 7 && col < 7) || (row < 7 && col >= n - 7) || (row >= n - 7 && col < 7);
  }

  function round(value) { return Math.round(value * 1000) / 1000; }

  /* Every shape below is drawn in module units, so one builder serves the
   * preview, the SVG download and the canvas that becomes the PNG. */
  function svgBody(grid, options) {
    var n = grid.length;
    var total = n + MARGIN * 2;
    var fg = options.fg;
    var parts = [];
    var r, c;

    parts.push('<rect width="' + total + '" height="' + total + '" fill="' + options.bg + '"/>');

    for (r = 0; r < n; r += 1) {
      for (c = 0; c < n; c += 1) {
        if (!grid[r][c] || inEye(r, c, n)) continue;
        var x = c + MARGIN;
        var y = r + MARGIN;
        if (options.shape === 'dots') {
          parts.push('<circle cx="' + round(x + 0.5) + '" cy="' + round(y + 0.5) + '" r="0.46" fill="' + fg + '"/>');
        } else if (options.shape === 'rounded') {
          parts.push('<rect x="' + x + '" y="' + y + '" width="1" height="1" rx="0.3" fill="' + fg + '"/>');
        } else {
          parts.push('<rect x="' + x + '" y="' + y + '" width="1" height="1" fill="' + fg + '"/>');
        }
      }
    }

    var eyes = [[0, 0], [0, n - 7], [n - 7, 0]];
    eyes.forEach(function (spot) {
      var ex = spot[1] + MARGIN;
      var ey = spot[0] + MARGIN;
      if (options.eye === 'circle') {
        parts.push('<circle cx="' + round(ex + 3.5) + '" cy="' + round(ey + 3.5) + '" r="3" fill="none" stroke="' + fg + '" stroke-width="1"/>');
        parts.push('<circle cx="' + round(ex + 3.5) + '" cy="' + round(ey + 3.5) + '" r="1.5" fill="' + fg + '"/>');
      } else if (options.eye === 'rounded') {
        parts.push('<rect x="' + (ex + 0.5) + '" y="' + (ey + 0.5) + '" width="6" height="6" rx="2" fill="none" stroke="' + fg + '" stroke-width="1"/>');
        parts.push('<rect x="' + (ex + 2) + '" y="' + (ey + 2) + '" width="3" height="3" rx="1" fill="' + fg + '"/>');
      } else {
        parts.push('<rect x="' + (ex + 0.5) + '" y="' + (ey + 0.5) + '" width="6" height="6" fill="none" stroke="' + fg + '" stroke-width="1"/>');
        parts.push('<rect x="' + (ex + 2) + '" y="' + (ey + 2) + '" width="3" height="3" fill="' + fg + '"/>');
      }
    });

    if (options.logo && options.logoSize > 0) {
      var size = options.logoSize;
      var start = (total - size) / 2;
      parts.push('<rect x="' + round(start - 0.6) + '" y="' + round(start - 0.6) + '" width="' + round(size + 1.2) + '" height="' + round(size + 1.2) + '" rx="' + round(size * 0.16) + '" fill="' + options.bg + '"/>');
      parts.push('<image href="' + options.logo + '" x="' + round(start) + '" y="' + round(start) + '" width="' + round(size) + '" height="' + round(size) + '" preserveAspectRatio="xMidYMid meet"/>');
    }

    return parts.join('');
  }

  function svgDocument(grid, options) {
    var total = grid.length + MARGIN * 2;
    var px = options.pixels || 1024;
    return '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ' +
      'width="' + px + '" height="' + px + '" viewBox="0 0 ' + total + ' ' + total + '" ' +
      'shape-rendering="crispEdges" role="img" aria-label="QR code">\n' +
      svgBody(grid, options) + '\n</svg>\n';
  }

  function logoSizeFor(n) {
    /* About 18 percent of the width, which the higher tolerance levels can
     * afford to lose and the low one cannot. */
    return state.logo ? n * 0.18 : 0;
  }

  function contrastRatio(a, b) {
    function channel(hex) {
      var value = parseInt(hex.slice(1), 16);
      var parts = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map(function (v) {
        var s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * parts[0] + 0.7152 * parts[1] + 0.0722 * parts[2];
    }
    var l1 = channel(a);
    var l2 = channel(b);
    var light = Math.max(l1, l2);
    var dark = Math.min(l1, l2);
    return (light + 0.05) / (dark + 0.05);
  }

  function render() {
    var text = currentPayload();
    var stage = el.stage;
    el.payloadText.textContent = text ? (text.length > 160 ? text.slice(0, 160) + ' ...' : text) : '';

    if (!text) {
      stage.innerHTML = '<p class="empty">' + escapeHtml(t('emptyPreview')) + '</p>';
      el.meta.innerHTML = '';
      lastQr = null;
      if (el.peek) el.peek.hidden = true;
      lastPeek = false;
      return;
    }

    var code;
    try {
      code = makeQr(text);
    } catch (error) {
      stage.innerHTML = '<p class="empty">' + escapeHtml(t('tooLong')) + '</p>';
      el.meta.innerHTML = '<span class="pill bad">' + escapeHtml(t('tooLongPill')) + '</span>';
      lastQr = null;
      if (el.peek) el.peek.hidden = true;
      return;
    }

    var grid = modulesOf(code);
    var n = grid.length;
    var options = {
      fg: state.fg,
      bg: state.bg,
      shape: state.shape,
      eye: state.eye,
      logo: state.logo,
      logoSize: logoSizeFor(n),
      pixels: state.png
    };
    lastQr = { grid: grid, options: options, text: text };

    var total = n + MARGIN * 2;
    stage.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + total + ' ' + total +
      '" role="img" aria-label="QR code" style="width:100%;height:auto;max-width:340px">' +
      svgBody(grid, options) + '</svg>';

    paintMeta(text, n);
    paintPeek(grid, total, options, text);
  }

  function paintMeta(text, n) {
    var bytes = payloadApi.byteLength(text);
    var ratio = contrastRatio(state.fg, state.bg);
    var pills = [];
    pills.push('<span class="pill">' + escapeHtml(t('metaChars', { n: text.length })) + '</span>');
    pills.push('<span class="pill">' + escapeHtml(t('metaModules', { n: n })) + '</span>');
    pills.push('<span class="pill">' + escapeHtml(t('metaEcc', { e: state.ecc })) + '</span>');
    pills.push(ratio >= 4
      ? '<span class="pill ok">' + escapeHtml(t('contrastOk')) + '</span>'
      : '<span class="pill warn">' + escapeHtml(t('contrastWarn')) + '</span>');
    if (state.logo && state.ecc !== 'Q' && state.ecc !== 'H') {
      pills.push('<span class="pill warn">' + escapeHtml(t('logoWarn')) + '</span>');
    }
    if (bytes > 1200) {
      pills.push('<span class="pill warn">' + escapeHtml(t('denseWarn')) + '</span>');
    }
    el.meta.innerHTML = pills.join('');
  }

  /* The small code that rides along the bottom of a phone screen. It is the
   * same matrix as the big one, drawn at 52 px, and it goes away when the
   * full preview is on screen. */
  function paintPeek(grid, total, options, text) {
    if (!el.peek) return;
    lastPeek = true;
    el.peekArt.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + total + ' ' + total + '" aria-hidden="true">' +
      svgBody(grid, options) + '</svg>';
    var shown = text.length > 46 ? text.slice(0, 46) + ' ...' : text;
    el.peekText.textContent = shown;
    el.peek.hidden = previewInView();
  }

  function previewInView() {
    if (!el.previewCard || !('IntersectionObserver' in window)) return false;
    var box = el.previewCard.getBoundingClientRect();
    return box.top < window.innerHeight - 40 && box.bottom > 0;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  /* --------------------------------------------------------------- downloads */

  function download(blob, name) {
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function fileBase() {
    var label = payloadApi.label(state) || 'qr';
    return 'qr-' + label.replace(/[^a-z0-9.-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 48);
  }

  function exportSvg() {
    if (!lastQr) { toast(t('emptyPreview')); return; }
    var svg = svgDocument(lastQr.grid, lastQr.options);
    download(new Blob([svg], { type: 'image/svg+xml' }), fileBase() + '.svg');
    toast(t('toastSvg'));
  }

  function drawToCanvas(ctx, grid, options, scale) {
    var n = grid.length;
    var total = n + MARGIN * 2;
    ctx.fillStyle = options.bg;
    ctx.fillRect(0, 0, total * scale, total * scale);
    ctx.fillStyle = options.fg;
    var r, c;
    for (r = 0; r < n; r += 1) {
      for (c = 0; c < n; c += 1) {
        if (!grid[r][c] || inEye(r, c, n)) continue;
        var x = (c + MARGIN) * scale;
        var y = (r + MARGIN) * scale;
        if (options.shape === 'dots') {
          ctx.beginPath();
          ctx.arc(x + scale / 2, y + scale / 2, scale * 0.46, 0, Math.PI * 2);
          ctx.fill();
        } else if (options.shape === 'rounded') {
          roundRect(ctx, x, y, scale, scale, scale * 0.3);
        } else {
          ctx.fillRect(x, y, scale, scale);
        }
      }
    }

    var eyes = [[0, 0], [0, n - 7], [n - 7, 0]];
    ctx.strokeStyle = options.fg;
    ctx.lineWidth = scale;
    eyes.forEach(function (spot) {
      var ex = (spot[1] + MARGIN) * scale;
      var ey = (spot[0] + MARGIN) * scale;
      if (options.eye === 'circle') {
        ctx.beginPath();
        ctx.arc(ex + 3.5 * scale, ey + 3.5 * scale, 3 * scale, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(ex + 3.5 * scale, ey + 3.5 * scale, 1.5 * scale, 0, Math.PI * 2);
        ctx.fill();
      } else if (options.eye === 'rounded') {
        roundRect(ctx, ex + 0.5 * scale, ey + 0.5 * scale, 6 * scale, 6 * scale, 2 * scale, true);
        roundRect(ctx, ex + 2 * scale, ey + 2 * scale, 3 * scale, 3 * scale, 1 * scale);
      } else {
        ctx.strokeRect(ex + 0.5 * scale, ey + 0.5 * scale, 6 * scale, 6 * scale);
        ctx.fillRect(ex + 2 * scale, ey + 2 * scale, 3 * scale, 3 * scale);
      }
    });
  }

  function roundRect(ctx, x, y, w, h, radius, strokeOnly) {
    var r = Math.min(radius, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    if (strokeOnly) ctx.stroke(); else ctx.fill();
  }

  function exportPng() {
    if (!lastQr) { toast(t('emptyPreview')); return; }
    var grid = lastQr.grid;
    var options = lastQr.options;
    var total = grid.length + MARGIN * 2;
    var size = state.png;
    var scale = size / total;
    var canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    var ctx = canvas.getContext('2d');
    if (!ctx) { toast(t('noCanvas')); return; }

    if (options.logo && options.logoSize > 0) {
      var image = new Image();
      image.onload = function () {
        drawToCanvas(ctx, grid, options, scale);
        var logoPx = options.logoSize * scale;
        var pad = 0.6 * scale;
        var start = (size - logoPx) / 2;
        ctx.fillStyle = options.bg;
        roundRect(ctx, start - pad, start - pad, logoPx + pad * 2, logoPx + pad * 2, logoPx * 0.16);
        ctx.drawImage(image, start, start, logoPx, logoPx);
        finishPng(canvas);
      };
      image.onerror = function () {
        drawToCanvas(ctx, grid, options, scale);
        finishPng(canvas);
      };
      image.src = options.logo;
      return;
    }

    drawToCanvas(ctx, grid, options, scale);
    finishPng(canvas);
  }

  function finishPng(canvas) {
    if (canvas.toBlob) {
      canvas.toBlob(function (blob) {
        if (!blob) { toast(t('noCanvas')); return; }
        download(blob, fileBase() + '-' + state.png + '.png');
        toast(t('toastPng'));
      }, 'image/png');
    } else {
      var link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = fileBase() + '-' + state.png + '.png';
      link.click();
      toast(t('toastPng'));
    }
  }

  /* ------------------------------------------------------------- print sheet */

  function captionFor(stateFor) {
    return payloadApi.label(stateFor) || '';
  }

  function a4Sheet(lines, columns, withCaption) {
    var pageW = 210;
    var pageH = 297;
    var margin = 12;
    var gap = 6;
    var cellW = (pageW - margin * 2 - gap * (columns - 1)) / columns;
    var rowsPerPage = 1;
    var codeSize = Math.min(cellW - 4, 46);
    var cellH = codeSize + (withCaption ? 12 : 6);
    rowsPerPage = Math.max(1, Math.floor((pageH - margin * 2) / (cellH + gap)));

    var parts = [];
    parts.push('<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="297mm" viewBox="0 0 210 297">');
    parts.push('<rect width="210" height="297" fill="#ffffff"/>');

    var index = 0;
    for (var slot = 0; slot < lines.length; slot += 1) {
      var row = Math.floor(slot / columns);
      var col = slot % columns;
      if (row >= rowsPerPage) break;
      var item = lines[slot];
      var code;
      try {
        code = makeQr(item.value);
      } catch (error) {
        continue;
      }
      var grid = modulesOf(code);
      var total = grid.length + MARGIN * 2;
      var x = margin + col * (cellW + gap);
      var y = margin + row * (cellH + gap);
      var scale = codeSize / total;
      parts.push('<g transform="translate(' + round(x + (cellW - codeSize) / 2) + ',' + round(y) + ') scale(' + round(scale) + ')">');
      parts.push(svgBody(grid, { fg: state.fg, bg: state.bg, shape: state.shape, eye: state.eye, logo: '', logoSize: 0 }));
      parts.push('</g>');
      if (withCaption) {
        var label = (item.caption || '').slice(0, 34);
        parts.push('<text x="' + round(x + cellW / 2) + '" y="' + round(y + codeSize + 5.5) +
          '" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="3.4" fill="#0a1d23">' +
          escapeXml(label) + '</text>');
      }
      index += 1;
    }
    parts.push('</svg>');
    return parts.join('\n');
  }

  function escapeXml(value) {
    return String(value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[ch];
    });
  }

  function printOne() {
    if (!lastQr) { toast(t('emptyPreview')); return; }
    var lines = [{ value: lastQr.text, caption: captionFor(state) }];
    el.printArea.innerHTML = a4Sheet(lines, 1, false);
    window.print();
  }

  /* The sheet, on screen, before the printer sees it. Showing the page is the
   * honest version of a print button: what you see is what comes out. */
  function sheetItems() {
    var items = [];
    String(el.batchList.value).split(/\r?\n/).forEach(function (line) {
      var value = line.trim();
      if (!value) return;
      items.push({ value: payloadApi.normalizeUrl(value), caption: value });
    });
    return items;
  }

  function paintSheetPreview() {
    if (!el.sheetFrame) return;
    var items = sheetItems();
    if (!items.length) {
      el.sheetFrame.hidden = true;
      el.sheetPreview.innerHTML = '';
      return;
    }
    var columns = parseInt(state.columns, 10) || 3;
    var perPage = columns * 8;
    el.sheetFrame.hidden = false;
    el.sheetPreview.innerHTML = a4Sheet(items.slice(0, perPage), columns, state.sheetCaption);
    if (items.length > perPage) {
      el.sheetMore.hidden = false;
      el.sheetMore.textContent = t('sheetMore', { n: perPage });
    } else {
      el.sheetMore.hidden = true;
      el.sheetMore.textContent = '';
    }
  }

  function makeSheet() {
    var items = sheetItems();
    if (!items.length) { toast(t('sheetEmpty')); return; }
    var columns = parseInt(state.columns, 10) || 3;
    el.printArea.innerHTML = a4Sheet(items.slice(0, columns * 8), columns, state.sheetCaption);
    toast(t('toastSheet'));
    window.print();
  }

  /* ------------------------------------------------------------------ wiring */

  function bindFields() {
    Object.keys(FIELD_MAP).forEach(function (id) {
      var node = $(id);
      if (!node) return;
      var key = FIELD_MAP[id];
      var eventName = node.type === 'checkbox' || node.tagName === 'SELECT' ? 'change' : 'input';
      node.addEventListener(eventName, function () {
        if (node.type === 'checkbox') state[key] = node.checked;
        else state[key] = node.value;
        pushHistory();
        save();
        render();
      });
      node.addEventListener('focus', pushHistory);
    });
  }

  function bindSegs() {
    document.querySelectorAll('.chip[data-type]').forEach(function (chip) {
      chip.addEventListener('click', function () {
        if (state.type === chip.getAttribute('data-type')) return;
        pushHistory();
        state.type = chip.getAttribute('data-type');
        paintFields();
        save();
        render();
        var first = document.querySelector('[data-panel="' + state.type + '"] input, [data-panel="' + state.type + '"] textarea');
        if (first) first.focus({ preventScroll: true });
      });
    });

    [['shapeSeg', 'shape'], ['eyeSeg', 'eye'], ['eccSeg', 'ecc'], ['pngSeg', 'png']].forEach(function (pair) {
      var container = el[pair[0]];
      container.querySelectorAll('button[data-value]').forEach(function (button) {
        button.addEventListener('click', function () {
          var value = button.getAttribute('data-value');
          if (pair[1] === 'png') value = parseInt(value, 10);
          if (state[pair[1]] === value) return;
          pushHistory();
          state[pair[1]] = value;
          paintControls();
          save();
          render();
        });
      });
    });

    el.columns.addEventListener('change', function () {
      state.columns = el.columns.value;
      save();
      paintSheetPreview();
    });
    el.sheetCaption.addEventListener('change', function () {
      state.sheetCaption = el.sheetCaption.checked;
      save();
      paintSheetPreview();
    });
    var sheetTimer = null;
    el.batchList.addEventListener('input', function () {
      clearTimeout(sheetTimer);
      sheetTimer = setTimeout(paintSheetPreview, 260);
    });
  }

  function bindPalette() {
    var presets = [
      ['#0a1d23', '#ffffff'],
      ['#0f6674', '#ffffff'],
      ['#b3261e', '#ffffff'],
      ['#1f7a5c', '#f4efe4'],
      ['#ffffff', '#0a1d23'],
      ['#f4efe4', '#061318']
    ];
    el.swatches.innerHTML = '';
    presets.forEach(function (pairs) {
      var dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'swatch';
      dot.style.background = 'linear-gradient(135deg, ' + pairs[0] + ' 50%, ' + pairs[1] + ' 50%)';
      dot.title = pairs[0] + ' / ' + pairs[1];
      dot.setAttribute('aria-label', pairs[0] + ' / ' + pairs[1]);
      dot.addEventListener('click', function () {
        pushHistory();
        state.fg = pairs[0];
        state.bg = pairs[1];
        paintControls();
        save();
        render();
      });
      el.swatches.appendChild(dot);
    });

    el.fgColor.addEventListener('input', function () {
      pushHistory();
      state.fg = el.fgColor.value;
      save();
      render();
    });
    el.bgColor.addEventListener('input', function () {
      pushHistory();
      state.bg = el.bgColor.value;
      save();
      render();
    });
  }

  function bindLogo() {
    el.logoPick.addEventListener('click', function () { el.logoInput.click(); });
    el.logoInput.addEventListener('change', function () {
      var file = el.logoInput.files && el.logoInput.files[0];
      if (!file) return;
      if (file.size > 1.5 * 1024 * 1024) { toast(t('logoTooBig')); return; }
      var reader = new FileReader();
      reader.onload = function () {
        pushHistory();
        state.logo = String(reader.result);
        state.logoName = file.name;
        paintControls();
        save();
        render();
      };
      reader.readAsDataURL(file);
      el.logoInput.value = '';
    });
    el.logoRemove.addEventListener('click', function () {
      pushHistory();
      state.logo = '';
      state.logoName = '';
      paintControls();
      save();
      render();
    });
  }

  function registerWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (!/^https?:$/.test(window.location.protocol)) return;
    try {
      navigator.serviceWorker.register('sw.js').catch(function () { /* offline is optional */ });
    } catch (error) { /* older browsers */ }
  }

  function init() {
    el = {
      toast: $('toast'),
      themeBtn: $('themeBtn'),
      langSelect: $('langSelect'),
      undoBtn: $('undoBtn'),
      stage: $('stage'),
      meta: $('meta'),
      payloadText: $('payloadText'),
      fgColor: $('fgColor'),
      bgColor: $('bgColor'),
      swatches: $('swatches'),
      shapeSeg: $('shapeSeg'),
      eyeSeg: $('eyeSeg'),
      eccSeg: $('eccSeg'),
      pngSeg: $('pngSeg'),
      columns: $('columns'),
      sheetCaption: $('sheetCaption'),
      logoInput: $('logoInput'),
      logoPick: $('logoPick'),
      logoRemove: $('logoRemove'),
      logoThumb: $('logoThumb'),
      batchList: $('batchList'),
      printArea: $('printArea'),
      peek: $('peek'),
      peekArt: $('peekArt'),
      peekText: $('peekText'),
      previewCard: document.querySelector('.preview-card'),
      sheetFrame: $('sheetFrame'),
      sheetPreview: $('sheetPreview'),
      sheetMore: $('sheetMore')
    };

    load();

    var storedTheme = null;
    try { storedTheme = localStorage.getItem(THEME_KEY); } catch (e) {}
    var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    state.theme = storedTheme || (document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : (prefersDark ? 'dark' : 'light'));

    var storedLang = null;
    try { storedLang = localStorage.getItem('qr-generator.lang'); } catch (e) {}
    var browserLang = (navigator.language || 'en').toLowerCase();
    var detected = 'en';
    if (browserLang.indexOf('ro') === 0) detected = 'ro';
    else if (browserLang.indexOf('sr') === 0) detected = browserLang.indexOf('cyrl') > -1 ? 'sr-cyrl' : 'sr-latn';
    state.language = storedLang && LANGS.indexOf(storedLang) > -1 ? storedLang : detected;

    paintTheme();
    el.themeBtn.addEventListener('click', toggleTheme);
    el.langSelect.addEventListener('change', function () {
      try { localStorage.setItem('qr-generator.lang', el.langSelect.value); } catch (e) {}
      applyLang(el.langSelect.value);
    });
    el.undoBtn.addEventListener('click', undo);

    $('svgBtn').addEventListener('click', exportSvg);
    $('pngBtn').addEventListener('click', exportPng);
    if (el.peek) {
      el.peek.addEventListener('click', function () {
        if (el.previewCard) el.previewCard.scrollIntoView({ block: 'center', behavior: 'smooth' });
      });
    }
    window.addEventListener('scroll', function () { if (el.peek && !el.peek.hidden) el.peek.hidden = previewInView(); }, { passive: true });
    // A window that changes width changes where the preview sits, so the strip
    // has to decide again whether it is needed.
    window.addEventListener('resize', function () {
      if (el.peek && lastPeek) el.peek.hidden = previewInView();
    }, { passive: true });
    $('printBtn').addEventListener('click', printOne);
    $('sheetBtn').addEventListener('click', makeSheet);
    $('copyBtn').addEventListener('click', function () {
      var text = currentPayload();
      if (!text) { toast(t('emptyPreview')); return; }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { toast(t('toastCopy')); }, function () { toast(t('copyFailed')); });
      } else {
        toast(t('copyFailed'));
      }
    });

    document.addEventListener('keydown', function (event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
        event.preventDefault();
        undo();
      }
    });

    bindFields();
    bindSegs();
    bindPalette();
    bindLogo();

    lastSaved = JSON.stringify(snapshot());
    paintFields();
    paintControls();
    paintUndo();
    applyLang(state.language);
    paintSheetPreview();
    registerWorker();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}());
