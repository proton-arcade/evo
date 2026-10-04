/* Regression test: a body sliding on ground should eventually stop.
 * Run with: node tests/physics-ground-friction-test.js
 */
'use strict';

var assert = require('assert');

global.document = {};
require('../js/core/util.js');
require('../js/sim/physics.js');

var world = new global.EVO.PhysicsWorld();
world.gravity = -50;
world.addBox(0, -0.5, 100, 0.5, 0, { tag: 'Ground', friction: 1 });
var body = world.addBody({ x: 0, y: 0.5, radius: 0.5 });
body.vx = 1;

for (var frame = 0; frame < 600; frame++) {
  world.simulate(1 / 60, 3, 4);
}

assert.strictEqual(body.touchingGround, true, 'the body should remain in contact with the floor');
assert(Math.abs(body.vx) < 0.01, 'ground friction should bring low-speed sliding to rest');
assert(body.x > 0 && body.x < 2, 'friction should slow the slide instead of letting it travel indefinitely');

console.log('Ground-friction regression check passed; the sliding body came to rest.');
