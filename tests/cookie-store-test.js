/*
 * Tests for the cookie backup of the storage (js/core/util.js).
 *
 * Cookies are tiny, so values are split into several cookies, lists are
 * shortened to what fits and a dropped cookie must never produce broken
 * data.  Run with: node tests/cookie-store-test.js
 */
'use strict';

var assert = require('assert');
var dom = require('./helpers/dom-stub.js');

dom.install(global);

global.localStorage = (function () {
  var memory = {};
  var store = {
    getItem: function (key) {
      return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null;
    },
    setItem: function (key, value) {
      memory[key] = String(value);
    },
    removeItem: function (key) {
      delete memory[key];
    },
    key: function (index) {
      return Object.keys(memory)[index] || null;
    },
    get length() {
      return Object.keys(memory).length;
    },
    keys: function () {
      return Object.keys(memory);
    },
    clear: function () {
      memory = {};
    },
  };
  return store;
})();

require('../js/core/util.js');

var EVO = global.EVO;
var Store = EVO.Store;

assert.strictEqual(Store.cookieAvailable, true, 'cookies should be usable with the stub');
assert.strictEqual(Store.backend, 'localStorage', 'localStorage is the main store in the stub');

/* --- A small value fits into one cookie ----------------------------- */
Store.setString('EVOLUTION_SETTINGS', '{"SimulationTime":10}');
Store.flushMirror();
assert.strictEqual(Store.getString('EVOLUTION_SETTINGS', ''), '{"SimulationTime":10}');
assert.strictEqual(Store.mirrorStatus()['EVOLUTION_SETTINGS'], 'ok');

/* --- A large value is split into several cookies -------------------- */
var big = '';
for (var i = 0; i < 4000; i++) big += 'abcdefghij'[i % 10];
Store.setString('designs', big);
Store.flushMirror();
var usage = Store.cookieUsage();
assert.ok(usage.cookies > 1, 'a large value uses more than one cookie, got ' + usage.cookies);
assert.strictEqual(Store.mirrorStatus()['designs'], 'ok');

/* --- Reading it back after the main store was wiped ---------------- */
global.localStorage.clear();
assert.strictEqual(Store.getString('designs', null), big, 'the value is restored from the cookies');
assert.ok(
  global.localStorage.getItem('evo.designs') === big,
  'the restored value is copied back into the main store'
);

/* --- A dropped chunk must not produce broken data ------------------ */
var jar = global.document._cookieJar;
var chunkName = Object.keys(jar).filter(function (name) {
  return name.indexOf('designs') !== -1 && /~\d+$/.test(name);
})[0];
assert.ok(chunkName, 'the large value was chunked');
delete jar[chunkName];
var freshStore = new EVO.CookieStore();
assert.strictEqual(freshStore.getItem('designs'), null, 'an incomplete value is treated as missing');

/* --- Lists are shortened to the newest entries that fit ------------- */
Store.setCookieBudget('large');
var recordings = [];
for (var r = 0; r < 20; r++) {
  recordings.push({ id: r, blob: new Array(3000).join('x') });
}
Store.setJSON('recordings', recordings);
Store.flushMirror();
assert.strictEqual(Store.mirrorStatus()['recordings'], 'partial', 'only a part of the list fits');
var fromCookies = new EVO.CookieStore().getItem('recordings');
var trimmed = JSON.parse(fromCookies);
assert.ok(trimmed.length > 0 && trimmed.length < recordings.length, 'the list was shortened');
assert.strictEqual(trimmed[0].id, 0, 'the newest entry is kept (entries are stored newest first)');

/* --- The budget can be changed and everything is rewritten ---------- */
Store.setCookieBudget('small');
var smallUsage = Store.cookieUsage();
assert.ok(
  smallUsage.cookies <= EVO.COOKIE_BUDGETS.small.maxTotalChunks,
  'the smaller budget is respected, got ' + smallUsage.cookies
);

/* --- Values that cannot fit at all are skipped, not corrupted ------- */
var huge = new Array(400000).join('y');
Store.setString('simulations', huge);
Store.flushMirror();
assert.strictEqual(
  Store.mirrorStatus()['simulations'],
  'too-big',
  'a value that never fits is reported as too big'
);
assert.strictEqual(
  new EVO.CookieStore().getItem('simulations'),
  null,
  'no stale cookie copy is kept for a value that did not fit'
);

/* --- Backup, restore and clearing ---------------------------------- */
global.localStorage.clear();
Store.setString('designs', big);
Store.setJSON('recordings', recordings);
var backup = Store.backupToCookies();
assert.strictEqual(backup.available, true);
assert.ok(backup.copied + backup.partial.length > 0, 'the backup copied something');

global.localStorage.clear();
var restored = Store.restoreFromCookies(true);
assert.ok(restored > 0, 'the backup can be restored');
assert.strictEqual(Store.getString('designs', null), big, 'a restored value is unchanged');

Store.clearCookies();
assert.strictEqual(Store.cookieUsage().cookies, 0, 'clearing the cookies removes everything');

/* --- deleteAll clears both stores ---------------------------------- */
Store.setString('designs', big);
Store.flushMirror();
Store.deleteAll();
assert.deepStrictEqual(Store.keys(), [], 'deleteAll removes every key');
assert.strictEqual(Store.cookieUsage().cookies, 0, 'deleteAll removes the cookies as well');

/* --- Every shape of storage object is understood -------------------
 * Real `localStorage` has length/key(i) and (depending on the browser) a
 * keys() method that returns an iterator instead of an array.
 */
Object.keys(require.cache).forEach(function (id) {
  delete require.cache[id];
});
var memory = { 'evo.designs': '[]', other: 'x' };
global.localStorage = {
  get length() {
    return Object.keys(memory).length;
  },
  key: function (index) {
    return Object.keys(memory)[index] || null;
  },
  keys: function () {
    var keys = Object.keys(memory);
    var index = 0;
    return {
      next: function () {
        return index < keys.length ? { value: keys[index++], done: false } : { done: true };
      },
    };
  },
  getItem: function (key) {
    return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null;
  },
  setItem: function (key, value) {
    memory[key] = String(value);
  },
  removeItem: function (key) {
    delete memory[key];
  },
};
var reloaded = require('../js/core/util.js');
var keys = reloaded.Store.primaryKeys().sort();
assert.deepStrictEqual(keys, ['designs', 'other'], 'keys are read through length/key: ' + keys);

/* --- Settings are never part of a data reset ------------------------ */
Store.setString('designs', big);
EVO.Settings.ShowMuscles = false;
EVO.Settings.reset();
assert.strictEqual(Store.getString('designs', null), big, 'resetting the settings keeps the designs');
assert.strictEqual(EVO.Settings.ShowMuscles, true, 'resetting the settings restores the defaults');

console.log('Cookie storage checks passed.');
