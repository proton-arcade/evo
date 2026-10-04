/* Regression checks for saving one evolved phenotype into My Creatures.
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
var stats = EVO.CreatureStats.create();
stats.fitness = 0.72;
stats.unclampedFitness = 0.72;
var chromosome = [0.123456, -0.5, 1.25, 0];
var scene = EVO.DefaultSimulationScenes.runningScene();
var recording = {
  creatureDesign: originalDesign,
  task: EVO.Objective.Running,
  generation: 7,
  stats: stats,
  networkSettings: networkSettings,
  sceneDescription: scene,
};

var savedId = EVO.Storage.saveEvolvedCreature(recording, chromosome, networkSettings, 0);
var designs = EVO.Storage.getDesigns();
assert.strictEqual(designs.length, 1, 'an evolved variant is stored in the creature library');
assert.strictEqual(designs[0].id, savedId);
assert.strictEqual(designs[0].evolvedCreature.task, EVO.Objective.Running);
assert.strictEqual(designs[0].evolvedCreature.generation, 7);
assert.deepStrictEqual(designs[0].evolvedCreature.chromosome, [0.1235, -0.5, 1.25, 0]);
assert.strictEqual(
  designs[0].evolvedCreature.networkSettings.NodesPerIntermediateLayer.length,
  networkSettings.NodesPerIntermediateLayer.length,
  'the phenotype keeps the network topology needed to restore its brain'
);
assert(designs[0].evolvedCreature.scene, 'the evolved variant retains its training scene');
assert(/Gen 7/.test(designs[0].name), 'the saved variant is distinguishable by generation');
assert.strictEqual(EVO.Storage.getRecordings().length, 0, 'saving the creature does not create a gallery recording');
assert.strictEqual(EVO.Storage.getSimulations().length, 0, 'saving the creature does not create a standalone simulation');

console.log('Evolved creature library save and brain metadata checks passed.');
