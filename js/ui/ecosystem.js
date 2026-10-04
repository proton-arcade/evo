/*
 * Evolution (Web Edition) — ui/ecosystem.js
 * ---------------------------------------------------------------
 * Creature selection and the shared-world ecosystem screen.
 */
(function (global) {
  'use strict';

  var EVO = (global.EVO = global.EVO || {});
  var UI = EVO.UI;
  var Widgets = EVO.Widgets;
  var App = EVO.App;
  var Storage = EVO.Storage;
  var Utils = EVO.Utils;
  var Renderer = EVO.Renderer;
  var Settings = EVO.Settings;
  var MAX_ECOSYSTEM_CREATURES = 6;

  function topBar(title, onBack) {
    var bar = UI.el('div', 'top-bar ecosystem-top-bar');
    var back = UI.el('button', 'back-button');
    back.appendChild(UI.el('span', 'back-arrow', '\u2190'));
    back.appendChild(UI.el('span', null, 'Back'));
    back.addEventListener('click', onBack);
    bar.appendChild(back);
    bar.appendChild(UI.el('div', 'top-bar-title', title));
    bar.appendChild(UI.el('div', 'top-bar-right'));
    return bar;
  }

  function savedEntries() {
    var entries = Storage.getDesigns().map(function (entry) {
      return {
        id: 'saved:' + entry.id,
        name: entry.name || 'Unnamed',
        design: entry.design,
        evolvedCreature: entry.evolvedCreature || null,
        source: 'Your library',
      };
    });
    EVO.DefaultCreatures.forEach(function (sample, index) {
      entries.push({
        id: 'sample:' + index,
        name: sample.name,
        design: sample.design,
        evolvedCreature: null,
        source: 'Sample creature',
      });
    });
    return entries;
  }

  var EcosystemScreen = {
    show: function () {
      this.availableEntries = savedEntries();
      this.selectedIds = [];
      this.objective = EVO.Objective.Running;
      this.duration = 30;
      this.speed = 1;
      this.manualCamera = false;
      this.buildSetup();
    },

    hide: function () {
      if (this.animationFrame) {
        global.cancelAnimationFrame(this.animationFrame);
        this.animationFrame = null;
      }
      this.detachRunEvents();
      if (this.simulation) this.simulation.stop();
      this.simulation = null;
      this.canvas = null;
      this.canvasContainer = null;
      this.camera = null;
      this.availableEntries = [];
      this.selectedEntries = [];
      this.selectionList = null;
    },

    buildSetup: function () {
      var self = this;
      var element = this.element;
      UI.clear(element);
      element.appendChild(topBar('Ecosystem', function () { App.show('home'); }));

      var content = UI.el('main', 'ecosystem-setup-content');
      content.appendChild(UI.el('h1', 'ecosystem-heading', 'Build an ecosystem'));
      content.appendChild(
        UI.el(
          'p',
          'ecosystem-intro',
          'Choose two to six creatures to share one world. Evolved library creatures keep their saved brain; other designs get a fresh exploratory brain for this run.'
        )
      );

      var controls = UI.el('div', 'ecosystem-setup-controls');
      var objectiveRow = UI.el('label', 'ecosystem-field');
      objectiveRow.appendChild(UI.el('span', 'widget-label', 'Shared environment'));
      var objectiveSelect = UI.el('select', 'dropdown ecosystem-objective');
      EVO.ObjectiveUtil.ALL_OBJECTIVES.forEach(function (objective) {
        var option = UI.el('option', null, EVO.ObjectiveUtil.stringRepresentation(objective));
        option.value = String(objective);
        objectiveSelect.appendChild(option);
      });
      objectiveSelect.value = String(this.objective);
      objectiveSelect.addEventListener('change', function () {
        self.objective = parseInt(objectiveSelect.value, 10);
      });
      objectiveRow.appendChild(objectiveSelect);
      controls.appendChild(objectiveRow);

      var durationWidget = Widgets.slider({
        label: 'Run length',
        min: 10,
        max: 60,
        step: 10,
        value: this.duration,
        format: function (value) { return value + ' seconds'; },
        onInput: function (value) { self.duration = value; },
      });
      controls.appendChild(durationWidget.element);
      content.appendChild(controls);

      var selectionHeading = UI.el('div', 'ecosystem-selection-heading');
      selectionHeading.appendChild(UI.el('h2', null, 'Choose residents'));
      this.selectionCount = UI.el('span', 'ecosystem-selection-count', '0 / ' + MAX_ECOSYSTEM_CREATURES + ' selected');
      selectionHeading.appendChild(this.selectionCount);
      content.appendChild(selectionHeading);

      this.selectionList = UI.el('div', 'ecosystem-creature-grid');
      this.availableEntries.forEach(function (entry) {
        self.selectionList.appendChild(self.createChoice(entry));
      });
      content.appendChild(this.selectionList);

      this.setupMessage = UI.el(
        'p',
        'ecosystem-selection-note',
        'Tip: save an evolved creature from Simulate to bring its learned movement into the ecosystem.'
      );
      content.appendChild(this.setupMessage);

      this.startButton = UI.el('button', 'evo-button primary ecosystem-start-button', 'Start ecosystem');
      this.startButton.disabled = true;
      this.startButton.addEventListener('click', function () {
        self.startEcosystem();
      });
      content.appendChild(this.startButton);
      element.appendChild(content);
      this.refreshChoices();
    },

    createChoice: function (entry) {
      var self = this;
      var card = UI.el('label', 'ecosystem-creature-card');
      var checkbox = UI.el('input', 'ecosystem-checkbox');
      checkbox.type = 'checkbox';
      checkbox.value = entry.id;
      checkbox.addEventListener('change', function () {
        var index = self.selectedIds.indexOf(entry.id);
        if (checkbox.checked && index === -1) self.selectedIds.push(entry.id);
        if (!checkbox.checked && index !== -1) self.selectedIds.splice(index, 1);
        self.refreshChoices();
      });
      card.appendChild(checkbox);

      var description = UI.el('span', 'ecosystem-card-content');
      description.appendChild(UI.el('span', 'ecosystem-card-name', entry.name));
      var subtitle = entry.source + ' · ' + entry.design.joints.length + ' joints';
      if (entry.evolvedCreature) {
        subtitle +=
          ' · evolved ' +
          EVO.ObjectiveUtil.stringRepresentation(entry.evolvedCreature.task).toLowerCase() +
          ' · gen ' +
          entry.evolvedCreature.generation;
      }
      description.appendChild(UI.el('span', 'ecosystem-card-subtitle', subtitle));
      card.appendChild(description);
      return card;
    },

    refreshChoices: function () {
      var self = this;
      var count = this.selectedIds.length;
      this.selectionCount.textContent = count + ' / ' + MAX_ECOSYSTEM_CREATURES + ' selected';
      this.startButton.disabled = count < 2 || count > MAX_ECOSYSTEM_CREATURES;
      var cards = this.selectionList.querySelectorAll('.ecosystem-creature-card');
      Array.prototype.forEach.call(cards, function (card) {
        var checkbox = card.querySelector('input');
        var selected = self.selectedIds.indexOf(checkbox.value) !== -1;
        checkbox.checked = selected;
        checkbox.disabled = count >= MAX_ECOSYSTEM_CREATURES && !selected;
        card.classList.toggle('selected', selected);
      });
      if (count < 2) {
        this.setupMessage.textContent = 'Select at least two creatures. Evolved library creatures keep their saved brain.';
      } else if (count >= MAX_ECOSYSTEM_CREATURES) {
        this.setupMessage.textContent = 'Six residents selected — uncheck one to make room for another.';
      } else {
        this.setupMessage.textContent = 'Evolved library creatures keep their saved brain; other designs get a fresh exploratory brain for this run.';
      }
    },

    startEcosystem: function () {
      var self = this;
      this.selectedEntries = this.availableEntries.filter(function (entry) {
        return self.selectedIds.indexOf(entry.id) !== -1;
      });
      if (this.selectedEntries.length < 2 || this.selectedEntries.length > MAX_ECOSYSTEM_CREATURES) return;

      this.simulation = new EVO.EcosystemSimulation();
      try {
        this.simulation.start(this.selectedEntries, this.objective, null, this.duration);
      } catch (error) {
        this.simulation.stop();
        this.simulation = null;
        this.setupMessage.textContent = error.message;
        return;
      }
      this.manualCamera = false;
      this.speed = 1;
      this.buildRun();
      this.resize();
      this.attachRunEvents();
      this.loop();
    },

    buildRun: function () {
      var self = this;
      var element = this.element;
      UI.clear(element);
      this.canvasContainer = UI.el('div', 'ecosystem-canvas-container');
      this.canvas = UI.el('canvas', 'ecosystem-canvas');
      this.canvasContainer.appendChild(this.canvas);
      element.appendChild(this.canvasContainer);

      var topLeft = UI.el('div', 'ecosystem-run-info');
      topLeft.appendChild(UI.el('div', 'ecosystem-run-title', 'ECOSYSTEM'));
      this.objectiveLabel = UI.el('div', 'ecosystem-run-objective', EVO.ObjectiveUtil.stringRepresentation(this.objective));
      topLeft.appendChild(this.objectiveLabel);
      this.residentLabel = UI.el(
        'div',
        'ecosystem-run-residents',
        this.selectedEntries.map(function (entry) { return entry.name; }).join(' · ')
      );
      topLeft.appendChild(this.residentLabel);
      element.appendChild(topLeft);

      var actions = UI.el('div', 'ecosystem-run-actions');
      this.pauseButton = UI.el('button', 'evo-button small', 'Pause');
      this.pauseButton.type = 'button';
      this.pauseButton.setAttribute('aria-label', 'Pause ecosystem simulation');
      this.pauseButton.addEventListener('click', function () {
        if (self.simulation.complete) {
          self.simulation.start(self.selectedEntries, self.objective, null, self.duration);
          self.manualCamera = false;
          self.cameraNeedsFit = true;
          self.fitCamera();
          self.pauseButton.textContent = 'Pause';
          self.pauseButton.setAttribute('aria-label', 'Pause ecosystem simulation');
          return;
        }
        var paused = self.simulation.togglePaused();
        self.pauseButton.textContent = paused ? 'Resume' : 'Pause';
        self.pauseButton.setAttribute('aria-label', paused ? 'Resume ecosystem simulation' : 'Pause ecosystem simulation');
      });
      actions.appendChild(this.pauseButton);

      var fitButton = UI.el('button', 'evo-button small', 'Fit');
      fitButton.addEventListener('click', function () {
        self.manualCamera = false;
        self.fitCamera();
      });
      actions.appendChild(fitButton);

      var chooseButton = UI.el('button', 'evo-button small', 'Residents');
      chooseButton.addEventListener('click', function () {
        if (self.simulation) self.simulation.stop();
        self.simulation = null;
        if (self.animationFrame) global.cancelAnimationFrame(self.animationFrame);
        self.animationFrame = null;
        self.detachRunEvents();
        self.buildSetup();
      });
      actions.appendChild(chooseButton);

      var exitButton = UI.el('button', 'evo-button small', 'Exit');
      exitButton.addEventListener('click', function () { App.show('home'); });
      actions.appendChild(exitButton);
      element.appendChild(actions);

      var status = UI.el('div', 'ecosystem-run-status');
      this.elapsedLabel = UI.el('span', 'ecosystem-elapsed', '0.0s');
      status.appendChild(this.elapsedLabel);
      status.appendChild(UI.el('span', 'ecosystem-status-divider', '·'));
      this.pausedLabel = UI.el('span', 'ecosystem-status-label', 'RUNNING');
      status.appendChild(this.pausedLabel);

      var speedLabel = UI.el('span', 'ecosystem-speed-caption', 'SPEED');
      status.appendChild(speedLabel);
      this.speedSlider = UI.el('input', 'hud-slider ecosystem-speed');
      this.speedSlider.type = 'range';
      this.speedSlider.min = '0.25';
      this.speedSlider.max = '3';
      this.speedSlider.step = '0.25';
      this.speedSlider.value = '1';
      this.speedSlider.addEventListener('input', function () {
        self.speed = parseFloat(self.speedSlider.value);
      });
      status.appendChild(this.speedSlider);
      this.speedValue = UI.el('span', 'ecosystem-speed-value', '1.00x');
      status.appendChild(this.speedValue);
      element.appendChild(status);

      this.camera = new EVO.Camera({ orthographicSize: 18 });
      this.cameraNeedsFit = true;
    },

    resize: function () {
      if (!this.canvas || !this.canvasContainer || !this.camera) return;
      var width = this.canvasContainer.clientWidth || global.innerWidth || 800;
      var height = this.canvasContainer.clientHeight || global.innerHeight || 600;
      var ratio = Utils.displayPixelRatio ? Utils.displayPixelRatio() : Math.min(global.devicePixelRatio || 1, 2);
      this.canvas.width = Math.floor(width * ratio);
      this.canvas.height = Math.floor(height * ratio);
      this.canvas.style.width = width + 'px';
      this.canvas.style.height = height + 'px';
      this.pixelRatio = ratio;
      this.camera.resize(width, height);
      if (this.cameraNeedsFit) this.fitCamera();
    },

    fitCamera: function () {
      if (!this.camera || !this.simulation || !this.simulation.creatures.length) return;
      var minX = Infinity;
      var maxX = -Infinity;
      var minY = Infinity;
      var maxY = -Infinity;
      this.simulation.creatures.forEach(function (creature) {
        creature.joints.forEach(function (joint) {
          minX = Math.min(minX, joint.body.x);
          maxX = Math.max(maxX, joint.body.x);
          minY = Math.min(minY, joint.body.y);
          maxY = Math.max(maxY, joint.body.y);
        });
      });
      if (!isFinite(minX)) return;
      var aspect = this.camera.width / Math.max(1, this.camera.height);
      this.camera.x = (minX + maxX) / 2;
      this.camera.y = (minY + maxY) / 2;
      this.camera.orthographicSize = Utils.clamp(
        Math.max(8, (maxY - minY + 4) / 2, (maxX - minX + 6) / (2 * Math.max(0.4, aspect))),
        this.camera.minZoom,
        this.camera.maxZoom
      );
      this.cameraNeedsFit = false;
    },

    loop: function () {
      var self = this;
      var lastTime = global.performance && global.performance.now ? global.performance.now() : Date.now();
      var step = function (now) {
        var dt = Math.min(0.1, (now - lastTime) / 1000 || 0);
        lastTime = now;
        self.update(dt);
        self.draw();
        self.animationFrame = global.requestAnimationFrame(step);
      };
      this.animationFrame = global.requestAnimationFrame(step);
    },

    update: function (dt) {
      if (!this.simulation) return;
      this.simulation.update(dt, this.speed);
      this.elapsedLabel.textContent =
        this.simulation.elapsed.toFixed(1) + 's / ' + this.duration + 's';
      this.speedValue.textContent = this.speed.toFixed(2) + 'x';
      this.pausedLabel.textContent = this.simulation.complete
        ? 'COMPLETE'
        : this.simulation.paused
          ? 'PAUSED'
          : 'RUNNING';
      this.pauseButton.textContent = this.simulation.complete
        ? 'Restart'
        : this.simulation.paused
          ? 'Resume'
          : 'Pause';
      if (!this.manualCamera) this.followCreatures();
    },

    followCreatures: function () {
      var creatures = this.simulation.creatures;
      if (!creatures.length) return;
      var x = 0;
      var y = 0;
      for (var i = 0; i < creatures.length; i++) {
        x += creatures[i].getXPosition();
        y += creatures[i].getYPosition();
      }
      x /= creatures.length;
      y /= creatures.length;
      this.camera.x += (x - this.camera.x) * 0.035;
      this.camera.y += (y - this.camera.y) * 0.035;
    },

    draw: function () {
      if (!this.canvas || !this.camera || !this.simulation) return;
      var ctx = this.canvas.getContext('2d');
      if (!ctx) return;
      var ratio = this.pixelRatio || 1;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      Renderer.drawBackground(ctx, this.camera);
      var gridVisibility = this.objective === EVO.Objective.Flying
        ? Settings.FlyingGridVisibility
        : Settings.DefaultGridVisibility;
      Renderer.drawGrid(ctx, this.camera, gridVisibility, Settings.GridSize || 1);
      Renderer.drawScene(ctx, this.simulation.scene, this.camera);
      Renderer.drawDistanceMarkers(ctx, this.simulation.scene, this.camera);
      for (var i = 0; i < this.simulation.creatures.length; i++) {
        Renderer.drawCreature(ctx, this.simulation.creatures[i], this.camera, {
          showMuscles: Settings.ShowMuscles,
          showContraction: Settings.ShowMuscleContraction,
        });
      }
    },

    attachRunEvents: function () {
      var self = this;
      if (!this.canvas) return;
      this.gestures = Utils.addTouchGestures(this.canvas, {
        onGestureStart: function () { self.dragging = null; },
        onPinch: function (scale, x, y) { self.zoomAt(x, y, scale); },
        onPan: function (dx, dy) {
          self.manualCamera = true;
          self.camera.panByScreenDelta(dx, dy);
        },
        onGestureEnd: function () { self.dragging = null; },
      });
      this.onPointerDown = function (event) {
        if (event.pointerType === 'touch' || event.target !== self.canvas || (self.gestures && self.gestures.active)) return;
        self.manualCamera = true;
        self.dragging = { x: event.clientX, y: event.clientY, id: event.pointerId };
        try { self.canvas.setPointerCapture(event.pointerId); } catch (error) { /* Optional API. */ }
      };
      this.onPointerMove = function (event) {
        if (!self.dragging || event.pointerId !== self.dragging.id || (self.gestures && self.gestures.active)) return;
        var dx = event.clientX - self.dragging.x;
        var dy = event.clientY - self.dragging.y;
        self.dragging = { x: event.clientX, y: event.clientY, id: event.pointerId };
        self.camera.panByScreenDelta(dx, dy);
      };
      this.onPointerEnd = function (event) {
        if (self.dragging && (!event || event.pointerId === self.dragging.id)) self.dragging = null;
      };
      this.onWheel = function (event) {
        event.preventDefault();
        self.manualCamera = true;
        var rect = self.canvas.getBoundingClientRect();
        self.zoomAt(event.clientX - rect.left, event.clientY - rect.top, Math.exp(-event.deltaY * 0.001));
      };
      this.canvas.addEventListener('pointerdown', this.onPointerDown);
      global.addEventListener('pointermove', this.onPointerMove);
      global.addEventListener('pointerup', this.onPointerEnd);
      global.addEventListener('pointercancel', this.onPointerEnd);
      this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    },

    zoomAt: function (x, y, scale) {
      if (!this.camera) return;
      this.manualCamera = true;
      this.camera.zoomAt(x, y, 1 / scale);
    },

    detachRunEvents: function () {
      if (this.gestures) {
        this.gestures.detach();
        this.gestures = null;
      }
      if (this.canvas) {
        this.canvas.removeEventListener('pointerdown', this.onPointerDown);
        this.canvas.removeEventListener('wheel', this.onWheel);
      }
      if (this.onPointerMove) global.removeEventListener('pointermove', this.onPointerMove);
      if (this.onPointerEnd) {
        global.removeEventListener('pointerup', this.onPointerEnd);
        global.removeEventListener('pointercancel', this.onPointerEnd);
      }
      this.dragging = null;
      this.onPointerDown = null;
      this.onPointerMove = null;
      this.onPointerEnd = null;
      this.onWheel = null;
    },
  };

  EVO.EcosystemScreen = EcosystemScreen;
  EVO.Screens = EVO.Screens || {};
  EVO.Screens.ecosystem = EcosystemScreen;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = EVO;
  }
})(typeof window !== 'undefined' ? window : globalThis);
