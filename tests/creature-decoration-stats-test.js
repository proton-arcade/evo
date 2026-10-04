/* Regression tests for decorations in live/playback creatures and relative stats.
 * Run with: node tests/creature-decoration-stats-test.js
 */
'use strict';

var assert = require('assert');

global.document = { documentElement: {}, body: {} };
require('../js/core/util.js');
require('../js/core/network.js');
require('../js/core/algorithms.js');
require('../js/core/data.js');
require('../js/sim/physics.js');
require('../js/sim/scene.js');
require('../js/sim/creature.js');
require('../js/sim/brain.js');
require('../js/sim/playback.js');
require('../js/render/decorations.js');
require('../js/render/renderer.js');

var EVO = global.EVO;
var userIdContext = EVO.CalculateUniqueMusclesContext([
  { userId: '__proto__' },
  { userId: 'constructor' },
  { userId: '__proto__' },
  { userId: '' },
]);
assert.strictEqual(userIdContext.numberOfUniqueMuscleIds, 3);
assert.deepStrictEqual(userIdContext.muscleToOutputIndex, [0, 1, 0, 2]);

var design = EVO.CreatureDesign.create(
  'Scratch cosmetic creature',
  [
    EVO.JointData.create(1, { x: 0, y: 2 }, 1, 0),
    EVO.JointData.create(2, { x: 0, y: 1 }, 1, 0),
  ],
  [EVO.BoneData.create(1, 1, 2, 1, false, false)],
  [],
  [EVO.DecorationData.create(1, 1, { x: 0.25, y: 0.1 }, 1.2, 15, true, false, EVO.DecorationType.GooglyEye)]
);
var world = new EVO.PhysicsWorld();
var creature = new EVO.Creature(world, design, {});
assert.strictEqual(creature.decorations.length, 1, 'live creatures construct design decorations');
assert.strictEqual(creature.decorations[0].bone, creature.bones[0], 'the decoration binds to its design bone');
assert.strictEqual(creature.decorations[0].decorationType, EVO.DecorationType.GooglyEye);
assert.strictEqual(Object.getPrototypeOf(creature.jointIdsWithPenalty), null, 'penalty lookup keys are prototype-safe');

var startX = creature.getXPosition();
var startY = creature.getYPosition();
creature.initialPosition = { x: startX, y: startY };
creature.joints.forEach(function (joint) {
  joint.body.x += 2.5;
  joint.body.y -= 1.25;
});
creature.updateGeometry(0);
creature.objectiveTracker = { evaluateFitness: function () { return 0.5; } };
var stats = creature.getStatistics(2);
assert.strictEqual(stats.horizontalDistanceTravelled, 2.5);
assert.strictEqual(stats.verticalDistanceTravelled, -1.25);
assert(Math.abs(stats.averageSpeed - Math.sqrt(2.5 * 2.5 + 1.25 * 1.25) / 2) < 1e-12);

var recording = EVO.CreatureRecording.create(
  EVO.CreatureDesign.clone(design),
  null,
  {
    sampleTimestamps: [0, 0.1],
    jointPositions: [
      [{ x: 0, y: 2 }, { x: 0.2, y: 2 }],
      [{ x: 0, y: 1 }, { x: 0.2, y: 1 }],
    ],
    muscleForces: [],
  },
  EVO.Objective.Running,
  1,
  stats,
  11,
  0,
  EVO.NeuralNetworkSettings.defaultSettings()
);
var playback = new EVO.PlaybackCreature(recording);
playback.seek(0.1);
assert.strictEqual(playback.decorations.length, 1, 'recorded creatures retain their design decorations');
assert.strictEqual(playback.decorations[0].bone, playback.bones[0]);
assert.strictEqual(playback.decorations[0].scale, 1.2);
assert.strictEqual(playback.decorations[0].offset.x, 0.25);

var drawCount = 0;
var originalDrawDecoration = EVO.Renderer.drawDecoration;
EVO.Renderer.drawDecoration = function (ctx, decoration) {
  drawCount++;
  assert(decoration.bone, 'rendered decoration must have a live or playback bone');
};
var noOp = function () {};
var context = {
  save: noOp,
  restore: noOp,
  beginPath: noOp,
  moveTo: noOp,
  lineTo: noOp,
  stroke: noOp,
  arc: noOp,
  fill: noOp,
};
var camera = new EVO.Camera({ orthographicSize: 10 });
camera.resize(200, 200);
EVO.Renderer.drawCreature(context, creature, camera, { showMuscles: false });
EVO.Renderer.drawPlaybackCreature(context, playback, camera, { showMuscles: false });
EVO.Renderer.drawDecoration = originalDrawDecoration;
assert.strictEqual(drawCount, 2, 'both live simulation and playback render the decoration pass');

console.log('Creature decoration and relative-stat regression checks passed.');
