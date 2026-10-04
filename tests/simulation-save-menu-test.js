/* Regression checks for named replay/run saves and in-place action-brain updates.
 * Run with: node tests/simulation-save-menu-test.js
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
  this.value = '';
  this.classNames = Object.create(null);
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
function element(tagName, className, textContent) {
  return new FakeElement(tagName, className, textContent);
}

var modalOptions = null;
var alerts = [];
var saveCalls = [];
var nameInput = null;
global.EVO = {
  UI: { el: element },
  Widgets: {
    textInput: function (options) {
      var input = element('input', 'text-input');
      input.value = options.value;
      nameInput = input;
      return { element: element('div', 'widget-input'), input: input };
    },
    buttonRow: function (buttons, className) {
      var row = element('div', 'button-row ' + (className || ''));
      buttons.forEach(function (button) {
        var node = element('button', 'evo-button', button.label);
        node.addEventListener('click', button.onClick);
        row.appendChild(node);
      });
      return row;
    },
  },
  Modal: {
    open: function (options) { modalOptions = options; },
    alert: function (message, title) { alerts.push({ message: message, title: title }); },
  },
  Storage: {
    saveSimulation: function (name, data) { saveCalls.push({ kind: 'run', name: name, data: data }); },
    saveRecording: function (recording, name) {
      saveCalls.push({ kind: 'replay', name: name, recording: recording });
    },
    saveEvolvedBrain: function (creatureId, recording, chromosome, settings, lastV2) {
      saveCalls.push({
        kind: 'brain',
        creatureId: creatureId,
        recording: recording,
        chromosome: chromosome,
        settings: settings,
        lastV2: lastV2,
      });
    },
  },
  Objective: { Running: 0 },
  ObjectiveUtil: { stringRepresentation: function () { return 'Running'; } },
  Utils: { clamp: function (value, min, max) { return Math.max(min, Math.min(max, value)); } },
  Settings: {},
  App: {},
  Screens: {},
};
require('../js/ui/simulation.js');

var screen = Object.create(global.EVO.SimulationScreen);
var recording = {
  creatureDesign: { name: 'Test creature' },
  movementData: { sampleTimestamps: [0] },
  task: global.EVO.Objective.Running,
  generation: 4,
  networkSettings: { layers: [2] },
};
screen.data = { CreatureDesign: { name: 'Test creature' }, LastV2SimulatedGeneration: 0 };
screen.libraryCreatureId = 'creature-1';
screen.recording = recording;
screen.evolvedChromosome = [0.25, -0.5, 0.75];
screen.showSaveMenu();
assert.strictEqual(modalOptions.title, 'Save run');
var actions = Object.create(null);
modalOptions.actions.forEach(function (action) { actions[action.label] = action; });
assert(actions['Save replay'] && actions['Save run'] && actions['Save creature brain']);
assert.strictEqual(actions['Save replay'].disabled, false);
assert.strictEqual(actions['Save creature brain'].disabled, false);

nameInput.value = 'My named champion';
actions['Save replay'].onClick();
assert.strictEqual(saveCalls[0].kind, 'replay');
assert.strictEqual(saveCalls[0].name, 'My named champion');
assert.strictEqual(saveCalls[0].recording, recording);

actions['Save run'].onClick();
assert.strictEqual(saveCalls[1].kind, 'run');
assert.strictEqual(saveCalls[1].name, 'My named champion');
assert.strictEqual(saveCalls[1].data, screen.data);

actions['Save creature brain'].onClick();
assert.strictEqual(saveCalls[2].kind, 'brain');
assert.strictEqual(saveCalls[2].creatureId, 'creature-1');
assert.strictEqual(saveCalls[2].recording, recording);
assert.deepStrictEqual(saveCalls[2].chromosome, screen.evolvedChromosome);
assert.strictEqual(saveCalls[2].settings, recording.networkSettings);
assert.strictEqual(saveCalls[2].lastV2, 0);
assert(alerts.some(function (alert) { return alert.title === 'Brain updated'; }));

screen.libraryCreatureId = null;
screen.showSaveMenu();
var unsavedBrainAction = modalOptions.actions.filter(function (action) {
  return action.label === 'Save creature brain';
})[0];
assert.strictEqual(unsavedBrainAction.disabled, true, 'an unsaved design cannot create a new brain snapshot');

console.log('Named Save Replay, Save Run and in-place action-brain menu checks passed.');
