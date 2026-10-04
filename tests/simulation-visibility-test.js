/* Regression check that Visibility foregrounds the previous generation's champion.
 * Run with: node tests/simulation-visibility-test.js
 */
'use strict';

var assert = require('assert');
var drawOrder = [];

global.EVO = {
  Settings: {
    HiddenCreatureOpacity: 0.225,
    ShowMuscles: true,
    ShowMuscleContraction: false,
  },
  Renderer: {
    drawCreature: function (ctx, creature, camera, options) {
      drawOrder.push({ kind: creature.name, opacity: options.opacity });
    },
    drawPlaybackCreature: function (ctx, playback, camera, options) {
      drawOrder.push({
        kind: 'previous best',
        opacity: options.opacity,
        highlight: !!options.highlight,
      });
    },
  },
  Screens: {},
};
require('../js/ui/simulation.js');

var screen = Object.create(global.EVO.SimulationScreen);
screen.state = 'simulating';
screen.showAllCreatures = false;
screen.watchingIndex = 0;
screen.ghostTime = 0;
screen.camera = {};
screen.ghost = {
  getDuration: function () { return 2; },
  seek: function () {},
};
screen.evolution = {
  currentCreatureBatch: [{ name: 'current 1' }, { name: 'current 2' }],
};
screen.drawCreaturePopulation({});

assert.deepStrictEqual(
  drawOrder.map(function (entry) { return entry.kind; }),
  ['current 1', 'current 2', 'previous best'],
  'the previous champion is drawn after the current population'
);
assert.strictEqual(drawOrder[0].opacity, 0.225, 'the current population is dimmed while focused');
assert.strictEqual(drawOrder[1].opacity, 0.225);
assert.strictEqual(drawOrder[2].opacity, 1, 'the previous champion is fully visible');
assert.strictEqual(drawOrder[2].highlight, true, 'the previous champion receives a visual highlight');

// With the visibility control turned back on, the current generation returns
// to full opacity and the previous-best ghost goes behind it.
drawOrder = [];
screen.showAllCreatures = true;
screen.drawCreaturePopulation({});
assert.deepStrictEqual(
  drawOrder.map(function (entry) { return entry.kind; }),
  ['previous best', 'current 1', 'current 2']
);
assert.strictEqual(drawOrder[0].opacity, 0.225);
assert.strictEqual(drawOrder[1].opacity, 1);

console.log('Previous-generation visibility layering checks passed.');
