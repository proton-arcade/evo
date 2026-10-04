/* Regression test for the pause button in the simulation HUD.
 * Run with: node tests/simulation-pause-button-test.js
 */
'use strict';

var assert = require('assert');

/* --- Minimal DOM stub ------------------------------------------------ */
function fakeClassList(el) {
  return {
    toggle: function (name, force) {
      var has = el._classes.indexOf(name) !== -1;
      var next = force === undefined ? !has : !!force;
      if (next && !has) el._classes.push(name);
      if (!next && has) el._classes.splice(el._classes.indexOf(name), 1);
      el.className = el._classes.join(' ');
      return next;
    },
    contains: function (name) {
      return el._classes.indexOf(name) !== -1;
    },
  };
}

function fakeEl(tag, cls, text) {
  var el = {
    tagName: String(tag).toUpperCase(),
    className: cls || '',
    _classes: cls ? String(cls).split(/\s+/) : [],
    textContent: text === undefined ? '' : text,
    title: '',
    children: [],
    listeners: {},
    attributes: {},
    appendChild: function (child) {
      this.children.push(child);
      child.parentNode = this;
      return child;
    },
    addEventListener: function (type, fn) {
      (this.listeners[type] = this.listeners[type] || []).push(fn);
    },
    setAttribute: function (key, value) {
      this.attributes[key] = value;
    },
    dispatch: function (type, event) {
      (this.listeners[type] || []).forEach(function (fn) {
        fn.call(el, event || {});
      });
    },
  };
  el.classList = fakeClassList(el);
  return el;
}

global.EVO = {
  Screens: {},
  UI: {
    el: function (tag, cls, text) {
      return fakeEl(tag, cls, text);
    },
    clear: function (el) {
      el.children = [];
    },
  },
  Widgets: {
    buttonRow: function (items, cls) {
      var row = fakeEl('div', 'button-row ' + (cls || ''));
      (items || []).forEach(function (item) {
        var button = fakeEl('button', 'evo-button ' + (item.className || ''), item.label);
        if (item.onClick) button.addEventListener('click', item.onClick);
        row.appendChild(button);
      });
      return row;
    },
  },
  Modal: {},
  Storage: {},
  App: { show: function () {} },
  Utils: {
    clamp: function (v, min, max) {
      return Math.max(min, Math.min(max, v));
    },
  },
  Renderer: {},
  Settings: {},
  ObjectiveUtil: {
    stringRepresentation: function (objective) {
      return ['Running', 'Jumping', 'Obstacle Jump', 'Climbing', 'Flying'][objective] || 'Running';
    },
  },
};
require('../js/ui/simulation.js');

var SimulationScreen = global.EVO.SimulationScreen;

/* --- Build the HUD --------------------------------------------------- */
var screen = Object.create(SimulationScreen);
screen.element = fakeEl('div');
screen.settings = { SimulationTime: 10, Objective: 0 };
screen.autoplay = true;
screen.state = 'simulating';
screen.evolution = null;
screen.buildHud(screen.element);

assert.ok(screen.pauseButton, 'buildHud creates a pause button');
assert.strictEqual(screen.pauseButton.tagName, 'BUTTON', 'the pause control is a button');
assert.ok(
  screen.pauseButton._classes.indexOf('hud-pause-button') !== -1,
  'the pause button carries the hud-pause-button class'
);

/* The button lives in the top-left HUD panel, visible during simulating. */
var topLeft = screen.element.children.filter(function (child) {
  return child._classes.indexOf('hud-top-left') !== -1;
})[0];
assert.ok(topLeft, 'the top left HUD panel is attached to the screen');
var pauseRow = topLeft.children.filter(function (child) {
  return child._classes.indexOf('hud-row') !== -1 && child.children.indexOf(screen.pauseButton) !== -1;
})[0];
assert.ok(pauseRow, 'the pause button sits in a row of the top left HUD');
assert.ok(
  screen.element.children.indexOf(topLeft) !== -1,
  'the HUD (with the pause button) is part of the visible screen, not hidden'
);

/* Clicking it pauses/resumes through the existing pause pipeline. */
var pauseCalls = 0;
screen.pauseSimulation = function () {
  pauseCalls++;
};
screen.pauseButton.dispatch('click');
assert.strictEqual(pauseCalls, 1, 'clicking the pause button calls pauseSimulation');
screen.pauseButton.dispatch('click');
assert.strictEqual(pauseCalls, 2, 'clicking it again toggles once more');

var toggleCalls = 0;
screen.togglePlayback = function () {
  toggleCalls++;
};
SimulationScreen.pauseSimulation.call(screen);
assert.strictEqual(toggleCalls, 1, 'pauseSimulation delegates to togglePlayback');

/* --- Glyph and labels track the state -------------------------------- */
screen.evolution = { paused: false, batchElapsed: 0, currentCreatureBatch: [] };

screen.refreshHud();
assert.strictEqual(screen.pauseButton.textContent, '\u2016', 'running simulation shows the pause glyph');
assert.ok(/^Pause /.test(screen.pauseButton.title), 'running simulation is labelled "Pause …"');
assert.strictEqual(screen.pauseButton.attributes['aria-label'], screen.pauseButton.title);

screen.evolution.paused = true;
screen.refreshHud();
assert.strictEqual(screen.pauseButton.textContent, '\u25B6', 'paused simulation shows the play glyph');
assert.ok(/^Resume /.test(screen.pauseButton.title), 'paused simulation is labelled "Resume …"');
assert.strictEqual(screen.phaseLabel.textContent, 'PAUSED', 'the phase label reports PAUSED');

screen.evolution.paused = false;
screen.state = 'playback';
screen.playback = {};
screen.playbackPlaying = true;
screen.playbackTime = 1.5;
screen.playbackDuration = 5;
screen.refreshHud();
assert.strictEqual(screen.pauseButton.textContent, '\u2016', 'a playing replay shows the pause glyph');
assert.ok(/playback/.test(screen.pauseButton.title), 'during playback the button targets the playback');

screen.playbackPlaying = false;
screen.refreshHud();
assert.strictEqual(screen.pauseButton.textContent, '\u25B6', 'a stopped replay shows the play glyph');

screen.playback = null;
screen.refreshHud();
assert.strictEqual(screen.pauseButton.textContent, '\u25B6', 'no replay means nothing to pause');

/* --- A manual pause holds the replay instead of letting autoplay skip -- */
var player = Object.create(SimulationScreen);
player.state = 'playback';
player.playback = {
  seek: function () {},
};
player.playbackPlaying = true;
player.playbackHeld = false;
player.playbackTime = 1;
player.playbackDuration = 5;
player.waitTimer = 0;
player.autoplay = true;
player.speed = 1;
player.evolution = {
  update: function () {},
  paused: false,
  batchElapsed: 0,
  currentCreatureBatch: [],
};
player.ghostTime = 0;
player.refreshHud = function () {};
player.refreshTimeLabels = function () {};
var continued = 0;
player.continueToNextGeneration = function () {
  continued++;
};

SimulationScreen.togglePlayback.call(player);
assert.strictEqual(player.playbackPlaying, false, 'the replay is paused');
assert.strictEqual(player.playbackHeld, true, 'pausing the replay sets the hold flag');

SimulationScreen.update.call(player, 0.1);
SimulationScreen.update.call(player, 0.1);
assert.strictEqual(continued, 0, 'autoplay does not skip to the next generation while held');

SimulationScreen.togglePlayback.call(player);
assert.strictEqual(player.playbackPlaying, true, 'the replay resumes');
assert.strictEqual(player.playbackHeld, false, 'resuming clears the hold flag');

SimulationScreen.update.call(player, 0.1);
assert.ok(player.playbackTime > 1, 'the replay advances again after resuming');

/* Replay reaches its natural end: autoplay continues after the wait. */
player.playbackTime = 4.95;
SimulationScreen.update.call(player, 0.1);
assert.strictEqual(player.playbackPlaying, false, 'the replay stops at its end');
player.waitTimer = 0;
SimulationScreen.update.call(player, 0.1);
assert.strictEqual(continued, 1, 'autoplay continues once the replay ends naturally');

console.log('Simulation pause button regression checks passed.');
