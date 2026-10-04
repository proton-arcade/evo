/* Regression test for the DURATION slider in the simulation HUD:
 * moving it queues the new duration for the next generation without
 * disturbing the running one, and the HUD keeps showing the right values
 * across a generation boundary.
 * Run with: node tests/simulation-duration-slider-test.js
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

var storedSettings = {};

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
  SimulationSettings: {
    encode: function (settings) {
      return JSON.parse(JSON.stringify(settings));
    },
  },
  NeuralNetworkSettings: {
    encode: function (settings) {
      return settings;
    },
  },
  ObjectiveUtil: {
    stringRepresentation: function (objective) {
      return ['Running', 'Jumping', 'Obstacle Jump', 'Climbing', 'Flying'][objective] || 'Running';
    },
  },
};
require('../js/ui/simulation.js');

var EVO = global.EVO;
var screen = Object.create(EVO.SimulationScreen);
screen.element = fakeEl('div');
screen.settings = { SimulationTime: 10, Objective: 0 };
screen.networkSettings = { some: 'network' };
screen.autoplay = true;
screen.state = 'simulating';

/* Evolution has already copied the settings for generation 1. */
screen.evolution = {
  Settings: { SimulationTime: 10, Objective: 0 },
  SettingsForNextGeneration: { SimulationTime: 10, Objective: 0 },
  paused: false,
  batchElapsed: 3,
  currentCreatureBatch: [],
  generationFitness: [],
};
screen.buildHud(screen.element);

/* --- Move the slider during the generation --------------------------- */
screen.durationSlider.value = '30';
screen.durationSlider.dispatch('input');

assert.strictEqual(
  screen.evolution.SettingsForNextGeneration.SimulationTime,
  30,
  'the new duration is queued for the next generation'
);
assert.strictEqual(
  screen.evolution.Settings.SimulationTime,
  10,
  'the running generation keeps its duration'
);
assert.strictEqual(screen.settings.SimulationTime, 10, 'the running generation settings are untouched');
assert.strictEqual(screen.durationValue.textContent, '30S', 'the slider label shows the queued duration');
assert.ok(
  /\/\s*10s$/.test(screen.timeLabel.textContent),
  'the time label still shows the running generation length — got: ' + screen.timeLabel.textContent
);

screen.refreshHud();
assert.strictEqual(screen.durationSlider.value, '30', 'refreshHud keeps the queued value in the slider');
assert.strictEqual(screen.durationValue.textContent, '30S', 'refreshHud keeps the queued label');

/* Saving persists the queued value, not the stale running one. */
screen.saveStateToSettings();
assert.strictEqual(EVO.Settings.SimulationSettings.SimulationTime, 30, 'saveStateToSettings persists the queue');

/* --- Generation boundary (the evolution copies its settings) --------- */
screen.evolution.Settings = { SimulationTime: 30, Objective: 0 };
screen.evolution.batchElapsed = 0;
screen.onGenerationBegin(2);

assert.strictEqual(screen.settings, screen.evolution.Settings, 'the HUD follows the new settings object');
assert.strictEqual(screen.durationSlider.value, '30', 'after the boundary the slider shows the running value');
assert.strictEqual(screen.durationValue.textContent, '30S', 'after the boundary the label shows the running value');
assert.ok(
  /\/\s*30\.0s$/.test(screen.timeLabel.textContent),
  'the time label shows the new running length — got: ' + screen.timeLabel.textContent
);

/* Queue again for generation 3 while generation 2 runs. */
screen.durationSlider.value = '45';
screen.durationSlider.dispatch('input');
assert.strictEqual(screen.evolution.SettingsForNextGeneration.SimulationTime, 45, 'queue updated again');
assert.strictEqual(screen.evolution.Settings.SimulationTime, 30, 'generation 2 duration untouched');

console.log('Simulation duration slider regression checks passed.');
