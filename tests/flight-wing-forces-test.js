/* Regression checks for rotational wing airflow, inversion, area and force bounds.
 * Run with: node tests/flight-wing-forces-test.js
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

var EVO = global.EVO;

function makeWing(direction, angularVelocity, inverted, chord) {
  var root = { x: direction.x > 0 ? 0 : 2, y: 2, vx: 0, vy: 0, fx: 0, fy: 0 };
  var tip = { x: root.x + direction.x * 2, y: root.y + direction.y * 2, vx: 0, vy: 0, fx: 0, fy: 0 };
  return {
    startJoint: { body: root },
    endJoint: { body: tip },
    isWing: true,
    inverted: !!inverted,
    direction: direction,
    length: 2,
    halfLength: 1,
    angularVelocity: angularVelocity,
    wingChord: chord === undefined ? 1 : chord,
    data: { wingChord: chord === undefined ? 1 : chord, inverted: !!inverted },
  };
}

function apply(bone) {
  EVO.Creature.prototype.applyWingForce.call({}, bone);
  return {
    x: bone.startJoint.body.fx + bone.endJoint.body.fx,
    y: bone.startJoint.body.fy + bone.endJoint.body.fy,
  };
}

var stationary = makeWing({ x: 1, y: 0 }, 0, false, 2);
var stationaryForce = apply(stationary);
assert.strictEqual(stationaryForce.x, 0, 'a still wing gets no free force');
assert.strictEqual(stationaryForce.y, 0);
assert.strictEqual(stationary.wingDebug.speed, 0);

// This is a deterministic downstroke: the center of the wing has no
// translational velocity, but angular velocity creates airflow at the
// aerodynamic center and yields upward force.
var downstroke = makeWing({ x: 1, y: 0 }, -2, false, 2);
var downForce = apply(downstroke);
assert(downstroke.wingDebug.speed > 2.8, 'rotation contributes wing-point speed');
assert(downstroke.wingDebug.lift > 0 && downstroke.wingDebug.drag > 0);
assert(downForce.y > 0, 'the selected downstroke produces upward force');
assert(downstroke.aerodynamicCenter, 'the aerodynamic application point is tracked');
assert(2 * downForce.y > 10 * 50, 'two suitably sized wings can exceed the weight of a light test creature');
assert(2 * downForce.y < 50 * 50, 'the same wings do not lift a much heavier test creature');
var oversizedWingA = makeWing({ x: 1, y: 0 }, -2, false, 5);
var oversizedWingB = makeWing({ x: -1, y: 0 }, 2, false, 5);
var oversizedWingForceA = apply(oversizedWingA);
var oversizedWingForceB = apply(oversizedWingB);
assert(oversizedWingForceA.y + oversizedWingForceB.y > 50 * 50, 'greater wing area restores lift against the heavier test weight');

var slowerDownstroke = makeWing({ x: 1, y: 0 }, -1, false, 2);
var slowerForce = apply(slowerDownstroke);
assert(
  Math.abs(downForce.y / slowerForce.y - 4) < 0.02,
  'aerodynamic force grows approximately with the square of wing speed'
);

// Wing chord is part of the creature design format and defaults cleanly for old files.
var wingData = EVO.BoneData.create(9, 1, 2, 1, true, false, false, 2.25);
var encodedWing = EVO.BoneData.encode(wingData);
assert.strictEqual(encodedWing.wingChord, 2.25);
assert.strictEqual(EVO.BoneData.decode(encodedWing).wingChord, 2.25);
assert.strictEqual(EVO.BoneData.decode({ id: 10, startJointID: 1, endJointID: 2 }).wingChord, 1);

// A mirrored wing with its local axis reversed has the same upward result
// when its angular direction is mirrored too.
var mirrored = makeWing({ x: -1, y: 0 }, 2, false, 2);
assert(apply(mirrored).y > 0, 'mirrored downstroke force still points upward');

var wrongPhase = makeWing({ x: 1, y: 0 }, -2, true, 2);
assert.strictEqual(apply(wrongPhase).y, 0, 'Invert selects the opposite stroke phase');
var invertedUpstroke = makeWing({ x: 1, y: 0 }, 2, true, 2);
var invertedForce = apply(invertedUpstroke);
assert(invertedForce.x !== 0 || invertedForce.y !== 0, 'the inverted wing activates on its selected upstroke');

var narrowWing = makeWing({ x: 1, y: 0 }, -2, false, 1);
var wideWing = makeWing({ x: 1, y: 0 }, -2, false, 2);
apply(narrowWing);
apply(wideWing);
assert(wideWing.wingDebug.lift > narrowWing.wingDebug.lift, 'larger chord increases effective wing area and lift');

// A wing-connected muscle must be able to rotate a wing. Applying equal and
// opposite endpoint forces supplies torque without injecting any free lift.
var drivenWing = makeWing({ x: 1, y: 0 }, 0, false, 2);
drivenWing.strokeTangentSign = -1;
drivenWing.connectedMuscles = [{
  living: true,
  currentForce: 1500,
  muscleAction: EVO.Creature.MuscleAction.CONTRACT,
}];
EVO.Creature.prototype.applyWingStrokeTorque.call({}, drivenWing);
assert(drivenWing.endJoint.body.fy < 0, 'a contracted right wing receives a downward tip stroke');
assert(drivenWing.startJoint.body.fy > 0, 'the root receives the opposing internal force');
assert.strictEqual(
  drivenWing.startJoint.body.fy + drivenWing.endJoint.body.fy,
  0,
  'the muscle drive adds torque rather than an artificial net force'
);
drivenWing.startJoint.body.fx = drivenWing.startJoint.body.fy = 0;
drivenWing.endJoint.body.fx = drivenWing.endJoint.body.fy = 0;
drivenWing.connectedMuscles[0].currentForce = 0;
EVO.Creature.prototype.applyWingStrokeTorque.call({}, drivenWing);
assert.strictEqual(drivenWing.startJoint.body.fy + drivenWing.endJoint.body.fy, 0, 'an idle wing has no motor stroke');

var extreme = makeWing({ x: 1, y: 0 }, -1000, false, 5);
var extremeForce = apply(extreme);
assert(
  Math.sqrt(extremeForce.x * extremeForce.x + extremeForce.y * extremeForce.y) <= EVO.Creature.WING_MAX_FORCE + 1e-6,
  'wing forces are clamped to prevent unstable impulses'
);

console.log('Rotational wing velocity, direction, chord area and force-limit checks passed.');
