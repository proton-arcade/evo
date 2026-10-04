/* Regression tests for the Obstacle Jump block course.
 *
 * The obstacle scene no longer launches rolling balls at the creature: it is a
 * course of solid blocks that slowly grow in size.  A creature has to get past
 * them and is rewarded for every block it clears.
 *
 * Run with: node tests/obstacle-block-course-test.js
 */
'use strict';

var assert = require('assert');

global.document = {};
require('../js/core/util.js');
require('../js/core/network.js');
require('../js/core/algorithms.js');
require('../js/core/data.js');
require('../js/data/defaultCreatures.js');
require('../js/sim/physics.js');
require('../js/sim/scene.js');
require('../js/sim/creature.js');
require('../js/sim/brain.js');

var EVO = global.EVO;

/* ------------------------------------------------------------------ *
 * Scene layout
 * ------------------------------------------------------------------ */
var description = EVO.DefaultSimulationScenes.obstacleJumpScene();
assert.strictEqual(
  description.structures.some(function (entry) {
    return entry.type === EVO.StructureType.RollingObstacleSpawner;
  }),
  false,
  'the obstacle scene must not spawn rolling obstacle balls anymore'
);

var blockEntries = description.structures.filter(function (entry) {
  return entry.type === EVO.StructureType.ObstacleBlock;
});
assert.ok(blockEntries.length >= 3, 'the course consists of several blocks');

var world = new EVO.PhysicsWorld();
var scene = new EVO.Scene(world, description);
var blocks = scene.getObstacleBlocks();
assert.strictEqual(blocks.length, blockEntries.length, 'every block structure is tracked by the scene');

var ground = description.structures[0];
var groundSurfaceY = ground.transform.y + Math.abs(ground.transform.scaleY) / 2;
for (var b = 0; b < blocks.length; b++) {
  var block = blocks[b];
  assert.ok(
    Math.abs(block.y - block.halfHeight - groundSurfaceY) < 1e-6,
    'block ' + b + ' stands on the ground'
  );
  if (b > 0) {
    var previous = blocks[b - 1];
    assert.ok(block.left > previous.right, 'block ' + b + ' lies behind block ' + (b - 1));
    assert.ok(block.width > previous.width, 'block ' + b + ' is wider than the previous one');
    assert.ok(block.height > previous.height, 'block ' + b + ' is taller than the previous one');
  }
}
assert.ok(scene.getObstacleCourseLength() > 0, 'the block course has a length');

/* ------------------------------------------------------------------ *
 * Blocks are solid
 * ------------------------------------------------------------------ */
world.gravity = 0;
var slider = world.addBody({ x: 0, y: 1.0, radius: 0.5, mass: 1 });
slider.frictionOverride = 0;
slider.vx = 30;
for (var step = 0; step < 60; step++) {
  world.simulate(1 / 60, 3, 4);
}
assert.ok(
  slider.x <= blocks[0].left + 0.2,
  'a fast creature cannot pass straight through a block (x = ' + slider.x.toFixed(2) + ')'
);

// Restore gravity and drop a body onto the third block.
world.gravity = -50;
var dropper = world.addBody({ x: blocks[2].x, y: blocks[2].top + 6, radius: 0.5, mass: 1 });
for (var fall = 0; fall < 300; fall++) {
  world.simulate(1 / 60, 3, 4);
}
assert.ok(
  Math.abs(dropper.y - (blocks[2].top + 0.5)) < 0.05,
  'a body dropped onto a block rests on top of it'
);
assert.strictEqual(dropper.touchingObstacle, true, 'standing on a block counts as an obstacle contact');
assert.strictEqual(dropper.touchingGround, false, 'blocks are not ground');

/* ------------------------------------------------------------------ *
 * Fitness: reward for getting past the blocks
 * ------------------------------------------------------------------ */
function fakeCreature() {
  return {
    scene: scene,
    initialPosition: { x: 0, y: 0 },
    joints: [{}, {}],
    x: 0,
    ground: 0,
    getXPosition: function () {
      return this.x;
    },
    distanceFromGround: function () {
      return this.ground;
    },
    addObstacleCollidingJointsToSet: function () {},
  };
}

function trackerForCreature(creature) {
  return EVO.ObjectiveTracker.create(EVO.Objective.ObstacleJump, creature);
}

function advanceTo(creature, tracker, targetX) {
  while (creature.x < targetX) {
    creature.x = Math.min(targetX, creature.x + 0.5);
    tracker.fixedUpdate(1 / 60);
  }
}

var creature = fakeCreature();
var tracker = trackerForCreature(creature);
assert.strictEqual(tracker.getBlockProgress().total, blocks.length, 'the tracker knows the number of blocks');
assert.strictEqual(
  tracker.evaluateFitness(10),
  0,
  'a creature that does not move is not rewarded'
);

var lastFitness = 0;
var clearedCount = 0;
for (var index = 0; index < blocks.length; index++) {
  var current = blocks[index];
  // Walk up to just in front of the block: only the progress reward applies.
  advanceTo(creature, tracker, current.left - 0.5);
  var approaching = tracker.evaluateFitness(10);
  assert.ok(
    approaching > lastFitness,
    'walking towards block ' + index + ' improves the fitness'
  );

  // Now clear it.
  advanceTo(creature, tracker, current.right + 0.5);
  var cleared = tracker.evaluateFitness(10);
  clearedCount++;
  assert.strictEqual(
    tracker.getBlockProgress().passed,
    clearedCount,
    'block ' + index + ' counts as cleared'
  );
  assert.ok(
    cleared > approaching,
    'getting past a block rewards the creature more than just approaching it'
  );
  lastFitness = cleared;
}

assert.ok(
  Math.abs(lastFitness - 1) < 1e-6,
  'clearing every block and finishing the course gives the maximum fitness'
);
assert.ok(tracker.maxForwardDistance > 0, 'the tracker reports how far the creature got');
assert.strictEqual(
  Math.round(tracker.courseDistance),
  Math.round(blocks[blocks.length - 1].right),
  'the course distance is measured from the spawn to the end of the course'
);

// A creature that only walks far without clearing a block must be rewarded less
// than one that clears the block, even if it ends up at the same position.
var stopped = fakeCreature();
var stoppedTracker = trackerForCreature(stopped);
advanceTo(stopped, stoppedTracker, blocks[0].right - 1);
var stuckFitness = stoppedTracker.evaluateFitness(10);
stopped.x = blocks[0].right + 0.5;
stoppedTracker.fixedUpdate(1 / 60);
var clearedFitness = stoppedTracker.evaluateFitness(10);
assert.ok(clearedFitness > stuckFitness, 'clearing the block is what is rewarded');

/* ------------------------------------------------------------------ *
 * Blocks behind the spawn position do not count
 * ------------------------------------------------------------------ */
var offsetCreature = fakeCreature();
offsetCreature.initialPosition = { x: blocks[1].right + 1, y: 0 };
offsetCreature.x = offsetCreature.initialPosition.x;
var offsetTracker = trackerForCreature(offsetCreature);
offsetTracker.fixedUpdate(1 / 60);
assert.strictEqual(
  offsetTracker.getBlockProgress().passed,
  0,
  'a creature that spawns past a block does not get free credit for it'
);
assert.ok(
  offsetTracker.getBlockProgress().total < blocks.length,
  'blocks behind the spawn position are not part of the course anymore'
);
assert.strictEqual(offsetTracker.evaluateFitness(10), 0, 'spawning far ahead is not rewarded on its own');

/* ------------------------------------------------------------------ *
 * The legacy rolling-obstacle scenes keep their original fitness
 * ------------------------------------------------------------------ */
var legacyDescription = (function () {
  var scene = EVO.DefaultSimulationScenes.obstacleJumpScene();
  scene.structures = scene.structures.filter(function (entry) {
    return entry.type !== EVO.StructureType.ObstacleBlock;
  });
  scene.structures = scene.structures.slice(0, 2);
  scene.structures.push({
    type: EVO.StructureType.RollingObstacleSpawner,
    transform: { x: 20, y: 4, scaleX: 1, scaleY: 1, rotation: 180 },
    params: { spawnInterval: 5, obstacleLifetime: 5, forceMultiplier: 1 },
  });
  return scene;
})();
var legacyWorld = new EVO.PhysicsWorld();
var legacyScene = new EVO.Scene(legacyWorld, legacyDescription);
assert.strictEqual(legacyScene.getObstacleBlocks().length, 0, 'legacy scenes have no block course');
legacyScene.update(1 / 60);
assert.strictEqual(legacyScene.getObstacle() !== null, true, 'legacy scenes still report their rolling obstacle');

var legacyCreature = {
  scene: legacyScene,
  initialPosition: { x: 0, y: 0 },
  joints: [{}],
  getXPosition: function () {
    return 0;
  },
  distanceFromGround: function () {
    return 0;
  },
  addObstacleCollidingJointsToSet: function () {},
};
var legacyTracker = trackerForCreature(legacyCreature);
legacyTracker.fixedUpdate(1 / 60);
assert.strictEqual(legacyTracker.getBlockProgress().total, 0, 'legacy scenes have no block progress');
assert.ok(
  legacyTracker.evaluateFitness(10) > 0,
  'legacy obstacle scenes keep their collision-avoidance fitness'
);

/* ------------------------------------------------------------------ *
 * The legacy obstacle brain aims at the next block
 * ------------------------------------------------------------------ */
var target = scene.getObstacle(0);
assert.strictEqual(target.block, blocks[0], 'the next block ahead of the creature is reported');
var farTarget = scene.getObstacle(blocks[0].right + 0.1);
assert.strictEqual(farTarget.block, blocks[1], 'once a block is cleared the next one becomes the target');

console.log('Obstacle Jump block course regression checks passed.');
