/* Regression checks for the built-in wing flap reflex and the shock stun.
 * Run with: node tests/creature-auto-flap-reflex-test.js
 *
 * A winged creature must automatically flap while it is airborne or falling,
 * rest the wing muscles while it stands on the ground, and drop everything
 * (brain, reflex and motion) the moment it is shocked.
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

var EVO = global.EVO;
var DT = 1 / 60;

// Body with two wing bones (2, 3) and one plain body bone (4). Muscles 1 and
// 2 power the wings; muscle 3 is an ordinary body muscle.
var design = EVO.CreatureDesign.create(
  'Auto flap reflex test creature',
  [
    EVO.JointData.create(1, { x: 0, y: 1.2 }, 3, 0),
    EVO.JointData.create(2, { x: 0, y: 2.2 }, 1, 0),
    EVO.JointData.create(3, { x: -2, y: 2.2 }, 1, 0),
    EVO.JointData.create(4, { x: 2, y: 2.2 }, 1, 0),
    EVO.JointData.create(5, { x: 0, y: 0.2 }, 1, 0),
  ],
  [
    EVO.BoneData.create(1, 1, 2, 1, false, false),
    EVO.BoneData.create(2, 2, 3, 1, true, false, false, 2),
    EVO.BoneData.create(3, 2, 4, 1, true, false, false, 2),
    EVO.BoneData.create(4, 1, 5, 1, false, false),
  ],
  [
    EVO.MuscleData.create(1, 1, 2, 1500, true, 'left-wing'),
    EVO.MuscleData.create(2, 1, 3, 1500, true, 'right-wing'),
    EVO.MuscleData.create(3, 1, 4, 1500, true, 'body'),
  ],
  []
);

function makeCreature(withBrain) {
  var world = new EVO.PhysicsWorld();
  var scene = new EVO.Scene(world, EVO.DefaultSimulationScenes.flyingScene());
  var creature = new EVO.Creature(world, design, { scene: scene });
  creature.prepareForEvolution();
  if (withBrain) {
    var brain = EVO.Brains.create(EVO.Brains.BrainType.Universal, creature);
    var uniqueMuscles = EVO.CalculateUniqueMusclesContext(design.muscles);
    var chromosomeLength = EVO.FeedForwardNetwork.chromosomeLength(
      EVO.Brains.numberOfInputsForBrainType(EVO.Brains.BrainType.Universal),
      EVO.Brains.numberOfOutputsForBrainType(EVO.Brains.BrainType.Universal, uniqueMuscles),
      EVO.NeuralNetworkSettings.defaultSettings()
    );
    // A constant chromosome produces a constant muscle drive, so any wing
    // oscillation observed below must come from the reflex itself.
    var chromosome = new Array(chromosomeLength);
    for (var i = 0; i < chromosomeLength; i++) chromosome[i] = 0.125;
    brain.init(EVO.NeuralNetworkSettings.defaultSettings(), creature.muscles, uniqueMuscles, chromosome);
    creature.brain = brain;
  }
  return creature;
}

function setGrounded(creature, touching, velocityY) {
  creature.joints.forEach(function (joint, index) {
    joint.isCollidingWithGround = index < touching;
    joint.body.vy = velocityY;
    joint.body.vx = 0;
  });
}

function wingActions(creature, ticks, grounded) {
  var actions = [];
  for (var tick = 0; tick < ticks; tick++) {
    if (grounded) setGrounded(creature, creature.joints.length, 0);
    creature.updateBrain(DT);
    actions.push(
      creature.wingMuscles.map(function (muscle) { return muscle.muscleAction; }).join(',')
    );
  }
  return actions;
}

/* --- The reflex knows which muscles power wings ----------------------- */
var reflexive = makeCreature(false);
assert.strictEqual(reflexive.wingMuscles.length, 2, 'both wing-connected muscles are found');
assert.strictEqual(
  reflexive.wingMuscles.indexOf(reflexive.muscles[2]),
  -1,
  'the plain body muscle is not part of the wing reflex'
);

/* --- On the ground the brain keeps control of the wing muscles -------- */
var grounded = makeCreature(true);
setGrounded(grounded, grounded.joints.length, 0);
var groundedActions = wingActions(grounded, 40, true);
assert.strictEqual(
  new Set(groundedActions).size,
  1,
  'a grounded creature does not flap: the brain drive stays untouched'
);
assert.strictEqual(grounded.flapPhase, 0, 'the flap oscillator rests on the ground');

/* --- Airborne, the reflex takes over and flaps rhythmically ----------- */
var airborne = makeCreature(true);
airborne.joints.forEach(function (joint) {
  joint.isCollidingWithGround = false;
  joint.body.vy = 0;
});
var airborneActions = [];
var airborneForces = [];
for (var tick = 0; tick < 60; tick++) {
  airborne.updateBrain(DT);
  airborneActions.push(airborne.wingMuscles[0].muscleAction);
  airborneForces.push(airborne.wingMuscles[0].currentForce);
}
assert.strictEqual(
  airborneActions[0],
  EVO.Creature.MuscleAction.CONTRACT,
  'the flap starts with the powered downstroke'
);
assert(
  airborneActions.indexOf(EVO.Creature.MuscleAction.CONTRACT) !== -1 &&
    airborneActions.indexOf(EVO.Creature.MuscleAction.EXPAND) !== -1,
  'the wing muscles oscillate while the creature is airborne'
);
var forceRange = Math.max.apply(null, airborneForces) - Math.min.apply(null, airborneForces);
assert(forceRange > 700, 'the flap drive modulates the wing muscle force');

/* --- Falling while still touching down also triggers a flap ----------- */
var falling = makeCreature(false);
setGrounded(falling, 1, -2);
var fallingActions = wingActions(falling, 40, false);
assert(
  new Set(fallingActions).size > 1,
  'a grounded but falling creature flaps to catch itself'
);

/* --- The reflex can be switched off ------------------------------------ */
var disabled = makeCreature(true);
disabled.autoFlap = false;
disabled.joints.forEach(function (joint) {
  joint.isCollidingWithGround = false;
});
var disabledActions = [];
for (var d = 0; d < 60; d++) {
  disabled.updateBrain(DT);
  disabledActions.push(disabled.wingMuscles[0].muscleAction);
}
assert.strictEqual(
  new Set(disabledActions).size,
  1,
  'with the reflex disabled the brain alone drives the wings'
);

/* --- Creatures without wings are untouched by the reflex --------------- */
var wingless = new EVO.Creature(
  new EVO.PhysicsWorld(),
  EVO.CreatureDesign.create(
    'Wingless',
    [EVO.JointData.create(1, { x: 0, y: 2 }, 1, 0), EVO.JointData.create(2, { x: 0.5, y: 1 }, 1, 0)],
    [EVO.BoneData.create(1, 1, 2, 1, false, false)],
    [EVO.MuscleData.create(1, 1, 1, 100, true, 'm')],
    []
  ),
  {}
);
wingless.prepareForEvolution();
assert.strictEqual(wingless.wingMuscles.length, 0, 'wingless creatures have no reflex muscles');
wingless.updateBrain(DT); // must not throw

/* --- Shock interrupts the flap and everything else -------------------- */
var shocked = makeCreature(true);
shocked.joints.forEach(function (joint) {
  joint.isCollidingWithGround = false;
  joint.body.vx = 5;
  joint.body.vy = 3;
});
shocked.updateBrain(DT);
assert(shocked.wingMuscles[0].currentForce > 0, 'the creature is flapping before the shock');
assert.strictEqual(shocked.shock(0.5), true, 'a living creature can be shocked');
assert(shocked.shockTimer > 0, 'the stun is scheduled');

var stunnedActions = [];
for (var sTick = 0; sTick < 30; sTick++) {
  shocked.updateBrain(DT);
  stunnedActions.push(shocked.wingMuscles[0].currentForce);
  shocked.update(DT);
}
assert(
  stunnedActions.every(function (force) { return force === 0; }),
  'while shocked the wing muscles stay relaxed: no brain, no reflex'
);
assert(shocked.joints[0].body.vx < 1, 'the shock bleeds off the motion that was in progress');
assert(shocked.shockTimer < 0.5, 'the stun wears off over time');

shocked.shockTimer = 0;
shocked.updateBrain(DT);
assert(shocked.wingMuscles[0].currentForce > 0, 'after the stun the flap reflex resumes');

/* --- Recording playback and dead creatures ignore the shock ----------- */
var playback = makeCreature(true);
playback.recordingPlayer = {};
assert.strictEqual(playback.shock(), false, 'playback creatures cannot be shocked');
var dead = makeCreature(true);
dead.alive = false;
assert.strictEqual(dead.shock(), false, 'inactive creatures cannot be shocked');

console.log('Auto wing-flap reflex and shock-interrupt checks passed.');
