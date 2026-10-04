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
      if (params.designId !== undefined) {
        this.libraryCreatureId = params.designId || null;
      } else if (this.data.LibraryCreatureId) {
        this.libraryCreatureId = this.data.LibraryCreatureId;
      } else {
        // Only infer from the current editor design for a fresh launch. An old
        // imported run without an id must never overwrite an unrelated library entry.
        this.libraryCreatureId = !params.data && App ? App.currentDesignId || null : null;
      }
      this.data.LibraryCreatureId = this.libraryCreatureId;
      this.settings = this.data.Settings;
      this.networkSettings = this.data.NetworkSettings;

      this.autoplay = params.autoplay === undefined ? true : !!params.autoplay;
      this.skipRecap = params.skipRecap === undefined
        ? !!(Settings && Settings.SkipGenerationRecap)
        : !!params.skipRecap;
      this.showFlightDebug = false;
      this.speed = 1;
      this.watchingIndex = 0;
      this.showAllCreatures = true;
      this.state = 'simulating';
      this.playback = null;
      this.playbackTime = 0;
      this.playbackPlaying = true;
      this.playbackFinished = false;
      this.playbackDuration = 0;
      this.playbackScene = null;
      this.playbackGeneration = null;
      this.playbackObjective = this.settings.Objective;
      this.waitTimer = 0;
      this.ghost = null;
      this.ghostTime = 0;
      this.recording = null;
      this.evolvedChromosome = null;
      this.awaitingPlayback = false;
      this.dragging = null;
      this.activePointerId = null;
      this.gestures = null;
      this.frameCount = 0;
      this.settingsVisible = false;
      this.autoSaveGeneration = 0;
      this.pendingAutosaveGeneration = null;

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
      this.flushPendingAutosave();
      if (this.evolution) {
        this.evolution.finish();
      }
      this.saveStateToSettings();

      // Screens are singletons in the app registry. Drop the finished run and
      // its recording buffers rather than keeping them alive after navigation.
      this.evolution = null;
      this.data = null;
      this.recording = null;
      this.evolvedChromosome = null;
      this.libraryCreatureId = null;
      this.playback = null;
      this.ghost = null;
      this.playbackScene = null;
      this.playbackTarget = null;
      if (this.trackedCamera) {
        this.trackedCamera.target = null;
        this.trackedCamera.controlPoints = [];
      }
      [
        'canvasContainer',
        'canvas',
        'fileInput',
        'generationLabel',
        'taskLabel',
        'fitnessLabel',
        'phaseLabel',
        'timeLabel',
        'previousCreatureButton',
        'creatureLabel',
        'nextCreatureButton',
        'autoplayToggle',
        'skipRecapToggle',
        'autoFlapToggle',
        'durationSlider',
        'durationValue',
        'pauseButton',
        'shockButton',
        'thumbnailCanvas',
        'thumbnailCaption',
        'statsPanel',
        'statsList',
        'playbackBar',
        'playButton',
        'seekSlider',
        'seekLabel',
        'recordingLabel',
        'saveCreatureButton',
        'saveRecordingButton',
        'nextButton',
        'speedLabel',
        'settingsDrawer',
        'simulationSettingsPanel',
        'settingsButton',
        'flightDebugToggle',
        'flightDebugPanel',
      ].forEach(function (property) {
        this[property] = null;
      }, this);
    },

    flushPendingAutosave: function () {
      if (this.pendingAutosaveGeneration === null || this.pendingAutosaveGeneration === undefined) return;
      var generation = this.pendingAutosaveGeneration;
      this.pendingAutosaveGeneration = null;
      this.autosave(generation);
    },


    resize: function () {
      if (!this.canvas) return;
      var width = this.canvasContainer.clientWidth || 800;
      var height = this.canvasContainer.clientHeight || 600;
      var ratio = Utils.displayPixelRatio ? Utils.displayPixelRatio() : Math.min(global.devicePixelRatio || 1, 2);
      this.canvas.width = Math.floor(width * ratio);
      this.canvas.height = Math.floor(height * ratio);
      this.canvas.style.width = width + 'px';
      this.canvas.style.height = height + 'px';
      this.camera.resize(width, height);
      this.pixelRatio = ratio;
      var viewport = global.visualViewport;
      var viewportWidth = viewport ? viewport.width : global.innerWidth;
      var viewportHeight = viewport ? viewport.height : global.innerHeight;
      var narrowScreen = viewportWidth && viewportWidth <= 760;
      var shortLandscape = viewportWidth >= 761 && viewportHeight && viewportHeight <= 460;
      var thumbSize = narrowScreen || shortLandscape ? 96 : 150;
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
        var decoded = EVO.SimulationData.decode(EVO.SimulationData.encode(data));
        if (!decoded.SceneDescription) {
          decoded.SceneDescription = EVO.DefaultSimulationScenes.defaultSceneForObjective(decoded.Settings.Objective);
        }
        return decoded;
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

      var recapRow = UI.el('div', 'hud-row');
      recapRow.appendChild(UI.el('span', 'hud-row-label', 'SKIP RECAP'));
      this.skipRecapToggle = UI.el('button', 'hud-toggle', 'OFF');
      this.skipRecapToggle.title = 'Skip the generation playback recap';
      this.skipRecapToggle.addEventListener('click', function () {
        self.setSkipRecap(!self.skipRecap);
      });
      recapRow.appendChild(this.skipRecapToggle);
      topLeft.appendChild(recapRow);

      var flapRow = UI.el('div', 'hud-row');
      flapRow.appendChild(UI.el('span', 'hud-row-label', 'AUTO FLAP'));
      this.autoFlapToggle = UI.el('button', 'hud-toggle', 'ON');
      this.autoFlapToggle.title =
        'Let winged creatures automatically flap while airborne or falling';
      this.autoFlapToggle.addEventListener('click', function () {
        self.setAutoFlap(!(Settings && Settings.AutoFlapEnabled));
      });
      flapRow.appendChild(this.autoFlapToggle);
      topLeft.appendChild(flapRow);

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
        if (self.evolution) {
          self.evolution.SettingsForNextGeneration.SimulationTime = self.settings.SimulationTime;
          if (self.evolution.playbackPending) self.evolution.reconfigurePendingGeneration();
        }
        if (self.simulationSettingsPanel && self.simulationSettingsPanel.setSimulationTime) {
          self.simulationSettingsPanel.setSimulationTime(self.settings.SimulationTime);
        }
        self.refreshHud();
        self.saveStateToSettings();
      });
      durationRow.appendChild(this.durationSlider);
      durationRow.appendChild(this.durationValue);
      topLeft.appendChild(durationRow);
      element.appendChild(topLeft);

      /* --- Top right: simulation controls + thumbnail + buttons --- */
      var topRight = UI.el('div', 'hud hud-top-right');
      var topControls = UI.el('div', 'hud-top-controls');
      this.flightDebugToggle = UI.el('button', 'evo-button small flight-debug-toggle', 'Wing Debug');
      this.flightDebugToggle.title = 'Show wing speed, aerodynamic forces and flight diagnostics';
      this.flightDebugToggle.addEventListener('click', function () {
        self.showFlightDebug = !self.showFlightDebug;
        self.refreshHud();
      });
      topControls.appendChild(this.flightDebugToggle);

      this.shockButton = UI.el('button', 'evo-button small shock-button', '\u26A1 Shock');
      this.shockButton.type = 'button';
      this.shockButton.title =
        'Shock the creatures: interrupts whatever they are doing right now (S)';
      this.shockButton.setAttribute('aria-label', 'Shock the creatures');
      this.shockButton.addEventListener('click', function () {
        self.shockCreatures();
      });
      topControls.appendChild(this.shockButton);

      this.pauseButton = UI.el('button', 'evo-button small simulation-pause-button', 'Pause');
      this.pauseButton.type = 'button';
      this.pauseButton.title = 'Pause the simulation';
      this.pauseButton.setAttribute('aria-label', 'Pause simulation');
      this.pauseButton.addEventListener('click', function () {
        self.pauseSimulation();
      });
      topControls.appendChild(this.pauseButton);

      var exitButton = UI.el('button', 'evo-button small', 'Exit');
      exitButton.title = 'Exit the simulation and return to the home screen';
      exitButton.setAttribute('aria-label', 'Exit simulation');
      exitButton.addEventListener('click', function () {
        self.exitSimulation();
      });
      topControls.appendChild(exitButton);
      topRight.appendChild(topControls);

      var frame = UI.el('div', 'thumbnail-frame');
      this.thumbnailCanvas = UI.el('canvas', 'thumbnail-canvas');
      frame.appendChild(this.thumbnailCanvas);
      this.thumbnailCaption = UI.el('div', 'thumbnail-caption', 'NO DATA');
      frame.appendChild(this.thumbnailCaption);
      topRight.appendChild(frame);

      this.flightDebugPanel = UI.el('pre', 'flight-debug hidden');
      topRight.appendChild(this.flightDebugPanel);

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
              onClick: function (event) {
                self.settingsButton = event && event.currentTarget;
                self.setSettingsVisible(!self.settingsVisible);
              },
              className: 'small',
            },
            {
              label: 'Save run',
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
        self.playbackFinished = false;
        self.waitTimer = 0;
        self.playbackTime = parseFloat(self.seekSlider.value) * self.playbackDuration;
        self.playback.seek(self.playbackTime);
        self.refreshHud();
      });
      this.playbackBar.appendChild(this.seekSlider);

      this.seekLabel = UI.el('span', 'hud-row-value', '0.0s');
      this.playbackBar.appendChild(this.seekLabel);

      this.recordingLabel = UI.el('span', 'hud-recording-label', '');
      this.playbackBar.appendChild(this.recordingLabel);

      this.saveCreatureButton = UI.el('button', 'hud-button primary', 'SAVE BRAIN');
      this.saveCreatureButton.title = 'Overwrite this action brain on the existing My Creatures entry and update its best-generation replay';
      this.saveCreatureButton.addEventListener('click', function () {
        self.saveCreatureBrain();
      });
      this.playbackBar.appendChild(this.saveCreatureButton);

      this.saveRecordingButton = UI.el('button', 'hud-button', 'SAVE REPLAY');
      this.saveRecordingButton.title = 'Save this movement recording to the Gallery';
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

    refreshSimulationPauseButton: function () {
      var button = this.pauseButton;
      if (!button) return;

      var available = this.state === 'simulating' && !!this.evolution;
      var paused = available && !!this.evolution.paused;
      button.classList.toggle('hidden', !available);
      button.classList.toggle('primary', paused);
      button.textContent = paused ? 'Resume' : 'Pause';
      button.title = paused ? 'Resume the simulation' : 'Pause the simulation';
      button.setAttribute('aria-label', paused ? 'Resume simulation' : 'Pause simulation');
    },

    refreshShockButton: function () {
      var button = this.shockButton;
      if (!button) return;
      var available =
        this.state === 'simulating' && !!this.evolution && !this.evolution.paused;
      button.classList.toggle('hidden', !available);
    },

    /** Startles the whole current batch, stopping each creature mid-action. */
    shockCreatures: function () {
      if (this.state !== 'simulating' || !this.evolution || this.evolution.paused) return;
      this.evolution.shock();
    },

    /** Toggles the built-in wing reflex for current and future creatures. */
    setAutoFlap: function (enabled) {
      enabled = !!enabled;
      if (Settings) Settings.AutoFlapEnabled = enabled;
      if (this.evolution) {
        this.evolution.currentCreatureBatch.forEach(function (creature) {
          creature.autoFlap = enabled;
          if (!enabled) {
            creature.flapPhase = 0;
            creature.flapHold = 0;
          }
        });
      }
      this.refreshHud();
    },

    exitSimulation: function () {
      App.show('home');
    },

    setSkipRecap: function (skip) {
      this.skipRecap = !!skip;
      if (Settings) Settings.SkipGenerationRecap = this.skipRecap;
      // Turning the option on during a recap skips the current recap too.
      if (this.skipRecap && this.state === 'playback') {
        this.continueToNextGeneration();
      } else {
        this.refreshHud();
      }
    },

    setSettingsVisible: function (visible) {
      this.settingsVisible = !!visible;
      if (this.settingsDrawer) {
        this.settingsDrawer.classList.toggle('hidden', !this.settingsVisible);
      }
    },

    handleSettingsOutsideClick: function (event) {
      if (!this.settingsVisible) return;
      var target = event && event.target;
      if (
        (target && this.settingsDrawer && this.settingsDrawer.contains(target)) ||
        (target && this.settingsButton && this.settingsButton.contains(target))
      ) {
        return;
      }
      this.setSettingsVisible(false);
    },

    buildSettingsDrawer: function (element) {
      var self = this;
      this.settingsDrawer = UI.el('div', 'settings-drawer hidden');
      this.settingsDrawer.appendChild(UI.el('div', 'drawer-title', 'Simulation settings'));
      this.simulationSettingsPanel = EVO.SimulationSettingsPanel.create(
        this.settings,
        this.networkSettings,
        function (settings, networkSettings) {
          self.settings = settings;
          self.networkSettings = networkSettings;
          if (self.evolution) {
            self.evolution.SettingsForNextGeneration = settings;
            self.evolution.NetworkSettingsForNextGeneration = networkSettings;
            self.evolution.SceneDescriptionForNextGeneration =
              EVO.DefaultSimulationScenes.defaultSceneForObjective(settings.Objective);
            if (self.evolution.playbackPending) self.evolution.reconfigurePendingGeneration();
          }
          self.refreshHud();
          self.saveStateToSettings();
        }
      );
      this.settingsDrawer.appendChild(this.simulationSettingsPanel);
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
      // The settings drawer was built just before the evolution engine. Keep
      // its models as the editable next-generation settings, while the engine
      // snapshots an independent active copy as soon as start() begins.
      Object.assign(this.settings, this.evolution.SettingsForNextGeneration);
      Object.assign(this.networkSettings, this.evolution.NetworkSettingsForNextGeneration);
      this.evolution.SettingsForNextGeneration = this.settings;
      this.evolution.NetworkSettingsForNextGeneration = this.networkSettings;

      this.evolution.start();
      this.refreshHud();
    },

    onGenerationBegin: function (generation) {
      this.currentGeneration = generation;
      if (this.awaitingPlayback) {
        // The next population is already prepared, but playback remains visible.
        this.awaitingPlayback = false;
        this.flushPendingAutosave();
        this.refreshHud();
        return;
      }
      if (this.pendingAutosaveGeneration !== null && this.pendingAutosaveGeneration !== undefined) {
        this.flushPendingAutosave();
        // In skip-recap mode the engine has already prepared the next
        // population, so release the completed generation immediately.
        if (this.evolution) {
          this.evolution.playbackPending = false;
          this.evolution.completedSolutions = null;
        }
      }
      this.syncCameraControlPoints();
      this.state = 'simulating';
      this.playback = null;
      this.playbackPlaying = true;
      this.playbackTime = 0;
      this.refreshHud();
    },

    syncCameraControlPoints: function () {
      if (!this.trackedCamera) return;
      var description = this.evolution && this.evolution.SceneDescription;
      this.trackedCamera.controlPoints =
        description && description.CameraControlPoints ? description.CameraControlPoints : [];
      this.trackedCamera.lastControlSegmentIndex = 0;
    },

    onBatchBegin: function () {
      this.watchingIndex = 0;
      this.resetCamera();
    },

    onGenerationEnd: function (payload) {
      this.pendingAutosaveGeneration = payload.generation;
      this.playbackGeneration = payload.generation;
      this.playbackObjective = this.evolution.Settings.Objective;
      this.recording = payload.recording;
      this.evolvedChromosome =
        payload.best && payload.best.chromosome ? payload.best.chromosome : null;
      this.bestStats = payload.best ? payload.best.stats : null;
      this.ghost = payload.recording ? new EVO.PlaybackCreature(payload.recording) : null;
      this.ghostTime = 0;

      var generation = payload.generation;
      this.thumbnailCaption.textContent = 'GENERATION ' + generation;
      this.recordingLabel.textContent =
        'GEN ' + generation + (this.bestStats ? ' · ' + percent(this.bestStats.fitness) : '');

      if (this.skipRecap) {
        // Keep the champion as the next generation's comparison ghost, but
        // don't pause evolution or enter the recap/playback state.
        this.awaitingPlayback = false;
        this.state = 'simulating';
        this.playbackScene = null;
        this.playbackTarget = null;
        this.playback = null;
        this.playbackPlaying = false;
        this.playbackFinished = false;
        this.playbackTime = 0;
        this.playbackDuration = 0;
        this.waitTimer = 0;
        this.refreshHud();
        this.refreshStats();
        return;
      }

      this.awaitingPlayback = true;
      // Rebuild a clean render scene from the completed generation's descriptor.
      // The live scene may contain obstacles at their end-of-batch positions.
      this.playbackScene = new EVO.Scene(new EVO.PhysicsWorld(), this.evolution.SceneDescription);
      this.evolution.pause();
      this.state = 'playback';
      this.playbackFinished = false;

      if (payload.recording) {
        this.playback = new EVO.PlaybackCreature(payload.recording);
        this.playback.seek(0);
        this.playbackDuration = Math.max(0.1, this.playback.getDuration());
        this.playbackTime = 0;
        this.playbackPlaying = true;
        this.waitTimer = 1.2;
        this.playback.seek(0);
      } else {
        this.playback = null;
        this.playbackPlaying = false;
        this.playbackTime = 0;
        this.playbackDuration = 0;
      }

      this.refreshHud();
      this.refreshStats();

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
          this.playbackFinished = false;
        }
        this.playbackPlaying = true;
      }
      this.refreshHud();
    },

    continueToNextGeneration: function () {
      this.waitTimer = 0;
      this.playbackPlaying = false;
      this.playbackFinished = false;
      this.playback = null;
      this.playbackTarget = null;
      this.playbackScene = null;
      this.watchingIndex = 0;
      this.state = 'simulating';
      this.syncCameraControlPoints();
      this.resetCamera();
      if (this.evolution) {
        this.evolution.playbackPending = false;
        this.evolution.completedSolutions = null;
        this.evolution.resume();
      }
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

    ensureFreeCamera: function () {
      if (this.trackedCamera.freeX === null || this.trackedCamera.freeX === undefined) {
        this.trackedCamera.freeX = this.trackedCamera.x;
        this.trackedCamera.freeY = this.trackedCamera.y;
      }
    },

    panCameraByScreenDelta: function (dx, dy) {
      this.ensureFreeCamera();
      var height = this.camera ? this.camera.height : 0;
      var pixelsPerUnit = height / (2 * this.trackedCamera.orthographicSize);
      if (!isFinite(pixelsPerUnit) || pixelsPerUnit <= 0) {
        pixelsPerUnit = this.camera.pixelsPerUnit();
      }
      this.trackedCamera.freeX -= dx / pixelsPerUnit;
      this.trackedCamera.freeY += dy / pixelsPerUnit;
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
            this.playbackFinished = true;
            this.waitTimer = this.autoplay ? 1.0 : 0;
          }
          this.playback.seek(this.playbackTime);
        } else if (this.playbackFinished && this.autoplay) {
          this.continueToNextGeneration();
        }
      }

      this.updateFlightDiagnostics();
      this.refreshTimeLabels();
    },

    draw: function () {
      var ctx = this.canvas.getContext('2d');
      if (!ctx) return;
      var ratio = this.pixelRatio || 1;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

      Renderer.drawBackground(ctx, this.camera);

      var activeObjective =
        this.state === 'playback'
          ? this.playbackObjective
          : this.evolution.Settings.Objective;
      var gridVisibility =
        activeObjective === EVO.Objective.Flying
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

      // Playback must keep the just-finished generation's scene visible; the
      // evolution engine prepares the next scene while the recording plays.
      var scene =
        this.state === 'playback' && this.playbackScene ? this.playbackScene : this.evolution.scene;
      // Recreate the same open-ended obstacle course while a recording is
      // playing, otherwise a champion that clears the initial stretch appears
      // to run through empty space in its recap.
      if (
        scene &&
        this.state === 'playback' &&
        this.playback &&
        scene.extendObstacleBlocksAhead
      ) {
        var playbackLeadingX = -Infinity;
        (this.playback.joints || []).forEach(function (joint) {
          playbackLeadingX = Math.max(playbackLeadingX, joint.x);
        });
        scene.extendObstacleBlocksAhead(playbackLeadingX);
      }
      if (scene) {
        Renderer.drawScene(ctx, scene, this.camera);
        Renderer.drawDistanceMarkers(ctx, scene, this.camera);
      }

      // Creatures
      if (this.state === 'playback' && this.playback) {
        Renderer.drawPlaybackCreature(ctx, this.playback, this.camera, {
          opacity: 1,
          showMuscles: Settings.ShowMuscles,
          showContraction: Settings.ShowMuscleContraction,
        });
      } else {
        this.drawCreaturePopulation(ctx);
      }

      this.frameCount++;
      if (this.frameCount % 4 === 0) {
        this.drawThumbnail();
      }
    },

    drawCreaturePopulation: function (ctx) {
      var hasPreviousBest =
        this.state === 'simulating' && this.ghost && this.ghost.getDuration() > 0;
      var focusPreviousBest = !this.showAllCreatures && hasPreviousBest;
      var batch = this.evolution.currentCreatureBatch || [];
      var ghostOpacity = Settings.HiddenCreatureOpacity;

      if (hasPreviousBest && !focusPreviousBest) {
        this.ghost.seek(this.ghostTime % Math.max(0.001, this.ghost.getDuration()));
        Renderer.drawPlaybackCreature(ctx, this.ghost, this.camera, {
          opacity: ghostOpacity,
          showMuscles: Settings.ShowMuscles,
          showContraction: Settings.ShowMuscleContraction,
        });
      }

      for (var i = 0; i < batch.length; i++) {
        var watched = i === this.watchingIndex;
        var opacity;
        if (this.showAllCreatures) {
          opacity = 1;
        } else if (focusPreviousBest) {
          // Fade the evaluated population so the former generation's champion
          // can be inspected without the silhouettes blending together.
          opacity = ghostOpacity;
        } else {
          opacity = watched ? 1 : ghostOpacity;
        }
        Renderer.drawCreature(ctx, batch[i], this.camera, {
          opacity: opacity,
          showMuscles: Settings.ShowMuscles,
          showContraction: Settings.ShowMuscleContraction,
          showWingDebug: this.showFlightDebug && watched,
        });
      }

      if (focusPreviousBest) {
        this.ghost.seek(this.ghostTime % Math.max(0.001, this.ghost.getDuration()));
        // Draw last at full opacity: Visibility now brings the previous
        // generation's best creature to the foreground.
        Renderer.drawPlaybackCreature(ctx, this.ghost, this.camera, {
          opacity: 1,
          highlight: true,
          showMuscles: Settings.ShowMuscles,
          showContraction: Settings.ShowMuscleContraction,
        });
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
        this.state === 'playback' && this.playbackGeneration !== null
          ? this.playbackGeneration
          : this.currentGeneration || (this.evolution ? this.evolution.currentGenerationNumber : 1);
      this.generationLabel.textContent = 'GENERATION ' + generation;
      var activeObjective =
        this.state === 'playback'
          ? this.playbackObjective
          : this.evolution && this.evolution.Settings
            ? this.evolution.Settings.Objective
            : this.settings.Objective;
      this.taskLabel.textContent = objectiveName(activeObjective);
      var isFlyingTask = !!EVO.Objective && activeObjective === EVO.Objective.Flying;
      if (this.flightDebugToggle) {
        this.flightDebugToggle.classList.toggle('hidden', !isFlyingTask);
        this.flightDebugToggle.classList.toggle('active', !!this.showFlightDebug);
        this.flightDebugToggle.textContent = this.showFlightDebug ? 'Wing Debug: On' : 'Wing Debug';
        this.flightDebugToggle.setAttribute(
          'aria-pressed',
          this.showFlightDebug ? 'true' : 'false'
        );
      }
      if (this.flightDebugPanel) {
        this.flightDebugPanel.classList.toggle(
          'hidden',
          !isFlyingTask || !this.showFlightDebug || this.state !== 'simulating'
        );
        this.updateFlightDiagnostics();
      }

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
      this.refreshSimulationPauseButton();
      this.refreshShockButton();

      var inPlayback = this.state === 'playback';
      var hasRecording = inPlayback && !!this.playback;
      this.playbackBar.classList.toggle('hidden', !inPlayback);
      this.playButton.classList.toggle('hidden', !hasRecording);
      this.seekSlider.classList.toggle('hidden', !hasRecording);
      this.seekLabel.classList.toggle('hidden', !hasRecording);
      this.saveCreatureButton.classList.toggle('hidden', !hasRecording);
      this.saveRecordingButton.classList.toggle('hidden', !hasRecording);
      this.saveCreatureButton.disabled =
        !this.libraryCreatureId || !this.recording || !this.evolvedChromosome || !this.evolvedChromosome.length;
      this.saveCreatureButton.title = !this.libraryCreatureId
        ? 'Start this simulation from a saved My Creatures entry to overwrite its brain'
        : 'Overwrite this action brain and update its best-generation replay';
      if (hasRecording) {
        this.playButton.textContent = this.playbackPlaying ? '\u2016' : '\u25B6';
        this.seekSlider.value = String(
          this.playbackDuration > 0 ? Utils.clamp(this.playbackTime / this.playbackDuration, 0, 1) : 0
        );
      } else if (inPlayback) {
        this.recordingLabel.textContent = 'GEN ' + generation + ' · NO RECORDING';
      }
      if (inPlayback) {
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
      if (this.skipRecapToggle) {
        this.skipRecapToggle.textContent = this.skipRecap ? 'ON' : 'OFF';
        this.skipRecapToggle.classList.toggle('active', this.skipRecap);
        this.skipRecapToggle.setAttribute('aria-pressed', this.skipRecap ? 'true' : 'false');
      }
      if (this.autoFlapToggle) {
        var autoFlap = !Settings || Settings.AutoFlapEnabled !== false;
        this.autoFlapToggle.textContent = autoFlap ? 'ON' : 'OFF';
        this.autoFlapToggle.classList.toggle('active', autoFlap);
        this.autoFlapToggle.setAttribute('aria-pressed', autoFlap ? 'true' : 'false');
      }
      this.durationSlider.value = String(this.settings.SimulationTime);
      this.durationValue.textContent = this.settings.SimulationTime + 'S';
      var activeDuration = this.evolution && this.evolution.Settings
        ? this.evolution.Settings.SimulationTime
        : this.settings.SimulationTime;
      if (this.state === 'playback' && !this.playback) {
        this.timeLabel.textContent = 'NO RECORDING';
      } else {
        this.timeLabel.textContent =
          this.formatTime(this.state === 'playback' ? this.playbackTime : this.batchElapsed()) +
          ' / ' +
          (this.state === 'playback' ? this.playbackDuration : activeDuration).toFixed(1) +
          's';
      }
    },

    refreshTimeLabels: function () {
      if (!this.timeLabel) return;
      if (this.state === 'playback' && this.playback) {
        this.timeLabel.textContent = this.formatTime(this.playbackTime) + ' / ' + this.playbackDuration.toFixed(1) + 's';
        this.seekLabel.textContent = this.formatTime(this.playbackTime);
        if (this.playbackDuration > 0) {
          this.seekSlider.value = String(Utils.clamp(this.playbackTime / this.playbackDuration, 0, 1));
        }
      } else if (this.state === 'playback') {
        this.timeLabel.textContent = 'NO RECORDING';
      } else {
        var activeDuration = this.evolution && this.evolution.Settings
          ? this.evolution.Settings.SimulationTime
          : this.settings.SimulationTime;
        this.timeLabel.textContent = this.formatTime(this.batchElapsed()) + ' / ' + activeDuration + 's';
        var fitness = this.currentFitness();
        this.fitnessLabel.textContent = 'FITNESS: ' + percent(fitness);
      }
    },

    formatTime: function (time) {
      if (!isFinite(time)) time = 0;
      return time.toFixed(1) + 's';
    },

    updateFlightDiagnostics: function () {
      if (!this.flightDebugPanel || !this.showFlightDebug) return;
      var creature =
        this.state === 'simulating' && this.evolution
          ? this.evolution.getWatchingCreature(this.watchingIndex)
          : null;
      if (!creature) {
        this.flightDebugPanel.textContent = 'Live wing diagnostics appear while a generation is simulating.';
        return;
      }

      var wings = (creature.bones || []).filter(function (bone) { return bone.isWing; });
      if (!wings.length) {
        this.flightDebugPanel.textContent = 'No wing bones are marked on this creature.';
        return;
      }

      var lines = ['WING FLIGHT DIAGNOSTICS'];
      var totalUpwardLift = 0;
      var totalUpwardWingForce = 0;
      var unpoweredWingCount = 0;
      wings.forEach(function (bone, index) {
        var debug = bone.wingDebug || {};
        var angle = (debug.angleOfAttack || 0) * Utils.Rad2Deg;
        var hasWingMuscle = !!(bone.connectedMuscles && bone.connectedMuscles.length);
        if (!hasWingMuscle) unpoweredWingCount++;
        totalUpwardLift += Math.max(0, debug.liftY || 0);
        totalUpwardWingForce += debug.forceY || 0;
        lines.push(
          'Wing ' + (index + 1) + ': ' + (debug.speed || 0).toFixed(2) + ' u/s · AoA ' +
            angle.toFixed(0) + '° · lift ' + (debug.lift || 0).toFixed(0) + ' · drag ' +
            (debug.drag || 0).toFixed(0) + ' · drive ' + Math.abs(debug.strokeForce || 0).toFixed(0)
        );
      });
      if (unpoweredWingCount) {
        lines.push(
          unpoweredWingCount === wings.length
            ? 'Add a muscle between a wing and a body bone to power a flap.'
            : unpoweredWingCount + ' wing(s) have no attached muscle and cannot flap.'
        );
      }

      var mass = 0;
      (creature.joints || []).forEach(function (joint) {
        mass += joint.data ? joint.data.weight : joint.body && joint.body.mass || 0;
      });
      (creature.bones || []).forEach(function (bone) {
        mass += bone.data ? bone.data.weight : bone.mass || 0;
      });
      var gravity = this.evolution.scene && this.evolution.scene.world
        ? Math.abs(this.evolution.scene.world.gravity)
        : 50;
      var tracker = creature.objectiveTracker || {};
      var groundContacts = creature.getNumberOfPointsTouchingGround
        ? creature.getNumberOfPointsTouchingGround()
        : 0;
      lines.push(
        'Upward lift: ' + totalUpwardLift.toFixed(0) + ' · net upward wing force: ' +
          totalUpwardWingForce.toFixed(0) + ' / estimated weight: ' + (mass * gravity).toFixed(0)
      );
      lines.push(
        'Ground contacts: ' + groundContacts + ' · airborne: ' +
          (tracker.currentAirborneTime || 0).toFixed(2) + 's · total: ' +
          (tracker.totalAirborneTime || 0).toFixed(2) + 's'
      );
      this.flightDebugPanel.textContent = lines.join('\n');
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
      var suggestedName = this.data && this.data.CreatureDesign
        ? this.data.CreatureDesign.name || 'Evolution'
        : 'Evolution';
      if (this.recording && this.recording.generation) {
        suggestedName += ' · Gen ' + this.recording.generation;
      }
      var nameField = Widgets.textInput({
        label: 'Replay / run name',
        value: suggestedName,
        maxLength: 60,
      });
      content.appendChild(nameField.element);
      var creatureSnapshot = this.getEvolvedCreatureSnapshot();
      content.appendChild(
        UI.el(
          'p',
          'panel-note',
          'Save a replay or run checkpoint, or overwrite this creature’s brain for the current action. Saving the brain also replaces that action’s best-generation replay in the Gallery. Brain saving requires a simulation launched from a saved My Creatures entry.'
        )
      );

      Modal.open({
        title: 'Save run',
        content: content,
        actions: [
          { label: 'Cancel' },
          {
            label: 'Save replay',
            disabled: !this.recording,
            onClick: function () {
              self.saveRecording(nameField.input.value);
            },
          },
          {
            label: 'Save run',
            onClick: function () {
              self.saveRun(nameField.input.value);
            },
          },
          {
            label: 'Save creature brain',
            disabled: !creatureSnapshot || !this.libraryCreatureId,
            onClick: function () {
              self.saveCreatureBrain(creatureSnapshot);
            },
          },
          {
            label: 'Download run',
            primary: true,
            onClick: function () {
              self.exportFile(nameField.input.value || 'Evolution');
            },
          },
        ],
      });
    },

    saveRun: function (name) {
      try {
        Storage.saveSimulation(name || 'Evolution', this.data);
        Modal.alert('The simulation run was saved in this browser.', 'Run saved');
      } catch (error) {
        Modal.alert('The run could not be saved: ' + error.message, 'Save failed');
      }
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

    getEvolvedCreatureSnapshot: function () {
      if (
        !this.recording ||
        !this.recording.movementData ||
        !this.evolvedChromosome ||
        !this.evolvedChromosome.length
      ) {
        return null;
      }
      return {
        recording: this.recording,
        chromosome: this.evolvedChromosome,
        networkSettings: this.recording.networkSettings ||
          (this.evolution && this.evolution.NetworkSettings),
      };
    },

    saveCreatureBrain: function (snapshot) {
      snapshot = snapshot || this.getEvolvedCreatureSnapshot();
      if (!this.libraryCreatureId) {
        Modal.alert(
          'This simulation is not linked to a saved creature. Save the design in My Creatures first, then train its action brain.',
          'Saved creature required'
        );
        return;
      }
      if (!snapshot) {
        Modal.alert('Wait for a generation replay before saving its best brain.', 'Brain unavailable');
        return;
      }
      try {
        Storage.saveEvolvedBrain(
          this.libraryCreatureId,
          snapshot.recording,
          snapshot.chromosome,
          snapshot.networkSettings,
          this.data ? this.data.LastV2SimulatedGeneration : 0
        );
        Modal.alert(
          'Overwrote the ' + objectiveName(snapshot.recording.task) +
            ' brain on this creature and updated its best-generation replay in the Gallery.',
          'Brain updated'
        );
      } catch (error) {
        Modal.alert('The creature brain could not be updated: ' + error.message, 'Save failed');
      }
    },

    saveRecording: function (customName) {
      if (!this.recording) {
        Modal.alert('There is no generation replay available to save yet.', 'Replay unavailable');
        return;
      }
      try {
        Storage.saveRecording(this.recording, customName);
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
      this.onDocumentClick = function (event) {
        self.handleSettingsOutsideClick(event);
      };
      document.addEventListener('click', this.onDocumentClick);

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
          case 's':
          case 'S':
            self.shockCreatures();
            break;
          case 'ArrowLeft':
            if (self.state === 'playback' && self.playback) {
              self.playbackTime = Math.max(0, self.playbackTime - 1);
              self.playback.seek(self.playbackTime);
            } else {
              self.watchingIndex = Math.max(0, self.watchingIndex - 1);
            }
            break;
          case 'ArrowRight':
            if (self.state === 'playback' && self.playback) {
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

      /* Camera interaction: one-finger drag, pinch zoom and two-finger pan. */
      this.gestures = Utils.addTouchGestures(this.canvas, {
        onGestureStart: function () {
          self.dragging = null;
          self.activePointerId = null;
        },
        onPinch: function (scale) {
          self.trackedCamera.setZoom(self.trackedCamera.orthographicSize / scale);
        },
        onPan: function (dx, dy) {
          self.panCameraByScreenDelta(dx, dy);
        },
        onGestureEnd: function () {
          // Ignore the remaining finger until it is lifted; it must not resume
          // the one-finger drag that preceded the pinch.
          self.dragging = null;
          self.activePointerId = null;
        },
      });

      this.onPointerDown = function (event) {
        if (event.target !== self.canvas || (self.gestures && self.gestures.active)) return;
        self.activePointerId = event.pointerId;
        self.dragging = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
        try {
          self.canvas.setPointerCapture(event.pointerId);
        } catch (error) {
          // Pointer capture is unavailable in a few embedded/webview contexts.
        }
      };
      this.onPointerMove = function (event) {
        if (self.gestures && self.gestures.active) return;
        if (!self.dragging || event.pointerId !== self.dragging.pointerId) return;
        var dx = event.clientX - self.dragging.x;
        var dy = event.clientY - self.dragging.y;
        self.dragging = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
        self.panCameraByScreenDelta(dx, dy);
      };
      this.onPointerUp = function (event) {
        if (!self.dragging || event.pointerId !== self.dragging.pointerId) return;
        self.dragging = null;
        self.activePointerId = null;
      };
      this.onPointerCancel = function (event) {
        if (!self.dragging || event.pointerId !== self.dragging.pointerId) return;
        self.dragging = null;
        self.activePointerId = null;
      };
      this.onBlur = function () {
        self.dragging = null;
        self.activePointerId = null;
      };
      this.onVisibilityChange = function () {
        self.dragging = null;
        self.activePointerId = null;
      };
      this.onWheel = function (event) {
        event.preventDefault();
        var delta = event.deltaY > 0 ? 1 : -1;
        self.trackedCamera.setZoom(self.trackedCamera.orthographicSize + delta * 0.8);
      };

      this.canvas.addEventListener('pointerdown', this.onPointerDown);
      this.canvas.addEventListener('pointermove', this.onPointerMove);
      this.canvas.addEventListener('pointerup', this.onPointerUp);
      this.canvas.addEventListener('pointercancel', this.onPointerCancel);
      global.addEventListener('blur', this.onBlur);
      document.addEventListener('visibilitychange', this.onVisibilityChange);
      this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    },

    detachEvents: function () {
      global.removeEventListener('resize', this.onResize);
      document.removeEventListener('click', this.onDocumentClick);
      global.removeEventListener('keydown', this.onKeyDown);
      global.removeEventListener('blur', this.onBlur);
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
      if (this.gestures) {
        this.gestures.detach();
        this.gestures = null;
      }
      if (this.canvas) {
        this.canvas.removeEventListener('pointerdown', this.onPointerDown);
        this.canvas.removeEventListener('pointermove', this.onPointerMove);
        this.canvas.removeEventListener('pointerup', this.onPointerUp);
        this.canvas.removeEventListener('pointercancel', this.onPointerCancel);
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
