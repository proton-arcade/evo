/*
 * Evolution (Web Edition) — tools/build-creature-file.js
 * ---------------------------------------------------------------
 * Assembles trained action brains into a single creature file. The file is
 * written with `EVO.CreatureFile.encode` — the very encoder the editor's
 * Export button uses — so a file produced here is byte-compatible with one
 * exported from the app and imports straight back into My Creatures.
 *
 *   node tools/build-creature-file.js <creature.json> <resultsDir> <outFile>
 */
'use strict';

var fs = require('fs');
var path = require('path');

require('../js/core/util.js');
require('../js/core/network.js');
require('../js/core/algorithms.js');
require('../js/core/data.js');
require('../js/sim/scene.js');

var EVO = global.EVO;

var argv = process.argv.slice(2);
if (argv.length < 3) {
  console.error('usage: node tools/build-creature-file.js <creature.json> <resultsDir> <outFile>');
  process.exit(2);
}

var design = EVO.CreatureDesign.decode(JSON.parse(fs.readFileSync(argv[0], 'utf8')));
var resultsDir = argv[1];
var outFile = argv[2];

var brains = {};
var report = [];
var totalCreatures = 0;
var totalSeconds = 0;

fs.readdirSync(resultsDir)
  .filter(function (name) {
    return name.slice(-5) === '.json';
  })
  .sort()
  .forEach(function (name) {
    var result = JSON.parse(fs.readFileSync(path.join(resultsDir, name), 'utf8'));
    var key = EVO.BrainProfile.keyForObjective(result.objective);
    brains[key] = {
      task: result.objective,
      generation: result.generation,
      chromosome: result.chromosome,
      networkSettings: result.networkSettings,
      scene: result.scene,
      stats: result.stats,
      lastV2SimulatedGeneration: result.lastV2SimulatedGeneration || 0,
    };
    totalCreatures += result.creaturesSimulated || 0;
    totalSeconds += result.seconds || 0;
    report.push(result);
  });

if (!Object.keys(brains).length) {
  console.error('No training results found in ' + resultsDir);
  process.exit(1);
}

var creatureFile = EVO.CreatureFile.encode(design, brains);
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(creatureFile, null, 2) + '\n');

/* Read the written file back through the importer to prove it round-trips. */
var roundTripped = EVO.CreatureFile.decode(JSON.parse(fs.readFileSync(outFile, 'utf8')));
if (EVO.CreatureFile.countBrains(roundTripped.brains) !== Object.keys(brains).length) {
  console.error('The written creature file did not round-trip its brains.');
  process.exit(1);
}

console.log('Wrote ' + outFile);
console.log(
  '  joints=' + creatureFile.joints.length +
    ' bones=' + creatureFile.bones.length +
    ' muscles=' + creatureFile.muscles.length +
    ' brains=' + Object.keys(creatureFile.brains).join(',')
);
console.log(
  '  simulated ' + totalCreatures + ' creatures in ' + Math.round(totalSeconds) + 's of wall time'
);
report
  .sort(function (a, b) {
    return a.objective - b.objective;
  })
  .forEach(function (result) {
    var stats = result.stats;
    console.log(
      '  ' +
        result.objectiveName.padEnd(14) +
        ' gens=' + String(result.generationsRun).padStart(4) +
        ' pop=' + result.populationSize +
        ' bestGen=' + String(result.generation).padStart(4) +
        ' fitness=' + stats.fitness.toFixed(4) +
        ' dist=' + stats.horizontalDistanceTravelled.toFixed(2) +
        ' maxHeight=' + stats.maxJumpHeight.toFixed(2) +
        ' avgSpeed=' + stats.averageSpeed.toFixed(2)
    );
  });
