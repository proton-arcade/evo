/* Regression tests for playback, generation handoff, and no-recording states.
 * Run with: node tests/simulation-playback-lifecycle-test.js
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
      var row = element('div', 'button-row ' + (className || ''));
      buttons.forEach(function (button) {
        if (!button) return;
        var node = element('button', 'evo-button ' + (button.className || ''), button.label);
        node.addEventListener('click', button.onClick);
        row.appendChild(node);
      });
      return row;
    },
  },
  Objective: { Running: 0, Flying: 4 },
  ObjectiveUtil: {
    stringRepresentation: function (objective) {
      return objective === 4 ? 'Flying' : 'Running';
    },
  },
  Utils: {
    clamp: function (value, min, max) {
      return Math.max(min, Math.min(max, value));
    },
  },
  Settings: {},
  PhysicsWorld: function () { this.clear = function () {}; },
  Scene: function (world, description) {
    this.world = world;
    this.description = description;
    this.renderables = [];
    this.distanceMarkers = [];
  },
  App: { show: function () {} },
  Screens: {},
};
require('../js/ui/simulation.js');

var screen = Object.create(global.EVO.SimulationScreen);
var originalScene = { name: 'running scene' };
var nextScene = { name: 'flying scene' };
screen.settings = { Objective: global.EVO.Objective.Running, SimulationTime: 5 };
screen.state = 'simulating';
screen.autoplay = false;
screen.speed = 1;
screen.playbackTime = 0;
screen.playbackDuration = 0;
screen.playbackPlaying = true;
screen.playbackFinished = false;
screen.playback = null;
screen.playbackScene = null;
screen.playbackObjective = global.EVO.Objective.Running;
screen.awaitingPlayback = false;
screen.pendingAutosaveGeneration = null;
screen.autoSaveGeneration = 0;
screen.waitTimer = 0;
screen.currentGeneration = 1;
screen.watchingIndex = 0;
screen.evolution = {
  Settings: { Objective: global.EVO.Objective.Running, SimulationTime: 5 },
  SceneDescription: originalScene,
  scene: originalScene,
  paused: false,
  playbackPending: false,
  completedSolutions: [{}],
  currentGenerationNumber: 1,
  currentCreatureBatch: [],
  batchElapsed: 0,
  solutions: [],
  generationFitness: [],
  pause: function () {
    this.paused = true;
  },
  resume: function () {
    this.paused = false;
  },
};
screen.refreshStats = function () {};
screen.refreshHud = global.EVO.SimulationScreen.refreshHud;
screen.autosaved = [];
screen.autosave = function (generation) {
  this.autosaved.push(generation);
};
screen.buildHud(element('div'));

screen.onGenerationEnd({
  generation: 1,
  best: { stats: { fitness: 0.25, unclampedFitness: 0.25 } },
  recording: null,
});
assert.strictEqual(screen.evolution.paused, true);
assert.strictEqual(screen.state, 'playback');
assert.strictEqual(screen.playbackScene.description, originalScene, 'the replay scene uses the just-finished scene descriptor');
assert.notStrictEqual(screen.playbackScene, screen.evolution.scene, 'replay uses a clean render-only scene, not final obstacle positions');
var replayScene = screen.playbackScene;
assert.strictEqual(screen.playbackObjective, global.EVO.Objective.Running);
assert.strictEqual(screen.playbackGeneration, 1);
assert.strictEqual(screen.pendingAutosaveGeneration, 1);
assert.deepStrictEqual(screen.autosaved, [], 'autosave waits until the next population is prepared');
assert.strictEqual(screen.playbackBar.classNames.hidden, false, 'the handoff controls remain visible without a recording');
assert.strictEqual(screen.playButton.classNames.hidden, true);
assert.strictEqual(screen.seekSlider.classNames.hidden, true);
assert.strictEqual(screen.saveRecordingButton.classNames.hidden, true);
assert.strictEqual(screen.recordingLabel.textContent, 'GEN 1 · NO RECORDING');
assert.strictEqual(screen.timeLabel.textContent, 'NO RECORDING');

screen.evolution.SceneDescription = nextScene;
screen.evolution.scene = nextScene;
screen.evolution.Settings = { Objective: global.EVO.Objective.Flying, SimulationTime: 7 };
var syncCount = 0;
screen.syncCameraControlPoints = function () {
  syncCount++;
};
screen.onGenerationBegin(2);
assert.deepStrictEqual(screen.autosaved, [1], 'autosave runs after the next generation settings/chromosomes are ready');
assert.strictEqual(screen.state, 'playback', 'the replay/handoff remains visible after preparation');
assert.strictEqual(screen.generationLabel.textContent, 'GENERATION 1', 'the generation label tracks the replay, not the prepared population');
assert.strictEqual(screen.playbackScene, replayScene, 'preparing a different scene does not replace the replay scene');
assert.strictEqual(screen.playbackObjective, global.EVO.Objective.Running, 'the task display stays aligned with the replay');
assert.strictEqual(syncCount, 0, 'the next scene does not change camera controls before replay ends');

screen.resetCamera = function () {};
screen.watchingIndex = 3;
screen.continueToNextGeneration();
assert.strictEqual(screen.state, 'simulating');
assert.strictEqual(screen.playbackScene, null);
assert.strictEqual(screen.watchingIndex, 0, 'continuing resets a stale creature index after population changes');
assert.strictEqual(screen.evolution.playbackPending, false);
assert.strictEqual(screen.evolution.completedSolutions, null, 'completed solutions are released after the handoff');
assert.strictEqual(screen.evolution.paused, false);
assert.strictEqual(syncCount, 1, 'camera scene controls switch when simulation resumes');

screen.pendingAutosaveGeneration = 2;
screen.data = {};
screen.recording = {};
screen.playback = {};
screen.ghost = {};
screen.playbackScene = {};
screen.playbackTarget = {};
screen.trackedCamera = { target: {}, controlPoints: [{}] };
screen.detachEvents = function () {};
screen.saveStateToSettings = function () {};
screen.evolution.finish = function () {};
screen.hide();
assert.deepStrictEqual(screen.autosaved, [1, 2], 'exiting during playback flushes a pending autosave');
assert.strictEqual(screen.pendingAutosaveGeneration, null);
assert.strictEqual(screen.evolution, null, 'leaving the singleton screen releases the simulation engine');
assert.strictEqual(screen.data, null, 'leaving releases population chromosome arrays');
assert.strictEqual(screen.recording, null);
assert.strictEqual(screen.playback, null);
assert.strictEqual(screen.ghost, null);
assert.strictEqual(screen.playbackScene, null);
assert.strictEqual(screen.playbackTarget, null);
assert.strictEqual(screen.trackedCamera.target, null);

console.log('Simulation playback lifecycle and no-recording regression checks passed.');
