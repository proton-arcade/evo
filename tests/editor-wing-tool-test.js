/* Regression checks for the dedicated Wing editor tool.
 * Run with: node tests/editor-wing-tool-test.js
 */
'use strict';

var assert = require('assert');

function FakeElement(tagName, className, textContent) {
  this.tagName = String(tagName || 'div').toUpperCase();
  this.className = className || '';
  this.textContent = textContent || '';
  this.children = [];
  this.listeners = {};
  var classes = Object.create(null);
  this.classList = {
    toggle: function (name, force) {
      classes[name] = force === undefined ? !classes[name] : !!force;
      return classes[name];
    },
  };
}
FakeElement.prototype.appendChild = function (child) {
  this.children.push(child);
  child.parentNode = this;
  return child;
};
FakeElement.prototype.addEventListener = function (name, callback) {
  this.listeners[name] = callback;
};
FakeElement.prototype.removeEventListener = function () {};
FakeElement.prototype.querySelectorAll = function () {
  return [];
};
FakeElement.prototype.getBoundingClientRect = function () {
  return { left: 0, top: 0 };
};

function noop() {}
global.window = global;
global.addEventListener = noop;
global.removeEventListener = noop;
global.document = {
  documentElement: {},
  body: {},
  addEventListener: noop,
  removeEventListener: noop,
};

require('../js/core/util.js');
require('../js/core/network.js');
require('../js/core/data.js');
global.EVO.Creature = { JOINT_RADIUS: 0.5 };
require('../js/sim/builder.js');
global.EVO.UI = {
  el: function (tagName, className, textContent) {
    return new FakeElement(tagName, className, textContent);
  },
};
global.EVO.App = { setDesign: noop };
global.EVO.Screens = {};
require('../js/ui/editor.js');

var EVO = global.EVO;
var design = EVO.CreatureDesign.create(
  'Wing tool fixture',
  [
    EVO.JointData.create(1, { x: 0, y: 0 }, 1, 0),
    EVO.JointData.create(2, { x: 4, y: 0 }, 1, 0),
  ],
  [EVO.BoneData.create(3, 1, 2, 1, false, false, false)],
  [],
  []
);
var editor = Object.create(EVO.EditorScreen);
editor.builder = new EVO.CreatureBuilder(design);
editor.history = new EVO.HistoryManager(10);
editor.history.push(editor.builder.design);
editor.tool = EVO.EditorTools.SELECT;
editor.selection = { type: 'bone', id: 3 };
editor.pending = null;
editor.camera = {
  orthographicSize: 12,
  zoomAt: noop,
  panByScreenDelta: noop,
};
editor.canvas = new FakeElement('canvas');
editor.element = new FakeElement('div');
editor.render = noop;
editor.refreshSettings = noop;

// The toolbar has a distinct Wing entry, and its button activates the tool.
var toolbar = editor.buildToolbar();
assert.strictEqual(toolbar.children.length, 7, 'the wing tool is a first-class toolbar entry');
assert(editor.toolButtons[EVO.EditorTools.WING], 'the toolbar exposes the Wing tool');
assert.strictEqual(editor.toolButtons[EVO.EditorTools.WING].title, 'Wing tool (W)');
editor.toolButtons[EVO.EditorTools.WING].listeners.click();
assert.strictEqual(editor.tool, EVO.EditorTools.WING);
assert.strictEqual(editor.selection, null, 'leaving Select clears the old selection');
assert(editor.toolHint().indexOf('Tap a bone') !== -1, 'the Wing tool explains its toggle action');

var wing = editor.builder.findBone(3);
editor.applyToolAt({ x: 2, y: 0 }, { x: 2, y: 0 });
assert.strictEqual(wing.isWing, true, 'tapping an ordinary bone attaches a wing');
assert.strictEqual(editor.history.entries.length, 2, 'attaching a wing is undoable');
editor.applyToolAt({ x: 2, y: 0 }, { x: 2, y: 0 });
assert.strictEqual(wing.isWing, false, 'tapping a winged bone removes its wing');
assert.strictEqual(editor.history.entries.length, 3, 'removing a wing is undoable too');
editor.undo();
assert.strictEqual(editor.builder.findBone(3).isWing, true, 'undo restores the removed wing');
editor.redo();
assert.strictEqual(editor.builder.findBone(3).isWing, false, 'redo restores its removal');

// The W shortcut works outside form controls and leaves text entry alone.
editor.attachEvents();
editor.tool = EVO.EditorTools.SELECT;
editor.onKeyDown({ key: 'w', target: { tagName: 'DIV' } });
assert.strictEqual(editor.tool, EVO.EditorTools.WING, 'W selects the Wing tool');
editor.tool = EVO.EditorTools.SELECT;
editor.onKeyDown({ key: 'w', target: { tagName: 'INPUT' } });
assert.strictEqual(editor.tool, EVO.EditorTools.SELECT, 'W does not steal focus from text inputs');
editor.detachEvents();

console.log('Wing toolbar toggle, undo and keyboard shortcut checks passed.');
