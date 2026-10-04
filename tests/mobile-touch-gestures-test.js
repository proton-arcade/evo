/* Mobile viewport and Pointer Events touch-gesture diagnostics.
 * Run with: node tests/mobile-touch-gestures-test.js
 */
'use strict';

var assert = require('assert');
var fs = require('fs');

var html = fs.readFileSync('index.html', 'utf8');
var css = fs.readFileSync('css/style.css', 'utf8');
assert(/name="viewport"[^>]*content="[^"]*width=device-width[^"]*viewport-fit=cover/i.test(html));
assert(!/user-scalable\s*=\s*no|maximum-scale\s*=\s*1/i.test(html), 'mobile browser zoom should remain available');
assert(css.indexOf('@media (max-width: 760px)') !== -1);
assert(css.indexOf('@media (max-width: 520px)') !== -1);
assert(css.indexOf('@media (pointer: coarse)') !== -1);
assert(/@media \(pointer: coarse\)[\s\S]*?min-height:\s*42px/.test(css), 'touch controls should have finger-sized hit areas');
assert(css.indexOf('@media (max-height: 460px) and (min-width: 761px)') !== -1, 'short landscape screens should get compact HUD layout');
assert(css.indexOf('height: 100dvh;') !== -1, 'the app viewport should follow mobile browser chrome');
assert(css.indexOf('env(safe-area-inset-bottom') !== -1, 'mobile controls should respect device safe areas');
assert(/\.editor-canvas,[\s\S]*?touch-action:\s*none/.test(css));
assert(/\.ecosystem-canvas\s*\{[^}]*touch-action:\s*none/.test(css), 'ecosystem camera controls should support touch gestures');
assert(/\.ecosystem-creature-card\s*\{[^}]*min-height:\s*68px/.test(css), 'creature choices should be easy to tap on mobile');

var elementHandlers = Object.create(null);
var windowHandlers = Object.create(null);
var documentHandlers = Object.create(null);
global.document = {
  addEventListener: function (name, handler) {
    documentHandlers[name] = handler;
  },
  removeEventListener: function (name, handler) {
    if (documentHandlers[name] === handler) delete documentHandlers[name];
  },
};
global.addEventListener = function (name, handler) {
  windowHandlers[name] = handler;
};
global.removeEventListener = function (name, handler) {
  if (windowHandlers[name] === handler) delete windowHandlers[name];
};
require('../js/core/util.js');

global.devicePixelRatio = 3;
assert.strictEqual(global.EVO.Utils.displayPixelRatio(), 2, 'high-DPI canvas work is capped for mobile performance');
global.devicePixelRatio = 1.5;
assert.strictEqual(global.EVO.Utils.displayPixelRatio(), 1.5);

var element = {
  addEventListener: function (name, handler) {
    elementHandlers[name] = handler;
  },
  removeEventListener: function (name, handler) {
    if (elementHandlers[name] === handler) delete elementHandlers[name];
  },
  getBoundingClientRect: function () {
    return { left: 10, top: 20 };
  },
};
var started = 0;
var ended = 0;
var pans = [];
var pinches = [];
var gestures = global.EVO.Utils.addTouchGestures(element, {
  onGestureStart: function () { started++; },
  onGestureEnd: function () { ended++; },
  onPan: function (dx, dy) { pans.push([dx, dy]); },
  onPinch: function (scale) { pinches.push(scale); },
});

function pointer(pointerId, pointerType, clientX, clientY) {
  return { pointerId: pointerId, pointerType: pointerType, clientX: clientX, clientY: clientY };
}
elementHandlers.pointerdown(pointer(1, 'touch', 100, 100));
assert.strictEqual(gestures.active, false, 'one finger should remain available for a drag');
elementHandlers.pointerdown(pointer(2, 'touch', 200, 100));
assert.strictEqual(gestures.active, true, 'two fingers should activate pan and pinch');
assert.strictEqual(started, 1);
windowHandlers.pointermove(pointer(2, 'touch', 220, 120));
assert.deepStrictEqual(pans, [[10, 10]], 'two-finger motion should report CSS-pixel pan deltas');
assert(pinches[0] > 1.2 && pinches[0] < 1.23, 'spreading fingers should report pinch zoom');

elementHandlers.pointerup(pointer(2, 'touch', 220, 120));
windowHandlers.pointerup(pointer(2, 'touch', 220, 120));
assert.strictEqual(gestures.active, false);
assert.strictEqual(gestures.pointerCount, 1);
assert.strictEqual(ended, 1);
elementHandlers.pointerup(pointer(1, 'touch', 100, 100));
windowHandlers.pointerup(pointer(1, 'touch', 100, 100));
assert.strictEqual(gestures.pointerCount, 0);

gestures.detach();
assert.strictEqual(Object.keys(elementHandlers).length, 0, 'touch listeners should detach during screen navigation');
assert.strictEqual(Object.keys(windowHandlers).length, 0);
assert.strictEqual(Object.keys(documentHandlers).length, 0);

console.log('Mobile viewport, touch target, HiDPI and two-finger gesture diagnostics passed.');
