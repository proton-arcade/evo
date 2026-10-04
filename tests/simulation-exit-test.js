/* Regression test for exiting a running simulation through its Exit control.
 * Run with: node tests/simulation-exit-test.js
 */
'use strict';

var assert = require('assert');
var destination = null;

global.EVO = {
  App: {
    show: function (screenName) {
      destination = screenName;
    },
  },
  Screens: {},
};
require('../js/ui/simulation.js');

global.EVO.SimulationScreen.exitSimulation();
assert.strictEqual(destination, 'home');

console.log('Simulation exit regression checks passed.');
