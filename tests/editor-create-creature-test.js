/* Regression and smoke test for creating custom creatures from a blank editor.
 * No sample creature data is loaded by this test.
 * Run with: node tests/editor-create-creature-test.js
 */
'use strict';

var assert = require('assert');

global.document = { documentElement: {}, body: {} };

require('../js/core/util.js');
require('../js/core/network.js');
require('../js/core/algorithms.js');
require('../js/core/data.js');
require('../js/sim/physics.js');
require('../js/sim/scene.js');
require('../js/sim/creature.js');
require('../js/sim/brain.js');
require('../js/sim/builder.js');
require('../js/sim/evolution.js');

function FakeElement(tagName, className, textContent) {
  this.tagName = String(tagName).toUpperCase();
  this.className = className || '';
  this.textContent = textContent || '';
  this.value = '';
  this.children = [];
  this.listeners = {};
  this.attributes = {};
  this.classes = Object.create(null);
  var self = this;
  this.classList = {
    add: function (name) {
      self.classes[name] = true;
    },
    toggle: function (name, force) {
      var enabled = force === undefined ? !self.classes[name] : !!force;
      self.classes[name] = enabled;
      return enabled;
    },
  };
}

FakeElement.prototype.appendChild = function (child) {
  this.children.push(child);
  child.parentNode = this;
  return child;
};
FakeElement.prototype.addEventListener = function (name, handler) {
  this.listeners[name] = handler;
};
FakeElement.prototype.setAttribute = function (name, value) {
  this.attributes[name] = String(value);
};

function element(tagName, className, textContent) {
  return new FakeElement(tagName, className, textContent);
}

var pendingConfirmation = null;
var savedDesigns = [];
var currentDesign = null;
global.EVO.UI = { el: element };
global.EVO.Widgets = {
  textInput: function (options) {
    var row = element('div', 'widget widget-input');
    var input = element('input', 'text-input');
    input.value = options.value || '';
    input.addEventListener('input', function () {
      if (options.onInput) options.onInput(input.value);
    });
    row.appendChild(input);
    return { element: row, input: input };
  },
  buttonRow: function (buttons, className) {
    var row = element('div', 'button-row' + (className ? ' ' + className : ''));
    buttons.forEach(function (button) {
      var node = element('button', 'evo-button' + (button.className ? ' ' + button.className : ''), button.label);
      node.addEventListener('click', button.onClick);
      row.appendChild(node);
    });
    return row;
  },
};
global.EVO.Modal = {
  confirm: function (message, onConfirm) {
    pendingConfirmation = onConfirm;
  },
  alert: function () {},
};
global.EVO.Storage = {
  saveDesign: function (design, existingId) {
    var copy = global.EVO.CreatureDesign.clone(design);
    if (existingId) {
      var existing = savedDesigns.filter(function (entry) {
        return entry.id === existingId;
      })[0];
      if (existing) existing.design = copy;
      return existingId;
    }
    var id = 'new-design-' + (savedDesigns.length + 1);
    savedDesigns.push({ design: copy, existingId: null, id: id });
    return id;
  },
};
global.EVO.App = {
  setDesign: function (design) {
    currentDesign = design;
  },
};
global.EVO.Screens = {};
global.EVO.Settings.GridEnabled = false;
global.EVO.Settings.GridSize = 1;
require('../js/render/viewModel.js');
require('../js/ui/editor.js');

var EVO = global.EVO;
assert.strictEqual(EVO.DefaultCreatures, undefined, 'the creation test must not load sample creatures');

function makeEditor() {
  var oldDraft = EVO.CreatureDesign.create(
    'Earlier draft',
    [EVO.JointData.create(90, { x: 0, y: 0 }, 1, 0)],
    [],
    [],
    []
  );
  var editor = Object.create(EVO.EditorScreen);
  editor.builder = new EVO.CreatureBuilder(oldDraft);
  editor.designId = 'previously-saved-draft';
  editor.history = new EVO.HistoryManager(40);
  editor.history.push(editor.builder.design);
  editor.tool = EVO.EditorTools.SELECT;
  editor.selection = { type: 'joint', id: 90 };
  editor.pending = { kind: 'bone', startId: 90 };
  editor.drag = null;
  editor.deferredTap = null;
  editor.activePointerId = null;
  editor.isPointerDown = false;
  editor.gestures = { active: false };
  editor.canvas = element('canvas', 'editor-canvas');
  editor.canvas.getBoundingClientRect = function () {
    return { left: 0, top: 0 };
  };
  editor.camera = {
    orthographicSize: 10,
    screenToWorld: function (x, y) {
      return { x: x, y: y };
    },
  };
  editor.render = function () {};
  editor.refreshSettings = function () {};
  editor.updateToolButtons = function () {};

  var topBar = editor.buildTopBar();
  var actions = topBar.children[2];
  editor.newButton = actions.children.filter(function (button) {
    return button.textContent === 'New';
  })[0];
  assert(editor.newButton, 'the editor should expose its New action');
  return editor;
}

var nextPointerId = 0;
function tap(editor, x, y, pointerType) {
  var event = {
    pointerId: ++nextPointerId,
    pointerType: pointerType || 'mouse',
    clientX: x,
    clientY: y,
    target: editor.canvas,
  };
  editor.handlePointerDown(event);
  editor.handlePointerUp(event);
}

function chooseNew(editor) {
  editor.newButton.listeners.click();
  assert.strictEqual(typeof pendingConfirmation, 'function', 'New should ask for confirmation');
  var confirm = pendingConfirmation;
  pendingConfirmation = null;
  confirm();
}

function setName(editor, name) {
  editor.nameInput.value = name;
  editor.nameInput.listeners.input();
}

function addJoints(editor, points) {
  editor.setTool(EVO.EditorTools.JOINT);
  points.forEach(function (point, index) {
    tap(editor, point[0], point[1], index % 2 ? 'touch' : 'mouse');
  });
  assert.strictEqual(editor.builder.design.joints.length, points.length, 'all placed joints should be added');
  return editor.builder.design.joints.slice();
}

function addBones(editor, points, pairs) {
  editor.setTool(EVO.EditorTools.BONE);
  pairs.forEach(function (pair) {
    tap(editor, points[pair[0]][0], points[pair[0]][1]);
    tap(editor, points[pair[1]][0], points[pair[1]][1]);
  });
  assert.strictEqual(editor.builder.design.bones.length, pairs.length, 'all connected bones should be added');
  return editor.builder.design.bones.slice();
}

function addMuscles(editor, bones, pairs) {
  editor.setTool(EVO.EditorTools.MUSCLE);
  pairs.forEach(function (pair) {
    var first = editor.builder.getBoneCenter(bones[pair[0]]);
    var second = editor.builder.getBoneCenter(bones[pair[1]]);
    tap(editor, first.x, first.y);
    tap(editor, second.x, second.y, 'touch');
  });
  assert.strictEqual(editor.builder.design.muscles.length, pairs.length, 'all selected bone pairs should be joined');
  return editor.builder.design.muscles.slice();
}

function addDecoration(editor, bone, type) {
  editor.setTool(EVO.EditorTools.DECORATION);
  editor.decorationType = type;
  var center = editor.builder.getBoneCenter(bone);
  tap(editor, center.x, center.y, 'touch');
  var decoration = editor.builder.design.decorations[editor.builder.design.decorations.length - 1];
  assert(decoration, 'tapping a bone with the decoration tool should attach a decoration');
  assert.strictEqual(decoration.boneId, bone.id);
  return decoration;
}

function createWalker(editor) {
  var points = [[-2, 3], [-1, 5], [1, 5], [2, 3], [0, 3], [0, 7]];
  var joints = addJoints(editor, points);

  var historyBeforeOverlap = editor.history.entries.length;
  tap(editor, -2, 3.2);
  assert.strictEqual(editor.builder.design.joints.length, 6, 'joints placed too close together should be rejected');
  assert.strictEqual(editor.history.entries.length, historyBeforeOverlap, 'rejected placements should not enter history');

  editor.undo();
  assert.strictEqual(editor.builder.design.joints.length, 5, 'undo should remove the most recent joint');
  editor.redo();
  assert.strictEqual(editor.builder.design.joints.length, 6, 'redo should restore the joint');

  editor.setTool(EVO.EditorTools.BONE);
  tap(editor, points[0][0], points[0][1]);
  tap(editor, points[0][0], points[0][1]);
  assert.strictEqual(editor.builder.design.bones.length, 0, 'tapping the same joint twice should cancel a bone');
  assert.strictEqual(editor.pending, null);

  var pairs = [[0, 1], [1, 4], [4, 2], [2, 3], [4, 5]];
  var bones = addBones(editor, points, pairs);
  tap(editor, points[0][0], points[0][1]);
  tap(editor, points[1][0], points[1][1]);
  assert.strictEqual(editor.builder.design.bones.length, 5, 'duplicate bones should be rejected');

  var muscles = addMuscles(editor, bones, [[0, 1], [2, 3], [1, 4]]);
  var firstCenter = editor.builder.getBoneCenter(bones[0]);
  var secondCenter = editor.builder.getBoneCenter(bones[1]);
  tap(editor, firstCenter.x, firstCenter.y);
  tap(editor, secondCenter.x, secondCenter.y);
  assert.strictEqual(editor.builder.design.muscles.length, 3, 'duplicate muscles should be rejected');

  var decoration = addDecoration(editor, bones[4], EVO.DecorationType.MouthSmile);
  editor.undo();
  assert.strictEqual(editor.builder.design.decorations.length, 0, 'undo should remove a newly attached decoration');
  editor.redo();
  assert.strictEqual(editor.builder.design.decorations.length, 1, 'redo should restore the decoration');

  var historyBeforeProperties = editor.history.entries.length;
  editor.applyProperty(function (builder) {
    return builder.setJointWeight(joints[0].id, 2.25);
  });
  editor.applyProperty(function (builder) {
    return builder.setJointPenalty(joints[0].id, 0.2);
  });
  editor.applyProperty(function (builder) {
    return builder.setBoneWeight(bones[0].id, 1.5);
  });
  editor.applyProperty(function (builder) {
    return builder.setBoneInverted(bones[0].id, true);
  });
  editor.applyProperty(function (builder) {
    return builder.setMuscleStrength(muscles[0].id, 2100);
  });
  editor.applyProperty(function (builder) {
    return builder.setMuscleUserId(muscles[0].id, 'left-leg');
  });
  editor.applyProperty(function (builder) {
    return builder.setDecorationScale(decoration.id, 1.25);
  });
  editor.applyProperty(function (builder) {
    return builder.setDecorationFlip(decoration.id, true, false);
  });
  assert.strictEqual(editor.history.entries.length, historyBeforeProperties, 'property adjustments should not add history entries');

  editor.setTool(EVO.EditorTools.SELECT);
  tap(editor, points[0][0], points[0][1], 'touch');
  assert.deepStrictEqual(editor.selection, { type: 'joint', id: joints[0].id }, 'touch selection should select the custom joint');

  setName(editor, 'Scratch Strider');
  return EVO.CreatureDesign.clone(editor.builder.design);
}

function createFlier(editor) {
  var points = [[0, 6], [-3, 7], [3, 7], [0, 4], [-1, 2.5], [-2, 1], [1, 2.5], [2, 1], [0, 8]];
  var joints = addJoints(editor, points);
  var pairs = [[0, 1], [0, 2], [0, 3], [3, 4], [4, 5], [3, 6], [6, 7], [0, 8]];
  var bones = addBones(editor, points, pairs);
  var muscles = addMuscles(editor, bones, [[0, 1], [3, 4], [5, 6], [2, 7]]);
  var eye = addDecoration(editor, bones[7], EVO.DecorationType.GooglyEye);
  var shoe = addDecoration(editor, bones[6], EVO.DecorationType.Shoe);

  editor.applyProperty(function (builder) {
    return builder.setBoneIsWing(bones[0].id, true);
  });
  editor.applyProperty(function (builder) {
    return builder.setBoneIsWing(bones[1].id, true);
  });
  editor.applyProperty(function (builder) {
    return builder.setBoneInverted(bones[1].id, true);
  });
  editor.applyProperty(function (builder) {
    return builder.setMuscleUserId(muscles[0].id, 'wingbeat');
  });
  editor.applyProperty(function (builder) {
    return builder.setMuscleUserId(muscles[1].id, 'legs');
  });
  editor.applyProperty(function (builder) {
    return builder.setMuscleUserId(muscles[2].id, 'legs');
  });
  editor.applyProperty(function (builder) {
    return builder.setDecorationScale(eye.id, 1.2);
  });
  editor.applyProperty(function (builder) {
    return builder.setDecorationRotation(shoe.id, -10);
  });

  assert.strictEqual(joints.length, 9);
  assert.strictEqual(editor.builder.findBone(bones[0].id).isWing, true);
  assert.strictEqual(editor.builder.findBone(bones[1].id).isWing, true);
  setName(editor, 'Scratch Sky Skipper');
  return EVO.CreatureDesign.clone(editor.builder.design);
}

function saveAsNewDesign(editor, expectedName) {
  editor.save();
  var saved = savedDesigns[savedDesigns.length - 1];
  assert.strictEqual(saved.existingId, null, 'a newly created design must not overwrite another saved design');
  assert.strictEqual(saved.design.name, expectedName);
  assert(editor.designId, 'saving a new design should assign it a new save id');
}

var editor = makeEditor();
chooseNew(editor);
assert.strictEqual(editor.builder.design.joints.length, 0, 'New should start with a blank design');
assert.strictEqual(editor.builder.design.name, '', 'New should clear the creature name');
assert.strictEqual(editor.designId, null, 'New should clear any previous save association');
assert.strictEqual(editor.nameInput.value, '', 'New should clear the name field');
assert.strictEqual(editor.selection, null);
assert.strictEqual(editor.pending, null);
assert.strictEqual(editor.history.entries.length, 1);
assert.strictEqual(currentDesign.joints.length, 0, 'the blank design should become the app current design');

var walker = createWalker(editor);
saveAsNewDesign(editor, 'Scratch Strider');

chooseNew(editor);
assert.strictEqual(editor.builder.design.joints.length, 0, 'a second custom creation also starts blank');
var flier = createFlier(editor);
saveAsNewDesign(editor, 'Scratch Sky Skipper');

setName(editor, '');
editor.save();
assert.strictEqual(editor.builder.design.name, 'Unnamed', 'saving a blank name should assign the fallback name');
assert.strictEqual(editor.nameInput.value, 'Unnamed', 'saving should keep the visible name field in sync');

assert.strictEqual(EVO.CreatureDesign.decode(EVO.CreatureDesign.encode(walker)).muscles.length, 3);
assert.strictEqual(EVO.CreatureDesign.decode(EVO.CreatureDesign.encode(flier)).decorations.length, 2);

var completedScenarios = 0;
[walker, flier].forEach(function (design) {
  EVO.ObjectiveUtil.ALL_OBJECTIVES.forEach(function (objective) {
    [false, true].forEach(function (batched) {
      var settings = EVO.SimulationSettings.defaultSettings();
      settings.Objective = objective;
      settings.SimulationTime = 5;
      settings.PopulationSize = 4;
      settings.BatchSize = 2;
      settings.SimulateInBatches = batched;
      var data = EVO.SimulationData.create(
        settings,
        EVO.NeuralNetworkSettings.defaultSettings(),
        EVO.CreatureDesign.clone(design),
        EVO.DefaultSimulationScenes.defaultSceneForObjective(objective)
      );
      var completedGeneration = null;
      var evolution = new EVO.Evolution({
        data: data,
        onEvent: function (name, payload) {
          if (name === 'generationDidEnd') completedGeneration = payload;
        },
      });
      evolution.start();
      for (var step = 0; step < 60; step++) evolution.update(1 / 60);
      evolution.pause();
      var pausedAt = evolution.batchElapsed;
      evolution.update(0.5);
      assert.strictEqual(evolution.batchElapsed, pausedAt, 'a custom-creature task should stop advancing while paused');
      evolution.resume();
      var requiredTicks = batched ? 603 : 302;
      for (step = 60; step < requiredTicks; step++) evolution.update(1 / 60);

      assert(completedGeneration && completedGeneration.recording, 'a custom creature should finish and record ' + EVO.ObjectiveUtil.stringRepresentation(objective));
      assert(Number.isFinite(completedGeneration.best.stats.fitness), 'custom creature fitness should be finite');
      assert.strictEqual(data.BestCreatures.length, 1);
      assert.strictEqual(evolution.currentGenerationNumber, 2);
      completedScenarios++;
      evolution.finish();
    });
  });
});

console.log(
  'Custom creature creation and simulation checks passed (' +
    savedDesigns.length +
    ' scratch-built designs; ' +
    completedScenarios +
    ' task/batching scenarios).'
);
