/* Regression test for settings panel models after the evolution engine starts.
 * Run with: node tests/simulation-settings-active-future-test.js
 */
'use strict';

var assert = require('assert');

function FakeElement(tagName, className, textContent) {
  this.tagName = String(tagName).toUpperCase();
  this.className = className || '';
  this.textContent = textContent || '';
  this.children = [];
}
FakeElement.prototype.appendChild = function (child) {
  this.children.push(child);
  child.parentNode = this;
  return child;
};
function element(tagName, className, textContent) {
  return new FakeElement(tagName, className, textContent);
}

global.EVO = {
  UI: { el: element },
  Widgets: {},
  Objective: { Running: 0, Flying: 4 },
  ObjectiveUtil: { stringRepresentation: function () { return 'Running'; } },
  SimulationSettingsPanel: {
    create: function (settings, networkSettings, onChange) {
      global.EVO.panelModels = { settings: settings, networkSettings: networkSettings, onChange: onChange };
      return element('div', 'settings-panels');
    },
  },
  DefaultSimulationScenes: {
    defaultSceneForObjective: function (objective) {
      return { objective: objective };
    },
  },
  SimulationSettings: { encode: function (value) { return value; } },
  NeuralNetworkSettings: { encode: function (value) { return value; } },
  CreatureDesign: { encode: function (value) { return value; } },
  App: {},
  Store: {},
  Modal: {},
  Storage: {},
  Utils: {},
  Settings: {},
  Screens: {},
};

function FakeEvolution(options) {
  this.data = options.data;
  this.Settings = this.data.Settings;
  this.NetworkSettings = this.data.NetworkSettings;
  this.SettingsForNextGeneration = Object.assign({}, this.data.Settings);
  this.NetworkSettingsForNextGeneration = {
    NodesPerIntermediateLayer: this.data.NetworkSettings.NodesPerIntermediateLayer.slice(),
  };
  this.playbackPending = false;
  this.start = function () {
    this.Settings = Object.assign({}, this.SettingsForNextGeneration);
    this.NetworkSettings = {
      NodesPerIntermediateLayer: this.NetworkSettingsForNextGeneration.NodesPerIntermediateLayer.slice(),
    };
    this.data.Settings = this.Settings;
    this.data.NetworkSettings = this.NetworkSettings;
  };
}
global.EVO.Evolution = FakeEvolution;
require('../js/ui/simulation.js');

var screen = Object.create(global.EVO.SimulationScreen);
screen.element = element('div');
screen.settings = { Objective: global.EVO.Objective.Running, SimulationTime: 10, PopulationSize: 4 };
screen.networkSettings = { NodesPerIntermediateLayer: [3] };
screen.data = {
  Settings: screen.settings,
  NetworkSettings: screen.networkSettings,
  CreatureDesign: { name: 'test' },
};
screen.refreshHud = function () {};
screen.saveStateToSettings = function () {};
screen.buildSettingsDrawer(screen.element);
var panelSettings = global.EVO.panelModels.settings;
var panelNetworkSettings = global.EVO.panelModels.networkSettings;

screen.startSimulation();
assert.strictEqual(screen.settings, panelSettings, 'the settings screen and top HUD share the panel model');
assert.strictEqual(screen.networkSettings, panelNetworkSettings);
assert.strictEqual(screen.evolution.SettingsForNextGeneration, panelSettings);
assert.notStrictEqual(screen.evolution.Settings, panelSettings, 'active settings are snapshotted separately');
assert.notStrictEqual(screen.evolution.NetworkSettings, panelNetworkSettings);

// The HUD duration control writes to the future model; then a change from the
// settings panel must not replace it with the stale pre-start settings object.
panelSettings.SimulationTime = 25;
screen.evolution.SettingsForNextGeneration.SimulationTime = 25;
panelSettings.Objective = global.EVO.Objective.Flying;
panelSettings.MutationRate = 0.2;
panelNetworkSettings.NodesPerIntermediateLayer[0] = 6;
global.EVO.panelModels.onChange(panelSettings, panelNetworkSettings);

assert.strictEqual(screen.evolution.Settings.SimulationTime, 10, 'the active generation keeps its original duration');
assert.strictEqual(screen.evolution.Settings.Objective, global.EVO.Objective.Running);
assert.strictEqual(screen.evolution.SettingsForNextGeneration.SimulationTime, 25);
assert.strictEqual(screen.evolution.SettingsForNextGeneration.Objective, global.EVO.Objective.Flying);
assert.strictEqual(screen.evolution.NetworkSettings.NodesPerIntermediateLayer[0], 3);
assert.strictEqual(screen.evolution.NetworkSettingsForNextGeneration.NodesPerIntermediateLayer[0], 6);
assert.strictEqual(screen.evolution.SceneDescriptionForNextGeneration.objective, global.EVO.Objective.Flying);

console.log('Simulation settings active/future model regression checks passed.');
