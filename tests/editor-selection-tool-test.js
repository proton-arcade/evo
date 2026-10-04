/* Regression test for clearing selection when leaving the Select tool.
 * Run with: node tests/editor-selection-tool-test.js
 */
'use strict';

var assert = require('assert');

require('../js/core/util.js');
require('../js/core/network.js');
require('../js/core/data.js');

global.EVO.Creature = { JOINT_RADIUS: 0.5 };
require('../js/sim/builder.js');
global.EVO.Screens = {};
require('../js/ui/editor.js');

var EVO = global.EVO;
var editor = Object.create(EVO.EditorScreen);
editor.builder = new EVO.CreatureBuilder(EVO.CreatureDesign.empty());
editor.updateToolButtons = function () {};
editor.refreshSettings = function () {};
editor.render = function () {};

[
  EVO.EditorTools.JOINT,
  EVO.EditorTools.BONE,
  EVO.EditorTools.WING,
  EVO.EditorTools.MUSCLE,
  EVO.EditorTools.DECORATION,
  EVO.EditorTools.ERASE,
].forEach(function (tool) {
  editor.selection = { type: 'joint', id: 1 };
  editor.setTool(tool);
  assert.strictEqual(editor.selection, null, 'switching to ' + tool + ' should clear selection');
});

console.log('Editor selection tool regression checks passed.');
