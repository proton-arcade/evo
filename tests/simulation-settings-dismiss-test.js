/* Regression test for dismissing simulation settings by clicking away.
 * Run with: node tests/simulation-settings-dismiss-test.js
 */
'use strict';

var assert = require('assert');

global.EVO = { Screens: {} };
require('../js/ui/simulation.js');

var SimulationScreen = global.EVO.SimulationScreen;
var drawerChild = {};
var buttonChild = {};
var outside = {};
var visibilityClass = null;
var screen = Object.create(SimulationScreen);

screen.settingsVisible = true;
screen.settingsDrawer = {
  contains: function (target) {
    return target === this || target === drawerChild;
  },
  classList: {
    toggle: function (className, hidden) {
      visibilityClass = { className: className, hidden: hidden };
    },
  },
};
screen.settingsButton = {
  contains: function (target) {
    return target === this || target === buttonChild;
  },
};

screen.handleSettingsOutsideClick({ target: drawerChild });
assert.strictEqual(screen.settingsVisible, true, 'clicking inside settings keeps it open');

screen.handleSettingsOutsideClick({ target: buttonChild });
assert.strictEqual(screen.settingsVisible, true, 'clicking the settings toggle is not an outside click');

screen.handleSettingsOutsideClick({ target: outside });
assert.strictEqual(screen.settingsVisible, false, 'clicking elsewhere closes settings');
assert.deepStrictEqual(visibilityClass, { className: 'hidden', hidden: true });

console.log('Simulation settings dismiss regression checks passed.');
