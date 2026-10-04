/* Regression checks for overwriting action brains on an existing My Creatures entry.
 * Run with: node tests/evolved-creature-library-save-test.js
 */
'use strict';

var assert = require('assert');

global.document = {};
global.EVO = { UI: {} };
require('../js/core/util.js');
require('../js/core/network.js');
require('../js/core/algorithms.js');
require('../js/core/data.js');
require('../js/data/defaultCreatures.js');
require('../js/sim/scene.js');
require('../js/ui/app.js');

var EVO = global.EVO;
EVO.Store.deleteAll();
var originalDesign = EVO.DefaultCreatures[0].design;
var networkSettings = EVO.NeuralNetworkSettings.defaultSettings();
var scene = EVO.DefaultSimulationScenes.runningScene();
var stats = EVO.CreatureStats.create();
stats.fitness = 0.72;
stats.unclampedFitness = 0.72;
var chromosome = [0.123456, -0.5, 1.25, 0];
var movementData = {
  sampleTimestamps: [0, 1 / 30],
  jointPositions: originalDesign.joints.map(function (joint) {
    return [
      { x: joint.x, y: joint.y },
      { x: joint.x + 0.1, y: joint.y + 0.1 },
    ];
  }),
  muscleForces: originalDesign.muscles.map(function () { return [0, 0]; }),
};
var recording = {
  creatureDesign: originalDesign,
  movementData: movementData,
  task: EVO.Objective.Running,
  generation: 7,
  stats: stats,
  networkInputCount: 11,
  networkOutputCount: 1,
  networkSettings: networkSettings,
  sceneDescription: scene,
};

var savedId = EVO.Storage.saveDesign(originalDesign);
EVO.App.setDesign(originalDesign, savedId);
assert.strictEqual(EVO.App.currentDesignId, savedId, 'the selected library id is tracked for simulation saves');
EVO.App.setDesign(EVO.CreatureDesign.clone(originalDesign));
assert.strictEqual(EVO.App.currentDesignId, savedId, 'design edits retain their existing library target');
var firstSave = EVO.Storage.saveEvolvedBrain(savedId, recording, chromosome, networkSettings, 0);
var designs = EVO.Storage.getDesigns();
assert.strictEqual(designs.length, 1, 'saving a brain does not add a creature snapshot');
assert.strictEqual(designs[0].id, savedId, 'the existing creature entry is updated in place');
assert.strictEqual(designs[0].name, originalDesign.name, 'brain saving does not rename or clone the design');
assert.strictEqual(designs[0].evolvedBrains.running.task, EVO.Objective.Running);
assert.strictEqual(designs[0].evolvedBrains.running.generation, 7);
assert.deepStrictEqual(
  designs[0].evolvedBrains.running.chromosome,
  [0.1235, -0.5, 1.25, 0],
  'the saved action profile keeps the rounded brain chromosome'
);
assert(
  designs[0].evolvedBrains.running.networkSettings,
  'the profile retains topology needed to restore its brain'
);
assert(designs[0].evolvedBrains.running.scene);
assert.strictEqual(designs[0].evolvedBrains.running.replayId, firstSave.replayId);
assert.strictEqual(designs[0].evolvedCreature.task, EVO.Objective.Running, 'legacy readers retain a latest-brain alias');
assert.strictEqual(EVO.Storage.getRecordings().length, 1, 'saving the brain also saves its generation-best replay');
assert.strictEqual(EVO.Storage.getRecordings()[0].id, firstSave.replayId);

var flyingRecording = Object.assign({}, recording, {
  task: EVO.Objective.Flying,
  generation: 8,
  stats: Object.assign({}, stats, { fitness: 0.81, unclampedFitness: 0.81 }),
});
var flyingSave = EVO.Storage.saveEvolvedBrain(
  savedId,
  flyingRecording,
  [0.75, 0.5, -0.25],
  networkSettings,
  0
);
designs = EVO.Storage.getDesigns();
assert.strictEqual(designs.length, 1, 'multiple action brains stay on the same creature entry');
assert(designs[0].evolvedBrains.running, 'the running brain remains intact');
assert(designs[0].evolvedBrains.flying, 'a separate flying brain is added');
assert.strictEqual(EVO.Storage.getRecordings().length, 2, 'each action keeps its own Gallery replay');
assert.strictEqual(
  EVO.Storage.getEvolvedBrain(designs[0], EVO.Objective.Flying).generation,
  8,
  'the stored brain can be retrieved by action'
);

var updatedRunningRecording = Object.assign({}, recording, {
  generation: 9,
  stats: Object.assign({}, stats, { fitness: 0.91, unclampedFitness: 0.91 }),
});
var updatedRunning = EVO.Storage.saveEvolvedBrain(
  savedId,
  updatedRunningRecording,
  [0.9, 0.8, 0.7, 0.6],
  networkSettings,
  0
);
designs = EVO.Storage.getDesigns();
assert.strictEqual(designs.length, 1, 'overwriting never creates a duplicate design');
assert.strictEqual(designs[0].evolvedBrains.running.generation, 9);
assert.deepStrictEqual(designs[0].evolvedBrains.running.chromosome, [0.9, 0.8, 0.7, 0.6]);
assert.strictEqual(
  designs[0].evolvedBrains.flying.generation,
  8,
  'rewriting one action preserves every other action brain'
);
assert.strictEqual(updatedRunning.replayId, firstSave.replayId, 'rewriting a brain also replaces its linked replay');
assert.strictEqual(EVO.Storage.getRecordings().length, 2, 'repeated saves do not create duplicate action replays');
assert(/Gen 9/.test(EVO.Storage.getRecordings().filter(function (entry) {
  return entry.id === firstSave.replayId;
})[0].name));
assert.notStrictEqual(flyingSave.replayId, firstSave.replayId);

var editedDesign = EVO.CreatureDesign.clone(originalDesign);
editedDesign.name = 'Renamed base design';
EVO.Storage.saveDesign(editedDesign, savedId);
designs = EVO.Storage.getDesigns();
assert.strictEqual(designs.length, 1);
assert.strictEqual(designs[0].name, 'Renamed base design');
assert(designs[0].evolvedBrains.running);
assert(designs[0].evolvedBrains.flying);

var simulation = EVO.SimulationData.create(
  EVO.SimulationSettings.forObjective(EVO.Objective.Running),
  networkSettings,
  originalDesign,
  scene
);
simulation.LibraryCreatureId = savedId;
var decodedSimulation = EVO.SimulationData.decode(EVO.SimulationData.encode(simulation));
assert.strictEqual(decodedSimulation.LibraryCreatureId, savedId, 'run checkpoints retain the library link');
EVO.App.setDesign(originalDesign, null);
assert.strictEqual(EVO.App.currentDesignId, null, 'switching to an unsaved/sample design clears the target id');

assert.throws(function () {
  EVO.Storage.saveEvolvedBrain('missing-id', recording, chromosome, networkSettings, 0);
}, /no longer in My Creatures/);

var legacyProfile = {
  task: EVO.Objective.Jumping,
  generation: 2,
  chromosome: [0.2, 0.4],
  networkSettings: EVO.NeuralNetworkSettings.encode(networkSettings),
  scene: null,
  stats: null,
  lastV2SimulatedGeneration: 0,
};
EVO.Store.setJSON('designs', [{
  id: 'legacy-creature',
  name: 'Legacy Creature',
  design: EVO.CreatureDesign.encode(originalDesign),
  evolvedCreature: legacyProfile,
}]);
EVO.Store.setJSON('recordings', []);
var legacyEntry = EVO.Storage.getDesigns()[0];
assert.strictEqual(EVO.Storage.getEvolvedBrainProfiles(legacyEntry).length, 1, 'old single-brain entries remain selectable');
EVO.Storage.saveEvolvedBrain('legacy-creature', recording, chromosome, networkSettings, 0);
var migrated = EVO.Storage.getDesigns()[0];
assert(migrated.evolvedBrains.jumping, 'saving a second action migrates the old profile');
assert(migrated.evolvedBrains.running, 'the new action profile is added alongside the migrated one');

console.log('In-place action-brain overwrite, independent tasks and best-generation replay checks passed.');
