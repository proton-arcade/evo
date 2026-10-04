/* Regression checks for the progressive Obstacle Jump block course and its fitness.
 * Run with: node tests/obstacle-block-course-test.js
 */
'use strict';

var assert = require('assert');

global.document = { documentElement: {}, body: {} };
require('../js/core/util.js');
require('../js/core/algorithms.js');
require('../js/core/data.js');
require('../js/sim/physics.js');
require('../js/sim/scene.js');
require('../js/sim/brain.js');

var EVO = global.EVO;
var description = EVO.DefaultSimulationScenes.obstacleJumpScene();
var blockSpawner = description.structures.filter(function (entry) {
  return entry.type === EVO.StructureType.ObstacleBlockSpawner;
})[0];
assert(blockSpawner, 'the default obstacle objective uses the block course');
assert.strictEqual(
  description.structures.some(function (entry) {
    return entry.type === EVO.StructureType.RollingObstacleSpawner;
  }),
  false,
  'the default obstacle scene no longer launches rolling balls'
);

var world = new EVO.PhysicsWorld();
var scene = new EVO.Scene(world, description);
assert.strictEqual(scene.blocks.length, 5, 'the course has several blocks');
assert.strictEqual(scene.obstacles.length, 0, 'no rolling obstacle is created');
for (var i = 1; i < scene.blocks.length; i++) {
  assert(scene.blocks[i].height > scene.blocks[i - 1].height, 'block height grows along the course');
  assert(scene.blocks[i].width > scene.blocks[i - 1].width, 'block width grows along the course');
}
assert(
  world.staticBoxes.some(function (box) { return box.tag === 'Obstacle'; }),
  'blocks participate in creature collision physics as obstacles'
);
assert(
  scene.renderables.some(function (renderable) {
    return renderable.kind === 'box' && renderable.color === EVO.SceneColors.obstacle;
  }),
  'blocks are drawn as solid boxes'
);

var creature = {
  scene: scene,
  initialPosition: { x: 0, y: 2 },
  joints: [
    { body: { x: 0, y: 2, radius: 0.5 } },
    { body: { x: -0.5, y: 1, radius: 0.5 } },
  ],
  getXPosition: function () {
    return this.joints.reduce(function (sum, joint) { return sum + joint.body.x; }, 0) / this.joints.length;
  },
  distanceFromGround: function () { return 0; },
  addObstacleCollidingJointsToSet: function () {},
};
var tracker = EVO.ObjectiveTracker.create(EVO.Objective.ObstacleJump, creature);
var beforeClearing = tracker.evaluateFitness();

// Moving the entire creature past the first block earns a clear, measurable
// increase in fitness even when it did not collide with anything.
creature.joints.forEach(function (joint) {
  joint.body.x = scene.blocks[0].right + 1;
});
tracker.fixedUpdate(1 / 60);
var afterFirstBlock = tracker.evaluateFitness();
assert(afterFirstBlock > beforeClearing, 'clearing a block is rewarded');
assert.strictEqual(tracker.passedBlockCount, 1);

creature.joints.forEach(function (joint) {
  joint.body.x = scene.blocks[scene.blocks.length - 1].right + 1;
});
tracker.fixedUpdate(1 / 60);
assert.strictEqual(tracker.passedBlockCount, scene.blocks.length, 'the full course can be cleared');
assert(tracker.evaluateFitness() > afterFirstBlock, 'fitness rewards clearing additional blocks');

console.log('Progressive obstacle blocks, collision setup and pass-reward checks passed.');
