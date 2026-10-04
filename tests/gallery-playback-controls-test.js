/* Regression test for gallery playback pause, end, and replay controls.
 * Run with: node tests/gallery-playback-controls-test.js
 */
'use strict';

var assert = require('assert');
global.EVO = { Screens: {}, Utils: { clamp: function (value, min, max) {
  return Math.max(min, Math.min(max, value));
} } };
require('../js/ui/gallery.js');

var screen = Object.create(global.EVO.GalleryScreen);
var seeks = [];
screen.playbackTime = 0;
screen.playbackPlaying = true;
screen.speed = 1;
screen.playback = {
  getDuration: function () { return 2; },
  seek: function (time) { seeks.push(time); },
};
screen.playButton = { textContent: '', disabled: false };
screen.refreshPlayButton();
assert.strictEqual(screen.playButton.textContent, '\u2016');
assert.strictEqual(screen.playButton.disabled, false);

screen.togglePlayback();
assert.strictEqual(screen.playbackPlaying, false, 'the gallery button pauses playback');
screen.update(1);
assert.strictEqual(screen.playbackTime, 0, 'paused playback does not advance');

screen.playbackTime = 2;
screen.playbackPlaying = false;
screen.togglePlayback();
assert.strictEqual(screen.playbackTime, 0, 'replay from the end starts at the beginning');
assert.strictEqual(screen.playbackPlaying, true);
assert.strictEqual(seeks[seeks.length - 1], 0);

screen.update(3);
assert.strictEqual(screen.playbackTime, 2, 'playback stops at the recording end');
assert.strictEqual(screen.playbackPlaying, false);
assert.strictEqual(screen.playButton.textContent, '\u25B6');

screen.playback = null;
screen.refreshPlayButton();
assert.strictEqual(screen.playButton.disabled, true, 'playback is disabled when no recording is selected');

screen.playback = {};
screen.recordings = [{ recording: {} }];
screen.bounds = { minX: 0, maxX: 1, minY: 0, maxY: 1 };
screen.detachEvents = function () {};
screen.hide();
assert.strictEqual(screen.playback, null, 'leaving the gallery releases its playback object');
assert.deepStrictEqual(screen.recordings, [], 'leaving the gallery releases decoded recording data');
assert.strictEqual(screen.bounds, null);

console.log('Gallery playback control regression checks passed.');
