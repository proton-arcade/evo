/* Regression test for population/batch-size and duration control synchronization.
 * Run with: node tests/simulation-settings-batch-clamp-test.js
 */
'use strict';

var assert = require('assert');

global.document = { documentElement: {}, body: {} };
require('../js/core/util.js');
require('../js/core/network.js');
require('../js/core/algorithms.js');
require('../js/core/data.js');

function FakeElement(tagName, className, textContent) {
  this.tagName = String(tagName).toUpperCase();
  this.className = className || '';
  this.textContent = textContent || '';
  this.children = [];
  this.listeners = {};
  this.value = '';
  this.checked = false;
}
FakeElement.prototype.appendChild = function (child) {
  this.children.push(child);
  child.parentNode = this;
  return child;
};
FakeElement.prototype.addEventListener = function (name, handler) {
  this.listeners[name] = handler;
};
FakeElement.prototype.removeChild = function (child) {
  var index = this.children.indexOf(child);
  if (index >= 0) this.children.splice(index, 1);
  child.parentNode = null;
  return child;
};
Object.defineProperty(FakeElement.prototype, 'firstChild', {
  get: function () {
    return this.children.length ? this.children[0] : null;
  },
});

function element(tagName, className, textContent) {
  return new FakeElement(tagName, className, textContent);
}
global.EVO.UI = { el: element, clear: function (node) {
  while (node.firstChild) node.removeChild(node.firstChild);
} };
global.EVO.Screens = {};
require('../js/ui/app.js');

var settings = global.EVO.SimulationSettings.defaultSettings();
settings.PopulationSize = 20;
settings.BatchSize = 15;
var networkSettings = global.EVO.NeuralNetworkSettings.defaultSettings();
var changes = 0;
var panel = global.EVO.SimulationSettingsPanel.create(settings, networkSettings, function () {
  changes++;
});
var simulationPanel = panel.children[0];
var populationSlider = simulationPanel.body.children[2].children[1];
var batchStepper = simulationPanel.body.children[4];
var stepperControls = batchStepper.children[1];
var batchValue = stepperControls.children[1];
var batchPlus = stepperControls.children[2];
var durationSlider = simulationPanel.body.children[1].children[1];
var durationValue = simulationPanel.body.children[1].children[0].children[1];

assert.strictEqual(batchValue.textContent, '15');
populationSlider.value = '4';
populationSlider.listeners.input();
assert.strictEqual(settings.PopulationSize, 4);
assert.strictEqual(settings.BatchSize, 4, 'reducing population clamps batch size to the new population');
assert.strictEqual(batchValue.textContent, '4', 'the visible batch stepper updates with the clamped value');

batchPlus.listeners.click();
assert.strictEqual(settings.BatchSize, 4, 'the batch stepper cannot exceed the population size');
assert.strictEqual(batchValue.textContent, '4', 'the batch stepper should snap back to its effective value');

panel.setSimulationTime(30);
assert.strictEqual(durationSlider.value, '30', 'HUD duration changes synchronize into the settings panel');
assert.strictEqual(durationValue.textContent, '30s');

durationSlider.value = '15';
durationSlider.listeners.input();
assert.strictEqual(settings.SimulationTime, 15);
assert(changes >= 3, 'user control changes propagate to the settings callback');

console.log('Simulation settings synchronization and batch clamp checks passed.');
