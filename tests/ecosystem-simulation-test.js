/* Regression checks for shared-world ecosystem simulation.
 * Run with: node tests/ecosystem-simulation-test.js
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
require('../js/sim/ecosystem.js');

var EVO = global.EVO;
var world = new EVO.PhysicsWorld();
world.gravity = 0;
world.interCreatureCollisions = true;
var ownerA = {};
var ownerB = {};
var bodyA = world.addBody({ x: 0, y: 0, radius: 0.5 });
var bodyB = world.addBody({ x: 0.5, y: 0, radius: 0.5 });
bodyA.owner = ownerA;
bodyB.owner = ownerB;
world.simulate(1 / 60, 3, 4);
assert(
  Math.hypot(bodyA.x - bodyB.x, bodyA.y - bodyB.y) >= 0.999,
  'different creatures should not occupy the same space'
);
assert(Math.abs(bodyA.vx) < 0.001 && Math.abs(bodyB.vx) < 0.001, 'depenetration must not inject velocity');

var residentDesign = EVO.DefaultCreatures[1].design;
var profileSettings = EVO.NeuralNetworkSettings.defaultSettings();
var profileBrainType = EVO.Brains.brainTypeForSimulation(EVO.Objective.Running, 0);
var profileMuscles = EVO.CalculateUniqueMusclesContext(residentDesign.muscles);
var profileWeightCount = EVO.FeedForwardNetwork.chromosomeLength(
  EVO.Brains.numberOfInputsForBrainType(profileBrainType),
  EVO.Brains.numberOfOutputsForBrainType(profileBrainType, profileMuscles),
  profileSettings
);
var savedChromosome = new Array(profileWeightCount);
for (var weight = 0; weight < savedChromosome.length; weight++) savedChromosome[weight] = 0.125;
var entries = [
  { name: EVO.DefaultCreatures[0].name, design: EVO.DefaultCreatures[0].design },
  {
    name: EVO.DefaultCreatures[1].name + ' evolved',
    design: residentDesign,
    evolvedCreature: {
      task: EVO.Objective.Running,
      generation: 3,
      chromosome: savedChromosome,
      networkSettings: EVO.NeuralNetworkSettings.encode(profileSettings),
      lastV2SimulatedGeneration: 0,
    },
  },
];
var ecosystem = new EVO.EcosystemSimulation();
ecosystem.start(entries, EVO.Objective.Running);
assert.strictEqual(ecosystem.creatures.length, 2, 'the shared world contains each selected creature');
assert.strictEqual(ecosystem.world.interCreatureCollisions, true, 'the world enables cross-creature contacts');
ecosystem.creatures.forEach(function (creature) {
  assert(creature.brain && creature.brain.network, 'each resident gets a working brain');
  creature.joints.forEach(function (joint) {
    assert.strictEqual(joint.body.owner, creature, 'body ownership supports cross-creature collision filtering');
  });
});
assert.deepStrictEqual(
  ecosystem.creatures[1].brain.network.toFloatArray(),
  savedChromosome,
  'an evolved resident restores its saved chromosome instead of random weights'
);

ecosystem.update(1 / 60, 1);
assert(ecosystem.elapsed > 0, 'the ecosystem advances in fixed time steps');
var elapsed = ecosystem.elapsed;
ecosystem.togglePaused();
ecosystem.update(0.1, 1);
assert.strictEqual(ecosystem.elapsed, elapsed, 'pause freezes all residents and the shared scene');
ecosystem.togglePaused();
ecosystem.update(1 / 60, 1);
assert(ecosystem.elapsed > elapsed, 'resume continues the shared simulation');
ecosystem.stop();
assert.strictEqual(ecosystem.isRunning, false, 'stopping releases the live ecosystem');
assert.strictEqual(ecosystem.creatures.length, 0);

ecosystem.start(entries, EVO.Objective.Running, null, 0.05);
ecosystem.update(0.1, 1);
assert.strictEqual(ecosystem.elapsed, 0.05, 'a configured ecosystem run stops at its duration');
assert.strictEqual(ecosystem.complete, true);
assert.strictEqual(ecosystem.paused, true, 'the run pauses automatically when it completes');
assert.strictEqual(ecosystem.togglePaused(), true, 'completed runs stay stopped until explicitly restarted');
ecosystem.stop();

console.log('Ecosystem shared-world, contact, pause, resume and duration checks passed.');
