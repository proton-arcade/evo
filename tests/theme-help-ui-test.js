/* Settings-controlled light/dark theme and the searchable Help surface.
 * Run with: node tests/theme-help-ui-test.js
 */
'use strict';

var assert = require('assert');
var fs = require('fs');

var rootAttributes = {};
var themeColor = {};
global.document = {
  documentElement: {
    style: {},
    setAttribute: function (name, value) {
      rootAttributes[name] = value;
    },
  },
  querySelector: function (selector) {
    if (selector === 'meta[name="theme-color"]') {
      return {
        setAttribute: function (name, value) {
          themeColor[name] = value;
        },
      };
    }
    return null;
  },
};

require('../js/core/util.js');
var EVO = global.EVO;

assert.strictEqual(EVO.Settings.Theme, 'light', 'light is the default theme');
assert.strictEqual(rootAttributes['data-theme'], 'light', 'the saved theme is applied while util loads');
assert.strictEqual(themeColor.content, '#ededed');

EVO.Settings.Theme = 'dark';
assert.strictEqual(EVO.Settings.Theme, 'dark', 'dark mode is persisted');
EVO.Theme.apply(EVO.Settings.Theme, false);
assert.strictEqual(rootAttributes['data-theme'], 'dark');
assert.strictEqual(global.document.documentElement.style.colorScheme, 'dark');
assert.strictEqual(themeColor.content, '#17191c');

require('../js/render/renderer.js');
require('../js/sim/physics.js');
require('../js/sim/scene.js');
assert.strictEqual(EVO.Renderer.COLORS.background, '#17191c', 'canvas background follows dark mode');
assert.strictEqual(EVO.Renderer.COLORS.bone, '#d4d7dc', 'bones remain visible on a dark canvas');
assert.strictEqual(EVO.SceneColors.obstacle, '#87909a', 'scene structures remain visible in dark mode');

var redraws = 0;
EVO.App = { current: { resize: function () { redraws++; } } };
EVO.Settings.Theme = 'light';
EVO.Theme.apply(EVO.Settings.Theme);
assert.strictEqual(redraws, 1, 'changing theme redraws the current canvas screen');
assert.strictEqual(EVO.Renderer.COLORS.background, '#ededed');
assert.strictEqual(EVO.SceneColors.obstacle, '#151515');

EVO.Settings.Theme = 'unsupported';
assert.strictEqual(EVO.Settings.Theme, 'light', 'unknown themes normalize to light');

var css = fs.readFileSync('css/style.css', 'utf8');
var app = fs.readFileSync('js/ui/app.js', 'utf8');
var html = fs.readFileSync('index.html', 'utf8');
assert(/:root\[data-theme='dark'\]/.test(css), 'dark theme tokens are defined');
assert(css.indexOf('--evo-bg: #17191c') !== -1, 'dark background token is present');
assert(css.indexOf('.help-search-input') !== -1 && css.indexOf('.help-topic-summary') !== -1);
assert(app.indexOf("label: 'Theme'") !== -1, 'Settings exposes the theme selector');
assert(app.indexOf("{ value: 'light', label: 'Light' }") !== -1);
assert(app.indexOf("{ value: 'dark', label: 'Dark' }") !== -1);
assert(app.indexOf("searchInput.type = 'search'") !== -1, 'Help has a real search field');
assert(app.indexOf("UI.el('details', 'help-topic')") !== -1, 'Help topics are accessible accordions');
assert(app.indexOf("UI.makeButton('Expand all'") !== -1);
assert(/name="color-scheme" content="light dark"/.test(html));

console.log('Theme persistence, canvas palettes and searchable Help UI checks passed.');
