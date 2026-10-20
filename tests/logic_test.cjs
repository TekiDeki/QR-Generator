#!/usr/bin/env node
/* QR Generator · logic tests
 * SPDX-License-Identifier: Apache-2.0
 *
 * node tests/logic_test.cjs
 * Payload building and the encoder only: no browser, no network.
 */
'use strict';

const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

const Q = require(path.join(__dirname, '..', 'src', 'payload.js'));

let checks = 0;
function ok(condition, message) {
  checks += 1;
  assert.ok(condition, message);
}
function eq(actual, expected, message) {
  checks += 1;
  assert.strictEqual(actual, expected, message + ' (got ' + JSON.stringify(actual) + ', wanted ' + JSON.stringify(expected) + ')');
}

/* The encoder is a browser script that hangs itself on the global object, so
 * it is loaded into a small sandbox instead of being required. */
function loadEncoder() {
  const file = path.join(__dirname, '..', 'src', 'qr.js');
  const source = fs.readFileSync(file, 'utf8');
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  return sandbox.qrcode;
}

/* ------------------------------------------------------------- payload: link */

eq(Q.normalizeUrl('freehtml.dev'), 'https://freehtml.dev', 'a bare host gets https');
eq(Q.normalizeUrl('  freehtml.dev/sign  '), 'https://freehtml.dev/sign', 'spaces around a host are trimmed');
eq(Q.normalizeUrl('http://example.com'), 'http://example.com', 'an existing http scheme is respected');
eq(Q.normalizeUrl('https://example.com/a?b=1'), 'https://example.com/a?b=1', 'a full address is untouched');
eq(Q.normalizeUrl('mailto:a@b.c'), 'mailto:a@b.c', 'any other scheme is respected');
eq(Q.normalizeUrl('//example.com'), 'https://example.com', 'a protocol relative address gets https');
eq(Q.normalizeUrl(''), '', 'an empty address stays empty');
eq(Q.build({ type: 'url', url: 'freehtml.dev' }), 'https://freehtml.dev', 'the url builder normalises');
eq(Q.build({ type: 'url', url: '' }), '', 'an empty link builds nothing');

/* ------------------------------------------------------------- payload: text */

eq(Q.build({ type: 'text', text: 'hello' }), 'hello', 'plain text goes through unchanged');
eq(Q.build({ type: 'text', text: 'добар дан' }), 'добар дан', 'non latin text is kept as it is');
eq(Q.build({ type: 'text', text: '' }), '', 'empty text builds nothing');

/* ------------------------------------------------------------- payload: wifi */

eq(Q.escapeWifi('My;Net'), 'My\\;Net', 'a semicolon in a network name is escaped');
eq(Q.escapeWifi('a:b'), 'a\\:b', 'a colon in a network name is escaped');
eq(Q.escapeWifi('back\\slash'), 'back\\\\slash', 'a backslash is escaped');
eq(Q.escapeWifi('x,y"z'), 'x\\,y\\"z', 'comma and quote are escaped');

eq(
  Q.build({ type: 'wifi', ssid: 'Cafe', password: 'tea12345', security: 'WPA', hidden: false }),
  'WIFI:T:WPA;S:Cafe;P:tea12345;;',
  'a normal WPA network'
);
eq(
  Q.build({ type: 'wifi', ssid: 'Cafe', password: 'ignored', security: 'nopass', hidden: false }),
  'WIFI:T:nopass;S:Cafe;;',
  'an open network carries no password'
);
eq(
  Q.build({ type: 'wifi', ssid: 'Hidden', password: 'x', security: 'WEP', hidden: true }),
  'WIFI:T:WEP;S:Hidden;P:x;H:true;;',
  'a hidden network says so'
);
eq(
  Q.build({ type: 'wifi', ssid: 'Cafe;Bar', password: 'a;b', security: 'WPA', hidden: false }),
  'WIFI:T:WPA;S:Cafe\\;Bar;P:a\\;b;;',
  'a hostile network name cannot break the payload'
);
eq(Q.build({ type: 'wifi', ssid: '', password: 'x' }), '', 'a network without a name builds nothing');

/* ---------------------------------------------------------- payload: contact */

eq(Q.escapeVcard('a;b,c\\d\ne'), 'a\\;b\\,c\\\\d\\ne', 'vCard escapes semicolon, comma, backslash and newline');

const card = Q.build({
  type: 'contact',
  firstName: 'Kristian',
  lastName: 'Miskovic',
  org: 'TekiDeki',
  phone: '+381 60 123 4567',
  email: 'a@b.c',
  website: 'freehtml.dev'
});
ok(card.startsWith('BEGIN:VCARD\r\nVERSION:3.0\r\n'), 'a contact starts with the vCard header');
ok(card.includes('N:Miskovic;Kristian;;;'), 'the name is family first, as vCard asks');
ok(card.includes('FN:Kristian Miskovic'), 'the display name is built from both parts');
ok(card.includes('ORG:TekiDeki'), 'the company is present');
ok(card.includes('TEL;TYPE=CELL:+381601234567'), 'the phone loses its spaces');
ok(card.includes('URL:https://freehtml.dev'), 'the website is normalised');
ok(card.endsWith('END:VCARD'), 'a contact ends with the closing line');
ok(card.split('\r\n').length >= 8, 'the lines are separated by CRLF');
eq(Q.build({ type: 'contact', firstName: '', lastName: '' }), '', 'a contact without a name builds nothing');

/* ------------------------------------------------------------ payload: rest */

eq(Q.build({ type: 'email', mailTo: 'a@b.c' }), 'mailto:a@b.c', 'an email with nothing else');
eq(
  Q.build({ type: 'email', mailTo: 'a@b.c', subject: 'Hi there', body: 'line one' }),
  'mailto:a@b.c?subject=Hi%20there&body=line%20one',
  'subject and body are encoded'
);
eq(Q.build({ type: 'email', mailTo: '' }), '', 'an email without an address builds nothing');

eq(Q.normalizePhone('+381 (60) 123-4567'), '+381601234567', 'a formatted phone becomes digits');
eq(Q.normalizePhone('060 123 4567'), '0601234567', 'a local number keeps its leading zero');
eq(Q.normalizePhone('+'), '+', 'a lone plus survives, so the user sees something is wrong');
eq(Q.build({ type: 'phone', phoneNumber: '+381 60 123 4567' }), 'tel:+381601234567', 'a phone code');
eq(Q.build({ type: 'phone', phoneNumber: '' }), '', 'a phone code without a number builds nothing');

eq(Q.build({ type: 'sms', smsNumber: '0601234567', smsText: 'Hello' }), 'SMSTO:0601234567:Hello', 'an sms code');
eq(Q.build({ type: 'sms', smsNumber: '', smsText: 'Hello' }), '', 'an sms code without a number builds nothing');

eq(Q.build({ type: 'nonsense' }), '', 'an unknown type builds nothing');
eq(Q.build({ type: 'url' }), '', 'a missing field builds nothing');

/* ------------------------------------------------------------------- labels */

eq(Q.label({ type: 'url', url: 'https://freehtml.dev/sign/' }), 'freehtml.dev/sign', 'the label drops the scheme and the trailing slash');
eq(Q.label({ type: 'wifi', ssid: 'Cafe' }), 'Cafe', 'the wifi label is the network name');
eq(Q.label({ type: 'contact', firstName: 'A', lastName: 'B' }), 'A B', 'the contact label is the full name');
eq(Q.label({ type: 'email', mailTo: 'a@b.c' }), 'a@b.c', 'the email label is the address');

/* -------------------------------------------------------------- byte length */

eq(Q.byteLength('abc'), 3, 'three ascii letters are three bytes');
eq(Q.byteLength('č'), 2, 'one two byte letter is two bytes');
eq(Q.byteLength('д'), 2, 'one cyrillic letter is two bytes');
eq(Q.byteLength('😀'), 4, 'an emoji is four bytes');
eq(Q.byteLength(''), 0, 'nothing is nothing');

/* ------------------------------------------------------------------ encoder */

const qrcode = loadEncoder();
const enc = qrcode(0, 'M');
enc.addData('https://freehtml.dev');
enc.make();
const n = enc.getModuleCount();
ok(n >= 21 && n <= 177, 'the module count is inside the specification range');
eq((n - 17) % 4, 0, 'the module count follows the version formula');

/* every one of the three finder corners has dark edge, light ring, dark core */
[[0, 0], [0, n - 7], [n - 7, 0]].forEach(function (spot) {
  const row = spot[0];
  const col = spot[1];
  ok(enc.isDark(row, col), 'finder corner is dark at ' + row + ',' + col);
  ok(!enc.isDark(row + 1, col + 1), 'finder ring is light at ' + (row + 1) + ',' + (col + 1));
  ok(enc.isDark(row + 3, col + 3), 'finder core is dark at ' + (row + 3) + ',' + (col + 3));
});

/* the timing pattern alternates along row six */
let alternates = true;
for (let c = 8; c < n - 8; c += 1) {
  if (enc.isDark(6, c) === enc.isDark(6, c + 1)) { alternates = false; break; }
}
ok(alternates, 'the timing pattern alternates');

/* more data means a bigger code */
const small = qrcode(0, 'M'); small.addData('a'); small.make();
const big = qrcode(0, 'M'); big.addData('a'.repeat(300)); big.make();
ok(big.getModuleCount() > small.getModuleCount(), 'a longer text produces a larger code');

/* a higher tolerance spends capacity on redundancy */
const low = qrcode(0, 'L'); low.addData('https://freehtml.dev/sign'); low.make();
const high = qrcode(0, 'H'); high.addData('https://freehtml.dev/sign'); high.make();
ok(high.getModuleCount() >= low.getModuleCount(), 'higher tolerance never shrinks the code');

/* the same input always gives the same matrix, which is what makes the build
 * and the screenshots reproducible */
const again = qrcode(0, 'M'); again.addData('https://freehtml.dev'); again.make();
let same = again.getModuleCount() === n;
for (let r = 0; r < n && same; r += 1) {
  for (let c = 0; c < n; c += 1) {
    if (again.isDark(r, c) !== enc.isDark(r, c)) { same = false; break; }
  }
}
ok(same, 'encoding is deterministic');

/* text too long for a single code has to throw, not silently truncate */
let threw = false;
try {
  const huge = qrcode(0, 'H');
  huge.addData('x'.repeat(4000));
  huge.make();
} catch (error) {
  threw = true;
}
ok(threw, 'text beyond capacity raises instead of being cut');

console.log('logic: ' + checks + ' checks passed');
