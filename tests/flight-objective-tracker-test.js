/* Regression checks for spawn-drop exclusion and sustained-flight fitness.
 * Run with: node tests/flight-objective-tracker-test.js
 */
'use strict';

var assert = require('assert');

global.document = { documentElement: {}, body: {} };
require('../js/core/util.js');
require('../js/core/algorithms.js');
require('../js/core/data.js');
require('../js/sim/brain.js');

var EVO = global.EVO;
function makeCreature() {
  return {
    touching: 0,
    height: 0,
    getNumberOfPointsTouchingGround: function () { return this.touching; },
    distanceFromGround: function () { return this.height; },
  };
}

var dropping = makeCreature();
var dropTracker = EVO.ObjectiveTracker.create(EVO.Objective.Flying, dropping);
dropping.height = 30;
for (var i = 0; i < 60; i++) dropTracker.fixedUpdate(1 / 60);
assert.strictEqual(dropTracker.settledOnGround, false);
assert.strictEqual(dropTracker.totalFrameCount, 0, 'spawn/drop time does not enter flight scoring');
assert.strictEqual(dropTracker.evaluateFitness(10), 0);

dropping.touching = 1;
dropTracker.fixedUpdate(1 / 60);
assert.strictEqual(dropTracker.settledOnGround, true, 'ground contact starts measurement');
assert.strictEqual(dropTracker.totalFrameCount, 0, 'the settling frame itself is excluded');

var jumper = makeCreature();
var jumpTracker = EVO.ObjectiveTracker.create(EVO.Objective.Flying, jumper);
jumper.touching = 1;
jumpTracker.fixedUpdate(1 / 60);
jumper.touching = 0;
jumper.height = 20;
jumpTracker.fixedUpdate(0.2);
jumper.touching = 1;
jumpTracker.fixedUpdate(0.1);
var briefJumpFitness = jumpTracker.evaluateFitness(10);

var flyer = makeCreature();
var flightTracker = EVO.ObjectiveTracker.create(EVO.Objective.Flying, flyer);
flyer.touching = 1;
flightTracker.fixedUpdate(1 / 60);
flyer.touching = 0;
flyer.height = 3;
for (i = 0; i < 120; i++) flightTracker.fixedUpdate(1 / 60);
var sustainedFlightFitness = flightTracker.evaluateFitness(10);
assert(sustainedFlightFitness > briefJumpFitness, 'continuous airtime is worth more than a brief high jump');
assert(flightTracker.maxSustainedAirborneTime > jumpTracker.maxSustainedAirborneTime);

console.log('Flight warm-up exclusion and sustained-airtime fitness checks passed.');
