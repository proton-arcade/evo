/* Regression checks for exporting and importing a creature together with its
 * evolved action brain profiles (CreatureFile / BrainProfile, EditorScreen.exportDesign
 * and EditorScreen.showImport).
 * Run with: node tests/creature-file-brain-export-test.js
 */
'use strict';

var assert = require('assert');

/* ------------------------------------------------------------------ *
 * Minimal DOM + download stubs, mirroring the other editor tests.
 * ------------------------------------------------------------------ */
function FakeElement(tagName, className, textContent) {
  this.tagName = String(tagName).toUpperCase();
  this.className = className || '';
  this.textContent = textContent || '';
  this.value = '';
  this.children = [];
  this.listeners = {};
  this.attributes = {};
  this.style = {};
  this.href = '';
  this.download = '';
  this.clicked = false;
  var self = this;
  this.classList = {
    add: function () {},
    toggle: function () {
      return false;
    },
    remove: function () {},
    contains: function () {
      return false;
    },
  };
  this.firstChild = null;
  this.appendChild = function (child) {
    self.children.push(child);
    child.parentNode = self;
    if (!self.firstChild) self.firstChild = child;
    return child;
  };
  this.removeChild = function (child) {
    var index = self.children.indexOf(child);
    if (index >= 0) self.children.splice(index, 1);
    self.firstChild = self.children[0] || null;
    return child;
  };
  this.addEventListener = function (name, handler) {
    self.listeners[name] = handler;
  };
  this.setAttribute = function (name, value) {
    self.attributes[name] = String(value);
  };
  this.click = function () {
    self.clicked = true;
  };
}

var fakeBody = new FakeElement('body');
global.document = {
  documentElement: {},
  body: fakeBody,
  createElement: function (tag) {
    return new FakeElement(tag);
  },
};

var capturedBlobs = [];
global.Blob = function (parts, options) {
  this.parts = parts;
  this.type = options && options.type;
  capturedBlobs.push(this);
};
global.URL = {
  createObjectURL: function () {
    return 'blob:fake';
  },
  revokeObjectURL: function () {},
};

require('../js/core/util.js');
require('../js/core/network.js');
require('../js/core/algorithms.js');
require('../js/core/data.js');
require('../js/data/defaultCreatures.js');
require('../js/sim/scene.js');
require('../js/ui/app.js');

var EVO = global.EVO;

/* The editor only needs Modal and Renderer to be present; record what it asks
 * Modal to do instead of building real overlays. */
var openedModals = [];
var closedModals = 0;
var alerts = [];
EVO.Modal = {
  open: function (options) {
    openedModals.push(options);
    return { close: function () {} };
  },
  close: function () {
    closedModals++;
  },
  alert: function (message, title) {
    alerts.push({ message: message, title: title });
  },
};
EVO.Renderer = {};

require('../js/ui/editor.js');

var Storage = EVO.Storage;
EVO.Store.deleteAll();

/* ------------------------------------------------------------------ *
 * Fixtures: a design plus two evolved action brains.
 * ------------------------------------------------------------------ */
var design = EVO.DefaultCreatures[0].design;
var networkSettings = EVO.NeuralNetworkSettings.defaultSettings();
var scene = EVO.DefaultSimulationScenes.runningScene();

function makeProfile(task, generation, chromosome) {
  var stats = EVO.CreatureStats.create();
  stats.fitness = 0.5;
  stats.unclampedFitness = 0.5;
  return {
    task: task,
    generation: generation,
    chromosome: chromosome,
    networkSettings: EVO.NeuralNetworkSettings.encode(networkSettings),
    scene: EVO.SimulationSceneDescription.encode(scene),
    stats: EVO.CreatureStats.encode(stats),
    lastV2SimulatedGeneration: 0,
  };
}

var runningBrain = makeProfile(EVO.Objective.Running, 12, [0.123456, -0.5, 1.25]);
var jumpingBrain = makeProfile(EVO.Objective.Jumping, 4, [0.25, 0.75, -1]);

var designId = Storage.saveDesign(design, null, {
  running: runningBrain,
  jumping: jumpingBrain,
});

assert.ok(designId, 'a design saved with brains gets a library id');
var storedBrains = Storage.getBrainProfilesForDesign(designId);
assert.deepStrictEqual(
  Object.keys(storedBrains).sort(),
  ['jumping', 'running'],
  'Storage.getBrainProfilesForDesign returns both saved action brains'
);
assert.deepStrictEqual(
  EVO.Storage.getEvolvedBrainProfiles(Storage.getDesigns()[0]).map(function (profile) {
    return profile.task;
  }),
  [EVO.Objective.Running, EVO.Objective.Jumping],
  'My Creatures lists the imported action brains in task order'
);

/* ------------------------------------------------------------------ *
 * CreatureFile encoding
 * ------------------------------------------------------------------ */
var encoded = EVO.CreatureFile.encode(design, storedBrains);
assert.deepStrictEqual(
  Object.keys(encoded).sort(),
  ['bones', 'brains', 'decorations', 'joints', 'muscles', 'name'],
  'the exported file keeps the plain design keys and adds brains'
);
assert.deepStrictEqual(
  Object.keys(encoded.brains).sort(),
  ['jumping', 'running'],
  'both action brains are exported'
);
assert.strictEqual(encoded.brains.running.task, EVO.Objective.Running);
assert.strictEqual(encoded.brains.running.generation, 12);
assert.deepStrictEqual(
  encoded.brains.running.chromosome,
  [0.1235, -0.5, 1.25],
  'the exported chromosome keeps the rounded weights'
);
assert.deepStrictEqual(
  encoded.brains.running.networkSettings,
  { NodesPerIntermediateLayer: [10] },
  'the brain topology travels with the creature'
);
assert.strictEqual(
  encoded.brains.running.replayId,
  undefined,
  'the browser-local replay reference is not exported'
);

/* Old editions and the Unity save files read the same file: they must still see
 * a plain design and ignore the extra entry. */
var legacyDesign = EVO.CreatureDesign.decode(JSON.parse(JSON.stringify(encoded)));
assert.strictEqual(legacyDesign.joints.length, design.joints.length);
assert.strictEqual(legacyDesign.bones.length, design.bones.length);
assert.strictEqual(legacyDesign.muscles.length, design.muscles.length);
assert.deepStrictEqual(
  EVO.CreatureDesign.encode(legacyDesign),
  EVO.CreatureDesign.encode(design),
  'CreatureDesign.decode ignores the brains entry'
);

/* Round trip through the importer. */
var decoded = EVO.CreatureFile.decode(JSON.parse(JSON.stringify(encoded)));
assert.deepStrictEqual(
  EVO.CreatureDesign.encode(decoded.design),
  EVO.CreatureDesign.encode(design),
  'the design survives a CreatureFile round trip'
);
assert.deepStrictEqual(
  Object.keys(decoded.brains).sort(),
  ['jumping', 'running'],
  'the brains survive a CreatureFile round trip'
);
assert.deepStrictEqual(decoded.brains.running.chromosome, [0.1235, -0.5, 1.25]);
assert.deepStrictEqual(decoded.brains.jumping.chromosome, [0.25, 0.75, -1]);
assert.strictEqual(decoded.brains.jumping.generation, 4);

/* A design-only file (no brains) still imports, and a brain list without keys
 * is keyed from each profile's own task. */
assert.deepStrictEqual(
  EVO.CreatureFile.decode(EVO.CreatureDesign.encode(design)).brains,
  {},
  'a design-only file imports with no brains'
);
var listForm = EVO.CreatureDesign.encode(design);
listForm.brains = [runningBrain, jumpingBrain];
assert.deepStrictEqual(
  Object.keys(EVO.CreatureFile.decode(listForm).brains).sort(),
  ['jumping', 'running'],
  'an unkeyed brain list is keyed from the profile task'
);
/* A brain without weights is dropped rather than imported as a broken profile. */
var emptyForm = EVO.CreatureDesign.encode(design);
emptyForm.brains = { running: { task: EVO.Objective.Running, chromosome: [] } };
assert.deepStrictEqual(
  EVO.CreatureFile.decode(emptyForm).brains,
  {},
  'a brain without a chromosome is not imported'
);

/* ------------------------------------------------------------------ *
 * EditorScreen.exportDesign — the real download path
 * ------------------------------------------------------------------ */
capturedBlobs = [];
var exportedEditor = { builder: { design: design }, designId: designId };
EVO.EditorScreen.exportDesign.call(exportedEditor);
assert.strictEqual(capturedBlobs.length, 1, 'exporting writes one file');
var exportedJson = JSON.parse(capturedBlobs[0].parts.join(''));
assert.deepStrictEqual(
  Object.keys(exportedJson.brains).sort(),
  ['jumping', 'running'],
  'EditorScreen.exportDesign ships the evolved brains with the creature'
);
assert.strictEqual(exportedJson.name, design.name, 'the exported name is kept');

/* A design that is not linked to a library entry exports as a plain design. */
capturedBlobs = [];
EVO.EditorScreen.exportDesign.call({ builder: { design: design }, designId: null });
var plainJson = JSON.parse(capturedBlobs[0].parts.join(''));
assert.strictEqual(plainJson.brains, undefined, 'a design without saved brains exports no brains');

/* ------------------------------------------------------------------ *
 * EditorScreen.showImport — the real import path
 * ------------------------------------------------------------------ */
/* showImport builds its paste box with UI.el, so fill the captured modal's
 * textarea and trigger the real Import button handler. */
function importText(text) {
  openedModals = [];
  closedModals = 0;
  alerts = [];
  var installed = null;
  var screen = {
    installDesign: function (importedDesign, importedId) {
      installed = { design: importedDesign, designId: importedId };
    },
  };
  EVO.EditorScreen.showImport.call(screen);
  var modal = openedModals[openedModals.length - 1];
  var textarea = modal.content.children[0];
  textarea.value = text;
  var importAction = modal.actions.filter(function (action) {
    return action.label === 'Import';
  })[0];
  importAction.onClick();
  return installed;
}

var beforeImport = Storage.getDesigns().length;
var installedWithBrains = importText(JSON.stringify(encoded));
assert.ok(installedWithBrains, 'importing a creature file installs the design');
assert.ok(
  installedWithBrains.designId,
  'a file carrying brains is saved to My Creatures so the brains are not lost'
);
assert.strictEqual(
  Storage.getDesigns().length,
  beforeImport + 1,
  'importing brains adds exactly one library entry'
);
assert.deepStrictEqual(
  Object.keys(Storage.getBrainProfilesForDesign(installedWithBrains.designId)).sort(),
  ['jumping', 'running'],
  'the imported creature keeps both action brains'
);
assert.strictEqual(closedModals, 1, 'the import dialog closes');
assert.strictEqual(alerts.length, 1, 'the user is told the brains came with it');
assert.ok(/2 evolved brains/.test(alerts[0].message), 'the alert reports the brain count');

/* A design-only file keeps the previous behaviour: loaded into the editor,
 * not saved to the library. */
var beforePlain = Storage.getDesigns().length;
var installedPlain = importText(JSON.stringify(EVO.CreatureDesign.encode(design)));
assert.ok(installedPlain, 'a plain design still imports');
assert.strictEqual(
  installedPlain.designId,
  null,
  'a design-only file is not auto-saved to My Creatures'
);
assert.strictEqual(
  Storage.getDesigns().length,
  beforePlain,
  'importing a plain design adds no library entry'
);
assert.strictEqual(alerts.length, 0, 'a plain import shows no extra alert');

/* Saving the phenotype again must not drop the imported brains. */
Storage.saveDesign(design, installedWithBrains.designId);
assert.deepStrictEqual(
  Object.keys(Storage.getBrainProfilesForDesign(installedWithBrains.designId)).sort(),
  ['jumping', 'running'],
  're-saving the design keeps its evolved brains'
);

/* An invalid file still reports the failure. */
openedModals = [];
alerts = [];
var failingScreen = { installDesign: function () {} };
EVO.EditorScreen.showImport.call(failingScreen);
var failingModal = openedModals[openedModals.length - 1];
failingModal.content.children[0].value = '{"name":"broken","joints":[]}';
failingModal.actions.filter(function (action) {
  return action.label === 'Import';
})[0].onClick();
assert.strictEqual(alerts.length, 1, 'an empty design is rejected');
assert.strictEqual(alerts[0].title, 'Import failed');

console.log('creature file brain export/import: all checks passed');
