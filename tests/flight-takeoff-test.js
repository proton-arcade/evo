/* Scratch-built muscle-driven stationary takeoff check.
 * Run with: node tests/flight-takeoff-test.js
 * A fixed 2 Hz controller bypasses neural-network evolution but drives the
 * production muscle spring/force path, making the aerodynamic integration deterministic.
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
var design = EVO.CreatureDesign.create(
  'Fixed wingbeat test creature',
  [
    EVO.JointData.create(1, { x: 0, y: 1.2 }, 3),
    EVO.JointData.create(2, { x: 0, y: 2.2 }, 1),
    EVO.JointData.create(3, { x: -2, y: 2.2 }, 1),
    EVO.JointData.create(4, { x: 2, y: 2.2 }, 1),
  ],
  [
    EVO.BoneData.create(1, 1, 2, 1),
    EVO.BoneData.create(2, 2, 3, 1, true, false, false, 2),
    EVO.BoneData.create(3, 2, 4, 1, true, false, false, 2),
  ],
  [
    EVO.MuscleData.create(1, 1, 2, 1500, true, 'left-wing'),
    EVO.MuscleData.create(2, 1, 3, 1500, true, 'right-wing'),
  ],
  []
);

function makeCreature() {
  var world = new EVO.PhysicsWorld();
  var scene = new EVO.Scene(world, EVO.DefaultSimulationScenes.flyingScene());
  var creature = new EVO.Creature(world, design, { scene: scene });
  creature.objectiveTracker = EVO.ObjectiveTracker.create(EVO.Objective.Flying, creature);
  creature.initialPosition = { x: creature.getXPosition(), y: creature.getYPosition() };
  creature.prepareForEvolution();
  creature.resolveStaticOverlap();
  return { world: world, scene: scene, creature: creature };
}

function run(seconds, useFixedMuscleController) {
  var setup = makeCreature();
  var world = setup.world;
  var scene = setup.scene;
  var creature = setup.creature;
  var dt = 1 / 60;
  var didStartWingbeat = false;
  var ticks = Math.round(seconds / dt);

  for (var tick = 0; tick < ticks; tick++) {
    if (useFixedMuscleController && creature.objectiveTracker.settledOnGround) {
      didStartWingbeat = true;
      var phase = Math.sin(2 * Math.PI * 2 * tick * dt);
      creature.muscles.forEach(function (muscle) {
        // Contract on the powered half-cycle; expand to recover for the next stroke.
        muscle.muscleAction = phase < 0
          ? EVO.Creature.MuscleAction.CONTRACT
          : EVO.Creature.MuscleAction.EXPAND;
        muscle.currentForce = muscle.data.strength;
      });
    }

    world.addForceCallback(function (simWorld, subDeltaTime) {
      creature.applyForces(simWorld, subDeltaTime);
    });
    world.simulate(dt, 3, 4);
    world.forceCallbacks.pop();
    scene.update(dt);
    creature.syncContacts();
    creature.updateBoneVelocities();
    creature.update(dt);
  }

  return {
    creature: creature,
    didStartWingbeat: didStartWingbeat,
    fitness: creature.objectiveTracker.evaluateFitness(seconds),
  };
}

var resting = run(6, false);
assert(resting.creature.objectiveTracker.settledOnGround, 'the no-flap creature settles first');
assert.strictEqual(resting.creature.objectiveTracker.totalAirborneTime, 0, 'a still wing gets no free takeoff');
assert(resting.creature.getLowestPoint().y < 1, 'the no-flap creature stays at the ground');

var flapping = run(6, true);
assert(flapping.didStartWingbeat, 'the fixed controller starts only after ground contact');
assert(flapping.creature.objectiveTracker.settledOnGround);
assert(flapping.creature.objectiveTracker.maxSustainedAirborneTime > 2, 'the creature sustains measurable airtime');
assert(flapping.creature.getLowestPoint().y > 2, 'the scratch-built creature clears the ground');
assert(flapping.fitness > resting.fitness, 'takeoff improves Flying fitness');

console.log('Stationary muscle-driven takeoff and no-flap regression checks passed.');
