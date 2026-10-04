/* Regression checks for the opt-in skip-generation-recap control.
 * Run with: node tests/simulation-skip-recap-test.js
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

global.EVO = {
  UI: { el: element },
  Widgets: {
    buttonRow: function (buttons, className) {
      var row = element('div', 'button-row ' + (className || ''));
      buttons.forEach(function (button) {
        var node = element('button', 'evo-button ' + (button.className || ''), button.label);
        node.addEventListener('click', button.onClick);
        row.appendChild(node);
      });
      return row;
    },
  },
  Objective: { Running: 0 },
  ObjectiveUtil: { stringRepresentation: function () { return 'Running'; } },
  Utils: { clamp: function (value, min, max) { return Math.max(min, Math.min(max, value)); } },
  Settings: { SkipGenerationRecap: false },
  App: {},
  Screens: {},
};
require('../js/ui/simulation.js');

var screen = Object.create(global.EVO.SimulationScreen);
screen.settings = { Objective: 0, SimulationTime: 10 };
screen.autoplay = true;
screen.skipRecap = false;
screen.refreshHud = function () {};
screen.buildHud(element('div'));
assert(screen.skipRecapToggle, 'the HUD exposes a skip-recap toggle');
screen.skipRecapToggle.listeners.click();
assert.strictEqual(screen.skipRecap, true, 'the control enables skipping recaps');
assert.strictEqual(global.EVO.Settings.SkipGenerationRecap, true, 'the preference is remembered');

var paused = false;
screen.evolution = {
  Settings: { Objective: global.EVO.Objective.Running },
  playbackPending: true,
  completedSolutions: [{}],
  pause: function () { paused = true; },
};
screen.thumbnailCaption = element('div');
screen.recordingLabel = element('span');
screen.refreshStats = function () {};
screen.autosaved = [];
screen.autosave = function (generation) { this.autosaved.push(generation); };
var bestChromosome = [1];
screen.onGenerationEnd({ generation: 1, recording: null, best: { chromosome: bestChromosome, stats: {} } });
assert.strictEqual(screen.evolvedChromosome, bestChromosome, 'the saved brain keeps the generation chromosome reference');
assert.strictEqual(screen.state, 'simulating', 'a skipped recap never enters playback state');
assert.strictEqual(screen.evolution.pause && paused, false, 'evolution keeps running through generation handoff');
assert.strictEqual(screen.pendingAutosaveGeneration, 1);

screen.onGenerationBegin(2);
assert.deepStrictEqual(screen.autosaved, [1], 'autosave still runs once the next population is prepared');
assert.strictEqual(screen.evolution.playbackPending, false, 'the skipped replay state is released');
assert.strictEqual(screen.evolution.completedSolutions, null);

var continueCount = 0;
screen.state = 'playback';
screen.continueToNextGeneration = function () { continueCount++; };
screen.setSkipRecap(true);
assert.strictEqual(continueCount, 1, 'enabling skip during playback also skips the current recap');

console.log('Skip-recap control and generation handoff checks passed.');
