/* End-to-end checks for the Obstacle Jump reward: real physics, real creature,
 * real evolution loop.
 *
 * Run with: node tests/obstacle-evolution-reward-test.js
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
require('../js/sim/evolution.js');

var EVO = global.EVO;

/** Creates a creature standing in front of the block course. */
function spawnCreature(scene) {
  var world = scene.world;
  var creature = new EVO.Creature(world, EVO.CreatureDesign.clone(EVO.DefaultCreatures[0].design), {
    scene: scene,
  });
  var distance = creature.semiSafeDistanceFromGround(false);
  creature.translate(0, 10 - (isFinite(distance) ? distance : 0));
  creature.resolveStaticOverlap();
  creature.initialPosition = { x: creature.getXPosition(), y: creature.getYPosition() };
  creature.objectiveTracker = EVO.ObjectiveTracker.create(EVO.Objective.ObstacleJump, creature);
  creature.prepareForEvolution();
  return creature;
}

function simulate(scene, creature, seconds, speed) {
  var fixedStep = 1 / 60;
  var steps = Math.round(seconds / fixedStep);
  for (var step = 0; step < steps; step++) {
    // Drag the creature forwards at a constant speed (a scripted controller).
    if (speed) creature.translate(speed * fixedStep, 0);
    scene.world.simulate(fixedStep, 3, 4);
    scene.update(fixedStep);
    creature.syncContacts();
    creature.updateBoneVelocities();
    creature.update(fixedStep);
  }
}

/* ------------------------------------------------------------------ *
 * A creature that does not move is not rewarded
 * ------------------------------------------------------------------ */
var scene = new EVO.Scene(new EVO.PhysicsWorld(), EVO.DefaultSimulationScenes.obstacleJumpScene());
var idle = spawnCreature(scene);
simulate(scene, idle, 5, 0);
var idleStats = idle.getStatistics(5);
assert.ok(
  idleStats.unclampedFitness < 0.05,
  'a creature that stays on the spot is barely rewarded (' + idleStats.unclampedFitness + ')'
);
assert.strictEqual(idle.objectiveTracker.getBlockProgress().passed, 0, 'no block was cleared');

/* ------------------------------------------------------------------ *
 * The same creature dragged forwards earns the progress reward
 * ------------------------------------------------------------------ */
scene = new EVO.Scene(new EVO.PhysicsWorld(), EVO.DefaultSimulationScenes.obstacleJumpScene());
var walker = spawnCreature(scene);
simulate(scene, walker, 5, 1.5);
var walkerStats = walker.getStatistics(5);
assert.ok(
  walkerStats.unclampedFitness > 0,
  'moving towards the first block is rewarded (' + walkerStats.unclampedFitness + ')'
);
assert.ok(
  walkerStats.unclampedFitness < 1,
  'the course is not cleared just by walking up to the first block'
);
assert.ok(
  walkerStats.horizontalDistanceTravelled > 0,
  'the creature actually moved forwards'
);

/* ------------------------------------------------------------------ *
 * The evolution loop runs the block course and records the best creature
 * ------------------------------------------------------------------ */
var settings = EVO.SimulationSettings.defaultSettings();
settings.Objective = EVO.Objective.ObstacleJump;
settings.PopulationSize = 4;
settings.SimulateInBatches = false;
settings.SimulationTime = 3;
var data = EVO.SimulationData.create(
  settings,
  EVO.NeuralNetworkSettings.defaultSettings(),
  EVO.CreatureDesign.clone(EVO.DefaultCreatures[0].design),
  EVO.DefaultSimulationScenes.obstacleJumpScene()
);

var generations = 0;
var eventNames = [];
var evolution = new EVO.Evolution({
  data: data,
  onEvent: function (name) {
    eventNames.push(name);
    if (name === 'generationDidEnd') generations++;
  },
});
evolution.start();
assert.ok(
  evolution.scene.getObstacleBlocks().length > 0,
  'the evolution uses a scene with a block course'
);
assert.ok(
  evolution.currentCreatureBatch.length > 0,
  'the population is placed in the block course'
);

var guard = 0;
while (guard++ < 200000 && generations < 2) {
  evolution.update(1 / 60);
  if (evolution.playbackPending) {
    evolution.resume();
    evolution.playbackPending = false;
    evolution.completedSolutions = null;
  }
}
evolution.finish();

assert.strictEqual(generations, 2, 'two generations were evaluated');
assert.strictEqual(eventNames.indexOf('generationDidEnd') >= 0, true, 'generations are reported');
assert.strictEqual(
  evolution.recordings.length,
  2,
  'a recording of the best creature is kept for every generation'
);
evolution.generationFitness.forEach(function (fitness) {
  assert.ok(
    isFinite(fitness) && fitness >= 0 && fitness <= 1,
    'the block course fitness stays in the [0, 1] range (' + fitness + ')'
  );
});
var recording = evolution.recordings[0];
assert.ok(recording.sceneDescription.structures.length > 0, 'the recording keeps its scene');

console.log('Obstacle Jump reward and evolution regression checks passed.');
