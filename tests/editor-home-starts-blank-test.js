/* Regression test that the primary Create a Creature action starts from scratch.
 * Run with: node tests/editor-home-starts-blank-test.js
 */
'use strict';

var assert = require('assert');

function FakeElement(tagName, className, textContent) {
  this.tagName = String(tagName).toUpperCase();
  this.className = className || '';
  this.textContent = textContent || '';
  this.children = [];
  this.listeners = {};
}
FakeElement.prototype.appendChild = function (child) {
  this.children.push(child);
  child.parentNode = this;
  return child;
};
FakeElement.prototype.addEventListener = function (name, handler) {
  this.listeners[name] = handler;
};
FakeElement.prototype.removeChild = function (child) {
  var index = this.children.indexOf(child);
  if (index >= 0) this.children.splice(index, 1);
  child.parentNode = null;
};
FakeElement.prototype.classList = {
  add: function () {},
};

function element(tagName, className, textContent) {
  return new FakeElement(tagName, className, textContent);
}

var persistedDesign = {
  name: 'Last scratch design',
  joints: [{ id: 1, x: 0, y: 0, weight: 1 }],
  bones: [],
  muscles: [],
  decorations: [],
};
var root = element('div', 'screens');
global.document = {
  documentElement: {},
  body: element('body'),
  getElementById: function () {
    return root;
  },
  addEventListener: function () {},
};
global.window = global;
global.addEventListener = function () {};
global.visualViewport = null;
global.innerWidth = 800;
global.innerHeight = 600;

global.EVO = {
  UI: { el: element },
  Utils: {},
  Store: {},
  Settings: { LastCreatureDesign: JSON.stringify(persistedDesign) },
  Screens: {},
  CreatureDesign: {
    empty: function () {
      return { name: '', joints: [], bones: [], muscles: [], decorations: [] };
    },
    decode: function (value) {
      return typeof value === 'string' ? JSON.parse(value) : value;
    },
  },
};
require('../js/ui/app.js');

global.EVO.App.start();
assert.strictEqual(global.EVO.App.currentDesign.name, 'Last scratch design', 'the last edited design restores on reload');
assert.strictEqual(global.EVO.App.currentDesign.joints.length, 1);
var home = global.EVO.App.current;
assert(home.element.children[1].children[1].children[1].textContent.indexOf('1 joints') === 0);

var route = null;
global.EVO.App.show = function (name, params) {
  route = { name: name, params: params };
};
var actions = home.element.children[1].children[0];
var createButton = actions.children[0];
assert.strictEqual(createButton.className, 'home-button');
createButton.listeners.click();

assert.strictEqual(route.name, 'editor');
assert.strictEqual(route.params.design.joints.length, 0, 'Create a Creature should not restore the last or a sample design');
assert.strictEqual(route.params.design.bones.length, 0);
assert.strictEqual(route.params.design.muscles.length, 0);

console.log('Home creation flow starts with a blank editor design.');
