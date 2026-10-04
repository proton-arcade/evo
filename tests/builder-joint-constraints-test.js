/* Regression tests for editor movement constraints and zero-valued component IDs.
 * Run with: node tests/builder-joint-constraints-test.js
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
require('../js/sim/builder.js');

var EVO = global.EVO;
var design = EVO.CreatureDesign.create(
  'Move test',
  [
    EVO.JointData.create(1, { x: 0, y: 0 }, 1, 0),
    EVO.JointData.create(2, { x: 2, y: 0 }, 1, 0),
    EVO.JointData.create(3, { x: 4, y: 0 }, 1, 0),
  ],
  [EVO.BoneData.create(4, 1, 2), EVO.BoneData.create(5, 2, 3)],
  [],
  []
);
var builder = new EVO.CreatureBuilder(design);
assert.strictEqual(builder.moveJoint(1, { x: 1.8, y: 0 }), false, 'dragging a joint into another must be rejected');
assert.strictEqual(builder.findJoint(1).x, 0, 'rejected single-joint moves must leave the design unchanged');

assert.strictEqual(
  builder.moveJoints([1, 2], { x: 2, y: 0 }),
  false,
  'moving a bone into an unrelated joint must be rejected atomically'
);
assert.strictEqual(builder.findJoint(1).x, 0);
assert.strictEqual(builder.findJoint(2).x, 2);
assert.strictEqual(builder.moveJoints([1, 2], { x: -2, y: 0 }), true);
assert.strictEqual(builder.findJoint(1).x, -2);
assert.strictEqual(builder.findJoint(2).x, 0);

var zeroIdBuilder = new EVO.CreatureBuilder(
  EVO.CreatureDesign.create(
    'Zero ID test',
    [
      EVO.JointData.create(0, { x: 0, y: 0 }, 1, 0),
      EVO.JointData.create(1, { x: 2, y: 0 }, 1, 0),
      EVO.JointData.create(2, { x: 4, y: 0 }, 1, 0),
    ],
    [EVO.BoneData.create(0, 0, 1), EVO.BoneData.create(1, 1, 2)],
    [],
    []
  )
);
assert.strictEqual(zeroIdBuilder.tryStartingBone(2), true);
assert.strictEqual(zeroIdBuilder.updateCurrentBoneEnd(0), true, 'joint ID zero must be a valid bone endpoint');
assert.strictEqual(zeroIdBuilder.placeCurrentBone(), true);
assert.strictEqual(zeroIdBuilder.design.bones[2].startJointID, 2);
assert.strictEqual(zeroIdBuilder.design.bones[2].endJointID, 0);

assert.strictEqual(zeroIdBuilder.tryStartingMuscle(1), true);
assert.strictEqual(zeroIdBuilder.updateCurrentMuscleEnd(0), true, 'bone ID zero must be a valid muscle endpoint');
assert.strictEqual(zeroIdBuilder.placeCurrentMuscle(), true);
assert.strictEqual(zeroIdBuilder.design.muscles[0].startBoneID, 1);
assert.strictEqual(zeroIdBuilder.design.muscles[0].endBoneID, 0);

console.log('Builder collision and zero-ID regression checks passed.');
