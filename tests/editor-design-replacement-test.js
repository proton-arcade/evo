/* Regression test for replacing a design from samples or imported JSON.
 * Run with: node tests/editor-design-replacement-test.js
 */
'use strict';

var assert = require('assert');

require('../js/core/util.js');
require('../js/core/data.js');
require('../js/sim/builder.js');

function FakeElement(tagName, className, textContent) {
  this.tagName = String(tagName).toUpperCase();
  this.className = className || '';
  this.textContent = textContent || '';
  this.children = [];
  this.listeners = {};
  this.value = '';
}
FakeElement.prototype.appendChild = function (child) {
  this.children.push(child);
  child.parentNode = this;
  return child;
};
FakeElement.prototype.addEventListener = function (name, handler) {
  this.listeners[name] = handler;
};

function element(tagName, className, textContent) {
  return new FakeElement(tagName, className, textContent);
}

var lastModal = null;
var closeCount = 0;
var appDesign = null;
var savedDesign = global.EVO.CreatureDesign.create(
  'My saved creature',
  [global.EVO.JointData.create(1, { x: 0, y: 0 }, 1, 0)],
  [],
  [],
  []
);
var sampleDesign = global.EVO.CreatureDesign.create(
  'Sample walker',
  [global.EVO.JointData.create(2, { x: 1, y: 0 }, 1, 0)],
  [],
  [],
  []
);

global.EVO.UI = { el: element, clear: function () {} };
global.EVO.Widgets = {};
global.EVO.Modal = {
  open: function (options) {
    lastModal = options;
  },
  close: function () {
    closeCount++;
  },
  alert: function (message, title) {
    throw new Error((title || 'Notice') + ': ' + message);
  },
};
global.EVO.Storage = {
  getDesigns: function () {
    return [{ id: 'saved-id', name: 'My saved creature', design: savedDesign }];
  },
};
global.EVO.App = {
  setDesign: function (design) {
    appDesign = design;
  },
};
global.EVO.Renderer = {};
global.EVO.DefaultCreatures = [{ name: 'Sample walker', design: sampleDesign }];
global.EVO.Screens = {};
require('../js/ui/editor.js');

var editor = Object.create(global.EVO.EditorScreen);
editor.builder = new global.EVO.CreatureBuilder(savedDesign);
editor.designId = 'old-save-id';
editor.history = new global.EVO.HistoryManager(40);
editor.history.push(editor.builder.design);
editor.selection = { type: 'joint', id: 1 };
editor.pending = { kind: 'bone', startId: 1 };
editor.drag = { kind: 'joint', id: 1 };
editor.deferredTap = { point: { x: 0, y: 0 } };
editor.nameInput = { value: 'My saved creature' };
editor.frameDesign = function () {};
editor.refreshSettings = function () {};
editor.render = function () {};

editor.showSamples();
var sampleButton = lastModal.content.children[0];
sampleButton.listeners.click();
assert.strictEqual(editor.builder.design.name, 'Sample walker');
assert.strictEqual(editor.nameInput.value, 'Sample walker', 'the name field should match the selected sample');
assert.strictEqual(editor.designId, null, 'loading a sample must not retain an unrelated save id');
assert.strictEqual(editor.pending, null, 'loading a sample must cancel an unfinished connection');
assert.strictEqual(editor.selection, null);
assert.strictEqual(editor.history.entries.length, 1, 'a loaded sample starts a fresh undo history');
assert.strictEqual(appDesign.name, 'Sample walker');

editor.designId = 'old-save-id';
editor.pending = { kind: 'muscle', startId: 99 };
editor.nameInput.value = 'stale name';
editor.showSamples();
var savedButton = lastModal.content.children[2];
savedButton.listeners.click();
assert.strictEqual(editor.builder.design.name, 'My saved creature');
assert.strictEqual(editor.nameInput.value, 'My saved creature');
assert.strictEqual(editor.designId, 'saved-id', 'loading a saved design should bind its own save id');
assert.strictEqual(editor.pending, null);

var imported = global.EVO.CreatureDesign.create(
  'Imported design',
  [global.EVO.JointData.create(5, { x: 3, y: 2 }, 1, 0)],
  [],
  [],
  []
);
editor.designId = 'old-save-id';
editor.pending = { kind: 'bone', startId: 1 };
editor.nameInput.value = 'stale name';
editor.showImport();
var textarea = lastModal.content.children[0];
textarea.value = JSON.stringify(global.EVO.CreatureDesign.encode(imported));
lastModal.actions[1].onClick();
assert.strictEqual(editor.builder.design.name, 'Imported design');
assert.strictEqual(editor.nameInput.value, 'Imported design');
assert.strictEqual(editor.designId, null, 'importing must create an unsaved design, not overwrite another one');
assert.strictEqual(editor.pending, null);
assert.strictEqual(editor.history.entries.length, 1);
assert.strictEqual(closeCount, 3);

console.log('Editor sample/import replacement state regression checks passed.');
