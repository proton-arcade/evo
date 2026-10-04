/* Regression test for separating active settings from the next generation.
 * Run with: node tests/evolution-generation-settings-test.js
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
require('../js/sim/builder.js');
require('../js/sim/evolution.js');

var EVO = global.EVO;
var settings = EVO.SimulationSettings.defaultSettings();
settings.Objective = EVO.Objective.Running;
settings.SimulationTime = 0.1;
settings.PopulationSize = 2;
settings.BatchSize = 2;
settings.SimulateInBatches = false;
settings.KeepBestCreatures = false;
settings.MutationRate = 0;
var networkSettings = EVO.NeuralNetworkSettings.create([2]);
var design = EVO.CreatureDesign.create(
  'Scratch test creature',
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
  [EVO.DecorationData.create(1, 1, { x: 0.1, y: 0.2 }, 1.1, 5, false, false, EVO.DecorationType.GooglyEye)]
);
var initialScene = EVO.DefaultSimulationScenes.defaultSceneForObjective(settings.Objective);
var data = EVO.SimulationData.create(settings, networkSettings, design, initialScene);
var evolution;
var generationEndPayloads = [];
var generationBeginCount = 0;
var batchBeginCount = 0;
evolution = new EVO.Evolution({
  data: data,
  onEvent: function (name, payload) {
    if (name === 'newGenerationDidBegin') generationBeginCount++;
    if (name === 'newBatchDidBegin') batchBeginCount++;
    if (name === 'generationDidEnd') {
      generationEndPayloads.push(payload);
      evolution.pause(); // SimulationScreen pauses during the generation replay.
    }
  },
});
evolution.start();

assert.notStrictEqual(evolution.Settings, evolution.SettingsForNextGeneration);
assert.notStrictEqual(evolution.NetworkSettings, evolution.NetworkSettingsForNextGeneration);
assert.strictEqual(evolution.Settings.Objective, EVO.Objective.Running);
assert.strictEqual(evolution.NetworkSettings.NodesPerIntermediateLayer[0], 2);

for (var i = 0; i < 30 && !generationEndPayloads.length; i++) evolution.update(1 / 60);
assert.strictEqual(generationEndPayloads.length, 1, 'the first scratch-built population completes');
assert.strictEqual(evolution.paused, true);
assert.strictEqual(evolution.playbackPending, true);
assert.strictEqual(generationEndPayloads[0].recording.task, EVO.Objective.Running);
assert.strictEqual(generationEndPayloads[0].recording.sceneDescription, initialScene);
assert.strictEqual(generationEndPayloads[0].recording.networkSettings.NodesPerIntermediateLayer[0], 2);

var futureSettings = Object.assign({}, evolution.SettingsForNextGeneration, {
  Objective: EVO.Objective.Flying,
  SimulationTime: 0.2,
  PopulationSize: 4,
  BatchSize: 2,
  SimulateInBatches: true,
  KeepBestCreatures: false,
  MutationRate: 0,
});
evolution.SettingsForNextGeneration = futureSettings;
evolution.NetworkSettingsForNextGeneration = EVO.NeuralNetworkSettings.create([4, 3]);
evolution.SceneDescriptionForNextGeneration = EVO.DefaultSimulationScenes.defaultSceneForObjective(EVO.Objective.Flying);
var beginCountBeforeReconfigure = generationBeginCount;
var batchCountBeforeReconfigure = batchBeginCount;
assert.strictEqual(evolution.reconfigurePendingGeneration(), true);

assert.strictEqual(evolution.Settings.Objective, EVO.Objective.Flying);
assert.strictEqual(evolution.Settings.SimulationTime, 0.2);
assert.strictEqual(evolution.Settings.PopulationSize, 4);
assert.deepStrictEqual(evolution.NetworkSettings.NodesPerIntermediateLayer, [4, 3]);
assert.strictEqual(evolution.SceneDescription, evolution.SceneDescriptionForNextGeneration);
assert.strictEqual(data.SceneDescription, evolution.SceneDescription);
assert.strictEqual(data.CurrentChromosomes.length, 4);
assert.strictEqual(evolution.currentCreatureBatch.length, 2);
assert.strictEqual(evolution.numberOfBatches, 2);
assert.strictEqual(evolution.playbackPending, true);
assert.strictEqual(generationBeginCount, beginCountBeforeReconfigure, 'settings changes should not emit a duplicate generation event');
assert.strictEqual(batchBeginCount, batchCountBeforeReconfigure, 'settings changes should not emit a duplicate batch event');

// The just-finished recording retains its original scene/objective while the
// prepared population uses the updated flight settings.
assert.strictEqual(generationEndPayloads[0].recording.task, EVO.Objective.Running);
assert.strictEqual(generationEndPayloads[0].recording.sceneDescription, initialScene);
assert(evolution.completedSolutions && evolution.completedSolutions.length === 2);
evolution.resume();
assert.strictEqual(evolution.playbackPending, false);
assert.strictEqual(evolution.completedSolutions, null);
for (i = 0; i < 60 && generationEndPayloads.length < 2; i++) evolution.update(1 / 60);
assert.strictEqual(generationEndPayloads.length, 2, 'the reconfigured next generation also completes');
assert.strictEqual(generationEndPayloads[1].recording.task, EVO.Objective.Flying);
assert.deepStrictEqual(generationEndPayloads[1].recording.sceneDescription, EVO.DefaultSimulationScenes.defaultSceneForObjective(EVO.Objective.Flying));
assert.deepStrictEqual(generationEndPayloads[1].recording.networkSettings.NodesPerIntermediateLayer, [4, 3]);

evolution.finish();
console.log('Evolution active/next-generation settings and scene lifecycle checks passed.');
