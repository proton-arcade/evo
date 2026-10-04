/* Regression tests for mutation ranges including the final chromosome gene.
 * Run with: node tests/algorithms-mutation-boundaries-test.js
 */
'use strict';

var assert = require('assert');
require('../js/core/util.js');
require('../js/core/network.js');
require('../js/core/algorithms.js');

var originalRandom = Math.random;
try {
  // The last possible chunk start must be reachable, even for short genomes.
  Math.random = function () { return 0.999999; };
  var chunk = [0, 0, 0];
  global.EVO.Mutation.mutate(chunk, global.EVO.MutationAlgorithm.Chunk);
  assert.notStrictEqual(chunk[2], 0, 'chunk mutation can start at and modify the final gene');

  // A two-gene inversion must be able to choose the full [0, 2) range.
  var values = [1, 2];
  var draws = [0, 0.999999];
  Math.random = function () { return draws.shift(); };
  global.EVO.Mutation.mutate(values, global.EVO.MutationAlgorithm.Inversion);
  assert.deepStrictEqual(values, [2, 1], 'inversion includes the final chromosome index');
} finally {
  Math.random = originalRandom;
}

console.log('Mutation boundary regression checks passed.');
