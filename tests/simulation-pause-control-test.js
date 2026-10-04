/* Regression test for the simulation HUD's visible pause/resume control.
 * Run with: node tests/simulation-pause-control-test.js
 */
'use strict';

var assert = require('assert');

function FakeElement(tagName, className, textContent) {
  this.tagName = String(tagName).toUpperCase();
  this.className = className || '';
  this.textContent = textContent || '';
  this.children = [];
  this.attributes = {};
  this.listeners = {};
  this.value = '';
  this.classNames = Object.create(null);
  (className || '')
    .split(/\s+/)
    .filter(Boolean)
    .forEach(function (name) {
      this.classNames[name] = true;
    }, this);

  var self = this;
  this.classList = {
    toggle: function (name, force) {
      var enabled = force === undefined ? !self.classNames[name] : !!force;
      self.classNames[name] = enabled;
      return enabled;
    },
  };
}

FakeElement.prototype.appendChild = function (child) {
  this.children.push(child);
  child.parentNode = this;
  return child;
};
FakeElement.prototype.addEventListener = function (name, handler) {
  this.listeners[name] = handler;
};
FakeElement.prototype.setAttribute = function (name, value) {
  this.attributes[name] = String(value);
};

function element(tagName, className, textContent) {
  return new FakeElement(tagName, className, textContent);
}

global.EVO = {
  UI: { el: element },
  Widgets: {
    buttonRow: function (buttons, className) {
      var row = element('div', 'button-row' + (className ? ' ' + className : ''));
      buttons.forEach(function (button) {
        if (!button) return;
        var node = element('button', 'evo-button' + (button.className ? ' ' + button.className : ''), button.label);
        node.addEventListener('click', button.onClick);
        row.appendChild(node);
      });
      return row;
    },
  },
  ObjectiveUtil: {
    stringRepresentation: function () {
      return 'Running';
    },
  },
  Utils: {
    clamp: function (value, min, max) {
      return Math.max(min, Math.min(max, value));
    },
  },
  App: { show: function () {} },
  Settings: {},
  Screens: {},
};

require('../js/ui/simulation.js');

var screen = Object.create(global.EVO.SimulationScreen);
screen.settings = { Objective: 0, SimulationTime: 10 };
screen.state = 'simulating';
screen.autoplay = true;
screen.playbackDuration = 0;
screen.playbackTime = 0;
screen.evolution = {
  paused: false,
  currentGenerationNumber: 1,
  currentCreatureBatch: [],
  batchElapsed: 0,
  pause: function () {
    this.paused = true;
  },
  resume: function () {
    this.paused = false;
  },
};

screen.buildHud(element('div'));

assert.strictEqual(screen.pauseButton.textContent, 'Pause', 'the running simulation offers Pause');
assert.strictEqual(screen.pauseButton.attributes['aria-label'], 'Pause simulation');
assert.strictEqual(screen.pauseButton.title, 'Pause the simulation');
assert.strictEqual(screen.pauseButton.classNames.hidden, false);

screen.pauseButton.listeners.click();
assert.strictEqual(screen.evolution.paused, true, 'the Pause button pauses evolution');
assert.strictEqual(screen.pauseButton.textContent, 'Resume', 'the paused simulation offers Resume');
assert.strictEqual(screen.pauseButton.attributes['aria-label'], 'Resume simulation');
assert.strictEqual(screen.pauseButton.title, 'Resume the simulation');
assert.strictEqual(screen.phaseLabel.textContent, 'PAUSED');

screen.pauseButton.listeners.click();
assert.strictEqual(screen.evolution.paused, false, 'the Resume button continues evolution');
assert.strictEqual(screen.pauseButton.textContent, 'Pause');
assert.strictEqual(screen.phaseLabel.textContent, 'SIMULATING');

screen.state = 'playback';
screen.refreshHud();
assert.strictEqual(screen.pauseButton.classNames.hidden, true, 'the simulation control hides during playback');

console.log('Simulation pause control regression checks passed.');
