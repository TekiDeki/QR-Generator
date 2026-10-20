/* QR Generator · TekiDeki - payload builders
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2026 Kristian Mario Miskovic (TekiDeki)
 *
 * Turns what a person types into the exact string a phone expects to find
 * inside a code. No DOM here on purpose: this file is loaded by the page and
 * by the Node logic tests, so every rule below is checked without a browser.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.QRPayload = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TYPES = ['url', 'text', 'wifi', 'contact', 'email', 'phone', 'sms'];

  /* Characters that end a field in the WIFI: scheme. A semicolon or a colon
   * typed in a network name would split the fields in the wrong place, so
   * they are escaped, as the specification asks. */
  function escapeWifi(value) {
    return String(value == null ? '' : value)
      .replace(/([\\;,:"])/g, '\\$1');
  }

  /* vCard 3.0 escaping: backslash, semicolon, comma and newline. */
  function escapeVcard(value) {
    return String(value == null ? '' : value)
      .replace(/\\/g, '\\\\')
      .replace(/\n/g, '\\n')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,');
  }

  /* A scheme already in the text is respected. Anything else gets https://,
   * because "example.com" pasted into a QR code without one is a dead code. */
  function normalizeUrl(value) {
    var text = String(value == null ? '' : value).trim();
    if (!text) return '';
    if (/^[a-z][a-z0-9+.-]*:/i.test(text)) return text;
    if (text.indexOf('//') === 0) return 'https:' + text;
    return 'https://' + text;
  }

  /* Digits with an optional leading plus. Spaces, dashes and brackets are
   * what people paste from a contact card, and they are not part of a number. */
  function normalizePhone(value) {
    var text = String(value == null ? '' : value).trim();
    if (!text) return '';
    var plus = text.charAt(0) === '+';
    var digits = text.replace(/[^0-9]/g, '');
    return (plus ? '+' : '') + digits;
  }

  function buildUrl(state) {
    return normalizeUrl(state.url);
  }

  function buildText(state) {
    return String(state.text == null ? '' : state.text);
  }

  function buildWifi(state) {
    var ssid = String(state.ssid == null ? '' : state.ssid);
    if (!ssid) return '';
    var security = state.security === 'WEP' || state.security === 'nopass' ? state.security : 'WPA';
    var parts = ['WIFI:', 'T:' + security + ';', 'S:' + escapeWifi(ssid) + ';'];
    if (security !== 'nopass') {
      parts.push('P:' + escapeWifi(state.password || '') + ';');
    }
    if (state.hidden) parts.push('H:true;');
    parts.push(';');
    return parts.join('');
  }

  function buildContact(state) {
    var first = String(state.firstName == null ? '' : state.firstName).trim();
    var last = String(state.lastName == null ? '' : state.lastName).trim();
    if (!first && !last) return '';
    var lines = ['BEGIN:VCARD', 'VERSION:3.0'];
    lines.push('N:' + escapeVcard(last) + ';' + escapeVcard(first) + ';;;');
    lines.push('FN:' + escapeVcard((first + ' ' + last).trim()));
    if (state.org) lines.push('ORG:' + escapeVcard(state.org));
    if (state.phone) lines.push('TEL;TYPE=CELL:' + escapeVcard(normalizePhone(state.phone)));
    if (state.email) lines.push('EMAIL:' + escapeVcard(state.email));
    if (state.website) lines.push('URL:' + escapeVcard(normalizeUrl(state.website)));
    lines.push('END:VCARD');
    return lines.join('\r\n');
  }

  function buildEmail(state) {
    var to = String(state.mailTo == null ? '' : state.mailTo).trim();
    if (!to) return '';
    var query = [];
    if (state.subject) query.push('subject=' + encodeURIComponent(state.subject));
    if (state.body) query.push('body=' + encodeURIComponent(state.body));
    return 'mailto:' + to + (query.length ? '?' + query.join('&') : '');
  }

  function buildPhone(state) {
    var number = normalizePhone(state.phoneNumber);
    return number ? 'tel:' + number : '';
  }

  function buildSms(state) {
    var number = normalizePhone(state.smsNumber);
    if (!number) return '';
    var message = String(state.smsText == null ? '' : state.smsText);
    return 'SMSTO:' + number + ':' + message;
  }

  var BUILDERS = {
    url: buildUrl,
    text: buildText,
    wifi: buildWifi,
    contact: buildContact,
    email: buildEmail,
    phone: buildPhone,
    sms: buildSms
  };

  /* A human readable name for the kind of code, used as the label under it in
   * the print sheet and as the file name. */
  function label(state) {
    switch (state.type) {
      case 'url': return normalizeUrl(state.url).replace(/^https?:\/\//, '').replace(/\/$/, '');
      case 'text': return String(state.text || '').slice(0, 40);
      case 'wifi': return String(state.ssid || '');
      case 'contact': return ((String(state.firstName || '') + ' ' + String(state.lastName || '')).trim());
      case 'email': return String(state.mailTo || '');
      case 'phone': return normalizePhone(state.phoneNumber);
      case 'sms': return normalizePhone(state.smsNumber);
      default: return '';
    }
  }

  function build(state) {
    var fn = BUILDERS[state && state.type];
    return fn ? fn(state) : '';
  }

  /* UTF-8 byte length, because that is what a code has to carry. */
  function byteLength(text) {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(text).length;
    var bytes = 0;
    for (var i = 0; i < text.length; i += 1) {
      var code = text.charCodeAt(i);
      if (code < 0x80) bytes += 1;
      else if (code < 0x800) bytes += 2;
      else if (code >= 0xd800 && code <= 0xdbff) { bytes += 4; i += 1; }
      else bytes += 3;
    }
    return bytes;
  }

  return {
    TYPES: TYPES,
    build: build,
    label: label,
    normalizeUrl: normalizeUrl,
    normalizePhone: normalizePhone,
    escapeWifi: escapeWifi,
    escapeVcard: escapeVcard,
    byteLength: byteLength,
    builders: BUILDERS
  };
}));
