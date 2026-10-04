/* Regression checks for imported component IDs that match Object.prototype keys.
 * Run with: node tests/playback-special-component-ids-test.js
 */
'use strict';

var assert = require('assert');

var positions = [
  { x: 1, y: 2 },
  { x: 4, y: 6 },
];
global.EVO = {
  CreatureRecordingPlayer: function () {},
};
global.EVO.CreatureRecordingPlayer.prototype.getDuration = function () {
  return 1;
};
global.EVO.CreatureRecordingPlayer.prototype.seekPlaybackToTime = function () {};
global.EVO.CreatureRecordingPlayer.prototype.getRecordedJointPosition = function (index) {
  return positions[index];
};
global.EVO.CreatureRecordingPlayer.prototype.getRecordedMuscleForce = function () {
  return 0.5;
};
require('../js/sim/playback.js');

var recording = {
  creatureDesign: {
    joints: [
      { id: 'constructor', x: 0, y: 0 },
      { id: '__proto__', x: 1, y: 0 },
    ],
    bones: [{ id: 'constructor', startJointID: 'constructor', endJointID: '__proto__' }],
    muscles: [{ startBoneID: 'constructor', endBoneID: 'constructor' }],
    decorations: [],
  },
  movementData: {},
};

var playback = new global.EVO.PlaybackCreature(recording);
assert.strictEqual(playback.bones[0].start.x, 1);
assert.strictEqual(playback.bones[0].end.y, 6);
assert.strictEqual(playback.muscles[0].startBone, playback.bones[0]);
assert.strictEqual(playback.muscles[0].force, 0.5);

console.log('Playback supports component IDs matching Object.prototype keys.');
