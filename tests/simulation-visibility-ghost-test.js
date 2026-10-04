/* Regression tests for the simulation "Visibility" mode.
 *
 * Visibility mode shows the whole population, but instead of drawing every
 * creature fully opaque (which merges into one mess) the population is faded
 * out and the best creature of the previous generation is highlighted above all
 * of them.
 *
 * Run with: node tests/simulation-visibility-ghost-test.js
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

/** Records every creature draw call so that the layering can be asserted. */
var drawCalls = [];
var HiddenCreatureOpacity = 0.225;

global.EVO = {
  UI: {
    el: element,
    findButton: function (row, marker) {
      for (var i = 0; i < row.children.length; i++) {
        var child = row.children[i];
        if (child && typeof child.className === 'string' && child.className.indexOf(marker) >= 0) {
          return child;
        }
      }
      return null;
    },
  },
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
  Objective: { Running: 0, Jumping: 1, ObstacleJump: 2, Climbing: 3, Flying: 4 },
  ObjectiveUtil: {
    stringRepresentation: function () {
      return 'Obstacle Jump';
    },
  },
  Utils: {
    clamp: function (value, min, max) {
      return Math.max(min, Math.min(max, value));
    },
  },
  Settings: {
    HiddenCreatureOpacity: HiddenCreatureOpacity,
    ShowMuscles: true,
    ShowMuscleContraction: false,
    DefaultGridVisibility: 0,
    FlyingGridVisibility: 0,
    GridSize: 1,
  },
  Renderer: {
    drawBackground: function () {},
    drawGrid: function () {},
    drawScene: function () {},
    drawDistanceMarkers: function () {},
    drawCreature: function (ctx, creature, camera, options) {
      drawCalls.push({ kind: 'creature', creature: creature, opacity: options.opacity });
    },
    drawPlaybackCreature: function (ctx, creature, camera, options) {
      drawCalls.push({ kind: 'ghost', creature: creature, opacity: options.opacity });
    },
  },
  App: { show: function () {} },
  Screens: {},
};
require('../js/ui/simulation.js');

var batch = [{ name: 'creature 0' }, { name: 'creature 1' }, { name: 'creature 2' }];
var ghost = {
  name: 'previous best',
  getDuration: function () {
    return 10;
  },
  seek: function () {},
};

var screen = Object.create(global.EVO.SimulationScreen);
screen.canvas = { getContext: function () { return { setTransform: function () {} }; } };
screen.camera = {};
screen.trackedCamera = {
  update: function () {},
  target: null,
};
screen.pixelRatio = 1;
screen.frameCount = 1;
screen.drawThumbnail = function () {};
screen.showAllCreatures = true;
screen.state = 'simulating';
screen.watchingIndex = 1;
screen.ghost = ghost;
screen.ghostTime = 0;
screen.playback = null;
screen.playbackScene = null;
screen.playbackObjective = global.EVO.Objective.ObstacleJump;
screen.playbackTarget = null;
screen.evolution = {
  Settings: { Objective: global.EVO.Objective.ObstacleJump, SimulationTime: 10 },
  scene: { obstacleBlocks: [] },
  currentCreatureBatch: batch,
  currentGenerationNumber: 1,
  paused: false,
  solutions: [],
  generationFitness: [],
  batchElapsed: 0,
  playbackPending: false,
  completedSolutions: null,
  pause: function () {
    this.paused = true;
  },
  resume: function () {
    this.paused = false;
  },
  getWatchingCreature: function (index) {
    return this.currentCreatureBatch[index];
  },
};

function drawAndCollect() {
  drawCalls = [];
  screen.draw();
  return drawCalls;
}

/* --- Visibility on: faded population, previous best on top -------------- */
var calls = drawAndCollect();
var creatureCalls = calls.filter(function (call) {
  return call.kind === 'creature';
});
var ghostCalls = calls.filter(function (call) {
  return call.kind === 'ghost';
});
assert.strictEqual(creatureCalls.length, batch.length, 'the whole population stays visible');
assert.strictEqual(ghostCalls.length, 1, 'the previous generation\'s best is drawn once');
creatureCalls.forEach(function (call) {
  assert.strictEqual(
    call.opacity,
    HiddenCreatureOpacity,
    'the population is faded so that it does not merge into one mess'
  );
});
assert.strictEqual(ghostCalls[0].opacity, 1, 'the previous generation\'s best is drawn fully opaque');
var ghostIndex = calls.findIndex(function (call) {
  return call.kind === 'ghost';
});
assert.strictEqual(
  ghostIndex,
  calls.length - 1,
  'the previous generation\'s best is drawn above all other creatures'
);
batch.forEach(function (creature) {
  assert.ok(
    calls.findIndex(function (call) {
      return call.creature === creature;
    }) < ghostIndex,
    'every creature of the current generation is drawn below the previous best'
  );
});

/* --- Visibility off: only the watched creature, ghost stays behind ------ */
screen.showAllCreatures = false;
calls = drawAndCollect();
creatureCalls = calls.filter(function (call) {
  return call.kind === 'creature';
});
ghostCalls = calls.filter(function (call) {
  return call.kind === 'ghost';
});
assert.strictEqual(creatureCalls.length, batch.length, 'every creature is still submitted to the renderer');
assert.strictEqual(creatureCalls[0].opacity, HiddenCreatureOpacity, 'unwatched creatures stay faded');
assert.strictEqual(creatureCalls[1].opacity, 1, 'the watched creature is fully opaque');
assert.strictEqual(ghostCalls[0].opacity, HiddenCreatureOpacity, 'the ghost is faded in single-creature mode');
assert.strictEqual(
  calls[0].kind,
  'ghost',
  'in single-creature mode the ghost is drawn behind the creatures'
);

/* --- No ghost yet: the watched creature is highlighted instead ---------- */
screen.showAllCreatures = true;
screen.ghost = null;
calls = drawAndCollect();
creatureCalls = calls.filter(function (call) {
  return call.kind === 'creature';
});
assert.strictEqual(
  creatureCalls.length,
  batch.length,
  'without a previous best every creature is still drawn'
);
assert.strictEqual(
  creatureCalls[1].opacity,
  1,
  'before the first generation ends the watched creature is highlighted'
);
assert.strictEqual(
  creatureCalls[0].opacity,
  HiddenCreatureOpacity,
  'the rest of the population stays faded'
);
assert.strictEqual(
  calls.some(function (call) {
    return call.kind === 'ghost';
  }),
  false,
  'there is no ghost to draw before the first generation has ended'
);
screen.ghost = ghost;

/* --- The HUD exposes the visibility state ------------------------------- */
screen.refreshHud = global.EVO.SimulationScreen.refreshHud;
screen.settings = { Objective: global.EVO.Objective.ObstacleJump, SimulationTime: 10 };
screen.autoplay = true;
screen.speed = 1;
screen.autoplayToggle = null;
screen.settingsVisible = false;
screen.simulationSettingsPanel = null;
screen.buildHud(element('div'));
assert.ok(screen.visibilityButton, 'the visibility toggle keeps a handle for its state');
screen.showAllCreatures = true;
screen.refreshHud();
assert.strictEqual(
  screen.visibilityButton.classNames.primary,
  true,
  'the visibility toggle shows that the whole population is visible'
);
screen.showAllCreatures = false;
screen.refreshHud();
assert.strictEqual(
  screen.visibilityButton.classNames.primary,
  false,
  'the visibility toggle shows that only the watched creature is visible'
);

/* --- The HUD reports the block progress of the obstacle course ---------- */
screen.showAllCreatures = true;
screen.evolution.getWatchingCreature = function () {
  return null;
};
var watchedCreature = {
  objectiveTracker: {
    getBlockProgress: function () {
      return { passed: 2, total: 5 };
    },
  },
};
screen.evolution.getWatchingCreature = function () {
  return watchedCreature;
};
screen.refreshHud();
assert.strictEqual(screen.blocksRow.classNames.hidden, false, 'the block progress is shown for Obstacle Jump');
assert.strictEqual(screen.blocksLabel.textContent, '2/5', 'the block progress is reported');
screen.evolution.Settings.Objective = global.EVO.Objective.Running;
screen.refreshHud();
assert.strictEqual(screen.blocksRow.classNames.hidden, true, 'other objectives hide the block progress');

console.log('Simulation visibility and previous-best layering regression checks passed.');
