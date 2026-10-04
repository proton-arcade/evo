/*
 * Evolution (Web Edition) — ui/editor.js
 * ---------------------------------------------------------------
 * The creature editor: place joints, connect them with bones, add muscles
 * and decorations, and tweak the properties of every component.
 * Port of Assets/Scripts/Controllers/CreatureEditor.cs and the
 * editor related views.
 */
(function (global) {
  'use strict';

  var EVO = (global.EVO = global.EVO || {});
  var UI = EVO.UI;
  var Widgets = EVO.Widgets;
  var Modal = EVO.Modal;
  var Storage = EVO.Storage;
  var App = EVO.App;
  var Utils = EVO.Utils;
  var Renderer = EVO.Renderer;

  var Tools = {
    SELECT: 'select',
    JOINT: 'joint',
    BONE: 'bone',
    MUSCLE: 'muscle',
    DECORATION: 'decoration',
    ERASE: 'erase',
  };

  var EditorScreen = {
    /* --- screen lifecycle ------------------------------------------- */
    show: function (params) {
      this.design = params.design ? EVO.CreatureDesign.clone(params.design) : null;
      this.designId = params.designId || null;
      if (!this.design) {
        var last = EVO.Store.getString('LAST_CREATURE_DESIGN_KEY', '');
        if (last) {
          try {
            this.design = EVO.CreatureDesign.decode(JSON.parse(last));
          } catch (error) {
            this.design = null;
          }
        }
      }
      if (!this.design) {
        this.design = EVO.DefaultCreatures[0]
          ? EVO.CreatureDesign.clone(EVO.DefaultCreatures[0].design)
          : EVO.CreatureDesign.empty();
      }

      this.builder = new EVO.CreatureBuilder(this.design);
      this.builder.design.name = this.design.name === 'Unnamed' ? '' : this.design.name;
      this.history = new EVO.HistoryManager(40);
      this.history.push(this.builder.design);

      this.tool = Tools.SELECT;
      this.selection = null; // {type, id}
      this.pending = null; // {kind: 'bone'|'muscle', startId}
      this.drag = null;
      this.isPointerDown = false;
      this.activePointerId = null;
      this.deferredTap = null;
      this.gestures = null;
      this.decorationType = EVO.DecorationType.GooglyEye;
      this.camera = new EVO.Camera({ orthographicSize: 10 });
      this.pointerPosition = { x: 0, y: 0 };
      this.showDecorationPicker = false;

      this.buildLayout();
      this.frameDesign();
      this.render();
      this.attachEvents();
      // Keep the application's current design in sync so that "Simulate"
      // works even if the creature was not modified.
      App.setDesign(this.builder.design);
    },

    hide: function () {
      if (this.animationFrame) {
        cancelAnimationFrame(this.animationFrame);
        this.animationFrame = null;
      }
      if (this.builder) {
        App.setDesign(this.builder.design);
      }
      this.detachEvents();
    },

    resize: function () {
      this.resizeCanvas();
      this.render();
    },

    /* --- layout ------------------------------------------------------ */
    buildLayout: function () {
      var self = this;
      var element = this.element;

      /* Canvas */
      var canvasContainer = UI.el('div', 'canvas-container');
      this.canvas = UI.el('canvas', 'editor-canvas');
      canvasContainer.appendChild(this.canvas);
      element.appendChild(canvasContainer);
      this.canvasContainer = canvasContainer;

      /* Top bar */
      element.appendChild(this.buildTopBar());

      /* Toolbar */
      element.appendChild(this.buildToolbar());

      /* Settings panel */
      this.settingsPanel = UI.el('div', 'side-panel editor-settings');
      element.appendChild(this.settingsPanel);

      /* Hint */
      this.hint = UI.el('div', 'editor-hint');
      canvasContainer.appendChild(this.hint);

      this.resizeCanvas();
      void self;
    },

    buildTopBar: function () {
      var self = this;
      var bar = UI.el('div', 'top-bar editor-top-bar');

      var back = UI.el('button', 'back-button');
      back.appendChild(UI.el('span', 'back-arrow', '\u2190'));
      back.appendChild(UI.el('span', null, 'Back'));
      back.addEventListener('click', function () {
        App.setDesign(self.builder.design);
        App.show('home');
      });
      bar.appendChild(back);

      var nameWidget = Widgets.textInput({
        value: this.builder.design.name,
        placeholder: 'Creature name',
        maxLength: 40,
        onInput: function (value) {
          self.builder.design.name = value;
        },
      });
      nameWidget.element.classList.add('editor-name');
      bar.appendChild(nameWidget.element);

      bar.appendChild(
        Widgets.buttonRow(
          [
            {
              label: 'Undo',
              onClick: function () {
                self.undo();
              },
            },
            {
              label: 'Redo',
              onClick: function () {
                self.redo();
              },
            },
            {
              label: 'New',
              onClick: function () {
                Modal.confirm('Start a new creature?', function () {
                  self.builder = new EVO.CreatureBuilder(EVO.CreatureDesign.empty());
                  self.history.reset();
                  self.history.push(self.builder.design);
                  self.selection = null;
                  self.pending = null;
                  self.refreshSettings();
                  self.render();
                }, 'Start new');
              },
            },
            {
              label: 'Samples',
              onClick: function () {
                self.showSamples();
              },
            },
            {
              label: 'Import',
              onClick: function () {
                self.showImport();
              },
            },
            {
              label: 'Export',
              onClick: function () {
                self.exportDesign();
              },
            },
            {
              label: 'Save',
              className: 'primary',
              onClick: function () {
                self.save();
              },
            },
            {
              label: 'Simulate',
              className: 'accent',
              onClick: function () {
                App.setDesign(self.builder.design);
                App.show('simulation', {});
              },
            },
          ],
          'compact'
        )
      );

      return bar;
    },

    buildToolbar: function () {
      var self = this;
      var toolbar = UI.el('div', 'toolbar');
      this.toolButtons = {};

      var definitions = [
        { tool: Tools.SELECT, label: 'Select', icon: '\u2723' },
        { tool: Tools.JOINT, label: 'Joint', icon: '\u25CF' },
        { tool: Tools.BONE, label: 'Bone', icon: '\u2571' },
        { tool: Tools.MUSCLE, label: 'Muscle', icon: '\u2248' },
        { tool: Tools.DECORATION, label: 'Decor', icon: '\u263A' },
        { tool: Tools.ERASE, label: 'Erase', icon: '\u2715' },
      ];

      definitions.forEach(function (definition) {
        var button = UI.el('button', 'tool-button');
        button.appendChild(UI.el('span', 'tool-icon', definition.icon));
        button.appendChild(UI.el('span', 'tool-label', definition.label));
        button.addEventListener('click', function () {
          self.setTool(definition.tool);
        });
        self.toolButtons[definition.tool] = button;
        toolbar.appendChild(button);
      });

      this.decorationPicker = UI.el('div', 'decoration-picker hidden');
      var pickerBody = UI.el('div', 'decoration-picker-body');
      EVO.DecorationTypeNames.forEach(function (name, type) {
        var option = UI.el('button', 'decoration-option', name);
        option.addEventListener('click', function () {
          self.decorationType = type;
          self.setTool(Tools.DECORATION);
          self.refreshDecorationPicker();
        });
        pickerBody.appendChild(option);
      });
      this.decorationPicker.appendChild(pickerBody);
      this.element.appendChild(this.decorationPicker);

      this.updateToolButtons();
      return toolbar;
    },

    setTool: function (tool) {
      this.tool = tool;
      this.pending = null;
      this.builder.cancelCurrentBone();
      this.builder.cancelCurrentMuscle();
      this.updateToolButtons();
      this.refreshSettings();
      this.render();
    },

    updateToolButtons: function () {
      var self = this;
      Object.keys(this.toolButtons).forEach(function (tool) {
        self.toolButtons[tool].classList.toggle('active', tool === self.tool);
      });
      this.decorationPicker.classList.toggle('hidden', this.tool !== Tools.DECORATION);
    },

    refreshDecorationPicker: function () {
      var self = this;
      var options = this.decorationPicker.querySelectorAll('.decoration-option');
      options.forEach(function (option, index) {
        option.classList.toggle('active', index === self.decorationType);
      });
    },

    resizeCanvas: function () {
      var container = this.canvasContainer;
      var width = container.clientWidth || 800;
      var height = container.clientHeight || 600;
      var ratio = Utils.displayPixelRatio ? Utils.displayPixelRatio() : Math.min(global.devicePixelRatio || 1, 2);
      this.canvas.width = Math.floor(width * ratio);
      this.canvas.height = Math.floor(height * ratio);
      this.canvas.style.width = width + 'px';
      this.canvas.style.height = height + 'px';
      this.camera.resize(width, height);
      this.pixelRatio = ratio;
    },

    frameDesign: function () {
      var design = this.builder.design;
      if (!design.joints.length) {
        this.camera.x = 0;
        this.camera.y = 3;
        this.camera.orthographicSize = 10;
        return;
      }
      var minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;
      design.joints.forEach(function (joint) {
        minX = Math.min(minX, joint.x);
        maxX = Math.max(maxX, joint.x);
        minY = Math.min(minY, joint.y);
        maxY = Math.max(maxY, joint.y);
      });
      var width = Math.max(6, maxX - minX);
      var height = Math.max(6, maxY - minY);
      this.camera.x = (minX + maxX) / 2;
      this.camera.y = (minY + maxY) / 2;
      this.camera.orthographicSize = Utils.clamp(Math.max(width * 0.75, height * 0.9), 3, 40);
    },

    /* --- events ------------------------------------------------------ */
    attachEvents: function () {
      var self = this;
      this.onPointerDown = function (event) {
        self.handlePointerDown(event);
      };
      this.onPointerMove = function (event) {
        self.handlePointerMove(event);
      };
      this.onPointerUp = function (event) {
        self.handlePointerUp(event);
      };
      this.onPointerCancel = function (event) {
        self.cancelPointerAction(event);
      };
      this.onBlur = function (event) {
        self.cancelPointerAction(event, true);
      };
      this.onVisibilityChange = function () {
        self.cancelPointerAction(null, true);
      };
      this.onWheel = function (event) {
        event.preventDefault();
        var rect = self.canvas.getBoundingClientRect();
        var factor = event.deltaY > 0 ? 1.1 : 1 / 1.1;
        self.camera.zoomAt(event.clientX - rect.left, event.clientY - rect.top, factor);
        self.render();
      };
      this.onKeyDown = function (event) {
        if (event.target && /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
        var key = event.key.toLowerCase();
        var shortcuts = {
          v: Tools.SELECT,
          j: Tools.JOINT,
          b: Tools.BONE,
          m: Tools.MUSCLE,
          d: Tools.DECORATION,
          e: Tools.ERASE,
        };
        if (shortcuts[key]) {
          self.setTool(shortcuts[key]);
        } else if ((event.ctrlKey || event.metaKey) && key === 'z') {
          event.preventDefault();
          if (event.shiftKey) self.redo();
          else self.undo();
        } else if (key === 'delete' || key === 'backspace') {
          if (self.selection) {
            self.deleteSelection();
          }
        } else if (key === 'escape') {
          self.pending = null;
          self.builder.cancelCurrentBone();
          self.builder.cancelCurrentMuscle();
          self.render();
        }
      };

      // Register gestures first so `active` is already true when the editor's
      // pointerdown handler receives the second touch of a pinch.
      this.gestures = Utils.addTouchGestures(this.canvas, {
        onGestureStart: function () {
          self.deferredTap = null;
          self.finishDrag();
          self.activePointerId = null;
          self.isPointerDown = false;
        },
        onPinch: function (scale, cx, cy) {
          self.camera.zoomAt(cx, cy, 1 / scale);
          self.render();
        },
        onPan: function (dx, dy) {
          self.camera.panByScreenDelta(dx, dy);
          self.render();
        },
        onGestureEnd: function () {
          // Do not turn the remaining finger of a finished gesture into a tap.
          self.deferredTap = null;
          self.activePointerId = null;
          self.isPointerDown = false;
          self.drag = null;
        },
      });

      this.canvas.addEventListener('pointerdown', this.onPointerDown);
      window.addEventListener('pointermove', this.onPointerMove);
      window.addEventListener('pointerup', this.onPointerUp);
      window.addEventListener('pointercancel', this.onPointerCancel);
      window.addEventListener('blur', this.onBlur);
      document.addEventListener('visibilitychange', this.onVisibilityChange);
      this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
      window.addEventListener('keydown', this.onKeyDown);
    },

    detachEvents: function () {
      if (this.gestures) {
        this.gestures.detach();
        this.gestures = null;
      }
      this.canvas.removeEventListener('pointerdown', this.onPointerDown);
      window.removeEventListener('pointermove', this.onPointerMove);
      window.removeEventListener('pointerup', this.onPointerUp);
      window.removeEventListener('pointercancel', this.onPointerCancel);
      window.removeEventListener('blur', this.onBlur);
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
      this.canvas.removeEventListener('wheel', this.onWheel);
      window.removeEventListener('keydown', this.onKeyDown);
    },

    pointerWorld: function (event) {
      var rect = this.canvas.getBoundingClientRect();
      return this.camera.screenToWorld(event.clientX - rect.left, event.clientY - rect.top);
    },

    isTouchEvent: function (event) {
      return !!(event && event.pointerType === 'touch');
    },

    /**
     * Releases over another control should not count as a canvas tap. Releasing
     * on the canvas, its ancestors, or the document/window is still accepted so
     * an ordinary drag can end just outside the canvas edge.
     */
    releaseBelongsToCanvas: function (event) {
      var target = event && event.target;
      if (
        !target ||
        target === global ||
        target === document ||
        target === document.documentElement ||
        target === document.body
      ) {
        return true;
      }
      var node = this.canvas;
      while (node) {
        if (node === target) return true;
        node = node.parentNode;
      }
      return false;
    },

    handlePointerDown: function (event) {
      // The gesture listener was registered first. Do not let the second finger
      // start an edit after the recognizer has promoted the interaction to a pinch.
      if (this.gestures && this.gestures.active) return;

      var point = this.pointerWorld(event);
      this.pointerPosition = point;
      this.activePointerId = event.pointerId === undefined ? null : event.pointerId;
      this.isPointerDown = true;
      this.lastPointer = { x: event.clientX, y: event.clientY };
      this.drag = null;

      if (this.isTouchEvent(event)) {
        // Wait until lift to apply a tap tool. If another finger arrives first,
        // the gesture-start callback cancels this record before it can edit.
        this.deferredTap = { point: { x: point.x, y: point.y } };
        if (this.tool === Tools.SELECT) this.beginSelection(point);
        return;
      }

      this.deferredTap = null;
      if (this.tool === Tools.SELECT) this.beginSelection(point);
      else this.applyToolAt(point, this.snap(point));
    },

    beginSelection: function (point) {
      var hit = this.builder.hitTest(point, this.hitTolerance());
      if (hit) {
        this.selection = hit;
        this.drag = {
          kind: hit.type,
          id: hit.id,
          startPoint: point,
          original: this.snapshot(),
          moved: false,
        };
        this.refreshSettings();
        this.render();
      } else {
        this.selection = null;
        this.drag = { kind: 'pan' };
        this.refreshSettings();
        this.render();
      }
    },

    applyToolAt: function (point, snapped) {
      var self = this;
      snapped = snapped || this.snap(point);

      if (this.tool === Tools.SELECT) {
        this.beginSelection(point);
        return;
      }

      if (this.tool === Tools.JOINT) {
        this.changeAndRecord(function (builder) {
          builder.tryPlacingJoint(snapped);
        });
        return;
      }

      if (this.tool === Tools.BONE) {
        var jointHit = this.hitJoint(point);
        if (jointHit) {
          if (this.pending && this.pending.kind === 'bone' && this.pending.startId !== jointHit.id) {
            this.completeBone(jointHit.id);
          } else if (this.pending && this.pending.kind === 'bone') {
            this.pending = null;
            this.builder.cancelCurrentBone();
            this.render();
          } else {
            this.pending = { kind: 'bone', startId: jointHit.id };
            this.builder.tryStartingBone(jointHit.id);
            this.render();
          }
        } else if (this.pending) {
          this.pending = null;
          this.builder.cancelCurrentBone();
          this.render();
        }
        return;
      }

      if (this.tool === Tools.MUSCLE) {
        var boneHit = this.hitBone(point);
        if (boneHit) {
          if (this.pending && this.pending.kind === 'muscle' && this.pending.startId !== boneHit.id) {
            this.completeMuscle(boneHit.id);
          } else {
            this.pending = { kind: 'muscle', startId: boneHit.id };
            this.builder.tryStartingMuscle(boneHit.id);
            this.render();
          }
        } else if (this.pending) {
          this.pending = null;
          this.builder.cancelCurrentMuscle();
          this.render();
        }
        return;
      }

      if (this.tool === Tools.DECORATION) {
        var target = this.hitBone(point);
        if (target) {
          this.changeAndRecord(function (builder) {
            var decoration = builder.createDecorationFromBone(target.id, { x: 0, y: 0 }, self.decorationType);
            if (decoration) {
              // Place it where the user tapped, relative to the bone centre.
              var center = builder.getBoneCenter(builder.findBone(target.id));
              var bone = builder.findBone(target.id);
              var start = builder.findJoint(bone.startJointID);
              var end = builder.findJoint(bone.endJointID);
              var angle = Math.atan2(-(end.x - start.x), end.y - start.y);
              var dx = point.x - center.x;
              var dy = point.y - center.y;
              var cos = Math.cos(-angle);
              var sin = Math.sin(-angle);
              decoration.offset.x = dx * cos - dy * sin;
              decoration.offset.y = -(dx * sin + dy * cos);
              self.selection = { type: 'decoration', id: decoration.id };
              self.refreshSettings();
            }
          });
        }
        return;
      }

      if (this.tool === Tools.ERASE) {
        var eraseHit = this.builder.hitTest(point, this.hitTolerance());
        if (eraseHit) {
          this.changeAndRecord(function (builder) {
            builder.deleteComponent(eraseHit.type, eraseHit.id);
          });
          if (this.selection && this.selection.id === eraseHit.id) {
            this.selection = null;
            this.refreshSettings();
          }
        }
      }
    },

    finishDrag: function () {
      if (this.drag && this.drag.kind !== 'pan' && this.drag.moved) {
        // Record the state before and after the drag so that it can be undone.
        var current = this.snapshot();
        if (JSON.stringify(this.drag.original) !== JSON.stringify(current)) {
          var historyEntry = JSON.stringify(EVO.CreatureDesign.decode(this.history.entries[this.history.index]));
          if (historyEntry !== JSON.stringify(this.drag.original)) {
            this.history.entries = this.history.entries.slice(0, this.history.index + 1);
            this.history.entries.push(JSON.parse(JSON.stringify(this.drag.original)));
            this.history.index = this.history.entries.length - 1;
          }
          this.history.push(this.builder.design);
          App.setDesign(this.builder.design);
        }
      }
      this.isPointerDown = false;
      this.activePointerId = null;
      this.drag = null;
    },

    cancelPointerAction: function (event, force) {
      if (
        !force &&
        event &&
        this.activePointerId !== null &&
        event.pointerId !== undefined &&
        event.pointerId !== this.activePointerId
      ) {
        return;
      }
      if (this.drag && this.drag.moved && this.drag.kind !== 'pan' && this.drag.original) {
        this.restoreSnapshot(this.drag.original);
        this.render();
      }
      this.deferredTap = null;
      this.isPointerDown = false;
      this.activePointerId = null;
      this.drag = null;
    },

    handlePointerUp: function (event) {
      if (this.activePointerId === null || event.pointerId !== this.activePointerId) return;
      if (!this.releaseBelongsToCanvas(event)) {
        this.cancelPointerAction(null, true);
        return;
      }

      if (this.deferredTap && this.tool !== Tools.SELECT) {
        var point = this.deferredTap.point;
        if (
          typeof event.clientX === 'number' &&
          isFinite(event.clientX) &&
          typeof event.clientY === 'number' &&
          isFinite(event.clientY)
        ) {
          point = this.pointerWorld(event);
        }
        this.pointerPosition = point;
        this.applyToolAt(point, this.snap(point));
      }
      this.deferredTap = null;
      this.finishDrag();
    },

    handlePointerMove: function (event) {
      if (this.activePointerId !== null && event.pointerId !== this.activePointerId) return;
      if (this.gestures && this.gestures.active) return;
      var point = this.pointerWorld(event);
      this.pointerPosition = point;

      if (this.drag && this.isPointerDown) {
        if (this.drag.kind === 'pan') {
          var dx = event.clientX - this.lastPointer.x;
          var dy = event.clientY - this.lastPointer.y;
          this.camera.panByScreenDelta(dx, dy);
          this.lastPointer = { x: event.clientX, y: event.clientY };
          this.render();
          return;
        }

        var delta = {
          x: point.x - this.drag.startPoint.x,
          y: point.y - this.drag.startPoint.y,
        };
        if (Math.abs(delta.x) + Math.abs(delta.y) > 0.02) {
          this.drag.moved = true;
          this.restoreSnapshot(this.drag.original);
          var builder = this.builder;
          if (this.drag.kind === 'joint') {
            var joint = builder.findJoint(this.drag.id);
            if (joint) {
              var snapped = this.snap({ x: joint.x + delta.x, y: joint.y + delta.y });
              builder.moveJoint(this.drag.id, snapped);
            }
          } else if (this.drag.kind === 'bone') {
            var bone = builder.findBone(this.drag.id);
            if (bone) {
              var moveDelta = this.snapDelta(delta);
              builder.moveJoints([bone.startJointID, bone.endJointID], moveDelta);
            }
          } else if (this.drag.kind === 'decoration') {
            var decoration = builder.findDecoration(this.drag.id);
            var boneOfDecoration = decoration ? builder.findBone(decoration.boneId) : null;
            if (decoration && boneOfDecoration) {
              var start = builder.findJoint(boneOfDecoration.startJointID);
              var end = builder.findJoint(boneOfDecoration.endJointID);
              var angle = Math.atan2(-(end.x - start.x), end.y - start.y);
              var cos = Math.cos(-angle);
              var sin = Math.sin(-angle);
              var rotation = decoration.rotation * Utils.Deg2Rad;
              var cosR = Math.cos(-rotation);
              var sinR = Math.sin(-rotation);
              var localX = delta.x * cos - delta.y * sin;
              var localY = -(delta.x * sin + delta.y * cos);
              decoration.offset.x += localX * cosR - localY * sinR;
              decoration.offset.y += -(localX * sinR + localY * cosR);
            }
          } else if (this.drag.kind === 'muscle') {
            // Muscles cannot be moved — ignore.
          }
          this.render();
        }
        return;
      }

      if (this.pending) {
        this.render();
      }
    },

    /* --- editing helpers --------------------------------------------- */
    hitTolerance: function () {
      return 0.35 * (this.camera.orthographicSize / 12);
    },

    snap: function (point) {
      if (!EVO.Settings.GridEnabled) return { x: point.x, y: point.y };
      var size = EVO.Settings.GridSize || 1;
      return { x: Math.round(point.x / size) * size, y: Math.round(point.y / size) * size };
    },

    snapDelta: function (delta) {
      if (!EVO.Settings.GridEnabled) return delta;
      var size = EVO.Settings.GridSize || 1;
      return {
        x: Math.round(delta.x / size) * size,
        y: Math.round(delta.y / size) * size,
      };
    },

    hitJoint: function (point) {
      var tolerance = this.hitTolerance() + EVO.Creature.JOINT_RADIUS;
      var best = null;
      var bestDistance = Infinity;
      for (var i = 0; i < this.builder.design.joints.length; i++) {
        var joint = this.builder.design.joints[i];
        var distance = Utils.distance(joint.x, joint.y, point.x, point.y);
        if (distance < tolerance && distance < bestDistance) {
          bestDistance = distance;
          best = joint;
        }
      }
      return best;
    },

    hitBone: function (point) {
      var hit = this.builder.hitTest(point, this.hitTolerance() + 0.4);
      if (!hit) return null;
      if (hit.type === 'bone') return this.builder.findBone(hit.id);
      if (hit.type === 'joint') {
        // Pick the first bone attached to the joint.
        var result = null;
        this.builder.forEachBoneOfJoint(hit.id, function (bone) {
          if (!result) result = bone;
        });
        return result;
      }
      if (hit.type === 'muscle') {
        var muscle = this.builder.findMuscle(hit.id);
        return muscle ? this.builder.findBone(muscle.startBoneID) : null;
      }
      return null;
    },

    completeBone: function (endJointId) {
      var self = this;
      var changed = false;
      this.changeAndRecord(function (builder) {
        if (!builder.currentBone) {
          builder.tryStartingBone(self.pending.startId);
        }
        builder.updateCurrentBoneEnd(endJointId);
        changed = builder.placeCurrentBone();
        return changed;
      });
      this.pending = null;
      if (!changed) {
        // Keep the tool responsive for retries.
        this.builder.cancelCurrentBone();
      }
      this.render();
    },

    completeMuscle: function (endBoneId) {
      var self = this;
      var changed = false;
      this.changeAndRecord(function (builder) {
        if (!builder.currentMuscle) {
          builder.tryStartingMuscle(self.pending.startId);
        }
        builder.updateCurrentMuscleEnd(endBoneId);
        changed = builder.placeCurrentMuscle();
        return changed;
      });
      this.pending = null;
      if (!changed) this.builder.cancelCurrentMuscle();
      this.render();
    },

    deleteSelection: function () {
      var self = this;
      if (!this.selection) return;
      this.changeAndRecord(function (builder) {
        builder.deleteComponent(self.selection.type, self.selection.id);
      });
      this.selection = null;
      this.refreshSettings();
      this.render();
    },

    /** Runs a structural modification and stores it in the undo history. */
    changeAndRecord: function (modification) {
      var result = modification(this.builder);
      if (result === false) {
        return false;
      }
      this.record();
      this.render();
      this.refreshSettings();
      return true;
    },

    /** Runs a property change (no history entry, no panel rebuild). */
    applyProperty: function (modification) {
      var result = modification(this.builder);
      if (result === false) return false;
      this.render();
      App.setDesign(this.builder.design);
      return true;
    },

    snapshot: function () {
      return EVO.CreatureDesign.encode(this.builder.design);
    },

    restoreSnapshot: function (snapshot) {
      this.builder.design = EVO.CreatureDesign.decode(snapshot);
    },

    record: function () {
      this.history.push(this.builder.design);
      App.setDesign(this.builder.design);
    },

    undo: function () {
      var design = this.history.undo();
      if (design) {
        this.builder.design = design;
        this.selection = null;
        this.render();
        this.refreshSettings();
        App.setDesign(design);
      }
    },

    redo: function () {
      var design = this.history.redo();
      if (design) {
        this.builder.design = design;
        this.selection = null;
        this.render();
        this.refreshSettings();
        App.setDesign(design);
      }
    },

    save: function () {
      var design = this.builder.design;
      if (!design.joints.length) {
        Modal.alert('Place at least one joint before saving.');
        return;
      }
      design.name = design.name || 'Unnamed';
      this.designId = Storage.saveDesign(design, this.designId);
      App.setDesign(design);
      Modal.alert('"' + design.name + '" was saved.', 'Saved');
    },

    exportDesign: function () {
      var json = JSON.stringify(EVO.CreatureDesign.encode(this.builder.design), null, 2);
      var blob = new Blob([json], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = (this.builder.design.name || 'creature') + '.json';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    },

    showImport: function () {
      var self = this;
      var textarea = UI.el('textarea', 'import-textarea');
      textarea.placeholder = 'Paste a creature design (JSON) here';
      var content = UI.el('div', 'import-content');
      content.appendChild(textarea);
      Modal.open({
        title: 'Import a creature',
        content: content,
        actions: [
          { label: 'Cancel' },
          {
            label: 'Import',
            primary: true,
            close: false,
            onClick: function () {
              try {
                var design = EVO.CreatureDesign.decode(JSON.parse(textarea.value));
                if (!design.joints.length) throw new Error('The design contains no joints.');
                self.builder = new EVO.CreatureBuilder(design);
                self.history.reset();
                self.history.push(self.builder.design);
                self.selection = null;
                self.pending = null;
                Modal.close();
                self.frameDesign();
                self.refreshSettings();
                self.render();
              } catch (error) {
                Modal.alert('Could not read that design: ' + error.message, 'Import failed');
              }
            },
          },
        ],
      });
    },

    showSamples: function () {
      var self = this;
      var content = UI.el('div', 'sample-list');
      EVO.DefaultCreatures.forEach(function (sample) {
        var button = UI.el('button', 'sample-option');
        button.appendChild(UI.el('span', 'sample-name', sample.name));
        button.appendChild(
          UI.el(
            'span',
            'sample-details',
            sample.design.joints.length +
              ' joints · ' +
              sample.design.bones.length +
              ' bones · ' +
              sample.design.muscles.length +
              ' muscles'
          )
        );
        button.addEventListener('click', function () {
          Modal.close();
          self.changeAndRecord(function () {
            self.builder = new EVO.CreatureBuilder(EVO.CreatureDesign.clone(sample.design));
            return true;
          });
          self.selection = null;
          self.frameDesign();
          self.refreshSettings();
          self.render();
        });
        content.appendChild(button);
      });

      var saved = Storage.getDesigns();
      if (saved.length) {
        content.appendChild(UI.el('div', 'sample-section-title', 'Your creatures'));
        saved.forEach(function (entry) {
          var button = UI.el('button', 'sample-option');
          button.appendChild(UI.el('span', 'sample-name', entry.name));
          button.addEventListener('click', function () {
            Modal.close();
            self.builder = new EVO.CreatureBuilder(EVO.CreatureDesign.clone(entry.design));
            self.designId = entry.id;
            self.history.reset();
            self.history.push(self.builder.design);
            self.selection = null;
            self.frameDesign();
            self.refreshSettings();
            self.render();
          });
          content.appendChild(button);
        });
      }

      Modal.open({ title: 'Load a creature', content: content, actions: [{ label: 'Cancel' }] });
    },

    /* --- settings panel ---------------------------------------------- */
    refreshSettings: function () {
      var self = this;
      var container = this.settingsPanel;
      UI.clear(container);

      var design = this.builder.design;
      var info = Widgets.panel(this.selection ? this.selectionTitle() : 'Creature');
      info.add(
        UI.el(
          'div',
          'design-stats',
          design.joints.length +
            ' joints · ' +
            design.bones.length +
            ' bones · ' +
            design.muscles.length +
            ' muscles · ' +
            design.decorations.length +
            ' decorations'
        )
      );
      container.appendChild(info);

      if (!this.selection) {
        var defaults = Widgets.panel('Properties');
        defaults.add(UI.el('p', 'panel-note', this.toolHint()));
        container.appendChild(defaults);

        var grid = Widgets.panel('Grid');
        grid.add(
          Widgets.toggle({
            label: 'Snap to grid',
            value: EVO.Settings.GridEnabled,
            onChange: function (value) {
              EVO.Settings.GridEnabled = value;
              self.refreshSettings();
              self.render();
            },
          }).element
        );
        if (EVO.Settings.GridEnabled) {
          grid.add(
            Widgets.slider({
              label: 'Grid size',
              min: 1,
              max: 3,
              step: 0.5,
              value: EVO.Settings.GridSize,
              format: function (v) {
                return v.toFixed(1);
              },
              onInput: function (value) {
                EVO.Settings.GridSize = value;
                self.render();
              },
            }).element
          );
        }
        grid.add(
          UI.el(
            'p',
            'panel-note',
            'The grid thickness and the snap size are stored in your settings.'
          )
        );
        container.appendChild(grid);
        return;
      }

      var panel = Widgets.panel(this.selectionTitle());

      if (this.selection.type === 'joint') {
        var joint = this.builder.findJoint(this.selection.id);
        if (joint) {
          panel.add(
            Widgets.slider({
              label: 'Weight',
              min: 0.2,
              max: 5,
              step: 0.05,
              value: joint.weight,
              format: function (v) {
                return v.toFixed(1) + 'x';
              },
              onInput: function (value) {
                self.applyProperty(function (builder) {
                  return builder.setJointWeight(joint.id, value);
                });
              },
            }).element
          );
          panel.add(
            Widgets.slider({
              label: 'Fitness penalty',
              min: 0,
              max: 0.5,
              step: 0.05,
              value: joint.fitnessPenaltyForTouchingGround,
              format: function (v) {
                return Math.round(v * 100) + '%';
              },
              onInput: function (value) {
                self.applyProperty(function (builder) {
                  return builder.setJointPenalty(joint.id, value);
                });
              },
            }).element
          );
        }
      } else if (this.selection.type === 'bone') {
        var bone = this.builder.findBone(this.selection.id);
        if (bone) {
          panel.add(
            Widgets.slider({
              label: 'Weight',
              min: 0.5,
              max: 5,
              step: 0.05,
              value: bone.weight,
              format: function (v) {
                return v.toFixed(1) + 'x';
              },
              onInput: function (value) {
                self.applyProperty(function (builder) {
                  return builder.setBoneWeight(bone.id, value);
                });
              },
            }).element
          );
          panel.add(
            Widgets.toggle({
              label: 'Wing',
              value: bone.isWing,
              onChange: function (value) {
                self.applyProperty(function (builder) {
                  return builder.setBoneIsWing(bone.id, value);
                });
              },
            }).element
          );
          if (bone.isWing) {
            panel.add(
              Widgets.toggle({
                label: 'Invert',
                value: bone.inverted,
                onChange: function (value) {
                  self.applyProperty(function (builder) {
                    return builder.setBoneInverted(bone.id, value);
                  });
                },
              }).element
            );
          }
        }
      } else if (this.selection.type === 'muscle') {
        var muscle = this.builder.findMuscle(this.selection.id);
        if (muscle) {
          panel.add(
            Widgets.slider({
              label: 'Strength',
              min: 0,
              max: 4500,
              step: 10,
              value: muscle.strength,
              format: function (v) {
                return (v / 1500).toFixed(1) + 'x';
              },
              onInput: function (value) {
                self.applyProperty(function (builder) {
                  return builder.setMuscleStrength(muscle.id, value);
                });
              },
            }).element
          );
          panel.add(
            Widgets.toggle({
              label: 'Can expand',
              value: muscle.canExpand,
              onChange: function (value) {
                self.applyProperty(function (builder) {
                  return builder.setMuscleCanExpand(muscle.id, value);
                });
              },
            }).element
          );
          panel.add(
            Widgets.textInput({
              label: 'Id',
              value: muscle.userId,
              placeholder: 'shared id',
              maxLength: 1000,
              onChange: function (value) {
                self.applyProperty(function (builder) {
                  return builder.setMuscleUserId(muscle.id, value);
                });
              },
            }).element
          );
          panel.add(
            UI.el(
              'p',
              'panel-note',
              'Muscles with the same id are contracted and expanded together by a single network output.'
            )
          );
        }
      } else if (this.selection.type === 'decoration') {
        var decoration = this.builder.findDecoration(this.selection.id);
        if (decoration) {
          panel.add(UI.el('div', 'design-stats', EVO.DecorationData.nameForType(decoration.decorationType)));
          panel.add(
            Widgets.slider({
              label: 'Scale',
              min: 0.2,
              max: 4,
              step: 0.05,
              value: decoration.scale,
              format: function (v) {
                return v.toFixed(2) + 'x';
              },
              onInput: function (value) {
                self.applyProperty(function (builder) {
                  return builder.setDecorationScale(decoration.id, value);
                });
              },
            }).element
          );
          panel.add(
            Widgets.slider({
              label: 'Rotation',
              min: -180,
              max: 180,
              step: 1,
              value: decoration.rotation,
              format: function (v) {
                return Math.round(v) + '°';
              },
              onInput: function (value) {
                self.applyProperty(function (builder) {
                  return builder.setDecorationRotation(decoration.id, value);
                });
              },
            }).element
          );
          panel.add(
            Widgets.toggle({
              label: 'Flip horizontally',
              value: decoration.flipX,
              onChange: function (value) {
                self.applyProperty(function (builder) {
                  return builder.setDecorationFlip(decoration.id, value, decoration.flipY);
                });
              },
            }).element
          );
          panel.add(
            Widgets.toggle({
              label: 'Flip vertically',
              value: decoration.flipY,
              onChange: function (value) {
                self.applyProperty(function (builder) {
                  return builder.setDecorationFlip(decoration.id, decoration.flipX, value);
                });
              },
            }).element
          );
          panel.add(
            Widgets.buttonRow([
              {
                label: 'Bring forward',
                onClick: function () {
                  self.applyProperty(function (builder) {
                    return builder.changeDecorationOrder(decoration.id, 1);
                  });
                },
              },
              {
                label: 'Send backward',
                onClick: function () {
                  self.applyProperty(function (builder) {
                    return builder.changeDecorationOrder(decoration.id, -1);
                  });
                },
              },
            ], 'compact')
          );
        }
      }

      var actions = Widgets.buttonRow([
        { label: 'Duplicate', onClick: function () { self.duplicateSelection(); } },
        { label: 'Delete', className: 'danger', onClick: function () { self.deleteSelection(); } },
      ], 'compact');
      panel.add(actions);

      container.appendChild(panel);
    },

    duplicateSelection: function () {
      var self = this;
      if (!this.selection) return;
      var selection = this.selection;
      this.changeAndRecord(function (builder) {
        if (selection.type === 'joint') {
          var joint = builder.findJoint(selection.id);
          if (joint) {
            var newJoint = builder.tryPlacingJoint({ x: joint.x + 1, y: joint.y + 1 });
            return newJoint;
          }
          return false;
        }
        if (selection.type === 'decoration') {
          var decoration = builder.findDecoration(selection.id);
          if (decoration) {
            var copy = builder.createDecorationFromBone(
              decoration.boneId,
              { x: decoration.offset.x + 0.5, y: decoration.offset.y },
              decoration.decorationType
            );
            if (copy) {
              builder.setDecorationScale(copy.id, decoration.scale);
              builder.setDecorationRotation(copy.id, decoration.rotation);
              self.selection = { type: 'decoration', id: copy.id };
              return true;
            }
          }
        }
        return false;
      });
    },

    selectionTitle: function () {
      if (!this.selection) return 'Properties';
      var names = { joint: 'Joint Settings', bone: 'Bone Settings', muscle: 'Muscle Settings', decoration: 'Decoration' };
      return names[this.selection.type] || 'Properties';
    },

    toolHint: function () {
      var hint;
      switch (this.tool) {
        case Tools.JOINT:
          hint = 'Tap to place a joint. Joints cannot be placed too close to each other.';
          break;
        case Tools.BONE:
          hint = 'Tap one joint and then another to connect them with a bone (or drag from one to the other).';
          break;
        case Tools.MUSCLE:
          hint = 'Tap one bone and then another to connect them with a muscle.';
          break;
        case Tools.DECORATION:
          hint = 'Tap a bone to attach the selected decoration to it.';
          break;
        case Tools.ERASE:
          hint = 'Tap a joint, bone, muscle or decoration to delete it.';
          break;
        default:
          hint = 'Select a component to edit its properties. Drag joints and bones to move them, drag empty space to pan.';
      }
      if (Utils.hasTouchScreen && Utils.hasTouchScreen()) {
        hint += ' Two fingers pan and zoom the view.';
      }
      return hint;
    },

    /* --- rendering ---------------------------------------------------- */
    buildRenderModel: function () {
      var design = this.builder.design;
      var jointById = {};
      var joints = design.joints.map(function (data) {
        var joint = {
          data: data,
          body: { x: data.x, y: data.y },
        };
        jointById[data.id] = joint;
        return joint;
      });

      var boneById = {};
      var bones = design.bones.map(function (data) {
        var bone = {
          data: data,
          startJoint: jointById[data.startJointID],
          endJoint: jointById[data.endJointID],
          center: { x: 0, y: 0 },
          angle: 0,
        };
        if (bone.startJoint && bone.endJoint) {
          bone.center.x = (bone.startJoint.body.x + bone.endJoint.body.x) / 2;
          bone.center.y = (bone.startJoint.body.y + bone.endJoint.body.y) / 2;
          bone.angle = Math.atan2(
            -(bone.endJoint.body.x - bone.startJoint.body.x),
            bone.endJoint.body.y - bone.startJoint.body.y
          );
        }
        boneById[data.id] = bone;
        return bone;
      });

      var muscles = design.muscles.map(function (data) {
        return {
          data: data,
          startBone: boneById[data.startBoneID],
          endBone: boneById[data.endBoneID],
          muscleAction: EVO.Creature.MuscleAction.CONTRACT,
          currentForce: 0,
        };
      });

      var decorations = design.decorations.map(function (data) {
        return {
          data: data,
          bone: boneById[data.boneId],
          offset: data.offset,
          scale: data.scale,
          rotation: data.rotation,
          flipX: data.flipX,
          flipY: data.flipY,
          decorationType: data.decorationType,
        };
      });

      return { joints: joints, bones: bones, muscles: muscles, decorations: decorations };
    },

    render: function () {
      var ctx = this.canvas.getContext('2d');
      if (!ctx) return;
      var ratio = this.pixelRatio || 1;
      ctx.save();
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

      Renderer.drawBackground(ctx, this.camera);

      // The editor always shows a subtle grid so that placing joints is easy.
      Renderer.drawGrid(
        ctx,
        this.camera,
        EVO.Settings.GridEnabled ? 1 : 0.45,
        EVO.Settings.GridSize || 1
      );

      // Ground line at y = 0
      var groundY = this.camera.worldToScreenY(0);
      if (groundY > 0 && groundY < this.camera.height) {
        ctx.save();
        ctx.strokeStyle = '#d0d0d0';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, groundY);
        ctx.lineTo(this.camera.width, groundY);
        ctx.stroke();
        ctx.restore();
      }

      var model = this.buildRenderModel();
      var selectedJoints = {};
      var selectedBones = {};
      if (this.selection) {
        if (this.selection.type === 'joint') selectedJoints[this.selection.id] = true;
        if (this.selection.type === 'bone') selectedBones[this.selection.id] = true;
      }

      Renderer.drawCreature(ctx, model, this.camera, {
        opacity: 1,
        showMuscles: true,
        showContraction: false,
        selectedJoints: selectedJoints,
        selectedBones: selectedBones,
      });

      // Highlight the selected muscle / decoration
      if (this.selection && this.selection.type === 'muscle') {
        var muscle = this.builder.findMuscle(this.selection.id);
        if (muscle) {
          var start = this.builder.getBoneCenter(this.builder.findBone(muscle.startBoneID));
          var end = this.builder.getBoneCenter(this.builder.findBone(muscle.endBoneID));
          ctx.save();
          ctx.strokeStyle = Renderer.COLORS.selection;
          ctx.lineWidth = 4;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(this.camera.worldToScreenX(start.x), this.camera.worldToScreenY(start.y));
          ctx.lineTo(this.camera.worldToScreenX(end.x), this.camera.worldToScreenY(end.y));
          ctx.stroke();
          ctx.restore();
        }
      }
      if (this.selection && this.selection.type === 'decoration') {
        var decoration = this.builder.findDecoration(this.selection.id);
        var bone = decoration ? this.builder.findBone(decoration.boneId) : null;
        if (bone) {
          // compute the world position of the decoration
          var renderEntry = null;
          for (var i = 0; i < model.decorations.length; i++) {
            if (model.decorations[i].data.id === decoration.id) {
              renderEntry = model.decorations[i];
            }
          }
          if (renderEntry) {
            var start2 = this.builder.findJoint(bone.startJointID);
            var end2 = this.builder.findJoint(bone.endJointID);
            var center = this.builder.getBoneCenter(bone);
            var angle = Math.atan2(-(end2.x - start2.x), end2.y - start2.y) + decoration.rotation * Utils.Deg2Rad;
            var px = center.x + decoration.offset.x * Math.cos(angle) + decoration.offset.y * Math.sin(angle);
            var py = center.y + decoration.offset.x * Math.sin(angle) - decoration.offset.y * Math.cos(angle);
            ctx.save();
            ctx.strokeStyle = Renderer.COLORS.selection;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(
              this.camera.worldToScreenX(px),
              this.camera.worldToScreenY(py),
              Math.max(10, 0.9 * this.camera.pixelsPerUnit()),
              0,
              Math.PI * 2
            );
            ctx.stroke();
            ctx.restore();
          }
        }
      }

      // Preview of the pending bone/muscle
      if (this.pending) {
        var startPoint = null;
        if (this.pending.kind === 'bone') {
          var joint = this.builder.findJoint(this.pending.startId);
          if (joint) startPoint = { x: joint.x, y: joint.y };
        } else {
          var boneStart = this.builder.findBone(this.pending.startId);
          if (boneStart) startPoint = this.builder.getBoneCenter(boneStart);
        }
        if (startPoint) {
          ctx.save();
          ctx.strokeStyle = Renderer.COLORS.selection;
          ctx.setLineDash([8, 6]);
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(
            this.camera.worldToScreenX(startPoint.x),
            this.camera.worldToScreenY(startPoint.y)
          );
          ctx.lineTo(
            this.camera.worldToScreenX(this.pointerPosition.x),
            this.camera.worldToScreenY(this.pointerPosition.y)
          );
          ctx.stroke();
          ctx.restore();
        }
      }

      ctx.restore();

      // Hint text
      this.hint.textContent = this.toolHint();
    },
  };

  EVO.EditorScreen = EditorScreen;
  EVO.EditorTools = Tools;
  EVO.Screens.editor = EditorScreen;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = EVO;
  }
})(typeof window !== 'undefined' ? window : globalThis);
