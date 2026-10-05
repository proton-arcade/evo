/*
 * Evolution (Web Edition) — tools/train-creature.js
 * ---------------------------------------------------------------
 * Headless evolution runner. Trains one action brain for a creature design
 * with the exact same code the app uses (`EVO.Evolution`, `EVO.Creature`,
 * `EVO.ObjectiveTracker`) — no browser, no rendering, nothing re-implemented.
 *
 *   node tools/train-creature.js <creature.json> <objective> <generations> <population> <outDir>
 *
 * `objective` is one of: Running, Jumping, ObstacleJump, Climbing, Flying.
 * Writes `<outDir>/<objective>.json` with the best brain found plus its stats
 * and the per-generation best fitness, ready for build-creature-file.js.
 */
'use strict';

var fs = require('fs');
var path = require('path');

/* Same bootstrap order as index.html, minus rendering and the UI. */
require('../js/core/util.js');
require('../js/core/network.js');
require('../js/core/algorithms.js');
require('../js/core/data.js');
require('../js/sim/physics.js');
require('../js/sim/scene.js');
require('../js/sim/creature.js');
require('../js/sim/brain.js');
require('../js/sim/evolution.js');

var EVO = global.EVO;

var argv = process.argv.slice(2);
if (argv.length < 5) {
  console.error(
    'usage: node tools/train-creature.js <creature.json> <objective> <generations> <population> <outDir>'
  );
  process.exit(2);
}

var creaturePath = argv[0];
/* `ObjectiveUtil.objectiveFromString` only knows the spaced names, so accept
 * `ObstacleJump` as well as `Obstacle Jump` — and refuse to fall through to
 * the Running default, which would silently train the wrong task. */
var objectiveArg = argv[1].replace(/([a-z0-9])([A-Z])/g, '$1 $2');
var objective = EVO.ObjectiveUtil.objectiveFromString(objectiveArg);
var objectiveName = EVO.ObjectiveUtil.stringRepresentation(objective);
function squashed(value) {
  return String(value).replace(/\s+/g, '').toLowerCase();
}
if (squashed(objectiveName) !== squashed(argv[1])) {
  console.error(
    'Unknown objective "' + argv[1] + '" — expected one of: ' +
      EVO.ObjectiveUtil.getAllObjectiveNames().join(', ')
  );
  process.exit(2);
}
var generations = Math.max(1, parseInt(argv[2], 10) || 1);
var population = Math.max(2, parseInt(argv[3], 10) || 10);
var outDir = argv[4];

var design = EVO.CreatureDesign.decode(JSON.parse(fs.readFileSync(creaturePath, 'utf8')));
if (!design.joints.length) {
  console.error('The creature file contains no joints.');
  process.exit(2);
}

var settings = EVO.SimulationSettings.forObjective(objective);
settings.PopulationSize = population;
settings.KeepBestCreatures = true;
var networkSettings = EVO.NeuralNetworkSettings.defaultSettings();

var data = EVO.SimulationData.create(
  settings,
  networkSettings,
  design,
  EVO.DefaultSimulationScenes.defaultSceneForObjective(objective)
);

var best = null;
var fitnessHistory = [];
var completed = 0;
var startedAt = Date.now();

var evolution = new EVO.Evolution({
  data: data,
  onEvent: function (name, payload) {
    if (name !== 'generationDidEnd') return;
    completed = payload.generation;
    var stats = payload.best.stats;
    fitnessHistory.push(Math.round(stats.unclampedFitness * 1e6) / 1e6);
    if (!best || stats.unclampedFitness > best.stats.unclampedFitness) {
      best = {
        generation: payload.generation,
        chromosome: payload.best.chromosome.slice(),
        stats: stats,
      };
    }
    // The loop keeps every best-of-generation replay for the UI; we only need
    // the fitness, so release them to keep a long run inside a small heap.
    evolution.recordings.length = 0;
  },
});

evolution.start();
var guardMs = 6 * 60 * 60 * 1000;
while (completed < generations && Date.now() - startedAt < guardMs) {
  evolution.update(1 / 60);
}
evolution.finish();

if (!best) {
  console.error('No generation completed for ' + objectiveName);
  process.exit(1);
}

var result = {
  objective: objective,
  objectiveName: objectiveName,
  creature: design.name,
  generation: best.generation,
  generationsRun: completed,
  populationSize: settings.PopulationSize,
  simulationTime: settings.SimulationTime,
  creaturesSimulated: completed * settings.PopulationSize,
  chromosome: best.chromosome,
  networkSettings: EVO.NeuralNetworkSettings.encode(networkSettings),
  scene: EVO.SimulationSceneDescription.encode(data.SceneDescription),
  stats: EVO.CreatureStats.encode(best.stats),
  lastV2SimulatedGeneration: 0,
  fitnessHistory: fitnessHistory,
  seconds: Math.round((Date.now() - startedAt) / 100) / 10,
};

fs.mkdirSync(outDir, { recursive: true });
var outFile = path.join(outDir, argv[1].replace(/[^\w-]+/g, '_') + '.json');
fs.writeFileSync(outFile, JSON.stringify(result, null, 2));

console.log(
  result.objectiveName +
    ': gens=' + completed +
    ' pop=' + settings.PopulationSize +
    ' creatures=' + result.creaturesSimulated +
    ' bestGen=' + best.generation +
    ' fitness=' + best.stats.fitness.toFixed(4) +
    ' distance=' + best.stats.horizontalDistanceTravelled.toFixed(2) +
    ' height=' + best.stats.maxJumpingHeight.toFixed(2) +
    ' seconds=' + result.seconds
);
