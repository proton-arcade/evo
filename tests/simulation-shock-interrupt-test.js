/* Regression checks for the Shock control in the evolution and ecosystem engines.
 * Run with: node tests/simulation-shock-interrupt-test.js
 *
 * Shocking a running simulation must immediately interrupt the creatures'
 * current behaviour (brain signals and muscle forces stop, motion decays)
 * and normal behaviour must resume once the stun wears off.
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
require('../js/sim/evolution.js');
require('../js/sim/ecosystem.js');

var EVO = global.EVO;
var DT = 1 / 60;

var design = EVO.CreatureDesign.create(
  'Shock test creature',
  [
    EVO.JointData.create(1, { x: 0, y: 2 }, 1, 0),
    EVO.JointData.create(2, { x: -0.5, y: 1 }, 1, 0),
    EVO.JointData.create(3, { x: 0.5, y: 1 }, 1, 0),
  ],
  [
    EVO.BoneData.create(1, 1, 2, 1, false, false),
    EVO.BoneData.create(2, 1, 3, 1, false, false),
  ],
  [EVO.MuscleData.create(1, 1, 2, 100, true, 'test-muscle')],
  []
);

/* --- Evolution batches ------------------------------------------------ */
var settings = EVO.SimulationSettings.defaultSettings();
settings.Objective = EVO.Objective.Running;
settings.SimulationTime = 5;
settings.PopulationSize = 2;
settings.BatchSize = 2;
settings.SimulateInBatches = false;
settings.KeepBestCreatures = false;
settings.MutationRate = 0;
var data = EVO.SimulationData.create(
  settings,
  EVO.NeuralNetworkSettings.create([2]),
  design,
  EVO.DefaultSimulationScenes.defaultSceneForObjective(settings.Objective)
);
var evolution = new EVO.Evolution({ data: data, onEvent: function () {} });
evolution.start();

for (var warmup = 0; warmup < 10; warmup++) evolution.update(DT);
var batch = evolution.currentCreatureBatch;
assert.strictEqual(batch.length, 2, 'the batch is simulating');
assert(
  batch[0].muscles[0].currentForce > 0,
  'the creatures are actively driven by their brains before the shock'
);

var stunned = evolution.shock();
assert.strictEqual(stunned, 2, 'every creature of the batch is shocked');
batch.forEach(function (creature) {
  assert(creature.shockTimer > 0, 'the stun is scheduled');
  assert.strictEqual(creature.muscles[0].currentForce, 0, 'the shock immediately relaxes the muscles');
  assert.strictEqual(creature.flapPhase, 0, 'the wing reflex is reset by the shock');
});

// While stunned, a full simulation tick must not re-engage the muscles.
evolution.update(DT);
batch.forEach(function (creature) {
  assert.strictEqual(
    creature.muscles[0].currentForce,
    0,
    'the interrupted behaviour does not resume while the stun lasts'
  );
});

// The shock also bleeds off the motion that was in progress.
batch.forEach(function (creature) {
  creature.joints.forEach(function (joint) {
    joint.body.vx = 4;
  });
});
for (var decay = 0; decay < 20; decay++) evolution.update(DT);
batch.forEach(function (creature) {
  assert(creature.joints[0].body.vx < 2, 'motion decays while the creature is stunned');
});

// Once the stun wears off, the brains take over again.
for (var recover = 0; recover < 60; recover++) evolution.update(DT);
batch.forEach(function (creature) {
  assert.strictEqual(creature.shockTimer, 0, 'the stun expires');
  assert(creature.muscles[0].currentForce > 0, 'normal brain control resumes after the shock');
});
evolution.finish();

/* --- Ecosystem residents ---------------------------------------------- */
var ecosystem = new EVO.EcosystemSimulation();
ecosystem.start(
  [
    { name: 'Resident A', design: design },
    { name: 'Resident B', design: design },
  ],
  EVO.Objective.Running,
  null,
  Infinity
);
for (var eWarm = 0; eWarm < 10; eWarm++) ecosystem.update(DT, 1);
var residentsStunned = ecosystem.shock();
assert.strictEqual(residentsStunned, 2, 'every resident can be shocked');
ecosystem.creatures.forEach(function (creature) {
  assert(creature.shockTimer > 0, 'the ecosystem shock stuns the residents');
});
ecosystem.update(DT, 1);
ecosystem.creatures.forEach(function (creature) {
  assert.strictEqual(
    creature.muscles[0].currentForce,
    0,
    'shocked residents stop their current behaviour in the shared world'
  );
});

ecosystem.complete = true;
assert.strictEqual(ecosystem.shock(), 0, 'completed ecosystem runs ignore shocks');
ecosystem.stop();

console.log('Evolution and ecosystem shock-interrupt checks passed.');
