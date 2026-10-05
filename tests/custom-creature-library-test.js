/* Validates every creature file in cc/ — the drop folder for custom creatures.
 * Each file must carry a usable design plus action brains whose chromosomes
 * match the network shape that design needs, and must import through the real
 * editor import path with its brains intact.
 * Run with: node tests/custom-creature-library-test.js
 */
'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

function FakeElement(tagName, className, textContent) {
  this.tagName = String(tagName).toUpperCase();
  this.className = className || '';
  this.textContent = textContent || '';
  this.value = '';
  this.children = [];
  this.style = {};
  this.firstChild = null;
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
  this.addEventListener = function () {};
  this.setAttribute = function () {};
}

global.document = {
  documentElement: {},
  body: new FakeElement('body'),
  createElement: function (tag) {
    return new FakeElement(tag);
  },
};
global.Blob = function (parts) {
  this.parts = parts;
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
require('../js/sim/brain.js');
require('../js/ui/app.js');

var EVO = global.EVO;

var openedModals = [];
EVO.Modal = {
  open: function (options) {
    openedModals.push(options);
    return { close: function () {} };
  },
  close: function () {},
  alert: function () {},
};
EVO.Renderer = {};

require('../js/ui/editor.js');

var Storage = EVO.Storage;
EVO.Store.deleteAll();

var ccDir = path.join(__dirname, '..', 'cc');
var files = fs.existsSync(ccDir)
  ? fs
      .readdirSync(ccDir)
      .filter(function (name) {
        return name.slice(-5) === '.json' && name !== 'index.json';
      })
      .sort()
  : [];

assert.ok(files.length, 'cc/ should contain at least one creature file');

files.forEach(function (name) {
  var text = fs.readFileSync(path.join(ccDir, name), 'utf8');
  var json = JSON.parse(text);
  var bundle = EVO.CreatureFile.decode(json);
  var design = bundle.design;

  assert.ok(design.joints.length > 0, name + ': the design has joints');
  assert.ok(design.bones.length > 0, name + ': the design has bones');
  assert.ok(design.muscles.length > 0, name + ': the design has muscles');
  assert.ok(
    EVO.CreatureFile.countBrains(bundle.brains) > 0,
    name + ': the file carries at least one evolved brain'
  );

  /* The plain design must stay readable by older editions and the Unity saves. */
  var legacy = EVO.CreatureDesign.decode(json);
  assert.deepStrictEqual(
    EVO.CreatureDesign.encode(legacy),
    EVO.CreatureDesign.encode(design),
    name + ': still readable as a plain creature design'
  );

  /* Every brain must fit the network that this exact design needs. */
  var musclesContext = EVO.CalculateUniqueMusclesContext(design.muscles);
  Object.keys(bundle.brains).forEach(function (key) {
    var profile = bundle.brains[key];
    var taskName = EVO.ObjectiveUtil.stringRepresentation(profile.task);
    assert.strictEqual(
      EVO.BrainProfile.keyForObjective(profile.task),
      key,
      name + ': brain key ' + key + ' matches its task'
    );
    var brainType = EVO.Brains.brainTypeForSimulation(
      profile.task,
      profile.lastV2SimulatedGeneration || 0
    );
    var inputCount = EVO.Brains.numberOfInputsForBrainType(brainType);
    var outputCount = EVO.Brains.numberOfOutputsForBrainType(brainType, musclesContext);
    var networkSettings = EVO.NeuralNetworkSettings.decode(profile.networkSettings);
    var expected = EVO.FeedForwardNetwork.chromosomeLength(
      inputCount,
      outputCount,
      networkSettings
    );
    assert.strictEqual(
      profile.chromosome.length,
      expected,
      name + ': ' + taskName + ' chromosome fits the design (' + expected + ' weights)'
    );
    assert.ok(
      profile.chromosome.every(function (weight) {
        return typeof weight === 'number' && isFinite(weight);
      }),
      name + ': ' + taskName + ' chromosome holds finite weights'
    );
    assert.ok(profile.generation > 0, name + ': ' + taskName + ' records its generation');
  });

  /* Drive the real editor import: the brains must land on a library entry. */
  openedModals = [];
  var installed = null;
  EVO.EditorScreen.showImport.call({
    installDesign: function (importedDesign, importedId) {
      installed = { design: importedDesign, designId: importedId };
    },
  });
  var modal = openedModals[openedModals.length - 1];
  modal.content.children[0].value = text;
  modal.actions.filter(function (action) {
    return action.label === 'Import';
  })[0].onClick();

  assert.ok(installed && installed.designId, name + ': imports as a My Creatures entry');
  var stored = Storage.getBrainProfilesForDesign(installed.designId);
  assert.deepStrictEqual(
    Object.keys(stored).sort(),
    Object.keys(bundle.brains).sort(),
    name + ': every brain survives the import'
  );
  Object.keys(stored).forEach(function (key) {
    assert.deepStrictEqual(
      stored[key].chromosome,
      bundle.brains[key].chromosome,
      name + ': ' + key + ' chromosome is stored unchanged'
    );
  });

  console.log(
    name +
      ': ' +
      design.joints.length +
      ' joints, ' +
      design.bones.length +
      ' bones, ' +
      design.muscles.length +
      ' muscles, brains: ' +
      Object.keys(stored).join(', ')
  );
});

console.log('custom creature library: all checks passed');
