/* Regression test for choosing muscle endpoints near a shared joint.
 * Run with: node tests/muscle-bone-hit-test.js
 */
'use strict';

var assert = require('assert');

require('../js/core/util.js');
require('../js/core/network.js');
require('../js/core/data.js');

global.EVO.Creature = { JOINT_RADIUS: 0.5 };
require('../js/sim/builder.js');
global.EVO.Screens = {};
require('../js/ui/editor.js');

var EVO = global.EVO;

function makeEditor() {
  var joints = [
    EVO.JointData.create(1, { x: 0, y: 0 }, 1, 0),
    EVO.JointData.create(2, { x: 4, y: 0 }, 1, 0),
    EVO.JointData.create(3, { x: 0, y: 4 }, 1, 0),
  ];
  var bones = [
    EVO.BoneData.create(10, 1, 2, 1, false, false, false),
    EVO.BoneData.create(20, 1, 3, 1, false, false, false),
  ];
  var builder = new EVO.CreatureBuilder(
    EVO.CreatureDesign.create('Hit test fixture', joints, bones, [], [])
  );
  var editor = Object.create(EVO.EditorScreen);

  editor.builder = builder;
  editor.camera = { orthographicSize: 10 };
  editor.tool = EVO.EditorTools.MUSCLE;
  editor.pending = null;
  editor.snap = function (point) {
    return point;
  };
  editor.render = function () {};
  editor.changeAndRecord = function (modification) {
    return modification(this.builder);
  };

  return editor;
}

function tap(editor, point) {
  editor.applyToolAt(point, point);
}

// Both clicks are close enough to the shared joint that generic hit testing
// reports the joint. Bone-specific targeting must still distinguish the tap.
var editor = makeEditor();
var tolerance = editor.hitTolerance() + 0.4;
assert.deepStrictEqual(editor.builder.hitTest({ x: 0, y: 0.2 }, tolerance), {
  type: 'joint',
  id: 1,
});

tap(editor, { x: 0.2, y: 0 });
assert.strictEqual(editor.pending.startId, 10, 'horizontal bone should start the muscle');
tap(editor, { x: 0, y: 0.2 });
assert.strictEqual(editor.builder.design.muscles.length, 1);
assert.strictEqual(editor.builder.design.muscles[0].startBoneID, 10);
assert.strictEqual(editor.builder.design.muscles[0].endBoneID, 20);

// Reverse the order too, so either bone can be selected as the first endpoint.
editor = makeEditor();
tap(editor, { x: 0, y: 0.2 });
assert.strictEqual(editor.pending.startId, 20, 'vertical bone should start the muscle');
tap(editor, { x: 0.2, y: 0 });
assert.strictEqual(editor.builder.design.muscles.length, 1);
assert.strictEqual(editor.builder.design.muscles[0].startBoneID, 20);
assert.strictEqual(editor.builder.design.muscles[0].endBoneID, 10);

// At an exactly shared point the segments tie; select the later-drawn bone.
editor = makeEditor();
assert.strictEqual(editor.hitBone({ x: 0, y: 0 }).id, 20);

console.log('Muscle bone hit-test regression checks passed.');
