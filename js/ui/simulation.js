/*
 * Evolution (Web Edition) — ui/simulation.js
 * ---------------------------------------------------------------
 * The simulation screen: runs the evolution, shows the creatures of the
 * current generation, plays back the best creature of every generation and
 * stores or loads simulation files.
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
  var Settings = EVO.Settings;

  function percent(value) {
    if (!isFinite(value)) return '0.00%';
    return (value * 100).toFixed(2) + '%';
  }

  function objectiveName(objective) {
    return EVO.ObjectiveUtil.stringRepresentation(objective);
  }

  var SimulationScreen = {
    /* ================================================================ *
     * Lifecycle
     * ================================================================ */
    show: function (params) {
      params = params || {};
      this.data = this.prepareData(params.data);
      this.settings = this.data.Settings;
      this.networkSettings = this.data.NetworkSettings;

      this.autoplay = params.autoplay === undefined ? true : !!params.autoplay;
      this.speed = 1;
      this.watchingIndex = 0;
      this.showAllCreatures = true;
      this.state = 'simulating';
      this.playback = null;
      this.playbackTime = 0;
      this.playbackPlaying = true;
      this.playbackDuration = 0;
      this.waitTimer = 0;
      this.ghost = null;
      this.ghostTime = 0;
      this.recording = null;
      this.awaitingPlayback = false;
      this.frameCount = 0;
      this.settingsVisible = false;
      this.autoSaveGeneration = 0;

      this.createCameras();
      this.buildLayout();
      this.resize();
      this.attachEvents();
      this.startSimulation();
      this.loop();
    },

    hide: function () {
      if (this.animationFrame) {
        cancelAnimationFrame(this.animationFrame);
        this.animationFrame = null;
      }
      this.detachEvents();
      if (this.evolution) {
        this.evolution.finish();
      }
      this.saveStateToSettings();
    },

    resize: function () {
      if (!this.canvas) return;
      var width = this.canvasContainer.clientWidth || 800;
      var height = this.canvasContainer.clientHeight || 600;
      var ratio = global.devicePixelRatio || 1;
      this.canvas.width = Math.floor(width * ratio);
      this.canvas.height = Math.floor(height * ratio);
      this.canvas.style.width = width + 'px';
      this.canvas.style.height = height + 'px';
      this.camera.resize(width, height);
      this.pixelRatio = ratio;
      var thumbSize = 150;
      this.thumbnailCanvas.width = Math.floor(thumbSize * ratio);
      this.thumbnailCanvas.height = Math.floor(thumbSize * ratio);
      this.thumbnailCanvas.style.width = thumbSize + 'px';
      this.thumbnailCanvas.style.height = thumbSize + 'px';
    },

    /* ================================================================ *
     * Data
     * ================================================================ */
    prepareData: function (data) {
      if (data) {
        return EVO.SimulationData.decode(EVO.SimulationData.encode(data));
      }
      var settings = EVO.SimulationSettings.decode(Settings.SimulationSettings);
      var networkSettings = EVO.NeuralNetworkSettings.decode(Settings.NetworkSettings);
      var design = EVO.CreatureDesign.clone(App.getDesign());
      if (!design.joints.length) {
        design = EVO.CreatureDesign.clone(EVO.DefaultCreatures[0].design);
      }
      return EVO.SimulationData.create(
        settings,
        networkSettings,
        design,
        EVO.DefaultSimulationScenes.defaultSceneForObjective(settings.Objective)
      );
    },

    saveStateToSettings: function () {
      Settings.SimulationSettings = EVO.SimulationSettings.encode(this.settings);
      Settings.NetworkSettings = EVO.NeuralNetworkSettings.encode(this.networkSettings);
      if (this.data) {
        Settings.LastCreatureDesign = JSON.stringify(EVO.CreatureDesign.encode(this.data.CreatureDesign));
      }
    },

    /* ================================================================ *
     * Layout
     * ================================================================ */
    buildLayout: function () {
      var self = this;
      var element = this.element;

      this.canvasContainer = UI.el('div', 'simulation-canvas-container');
      this.canvas = UI.el('canvas', 'simulation-canvas');
      this.canvasContainer.appendChild(this.canvas);
      element.appendChild(this.canvasContainer);

      this.buildHud(element);
      this.buildSettingsDrawer(element);

      // Hidden file input for loading simulation files.
      this.fileInput = UI.el('input');
      this.fileInput.type = 'file';
      this.fileInput.accept = '.json,application/json';
      this.fileInput.className = 'hidden';
      this.fileInput.addEventListener('change', function () {
        self.importFile(self.fileInput.files[0]);
        self.fileInput.value = '';
      });
      element.appendChild(this.fileInput);
    },

    buildHud: function (element) {
      var self = this;

      /* --- Top left: generation + fitness + settings --- */
      var topLeft = UI.el('div', 'hud hud-top-left');
      this.generationLabel = UI.el('div', 'hud-generation', 'GENERATION 1');
      topLeft.appendChild(this.generationLabel);
      this.taskLabel = UI.el('div', 'hud-task', objectiveName(this.settings.Objective));
      topLeft.appendChild(this.taskLabel);

      this.fitnessLabel = UI.el('div', 'hud-fitness', 'FITNESS: 0.00%');
      topLeft.appendChild(this.fitnessLabel);

      var phase = UI.el('div', 'hud-phase');
      this.phaseLabel = UI.el('span', 'hud-phase-label', 'SIMULATING');
      phase.appendChild(this.phaseLabel);
      this.timeLabel = UI.el('span', 'hud-phase-time', '0.0s / ' + this.settings.SimulationTime + 's');
      phase.appendChild(this.timeLabel);
      topLeft.appendChild(phase);

      var creatureRow = UI.el('div', 'hud-row');
      creatureRow.appendChild(UI.el('span', 'hud-row-label', 'CREATURE'));
      this.previousCreatureButton = UI.el('button', 'hud-button', '\u2039');
      this.previousCreatureButton.addEventListener('click', function () {
        self.watchingIndex = Math.max(0, self.watchingIndex - 1);
        self.resetCamera();
        self.refreshHud();
      });
      creatureRow.appendChild(this.previousCreatureButton);
      this.creatureLabel = UI.el('span', 'hud-row-value', '1/1');
      creatureRow.appendChild(this.creatureLabel);
      this.nextCreatureButton = UI.el('button', 'hud-button', '\u203A');
      this.nextCreatureButton.addEventListener('click', function () {
        var count = self.evolution ? self.evolution.currentCreatureBatch.length : 1;
        self.watchingIndex = Math.min(count - 1, self.watchingIndex + 1);
        self.resetCamera();
        self.refreshHud();
      });
      creatureRow.appendChild(this.nextCreatureButton);
      topLeft.appendChild(creatureRow);

      var autoplayRow = UI.el('div', 'hud-row');
      autoplayRow.appendChild(UI.el('span', 'hud-row-label', 'AUTOPLAY'));
      this.autoplayToggle = UI.el('button', 'hud-toggle active', 'ON');
      this.autoplayToggle.addEventListener('click', function () {
        self.autoplay = !self.autoplay;
        self.refreshHud();
      });
      autoplayRow.appendChild(this.autoplayToggle);
      topLeft.appendChild(autoplayRow);

      var durationRow = UI.el('div', 'hud-row');
      durationRow.appendChild(UI.el('span', 'hud-row-label', 'DURATION'));
      this.durationSlider = UI.el('input', 'hud-slider');
      this.durationSlider.type = 'range';
      this.durationSlider.min = '5';
      this.durationSlider.max = '60';
      this.durationSlider.step = '5';
      this.durationSlider.value = String(this.settings.SimulationTime);
      this.durationValue = UI.el('span', 'hud-row-value', this.settings.SimulationTime + 'S');
      this.durationSlider.addEventListener('input', function () {
        self.settings.SimulationTime = parseFloat(self.durationSlider.value);
        self.evolution.SettingsForNextGeneration.SimulationTime = self.settings.SimulationTime;
        self.settings = self.evolution.Settings; // keep the reference in sync
        self.durationValue.textContent = self.settings.SimulationTime + 'S';
        self.timeLabel.textContent =
          self.formatTime(self.batchElapsed()) + ' / ' + self.settings.SimulationTime + 's';
        self.saveStateToSettings();
      });
      durationRow.appendChild(this.durationSlider);
      durationRow.appendChild(this.durationValue);
      topLeft.appendChild(durationRow);
      element.appendChild(topLeft);

      /* --- Top right: thumbnail + buttons --- */
      var topRight = UI.el('div', 'hud hud-top-right');
      var frame = UI.el('div', 'thumbnail-frame');
      this.thumbnailCanvas = UI.el('canvas', 'thumbnail-canvas');
      frame.appendChild(this.thumbnailCanvas);
      this.thumbnailCaption = UI.el('div', 'thumbnail-caption', 'NO DATA');
      frame.appendChild(this.thumbnailCaption);
      topRight.appendChild(frame);

      topRight.appendChild(
        Widgets.buttonRow(
          [
            {
              label: 'Visibility',
              onClick: function () {
                self.showAllCreatures = !self.showAllCreatures;
                self.refreshHud();
              },
              className: 'small',
            },
            {
              label: 'Camera',
              onClick: function () {
                self.resetCamera();
              },
              className: 'small',
            },
            {
              label: 'Settings',
              onClick: function () {
                self.settingsVisible = !self.settingsVisible;
                self.settingsDrawer.classList.toggle('hidden', !self.settingsVisible);
              },
              className: 'small',
            },
            {
              label: 'Save',
              onClick: function () {
                self.showSaveMenu();
              },
              className: 'small',
            },
            {
              label: 'Load',
              onClick: function () {
                self.showLoadMenu();
              },
              className: 'small',
            },
            {
              label: 'Back',
              onClick: function () {
                App.show('home');
              },
              className: 'small',
            },
          ],
          'compact'
        )
      );
      element.appendChild(topRight);

      /* --- Bottom left: statistics --- */
      var stats = UI.el('div', 'hud hud-bottom-left');
      this.statsPanel = UI.el('div', 'hud-stats');
      stats.appendChild(UI.el('div', 'hud-stats-title', 'GENERATION HISTORY'));
      this.statsList = UI.el('div', 'hud-stats-list');
      stats.appendChild(this.statsList);
      element.appendChild(stats);

      /* --- Bottom: playback controls --- */
      this.playbackBar = UI.el('div', 'hud hud-bottom hidden');
      this.playButton = UI.el('button', 'hud-button play-button', '\u25B6');
      this.playButton.addEventListener('click', function () {
        self.togglePlayback();
      });
      this.playbackBar.appendChild(this.playButton);

      this.seekSlider = UI.el('input', 'hud-slider seek-slider');
      this.seekSlider.type = 'range';
      this.seekSlider.min = '0';
      this.seekSlider.max = '1';
      this.seekSlider.step = '0.001';
      this.seekSlider.value = '0';
      this.seekSlider.addEventListener('input', function () {
        if (!self.playback) return;
        self.playbackPlaying = false;
        self.playbackTime = parseFloat(self.seekSlider.value) * self.playbackDuration;
        self.playback.seek(self.playbackTime);
        self.refreshHud();
      });
      this.playbackBar.appendChild(this.seekSlider);

      this.seekLabel = UI.el('span', 'hud-row-value', '0.0s');
      this.playbackBar.appendChild(this.seekLabel);

      this.recordingLabel = UI.el('span', 'hud-recording-label', '');
      this.playbackBar.appendChild(this.recordingLabel);

      this.saveRecordingButton = UI.el('button', 'hud-button', 'SAVE');
      this.saveRecordingButton.addEventListener('click', function () {
        self.saveRecording();
      });
      this.playbackBar.appendChild(this.saveRecordingButton);

      this.nextButton = UI.el('button', 'hud-button', 'NEXT \u2192');
      this.nextButton.addEventListener('click', function () {
        self.continueToNextGeneration();
      });
      this.playbackBar.appendChild(this.nextButton);
      element.appendChild(this.playbackBar);

      /* --- Speed control --- */
      var speed = UI.el('div', 'hud hud-speed');
      speed.appendChild(UI.el('span', 'hud-row-label', 'SPEED'));
      var speedSlider = UI.el('input', 'hud-slider hud-slider-small');
      speedSlider.type = 'range';
      speedSlider.min = '0.25';
      speedSlider.max = '4';
      speedSlider.step = '0.25';
      speedSlider.value = '1';
      this.speedLabel = UI.el('span', 'hud-row-value', '1.00x');
      speedSlider.addEventListener('input', function () {
        self.speed = parseFloat(speedSlider.value);
        self.speedLabel.textContent = self.speed.toFixed(2) + 'x';
      });
      speed.appendChild(speedSlider);
      speed.appendChild(this.speedLabel);
      element.appendChild(speed);

      this.refreshHud();
    },

    buildSettingsDrawer: function (element) {
      var self = this;
      this.settingsDrawer = UI.el('div', 'settings-drawer hidden');
      this.settingsDrawer.appendChild(UI.el('div', 'drawer-title', 'Simulation settings'));
      this.settingsDrawer.appendChild(
        EVO.SimulationSettingsPanel.create(this.settings, this.networkSettings, function (settings, networkSettings) {
          self.settings = settings;
          self.networkSettings = networkSettings;
          if (self.evolution) {
            self.evolution.SettingsForNextGeneration = settings;
            self.evolution.NetworkSettings = networkSettings;
            self.evolution.data.Settings = settings;
            self.evolution.data.NetworkSettings = networkSettings;
            if (self.evolution.data.SceneDescription !== undefined) {
              self.evolution.data.SceneDescription = EVO.DefaultSimulationScenes.defaultSceneForObjective(
                settings.Objective
              );
            }
          }
          self.refreshHud();
          self.saveStateToSettings();
        })
      );
      this.settingsDrawer.appendChild(
        UI.el(
          'p',
          'panel-note',
          'Changes apply from the next generation onwards. The scene is rebuilt for every batch.'
        )
      );
      element.appendChild(this.settingsDrawer);
    },

    /* ================================================================ *
     * Simulation control
     * ================================================================ */
    createCameras: function () {
      var controlPoints = this.data.SceneDescription
        ? this.data.SceneDescription.CameraControlPoints
        : [];
      // The tracked camera follows the creatures; the render camera is the
      // screen space projection that the 2D renderer draws with.
      this.trackedCamera = new EVO.TrackedCamera({
        orthographicSize: 12.24,
        controlPoints: controlPoints,
      });
      this.camera = new EVO.Camera({ orthographicSize: 12.24 });
    },

    startSimulation: function () {
      var self = this;
      this.evolution = new EVO.Evolution({
        data: this.data,
        onEvent: function (name, payload) {
          if (name === 'newGenerationDidBegin') {
            self.onGenerationBegin(payload);
          } else if (name === 'generationDidEnd') {
            self.onGenerationEnd(payload);
          } else if (name === 'newBatchDidBegin') {
            self.onBatchBegin(payload);
          }
        },
      });

      this.evolution.start();
      this.refreshHud();
    },

    onGenerationBegin: function (generation) {
      this.currentGeneration = generation;
      if (this.awaitingPlayback) {
        // The playback of the previous generation is still running.
        this.awaitingPlayback = false;
        this.refreshHud();
        return;
      }
      this.state = 'simulating';
      this.playback = null;
      this.playbackPlaying = true;
      this.playbackTime = 0;
      this.refreshHud();
    },

    onBatchBegin: function () {
      this.watchingIndex = 0;
      this.resetCamera();
    },

    onGenerationEnd: function (payload) {
      this.awaitingPlayback = true;
      this.evolution.pause();
      this.state = 'playback';
      this.recording = payload.recording;
      this.bestStats = payload.best ? payload.best.stats : null;

      if (payload.recording) {
        // The previous ghost becomes the currently playing creature.
        this.ghost = new EVO.PlaybackCreature(payload.recording);
        this.ghostTime = 0;
        this.playback = new EVO.PlaybackCreature(payload.recording);
        this.playback.seek(0);
        this.playbackDuration = Math.max(0.1, this.playback.getDuration());
        this.playbackTime = 0;
        this.playbackPlaying = true;
        this.waitTimer = 1.2;
        this.playback.seek(0);
      } else {
        this.playback = null;
      }

      var generation = payload.generation;
      this.thumbnailCaption.textContent = 'GENERATION ' + generation;
      this.recordingLabel.textContent =
        'GEN ' + generation + (this.bestStats ? ' · ' + percent(this.bestStats.fitness) : '');
      this.refreshHud();
      this.refreshStats();
      this.autosave(generation);

      if (!this.playback) {
        // Nothing to play back — continue straight away.
        this.waitTimer = this.autoplay ? 0.4 : 0;
      }
    },

    togglePlayback: function () {
      if (this.state === 'simulating') {
        if (this.evolution.paused) this.evolution.resume();
        else this.evolution.pause();
        this.refreshHud();
        return;
      }
      if (!this.playback) {
        this.continueToNextGeneration();
        return;
      }
      if (this.playbackPlaying) {
        this.playbackPlaying = false;
      } else {
        if (this.playbackTime >= this.playbackDuration - 0.001) {
          this.playbackTime = 0;
        }
        this.playbackPlaying = true;
      }
      this.refreshHud();
    },

    continueToNextGeneration: function () {
      this.waitTimer = 0;
      this.playbackPlaying = false;
      this.state = 'simulating';
      this.evolution.resume();
      this.refreshHud();
    },

    pauseSimulation: function () {
      this.togglePlayback();
    },

    resetCamera: function () {
      this.trackedCamera.freeX = null;
      this.trackedCamera.freeY = null;
      this.trackedCamera.orthographicSize = this.trackedCamera.initialZoom;
    },

    batchElapsed: function () {
      return this.evolution ? this.evolution.batchElapsed : 0;
    },

    /* ================================================================ *
     * Main loop
     * ================================================================ */
    loop: function () {
      var self = this;
      var lastTime = performance.now ? performance.now() : Date.now();

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
      if (!this.evolution) return;
      var scaled = dt * this.speed;

      if (this.state === 'simulating') {
        this.ghostTime += scaled;
        this.evolution.update(scaled);
      } else if (this.state === 'playback') {
        if (this.waitTimer > 0) {
          // A short pause before the playback starts (and after it ends).
          this.waitTimer = Math.max(0, this.waitTimer - dt);
        } else if (!this.playback) {
          if (this.autoplay) this.continueToNextGeneration();
        } else if (this.playbackPlaying) {
          this.playbackTime += scaled;
          if (this.playbackTime >= this.playbackDuration) {
            this.playbackTime = this.playbackDuration;
            this.playbackPlaying = false;
            this.waitTimer = this.autoplay ? 1.0 : 0;
          }
          this.playback.seek(this.playbackTime);
        } else if (this.autoplay) {
          this.continueToNextGeneration();
        }
      }

      this.refreshTimeLabels();
    },

    draw: function () {
      var ctx = this.canvas.getContext('2d');
      if (!ctx) return;
      var ratio = this.pixelRatio || 1;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

      Renderer.drawBackground(ctx, this.camera);

      var gridVisibility =
        this.settings.Objective === EVO.Objective.Flying
          ? Settings.FlyingGridVisibility
          : Settings.DefaultGridVisibility;
      Renderer.drawGrid(ctx, this.camera, gridVisibility, Settings.GridSize || 1);

      // Camera target
      var target = null;
      if (this.state === 'playback' && this.playback) {
        if (!this.playbackTarget) {
          var self = this;
          this.playbackTarget = {
            getXPosition: function () {
              return self.playbackCenter().x;
            },
            getYPosition: function () {
              return self.playbackCenter().y;
            },
          };
        }
        target = this.playbackTarget;
      } else {
        target = this.evolution.getWatchingCreature(this.watchingIndex);
      }
      if (target) {
        this.trackedCamera.target = target;
      }
      this.trackedCamera.update();
      this.camera.x = this.trackedCamera.x;
      this.camera.y = this.trackedCamera.y;
      this.camera.orthographicSize = this.trackedCamera.orthographicSize;

      // Scene
      if (this.evolution.scene) {
        Renderer.drawScene(ctx, this.evolution.scene, this.camera);
        Renderer.drawDistanceMarkers(ctx, this.evolution.scene, this.camera);
      }

      // Ghost of the previous generation's best creature
      if (this.state === 'simulating' && this.ghost && this.ghost.getDuration() > 0) {
        this.ghost.seek(this.ghostTime % Math.max(0.001, this.ghost.getDuration()));
        Renderer.drawPlaybackCreature(ctx, this.ghost, this.camera, {
          opacity: Settings.HiddenCreatureOpacity,
          showMuscles: Settings.ShowMuscles,
          showContraction: Settings.ShowMuscleContraction,
        });
      }

      // Creatures
      if (this.state === 'playback' && this.playback) {
        Renderer.drawPlaybackCreature(ctx, this.playback, this.camera, {
          opacity: 1,
          showMuscles: Settings.ShowMuscles,
          showContraction: Settings.ShowMuscleContraction,
        });
      } else {
        var batch = this.evolution.currentCreatureBatch;
        for (var i = 0; i < batch.length; i++) {
          var watched = i === this.watchingIndex;
          var opacity = this.showAllCreatures || watched ? 1 : Settings.HiddenCreatureOpacity;
          Renderer.drawCreature(ctx, batch[i], this.camera, {
            opacity: opacity,
            showMuscles: Settings.ShowMuscles,
            showContraction: Settings.ShowMuscleContraction,
          });
        }
      }

      this.frameCount++;
      if (this.frameCount % 4 === 0) {
        this.drawThumbnail();
      }
    },

    playbackCenter: function () {
      var joints = this.playback.joints;
      var x = 0,
        y = 0;
      for (var i = 0; i < joints.length; i++) {
        x += joints[i].x;
        y += joints[i].y;
      }
      return { x: x / joints.length, y: y / joints.length };
    },

    drawThumbnail: function () {
      if (!this.thumbnailCanvas) return;
      var ctx = this.thumbnailCanvas.getContext('2d');
      if (!ctx) return;
      var ratio = this.pixelRatio || 1;
      var size = this.thumbnailCanvas.width / ratio;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, size, size);

      var creature = this.playback;
      if (!creature && this.ghost) creature = this.ghost;
      if (!creature) {
        ctx.fillStyle = Renderer.COLORS.background;
        ctx.fillRect(0, 0, size, size);
        return;
      }

      var bounds = creature.getBounds();
      var padding = 1.6;
      var width = Math.max(1, bounds.maxX - bounds.minX) + padding * 2;
      var height = Math.max(1, bounds.maxY - bounds.minY) + padding * 2;
      var ortho = Math.max(width, height) / 2;
      var camera = {
        x: (bounds.minX + bounds.maxX) / 2,
        y: (bounds.minY + bounds.maxY) / 2,
        width: size,
        height: size,
        orthographicSize: ortho,
      };
      camera.pixelsPerUnit = function () {
        return this.height / (2 * this.orthographicSize);
      };
      camera.worldToScreenX = function (x) {
        return (x - this.x) * this.pixelsPerUnit() + this.width / 2;
      };
      camera.worldToScreenY = function (y) {
        return this.height / 2 - (y - this.y) * this.pixelsPerUnit();
      };
      camera.visibleBounds = function () {
        var hw = this.width / 2 / this.pixelsPerUnit();
        var hh = this.height / 2 / this.pixelsPerUnit();
        return { minX: this.x - hw, maxX: this.x + hw, minY: this.y - hh, maxY: this.y + hh };
      };

      ctx.save();
      ctx.fillStyle = '#2c2c2c';
      ctx.fillRect(0, 0, size, size);
      Renderer.drawPlaybackCreature(ctx, creature, camera, {
        opacity: 1,
        showMuscles: Settings.ShowMuscles,
        showContraction: Settings.ShowMuscleContraction,
      });
      ctx.restore();
    },

    /* ================================================================ *
     * HUD
     * ================================================================ */
    refreshHud: function () {
      if (!this.generationLabel) return;
      var generation =
        this.currentGeneration || (this.evolution ? this.evolution.currentGenerationNumber : 1);
      this.generationLabel.textContent = 'GENERATION ' + generation;
      this.taskLabel.textContent = objectiveName(this.settings.Objective);

      var fitness = this.currentFitness();
      this.fitnessLabel.textContent = 'FITNESS: ' + percent(fitness);

      var paused = this.evolution ? this.evolution.paused : false;
      if (this.state === 'playback') {
        this.phaseLabel.textContent = 'PLAYBACK';
      } else if (paused) {
        this.phaseLabel.textContent = 'PAUSED';
      } else {
        this.phaseLabel.textContent = 'SIMULATING';
      }

      var inPlayback = this.state === 'playback' && !!this.playback;
      this.playbackBar.classList.toggle('hidden', !inPlayback);
      if (inPlayback) {
        this.playButton.textContent = this.playbackPlaying ? '\u2016' : '\u25B6';
        this.seekSlider.value = String(
          this.playbackDuration > 0 ? Utils.clamp(this.playbackTime / this.playbackDuration, 0, 1) : 0
        );
        var nextDisabled = this.autoplay && this.playbackPlaying;
        this.nextButton.classList.toggle('disabled', nextDisabled);
      }

      var batchCount = this.evolution ? this.evolution.currentCreatureBatch.length : 0;
      if (this.creatureLabel) {
        var index = batchCount ? Math.min(this.watchingIndex, batchCount - 1) + 1 : 0;
        this.creatureLabel.textContent = index + '/' + Math.max(1, batchCount);
        this.previousCreatureButton.classList.toggle('disabled', index <= 1);
        this.nextCreatureButton.classList.toggle('disabled', index >= batchCount);
      }

      this.autoplayToggle.textContent = this.autoplay ? 'ON' : 'OFF';
      this.autoplayToggle.classList.toggle('active', this.autoplay);
      this.durationSlider.value = String(this.settings.SimulationTime);
      this.durationValue.textContent = this.settings.SimulationTime + 'S';
      this.timeLabel.textContent =
        this.formatTime(this.state === 'playback' ? this.playbackTime : this.batchElapsed()) +
        ' / ' +
        (this.state === 'playback' ? this.playbackDuration : this.settings.SimulationTime).toFixed(1) +
        's';
    },

    refreshTimeLabels: function () {
      if (!this.timeLabel) return;
      if (this.state === 'playback') {
        this.timeLabel.textContent = this.formatTime(this.playbackTime) + ' / ' + this.playbackDuration.toFixed(1) + 's';
        this.seekLabel.textContent = this.formatTime(this.playbackTime);
        if (this.playbackDuration > 0) {
          this.seekSlider.value = String(Utils.clamp(this.playbackTime / this.playbackDuration, 0, 1));
        }
      } else {
        this.timeLabel.textContent =
          this.formatTime(this.batchElapsed()) + ' / ' + this.settings.SimulationTime + 's';
        var fitness = this.currentFitness();
        this.fitnessLabel.textContent = 'FITNESS: ' + percent(fitness);
      }
    },

    formatTime: function (time) {
      if (!isFinite(time)) time = 0;
      return time.toFixed(1) + 's';
    },

    /** The fitness that is displayed: live best of the current generation. */
    currentFitness: function () {
      var solutions = this.evolution ? this.evolution.solutions : null;
      if (solutions) {
        var best = 0;
        for (var i = 0; i < solutions.length; i++) {
          if (solutions[i] && solutions[i].stats && solutions[i].stats.fitness > best) {
            best = solutions[i].stats.fitness;
          }
        }
        if (best > 0) return best;
      }
      var history = this.evolution ? this.evolution.generationFitness : null;
      if (history && history.length) return history[history.length - 1];
      return 0;
    },

    refreshStats: function () {
      var history = this.evolution.generationFitness;
      UI.clear(this.statsList);
      var start = Math.max(0, history.length - 8);
      for (var i = start; i < history.length; i++) {
        var row = UI.el('div', 'hud-stats-row');
        row.appendChild(UI.el('span', 'hud-stats-gen', 'GEN ' + (i + 1)));
        var bar = UI.el('div', 'hud-stats-bar');
        var fill = UI.el('div', 'hud-stats-bar-fill');
        fill.style.width = Math.round(Utils.clamp(history[i], 0, 1) * 100) + '%';
        bar.appendChild(fill);
        row.appendChild(bar);
        row.appendChild(UI.el('span', 'hud-stats-value', percent(history[i])));
        this.statsList.appendChild(row);
      }
    },

    /* ================================================================ *
     * Saving / loading
     * ================================================================ */
    showSaveMenu: function () {
      var self = this;
      var content = UI.el('div', 'menu-content');
      content.appendChild(
        Widgets.textInput({
          label: 'Name',
          value: this.data.CreatureDesign.name || 'Evolution',
        }).element
      );
      var nameInput = content.lastChild.querySelector('input');

      content.appendChild(
        UI.el(
          'p',
          'panel-note',
          'Save the fully evolved state (chromosomes, best creatures and settings) so that ' +
            'you can continue the evolution later.'
        )
      );

      Modal.open({
        title: 'Save simulation',
        content: content,
        actions: [
          { label: 'Cancel' },
          {
            label: 'Save in this browser',
            onClick: function () {
              Storage.saveSimulation(nameInput.value || 'Evolution', self.data);
              Modal.alert('The simulation was saved in this browser.', 'Saved');
            },
          },
          {
            label: 'Download file',
            primary: true,
            onClick: function () {
              self.exportFile(nameInput.value || 'Evolution');
            },
          },
        ],
      });
    },

    exportFile: function (name) {
      var json = JSON.stringify(EVO.SimulationData.encode(this.data), null, 2);
      var blob = new Blob([json], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = name.replace(/[^\w\-]+/g, '_') + '.evolution.json';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    },

    showLoadMenu: function () {
      var self = this;
      var content = UI.el('div', 'menu-content');
      var simulations = Storage.getSimulations();
      if (!simulations.length) {
        content.appendChild(UI.el('p', 'panel-note', 'No simulations were saved in this browser yet.'));
      }
      simulations.forEach(function (entry) {
        var row = UI.el('div', 'list-row compact-row');
        var main = UI.el('div', 'list-row-main');
        main.appendChild(UI.el('span', 'list-row-title', entry.name));
        main.appendChild(
          UI.el('span', 'list-row-sub', 'Generation ' + entry.generation + ' · ' + new Date(entry.date).toLocaleString())
        );
        row.appendChild(main);
        row.appendChild(
          Widgets.buttonRow(
            [
              {
                label: 'Load',
                onClick: function () {
                  var data = Storage.loadSimulation(entry.id);
                  Modal.close();
                  if (data) {
                    self.saveStateToSettings();
                    if (self.evolution) self.evolution.finish();
                    App.show('simulation', { data: data });
                  }
                },
              },
              {
                label: 'Delete',
                className: 'danger',
                onClick: function () {
                  Storage.deleteSimulation(entry.id);
                  Modal.close();
                  self.showLoadMenu();
                },
              },
            ],
            'compact'
          )
        );
        content.appendChild(row);
      });

      content.appendChild(
        UI.el('p', 'panel-note', 'You can also open a simulation file that you downloaded earlier.')
      );

      Modal.open({
        title: 'Load simulation',
        content: content,
        actions: [
          { label: 'Cancel' },
          {
            label: 'Open file…',
            primary: true,
            onClick: function () {
              self.fileInput.click();
            },
          },
        ],
      });
    },

    importFile: function (file) {
      var self = this;
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var json = JSON.parse(reader.result);
          var data = EVO.SimulationData.decode(json);
          if (!data.CreatureDesign.joints.length) {
            throw new Error('The file does not contain a creature design.');
          }
          self.saveStateToSettings();
          if (self.evolution) self.evolution.finish();
          App.show('simulation', { data: data });
        } catch (error) {
          Modal.alert('Could not read that file: ' + error.message, 'Load failed');
        }
      };
      reader.onerror = function () {
        Modal.alert('Could not read that file.', 'Load failed');
      };
      reader.readAsText(file);
    },

    saveRecording: function () {
      if (!this.recording) return;
      try {
        Storage.saveRecording(this.recording);
        Modal.alert(
          'The recording of generation ' + this.recording.generation + ' was added to the gallery.',
          'Saved'
        );
      } catch (error) {
        Modal.alert('The recording could not be saved: ' + error.message, 'Save failed');
      }
    },

    autosave: function (generation) {
      if (!Settings.AutoSaveEnabled) return;
      if (generation - this.autoSaveGeneration < Math.max(1, Settings.AutoSaveDistance)) return;
      this.autoSaveGeneration = generation;
      try {
        Storage.saveSimulation(this.data.CreatureDesign.name || 'Autosave', this.data);
      } catch (error) {
        /* Storage may be full — ignore. */
      }
    },

    /* ================================================================ *
     * Events
     * ================================================================ */
    attachEvents: function () {
      var self = this;

      this.onResize = function () {
        self.resize();
      };
      global.addEventListener('resize', this.onResize);

      this.onKeyDown = function (event) {
        if (event.target && /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
        switch (event.key) {
          case ' ':
            event.preventDefault();
            self.pauseSimulation();
            break;
          case 'v':
            self.showAllCreatures = !self.showAllCreatures;
            self.refreshHud();
            break;
          case 'r':
            self.resetCamera();
            break;
          case 'ArrowLeft':
            if (self.playback) {
              self.playbackTime = Math.max(0, self.playbackTime - 1);
              self.playback.seek(self.playbackTime);
            } else {
              self.watchingIndex = Math.max(0, self.watchingIndex - 1);
            }
            break;
          case 'ArrowRight':
            if (self.playback) {
              self.playbackTime = Math.min(self.playbackDuration, self.playbackTime + 1);
              self.playback.seek(self.playbackTime);
            } else {
              self.watchingIndex = Math.min(
                Math.max(0, self.evolution.currentCreatureBatch.length - 1),
                self.watchingIndex + 1
              );
            }
            break;
          case 'ArrowUp':
            self.watchingIndex = Math.min(
              Math.max(0, self.evolution.currentCreatureBatch.length - 1),
              self.watchingIndex + 1
            );
            break;
          case 'ArrowDown':
            self.watchingIndex = Math.max(0, self.watchingIndex - 1);
            break;
          default:
            return;
        }
        self.refreshHud();
      };
      global.addEventListener('keydown', this.onKeyDown);

      /* Mouse interaction with the camera */
      this.onPointerDown = function (event) {
        if (event.target !== self.canvas) return;
        self.dragging = { x: event.clientX, y: event.clientY };
        self.canvas.setPointerCapture(event.pointerId);
      };
      this.onPointerMove = function (event) {
        if (!self.dragging) return;
        var dx = event.clientX - self.dragging.x;
        var dy = event.clientY - self.dragging.y;
        self.dragging = { x: event.clientX, y: event.clientY };
        if (self.trackedCamera.freeX === null || self.trackedCamera.freeX === undefined) {
          self.trackedCamera.freeX = self.trackedCamera.x;
          self.trackedCamera.freeY = self.trackedCamera.y;
        }
        self.trackedCamera.freeX -= dx / self.camera.pixelsPerUnit();
        self.trackedCamera.freeY += dy / self.camera.pixelsPerUnit();
      };
      this.onPointerUp = function () {
        self.dragging = null;
      };
      this.onWheel = function (event) {
        event.preventDefault();
        var delta = event.deltaY > 0 ? 1 : -1;
        self.trackedCamera.setZoom(self.trackedCamera.orthographicSize + delta * 0.8);
      };

      this.canvas.addEventListener('pointerdown', this.onPointerDown);
      this.canvas.addEventListener('pointermove', this.onPointerMove);
      this.canvas.addEventListener('pointerup', this.onPointerUp);
      this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    },

    detachEvents: function () {
      global.removeEventListener('resize', this.onResize);
      global.removeEventListener('keydown', this.onKeyDown);
      if (this.canvas) {
        this.canvas.removeEventListener('pointerdown', this.onPointerDown);
        this.canvas.removeEventListener('pointermove', this.onPointerMove);
        this.canvas.removeEventListener('pointerup', this.onPointerUp);
        this.canvas.removeEventListener('wheel', this.onWheel);
      }
    },
  };

  EVO.SimulationScreen = SimulationScreen;
  EVO.Screens.simulation = SimulationScreen;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = EVO;
  }
})(typeof window !== 'undefined' ? window : globalThis);
