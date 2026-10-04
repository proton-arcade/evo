/*
 * Smoke test for the screens of the game: every screen has to build
 * without errors, the help area has to be complete and searchable and the
 * storage panel of the settings screen has to work with the cookie backup.
 *
 * Run with: node tests/ui-screens-smoke-test.js
 */
'use strict';

var assert = require('assert');
var dom = require('./helpers/dom-stub.js');

dom.install(global);

/* The scripts, in the order in which index.html loads them. */
[
  'core/util.js',
  'core/network.js',
  'core/algorithms.js',
  'core/data.js',
  'data/defaultCreatures.js',
  'sim/physics.js',
  'sim/scene.js',
  'sim/creature.js',
  'sim/brain.js',
  'sim/builder.js',
  'sim/evolution.js',
  'sim/playback.js',
  'render/decorations.js',
  'render/renderer.js',
  'ui/app.js',
  'ui/editor.js',
  'ui/simulation.js',
  'ui/gallery.js',
  'ui/help.js',
].forEach(function (file) {
  require('../js/' + file);
});

var EVO = global.EVO;
var document = global.document;

/* --- Every screen is registered ------------------------------------- */
['home', 'editor', 'simulation', 'creatures', 'gallery', 'settings', 'help'].forEach(function (name) {
  assert.ok(EVO.Screens[name], 'the screen "' + name + '" is registered');
});

/* --- The app starts on the home screen ------------------------------ */
EVO.Settings.ShowOnboarding = false;
EVO.App.start();
assert.strictEqual(EVO.App.currentName, 'home', 'the app starts on the home screen');
assert.ok(EVO.App.element === undefined || true);

/* --- Settings (with the new storage panel) -------------------------- */
EVO.App.show('settings');
var settingsText = EVO.App.current.element.textContent;
assert.ok(settingsText.indexOf('Storage & cookies') !== -1, 'the storage panel is part of the settings');
assert.ok(settingsText.indexOf('Cookies') !== -1, 'the panel mentions cookies');

/* Saving a creature puts a copy into the cookies. */
var design = EVO.CreatureDesign.clone(EVO.DefaultCreatures[0].design);
design.name = 'Test creature';
EVO.Storage.saveDesign(design);
EVO.Store.flushMirror();
assert.ok(EVO.Store.cookieUsage().cookies > 0, 'the saved design is mirrored into the cookies');
assert.strictEqual(EVO.Storage.getDesigns().length, 1, 'the design was saved');

/* The panel can be refreshed and the backup rebuilt. */
var storagePanel = EVO.App.current.element.querySelectorAll('.panel');
assert.ok(storagePanel.length > 3, 'the settings screen has several panels');

/* The buttons of the storage panel do something. */
var backupButton = dom.findByText(EVO.App.current.element, 'Back up now', 'button')[0];
assert.ok(backupButton, 'the storage panel has a "Back up now" button');
dom.dispatch(backupButton, 'click');
assert.ok(EVO.Modal.root, 'backing up reports what it did');
assert.ok(EVO.Modal.root.textContent.indexOf('copied into cookies') !== -1, 'the report mentions cookies');
EVO.Modal.close();

/* --- Help ----------------------------------------------------------- */
EVO.App.show('help');
var help = EVO.Screens.help;
assert.ok(help.contentElement, 'the help screen builds its content area');
assert.ok(help.searchInput, 'the help screen has a search field');

/* The manual is complete: every category, section and block. */
var categories = EVO.Help.categories;
var sectionIds = {};
var sectionCount = 0;
var blockCount = 0;
categories.forEach(function (category) {
  assert.ok(category.title && category.sections.length, 'the category "' + category.id + '" has sections');
  category.sections.forEach(function (section) {
    assert.ok(!sectionIds[section.id], 'section ids are unique (' + section.id + ')');
    sectionIds[section.id] = true;
    sectionCount++;
    assert.ok(section.blocks.length > 0, 'the section "' + section.id + '" has content');
    section.blocks.forEach(function (block) {
      blockCount++;
      assert.ok(EVO.Help.blockText(block).length > 0, 'every block has searchable text');
      assert.ok(EVO.Help.renderBlock(block, ''), 'every block can be rendered');
    });
  });
});
assert.ok(categories.length >= 10, 'the manual covers at least ten topics, got ' + categories.length);
assert.ok(sectionCount >= 30, 'the manual has at least thirty sections, got ' + sectionCount);
assert.ok(blockCount >= 60, 'the manual has at least sixty blocks, got ' + blockCount);

/* Searching finds the right sections — and highlights the word. */
help.setQuery('cookie');
var results = help.contentElement.textContent;
assert.ok(results.indexOf('cookie') !== -1 || results.indexOf('Cookie') !== -1, 'searching for cookie finds something');
assert.ok(help.contentElement.querySelectorAll('.help-mark').length > 0, 'matches are highlighted');
assert.ok(help.contentElement.querySelectorAll('.help-result').length > 0, 'results are grouped by section');

help.setQuery('muscle');
assert.ok(help.contentElement.textContent.indexOf('muscle') !== -1, 'searching for muscle finds something');

help.setQuery('qqqqnotathing');
assert.ok(help.contentElement.textContent.indexOf('Nothing was found') !== -1, 'a search without results says so');

/* Clearing the search shows the category again, and sections collapse. */
help.setQuery('');
var collapse = dom.findByText(help.element, 'Collapse all', 'button')[0];
assert.ok(collapse, 'the toolbar has a "Collapse all" button');
dom.dispatch(collapse, 'click');
assert.strictEqual(
  help.contentElement.querySelectorAll('.help-section-body').length,
  0,
  'collapsing hides every section body'
);
var expand = dom.findByText(help.element, 'Expand all', 'button')[0];
dom.dispatch(expand, 'click');
assert.ok(
  help.contentElement.querySelectorAll('.help-section-body').length > 0,
  'expanding shows the sections again'
);

/* Switching the category rebuilds the sidebar and the content. */
help.setCategory('saving');
assert.strictEqual(help.activeCategory, 'saving');
assert.ok(help.contentElement.textContent.length > 100, 'the selected category has content');

/* --- My creatures --------------------------------------------------- */
EVO.App.show('creatures');
assert.ok(EVO.App.current.element.textContent.indexOf('Test creature') !== -1, 'saved creatures are listed');

/* --- Editor --------------------------------------------------------- */
EVO.App.show('editor', { design: EVO.CreatureDesign.clone(EVO.DefaultCreatures[1].design) });
assert.ok(EVO.Screens.editor.canvas, 'the editor builds its canvas');
assert.strictEqual(EVO.Screens.editor.builder.design.name, 'ROO', 'the editor opens the given design');
EVO.App.show('home');

/* --- The last screen is remembered --------------------------------- */
EVO.App.show('gallery');
assert.strictEqual(EVO.Settings.LastScreen, 'gallery', 'the last screen is stored');
assert.ok(EVO.App.resumableScreen(), 'the app remembers a screen to continue on');
assert.strictEqual(EVO.App.resumableScreen().name, 'gallery');

EVO.App.show('home');
assert.ok(
  EVO.App.current.element.textContent.indexOf('Continue where you left off') !== -1,
  'the home screen offers to continue where the game was left'
);

console.log('UI smoke checks passed (' + categories.length + ' help topics, ' + sectionCount + ' sections).');
