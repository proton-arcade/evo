/* Regression check that the simulation Save Creature button stores a creature variant.
 * Run with: node tests/simulation-save-creature-control-test.js
 */
'use strict';

var assert = require('assert');

function FakeElement(tagName, className, textContent) {
  this.tagName = String(tagName).toUpperCase();
  this.className = className || '';
  this.textContent = textContent || '';
  this.children = [];
  this.listeners = {};
  this.attributes = {};
  this.classNames = Object.create(null);
  this.style = {};
  this.value = '';
  var self = this;
  this.classList = {
    toggle: function (name, force) {
      self.classNames[name] = force === undefined ? !self.classNames[name] : !!force;
      return self.classNames[name];
    },
  };
}
FakeElement.prototype.appendChild = function (child) {
  this.children.push(child);
  child.parentNode = this;
  return child;
};
FakeElement.prototype.addEventListener = function (name, callback) {
  this.listeners[name] = callback;
};
FakeElement.prototype.setAttribute = function (name, value) {
  this.attributes[name] = String(value);
};
function el(tagName, className, textContent) {
  return new FakeElement(tagName, className, textContent);
}

var savedCreatureArgs = null;
var savedRecording = null;
var alerts = [];
global.EVO = {
  UI: { el: el },
  Widgets: {
    buttonRow: function (buttons, className) {
      var row = el('div', 'button-row ' + (className || ''));
      buttons.forEach(function (button) {
        var node = el('button', 'evo-button ' + (button.className || ''), button.label);
        node.addEventListener('click', button.onClick);
        row.appendChild(node);
      });
      return row;
    },
  },
  Modal: { alert: function (message, title) { alerts.push({ message: message, title: title }); } },
  Storage: {
    saveEvolvedCreature: function () { savedCreatureArgs = Array.prototype.slice.call(arguments); },
    saveRecording: function (recording) { savedRecording = recording; },
  },
  App: {},
  Utils: {},
  Renderer: {},
  Settings: {},
  Objective: { Running: 0 },
  ObjectiveUtil: { stringRepresentation: function () { return 'Running'; } },
  Screens: {},
};
require('../js/ui/simulation.js');

var EVO = global.EVO;
var screen = Object.create(EVO.SimulationScreen);
screen.settings = { Objective: EVO.Objective.Running, SimulationTime: 10 };
screen.refreshHud = function () {};
screen.buildHud(el('div'));
screen.recording = { task: EVO.Objective.Running, generation: 2, networkSettings: {} };
screen.evolvedChromosome = [0.1, -0.25, 0.9];
screen.data = { LastV2SimulatedGeneration: 0 };
screen.saveCreatureButton.listeners.click();
assert(savedCreatureArgs, 'the playback Save Creature action stores a creature record');
assert.strictEqual(savedCreatureArgs[0], screen.recording);
assert.strictEqual(savedCreatureArgs[1], screen.evolvedChromosome);
assert.strictEqual(savedCreatureArgs[2], screen.recording.networkSettings);
assert.strictEqual(savedCreatureArgs[3], 0);
assert.strictEqual(alerts[0].title, 'Creature saved');

screen.saveRecordingButton.listeners.click();
assert.strictEqual(savedRecording, screen.recording, 'the separate replay button still saves to the Gallery');
assert.strictEqual(alerts[1].title, 'Saved');

console.log('Simulation Save Creature and separate Save Replay control checks passed.');
