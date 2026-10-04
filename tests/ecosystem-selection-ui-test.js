/* Setup-screen diagnostics for choosing multiple ecosystem residents.
 * Run with: node tests/ecosystem-selection-ui-test.js
 */
'use strict';

var assert = require('assert');

function FakeElement(tagName) {
  this.tagName = String(tagName).toUpperCase();
  this.children = [];
  this.listeners = {};
  this.style = {};
  this.value = '';
  this.textContent = '';
  this.disabled = false;
  this.className = '';
  var self = this;
  this.classList = {
    toggle: function (name, force) {
      var classes = self.className.split(/\s+/).filter(Boolean);
      var has = classes.indexOf(name) !== -1;
      var enabled = force === undefined ? !has : !!force;
      if (enabled && !has) classes.push(name);
      if (!enabled && has) classes.splice(classes.indexOf(name), 1);
      self.className = classes.join(' ');
      return enabled;
    },
  };
}
FakeElement.prototype.appendChild = function (child) {
  this.children.push(child);
  child.parentNode = this;
  return child;
};
FakeElement.prototype.removeChild = function (child) {
  var index = this.children.indexOf(child);
  if (index >= 0) this.children.splice(index, 1);
  child.parentNode = null;
  return child;
};
FakeElement.prototype.addEventListener = function (name, callback) {
  this.listeners[name] = callback;
};
FakeElement.prototype.setAttribute = function (name, value) {
  this[name] = String(value);
};
FakeElement.prototype.querySelector = function (selector) {
  var all = this.querySelectorAll(selector);
  return all.length ? all[0] : null;
};
FakeElement.prototype.querySelectorAll = function (selector) {
  var result = [];
  var expected = selector.charAt(0) === '.' ? selector.substr(1) : null;
  function visit(node) {
    node.children.forEach(function (child) {
      var matches = expected
        ? child.className.split(/\s+/).indexOf(expected) !== -1
        : selector.toUpperCase() === child.tagName.toLowerCase() || selector.toUpperCase() === child.tagName;
      if (matches) result.push(child);
      visit(child);
    });
  }
  visit(this);
  return result;
};
FakeElement.prototype.dispatch = function (name) {
  if (this.listeners[name]) this.listeners[name]({ target: this, currentTarget: this });
};

global.document = { createElement: function (tagName) { return new FakeElement(tagName); } };
require('../js/core/util.js');
require('../js/core/network.js');
require('../js/core/algorithms.js');
require('../js/core/data.js');
require('../js/data/defaultCreatures.js');
require('../js/sim/physics.js');
require('../js/sim/scene.js');
require('../js/sim/creature.js');
require('../js/sim/brain.js');
require('../js/sim/ecosystem.js');
require('../js/ui/app.js');
require('../js/ui/ecosystem.js');

var EVO = global.EVO;
EVO.Store.deleteAll();
for (var i = 0; i < 3; i++) EVO.Storage.saveDesign(EVO.DefaultCreatures[i].design);
var screen = Object.create(EVO.EcosystemScreen);
screen.element = new FakeElement('div');
screen.show();

assert.strictEqual(screen.startButton.disabled, true, 'ecosystems require at least two residents');
assert.strictEqual(screen.availableEntries.length, 8, 'selection includes library entries and samples');
var cards = screen.selectionList.querySelectorAll('.ecosystem-creature-card');
assert.strictEqual(cards.length, 8);
for (var c = 0; c < 6; c++) {
  var checkbox = cards[c].querySelector('input');
  checkbox.checked = true;
  checkbox.dispatch('change');
}
assert.strictEqual(screen.selectedIds.length, 6);
assert.strictEqual(screen.startButton.disabled, false, 'the start action unlocks after selecting multiple residents');
assert.strictEqual(cards[6].querySelector('input').disabled, true, 'selection is capped at six creatures');

var firstCheckbox = cards[0].querySelector('input');
firstCheckbox.checked = false;
firstCheckbox.dispatch('change');
assert.strictEqual(screen.selectedIds.length, 5);
assert.strictEqual(cards[6].querySelector('input').disabled, false, 'unchecking a resident frees a selection slot');

screen.hide();
console.log('Ecosystem setup selection, minimum and six-resident cap checks passed.');
