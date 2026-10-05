/*
 * Evolution (Web Edition) — ui/app.js
 * ---------------------------------------------------------------
 * The application shell: screens, storage, reusable widgets and modals.
 */
(function (global) {
  'use strict';

  var EVO = (global.EVO = global.EVO || {});
  var UI = EVO.UI;
  var Utils = EVO.Utils;
  var Store = EVO.Store;
  var Settings = EVO.Settings;

  /* ================================================================== *
   * Widgets
   * ================================================================== */
  var Widgets = {
    /** A labelled range slider. */
    slider: function (options) {
      var row = UI.el('div', 'widget widget-slider');
      var header = UI.el('div', 'widget-header');
      var label = UI.el('span', 'widget-label', options.label);
      var valueLabel = UI.el('span', 'widget-value');
      header.appendChild(label);
      header.appendChild(valueLabel);
      row.appendChild(header);

      var input = UI.el('input', 'slider');
      input.type = 'range';
      input.min = String(options.min);
      input.max = String(options.max);
      input.step = String(options.step === undefined ? 0.01 : options.step);
      var format =
        options.format ||
        function (v) {
          return String(v);
        };

      var update = function (value, notify) {
        input.value = String(value);
        valueLabel.textContent = format(parseFloat(input.value));
        if (notify && options.onInput) options.onInput(parseFloat(input.value));
      };

      input.addEventListener('input', function () {
        update(parseFloat(input.value), true);
      });
      row.appendChild(input);
      update(options.value);

      return {
        element: row,
        set: function (value) {
          update(value, false);
        },
      };
    },

    /** A labelled on/off switch. */
    toggle: function (options) {
      var row = UI.el('div', 'widget widget-toggle');
      var label = UI.el('label', 'toggle');
      var input = UI.el('input');
      input.type = 'checkbox';
      input.checked = !!options.value;
      var track = UI.el('span', 'toggle-track');
      var text = UI.el('span', 'toggle-label', options.label);
      label.appendChild(input);
      label.appendChild(track);
      label.appendChild(text);
      row.appendChild(label);

      input.addEventListener('change', function () {
        if (options.onChange) options.onChange(input.checked);
      });

      return {
        element: row,
        set: function (value) {
          input.checked = !!value;
        },
      };
    },

    /** A labelled text input. */
    textInput: function (options) {
      var row = UI.el('div', 'widget widget-input');
      if (options.label) row.appendChild(UI.el('span', 'widget-label', options.label));
      var input = UI.el('input', 'text-input');
      input.type = 'text';
      input.value = options.value === undefined ? '' : options.value;
      if (options.placeholder) input.placeholder = options.placeholder;
      if (options.maxLength) input.maxLength = options.maxLength;
      input.addEventListener('input', function () {
        if (options.onInput) options.onInput(input.value);
      });
      if (options.onChange) {
        input.addEventListener('change', function () {
          options.onChange(input.value);
        });
      }
      row.appendChild(input);
      return {
        element: row,
        set: function (value) {
          input.value = value;
        },
        input: input,
      };
    },

    /** A labelled dropdown. */
    dropdown: function (options) {
      var row = UI.el('div', 'widget widget-dropdown');
      if (options.label) row.appendChild(UI.el('span', 'widget-label', options.label));
      var select = UI.el('select', 'dropdown');
      options.options.forEach(function (option) {
        var item = UI.el('option', null, option.label);
        item.value = String(option.value);
        select.appendChild(item);
      });
      select.value = String(options.value);
      select.addEventListener('change', function () {
        var value = select.value;
        if (options.numeric) value = parseFloat(value);
        if (options.onChange) options.onChange(value);
      });
      row.appendChild(select);
      return {
        element: row,
        set: function (value) {
          select.value = String(value);
        },
      };
    },

    /** A labelled integer stepper. */
    stepper: function (options) {
      var row = UI.el('div', 'widget widget-stepper');
      row.appendChild(UI.el('span', 'widget-label', options.label));
      var controls = UI.el('div', 'stepper-controls');
      var minus = UI.el('button', 'stepper-button', '−');
      var valueLabel = UI.el('span', 'stepper-value', String(options.value));
      var plus = UI.el('button', 'stepper-button', '+');
      controls.appendChild(minus);
      controls.appendChild(valueLabel);
      controls.appendChild(plus);
      row.appendChild(controls);

      var current = options.value;
      var set = function (value, notify) {
        current = Utils.clamp(
          Math.round(value),
          options.min === undefined ? -Infinity : options.min,
          options.max === undefined ? Infinity : options.max
        );
        valueLabel.textContent = String(current);
        if (notify && options.onChange) options.onChange(current);
      };
      minus.addEventListener('click', function () {
        set(current - (options.step || 1), true);
      });
      plus.addEventListener('click', function () {
        set(current + (options.step || 1), true);
      });

      return {
        element: row,
        set: function (value) {
          set(value, false);
        },
      };
    },

    /** A titled settings panel. */
    panel: function (title, options) {
      options = options || {};
      var panel = UI.el('div', 'panel' + (options.className ? ' ' + options.className : ''));
      if (title) {
        var header = UI.el('div', 'panel-header');
        header.appendChild(UI.el('span', 'panel-title', title));
        panel.appendChild(header);
      }
      var body = UI.el('div', 'panel-body');
      panel.appendChild(body);
      panel.body = body;
      panel.add = function (child) {
        body.appendChild(child);
        return child;
      };
      return panel;
    },

    /** A row of buttons. */
    buttonRow: function (buttons, className) {
      var row = UI.el('div', 'button-row' + (className ? ' ' + className : ''));
      buttons.forEach(function (button) {
        if (!button) return;
        var node = UI.el('button', 'evo-button' + (button.className ? ' ' + button.className : ''), button.label);
        node.addEventListener('click', button.onClick);
        row.appendChild(node);
      });
      return row;
    },
  };

  /* ================================================================== *
   * Modal dialogs
   * ================================================================== */
  var Modal = {
    root: null,
    close: function () {
      if (this.root && this.root.parentNode) {
        this.root.parentNode.removeChild(this.root);
      }
      this.root = null;
    },

    open: function (options) {
      this.close();
      var overlay = UI.el('div', 'modal-overlay');
      var dialog = UI.el('div', 'modal');
      if (options.title) {
        dialog.appendChild(UI.el('div', 'modal-title', options.title));
      }
      var body = UI.el('div', 'modal-body');
      if (options.message) body.appendChild(UI.el('p', 'modal-message', options.message));
      if (options.content) body.appendChild(options.content);
      dialog.appendChild(body);

      var self = this;
      if (options.actions && options.actions.length) {
        var actions = UI.el('div', 'modal-actions');
        options.actions.forEach(function (action) {
          var button = UI.el(
            'button',
            'evo-button' + (action.primary ? ' primary' : '') + (action.danger ? ' danger' : ''),
            action.label
          );
          button.disabled = !!action.disabled;
          button.addEventListener('click', function () {
            if (button.disabled) return;
            if (action.close !== false) self.close();
            if (action.onClick) action.onClick();
          });
          actions.appendChild(button);
        });
        dialog.appendChild(actions);
      }

      overlay.appendChild(dialog);
      overlay.addEventListener('mousedown', function (event) {
        if (event.target === overlay && options.dismissable !== false) self.close();
      });
      document.body.appendChild(overlay);
      this.root = overlay;
      return { element: overlay, dialog: dialog, close: function () { self.close(); } };
    },

    alert: function (message, title) {
      return this.open({
        title: title || 'Notice',
        message: message,
        actions: [{ label: 'OK', primary: true }],
      });
    },

    confirm: function (message, onConfirm, confirmLabel) {
      return this.open({
        title: 'Are you sure?',
        message: message,
        actions: [
          { label: 'Cancel' },
          { label: confirmLabel || 'Confirm', primary: true, onClick: onConfirm },
        ],
      });
    },
  };

  /* ================================================================== *
   * Storage of designs, recordings and simulations
   * ================================================================== */
  function makeId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
  }

  function objectiveBrainKey(objective) {
    return EVO.BrainProfile.keyForObjective(objective);
  }

  var Storage = {
    getDesigns: function () {
      var designs = Store.getJSON('designs', []);
      return designs.map(function (entry) {
        entry.design = EVO.CreatureDesign.decode(entry.design);
        return entry;
      });
    },

    /**
     * Saves a design. `brains` optionally attaches evolved action brains —
     * used when importing a creature file that carries them with the design.
     */
    saveDesign: function (design, existingId, brains) {
      var designs = Store.getJSON('designs', []);
      var entry = {
        id: existingId || makeId(),
        name: design.name || 'Unnamed',
        design: EVO.CreatureDesign.encode(design),
        date: new Date().toISOString(),
      };
      var replaced = false;
      for (var i = 0; i < designs.length; i++) {
        if (designs[i].id === entry.id) {
          // Editing the phenotype must not erase the action-specific brains.
          entry.evolvedBrains = designs[i].evolvedBrains;
          entry.evolvedCreature = designs[i].evolvedCreature;
          designs[i] = entry;
          replaced = true;
          break;
        }
      }
      if (EVO.CreatureFile.countBrains(brains)) {
        var normalized = Storage.normalizeBrains(brains);
        entry.evolvedBrains = Object.assign({}, entry.evolvedBrains, normalized.brains);
        entry.evolvedCreature = normalized.latest || entry.evolvedCreature || null;
      }
      if (!replaced) designs.unshift(entry);
      Store.setJSON('designs', designs);
      return entry.id;
    },

    /** Keeps only the known actions of a brain map and reports the first one. */
    normalizeBrains: function (brains) {
      var normalized = {};
      var latest = null;
      EVO.ObjectiveUtil.ALL_OBJECTIVES.forEach(function (objective) {
        var key = objectiveBrainKey(objective);
        var profile = brains && brains[key];
        if (!profile || !profile.chromosome || !profile.chromosome.length) return;
        normalized[key] = profile;
        if (!latest) latest = profile;
      });
      return { brains: normalized, latest: latest };
    },

    /** The evolved action brains stored on a My Creatures entry. */
    getBrainProfilesForDesign: function (designId) {
      if (!designId) return {};
      var designs = Store.getJSON('designs', []);
      for (var i = 0; i < designs.length; i++) {
        if (designs[i].id === designId) return designs[i].evolvedBrains || {};
      }
      return {};
    },

    getEvolvedBrainProfiles: function (entry) {
      if (!entry) return [];
      var profiles = entry.evolvedBrains || {};
      var result = [];
      EVO.ObjectiveUtil.ALL_OBJECTIVES.forEach(function (objective) {
        var profile = profiles[objectiveBrainKey(objective)];
        if (!profile && entry.evolvedCreature && entry.evolvedCreature.task === objective) {
          profile = entry.evolvedCreature;
        }
        if (profile) result.push(profile);
      });
      return result;
    },

    getEvolvedBrain: function (entry, objective) {
      if (!entry) return null;
      var profile = entry.evolvedBrains && entry.evolvedBrains[objectiveBrainKey(objective)];
      if (profile) return profile;
      return entry.evolvedCreature && entry.evolvedCreature.task === objective
        ? entry.evolvedCreature
        : null;
    },

    /** Replaces one action brain on an existing creature and refreshes its best replay. */
    saveEvolvedBrain: function (creatureId, recording, chromosome, networkSettings, lastV2Generation) {
      if (!creatureId) throw new Error('Save this creature to My Creatures before saving its brain.');
      if (!recording || !recording.creatureDesign || !recording.movementData || !chromosome || !chromosome.length) {
        throw new Error('There is no completed generation brain and replay to save yet.');
      }
      var designs = Store.getJSON('designs', []);
      var entry = null;
      for (var i = 0; i < designs.length; i++) {
        if (designs[i].id === creatureId) {
          entry = designs[i];
          break;
        }
      }
      if (!entry) throw new Error('The original creature is no longer in My Creatures.');

      var taskKey = objectiveBrainKey(recording.task);
      var profiles = entry.evolvedBrains || {};
      if (entry.evolvedCreature && !profiles[objectiveBrainKey(entry.evolvedCreature.task)]) {
        // Migrate the previous single-brain format without losing its profile.
        profiles[objectiveBrainKey(entry.evolvedCreature.task)] = entry.evolvedCreature;
      }
      var previousProfile = profiles[taskKey];
      var taskName = EVO.ObjectiveUtil.stringRepresentation(recording.task);
      var replayName = (entry.name || 'Creature') + ' · ' + taskName + ' · Gen ' + recording.generation;
      var replayId = this.saveRecording(recording, replayName, previousProfile && previousProfile.replayId);
      var profile = {
        task: recording.task,
        generation: recording.generation,
        chromosome: chromosome.map(function (weight) {
          return Utils.round4(weight);
        }),
        networkSettings: EVO.NeuralNetworkSettings.encode(
          networkSettings || recording.networkSettings
        ),
        scene:
          recording.sceneDescription && EVO.SimulationSceneDescription
            ? EVO.SimulationSceneDescription.encode(recording.sceneDescription)
            : null,
        stats: recording.stats ? EVO.CreatureStats.encode(recording.stats) : null,
        lastV2SimulatedGeneration: lastV2Generation || 0,
        replayId: replayId,
      };
      profiles[taskKey] = profile;
      entry.evolvedBrains = profiles;
      // Keep a latest-profile alias for old imported clients and saves.
      entry.evolvedCreature = profile;
      entry.date = new Date().toISOString();
      Store.setJSON('designs', designs);
      return { creatureId: creatureId, replayId: replayId, profile: profile };
    },

    deleteDesign: function (id) {
      var designs = Store.getJSON('designs', []).filter(function (entry) {
        return entry.id !== id;
      });
      Store.setJSON('designs', designs);
    },

    getRecordings: function () {
      return Store.getJSON('recordings', []).map(function (entry) {
        entry.recording = EVO.CreatureRecording.decode(entry.recording);
        return entry;
      });
    },

    saveRecording: function (recording, customName, existingId) {
      var recordings = Store.getJSON('recordings', []);
      var fallbackName = 'Generation ' + recording.generation + ' · ' +
        EVO.ObjectiveUtil.stringRepresentation(recording.task);
      var name = typeof customName === 'string' && customName.trim()
        ? customName.trim().substr(0, 60)
        : fallbackName;
      var entry = {
        id: existingId || makeId(),
        name: name,
        generation: recording.generation,
        task: recording.task,
        date: new Date().toISOString(),
        fitness: recording.stats.unclampedFitness,
        recording: EVO.CreatureRecording.encode(recording),
      };
      var existingIndex = -1;
      for (var i = 0; i < recordings.length; i++) {
        if (recordings[i].id === entry.id) {
          existingIndex = i;
          break;
        }
      }
      if (existingIndex !== -1) recordings.splice(existingIndex, 1);
      recordings.unshift(entry);
      // Keep the storage small.
      if (recordings.length > 20) recordings = recordings.slice(0, 20);
      try {
        Store.setJSON('recordings', recordings);
      } catch (error) {
        recordings = recordings.slice(0, 8);
        Store.setJSON('recordings', recordings);
        Modal.alert('The gallery is full — the oldest recordings were removed.');
      }
      return entry.id;
    },

    deleteRecording: function (id) {
      var recordings = Store.getJSON('recordings', []).filter(function (entry) {
        return entry.id !== id;
      });
      Store.setJSON('recordings', recordings);
    },

    getSimulations: function () {
      return Store.getJSON('simulations', []);
    },

    saveSimulation: function (name, data) {
      var simulations = Store.getJSON('simulations', []);
      var entry = {
        id: makeId(),
        name: name,
        date: new Date().toISOString(),
        generation: data.BestCreatures.length + 1,
        data: EVO.SimulationData.encode(data),
      };
      simulations.unshift(entry);
      if (simulations.length > 10) simulations = simulations.slice(0, 10);
      Store.setJSON('simulations', simulations);
      return entry.id;
    },

    loadSimulation: function (id) {
      var simulations = Store.getJSON('simulations', []);
      for (var i = 0; i < simulations.length; i++) {
        if (simulations[i].id === id) {
          return EVO.SimulationData.decode(simulations[i].data);
        }
      }
      return null;
    },

    deleteSimulation: function (id) {
      var simulations = Store.getJSON('simulations', []).filter(function (entry) {
        return entry.id !== id;
      });
      Store.setJSON('simulations', simulations);
    },
  };

  /* ================================================================== *
   * Screen management
   * ================================================================== */
  var App = {
    root: null,
    screens: {},
    current: null,
    currentName: null,
    currentDesignId: null,

    register: function (name, screen) {
      EVO.Screens = EVO.Screens || {};
      EVO.Screens[name] = screen;
    },

    start: function () {
      this.currentDesign = null;
      this.currentDesignId = Store.getString('LAST_CREATURE_DESIGN_ID_KEY', '') || null;
      var lastDesign = Settings.LastCreatureDesign;
      if (lastDesign) {
        try {
          this.currentDesign = EVO.CreatureDesign.decode(lastDesign);
        } catch (error) {
          this.currentDesign = null;
        }
      }
      if (!this.currentDesign) {
        this.currentDesignId = null;
        Store.remove('LAST_CREATURE_DESIGN_ID_KEY');
      } else if (this.currentDesignId) {
        var savedEntries = Store.getJSON('designs', []);
        var idExists = savedEntries.some(function (entry) { return entry.id === App.currentDesignId; });
        if (!idExists) {
          this.currentDesignId = null;
          Store.remove('LAST_CREATURE_DESIGN_ID_KEY');
        }
      }
      this.root = document.getElementById('screens');
      if (!this.root) {
        this.root = document.body;
      }
      this.show('home');
      var resizeCurrent = function () {
        if (App.current && App.current.resize) App.current.resize();
      };
      window.addEventListener('resize', resizeCurrent);
      window.addEventListener('orientationchange', function () {
        resizeCurrent();
        if (App.orientationResizeTimer) clearTimeout(App.orientationResizeTimer);
        App.orientationResizeTimer = setTimeout(resizeCurrent, 250);
      });
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', resizeCurrent);
      }
      document.addEventListener('contextmenu', function (event) {
        var target = event.target;
        if (
          target &&
          target.tagName === 'CANVAS' &&
          target.classList &&
          (target.classList.contains('editor-canvas') ||
            target.classList.contains('simulation-canvas') ||
            target.classList.contains('ecosystem-canvas') ||
            target.classList.contains('gallery-canvas'))
        ) {
          event.preventDefault();
        }
      });
      document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && Modal.root) {
          Modal.close();
        }
      });
    },

    show: function (name, params) {
      EVO.Screens = EVO.Screens || {};
      var screen = EVO.Screens[name];
      if (!screen) {
        // eslint-disable-next-line no-console
        console.warn('Unknown screen: ' + name);
        return;
      }

      if (this.current && this.current.hide) this.current.hide();
      if (this.current && this.current.element && this.current.element.parentNode) {
        this.current.element.parentNode.removeChild(this.current.element);
      }
      if (this.current) this.current.element = null;

      this.currentName = name;
      this.current = screen;
      screen.element = UI.el('div', 'screen screen-' + name);
      this.root.appendChild(screen.element);
      screen.element.classList.add('visible');
      if (screen.show) screen.show(params || {});
      if (screen.resize) screen.resize();
    },

    /**
     * Starts a simulation of `design` for one action. `profile` is the saved
     * brain to continue from (or null to train from scratch); `designId` is the
     * My Creatures entry it belongs to, or null for a creature that is not saved.
     */
    launchSimulation: function (design, designId, objective, profile) {
      App.setDesign(design, designId);
      var settings = EVO.SimulationSettings.forObjective(objective);
      var networkSettings = profile && profile.networkSettings
        ? EVO.NeuralNetworkSettings.decode(profile.networkSettings)
        : EVO.NeuralNetworkSettings.decode(Settings.NetworkSettings);
      var scene = profile && profile.scene
        ? EVO.SimulationSceneDescription.decode(profile.scene)
        : EVO.DefaultSimulationScenes.defaultSceneForObjective(objective);
      var data = EVO.SimulationData.create(
        settings,
        networkSettings,
        EVO.CreatureDesign.clone(design),
        scene
      );
      if (designId) data.LibraryCreatureId = designId;
      if (profile && profile.chromosome && profile.chromosome.length) {
        data.CurrentChromosomes = [profile.chromosome.slice()];
        data.LastV2SimulatedGeneration = profile.lastV2SimulatedGeneration || 0;
      }
      App.show('simulation', { data: data, designId: designId });
    },

    /** The "Choose an action brain" dialog; `getProfile(objective)` finds a saved brain. */
    chooseActionBrain: function (design, designId, getProfile) {
      var actions = EVO.ObjectiveUtil.ALL_OBJECTIVES.map(function (objective) {
        var profile = getProfile(objective);
        var actionName = EVO.ObjectiveUtil.stringRepresentation(objective);
        return {
          label: profile
            ? actionName + ' · saved Gen ' + profile.generation
            : 'Train ' + actionName + ' brain',
          primary: !!profile,
          onClick: function () {
            App.launchSimulation(design, designId, objective, profile);
          },
        };
      });
      Modal.open({
        title: 'Choose an action brain',
        message: 'Choose a task to train, or continue from that task’s saved brain. Saving a brain replaces only that task and updates its best-generation replay.',
        actions: actions.concat([{ label: 'Cancel' }]),
      });
    },

    getDesign: function () {
      return this.currentDesign || EVO.CreatureDesign.empty();
    },

    setDesign: function (design, designId) {
      this.currentDesign = design;
      if (arguments.length > 1) {
        this.currentDesignId = designId || null;
        if (this.currentDesignId) Store.setString('LAST_CREATURE_DESIGN_ID_KEY', this.currentDesignId);
        else Store.remove('LAST_CREATURE_DESIGN_ID_KEY');
      }
      Store.setString('LAST_CREATURE_DESIGN_KEY', JSON.stringify(EVO.CreatureDesign.encode(design)));
    },
  };

  /* ================================================================== *
   * Home screen
   * ================================================================== */
  var HomeScreen = {
    show: function () {
      var self = this;
      var element = this.element;
      element.appendChild(this.buildHeader());

      var content = UI.el('div', 'home-content');

      var actions = UI.el('div', 'home-actions');
      actions.appendChild(
        this.bigButton('Create a Creature', 'Design a creature from scratch', function () {
          App.show('editor', { design: EVO.CreatureDesign.empty() });
        })
      );
      actions.appendChild(
        this.bigButton('Start Simulation', 'Evolve the current creature design', function () {
          App.show('simulation', { designId: App.currentDesignId });
        })
      );
      actions.appendChild(
        this.bigButton('My Creatures', 'Load, edit or delete your saved designs', function () {
          App.show('creatures');
        })
      );
      actions.appendChild(
        this.bigButton('Ecosystem', 'Bring several creatures into one shared world', function () {
          App.show('ecosystem');
        })
      );
      actions.appendChild(
        this.bigButton('Gallery', 'Watch the best creatures you saved', function () {
          App.show('gallery');
        })
      );
      actions.appendChild(
        this.bigButton('Custom Creatures', 'Browse evolved creatures from the cc/ folder', function () {
          App.show('custom');
        })
      );
      actions.appendChild(
        this.bigButton('Settings', 'Algorithms, network and display settings', function () {
          App.show('settings');
        })
      );
      actions.appendChild(
        this.bigButton('Help', 'Quick starts, controls and troubleshooting', function () {
          App.show('help');
        })
      );

      content.appendChild(actions);

      var info = UI.el('div', 'home-info');
      var design = App.currentDesign;
      var summary = design
        ? design.joints.length + ' joints · ' + design.bones.length + ' bones · ' + design.muscles.length + ' muscles'
        : 'No creature design loaded';
      info.appendChild(UI.el('div', 'home-info-title', 'Current design'));
      info.appendChild(UI.el('div', 'home-info-sub', summary));
      content.appendChild(info);

      element.appendChild(content);
      element.appendChild(this.buildFooter());

      void self;
    },

    buildHeader: function () {
      var header = UI.el('header', 'home-header');
      header.appendChild(UI.el('h1', 'home-title', 'EVOLUTION'));
      header.appendChild(
        UI.el(
          'p',
          'home-subtitle',
          'A sandbox simulator that demonstrates machine learning with evolutionary algorithms'
        )
      );
      return header;
    },

    buildFooter: function () {
      var footer = UI.el('footer', 'home-footer');
      footer.appendChild(
        UI.el(
          'span',
          'footer-note',
          'After Karl Sims — "Evolving Virtual Creatures". Web edition, based on the original game by Keiwan Donyagard.'
        )
      );
      return footer;
    },

    bigButton: function (title, subtitle, onClick) {
      var button = UI.el('button', 'home-button');
      button.appendChild(UI.el('span', 'home-button-title', title));
      button.appendChild(UI.el('span', 'home-button-sub', subtitle));
      button.addEventListener('click', onClick);
      return button;
    },
  };

  /* ================================================================== *
   * Creature selection screen ("My Creatures")
   * ================================================================== */
  var CreaturesScreen = {
    show: function () {
      var self = this;
      this.element.appendChild(topBar('My Creatures', function () { App.show('home'); }));

      var content = UI.el('div', 'list-content');
      var designs = Storage.getDesigns();

      if (!App.currentDesign) {
        // Only keep this in memory — writing an empty design would make the
        // editor open with an empty canvas instead of the default creature.
        App.currentDesign = EVO.CreatureDesign.empty();
      }

      content.appendChild(UI.el('div', 'list-section-title', 'Your designs'));
      if (designs.length === 0) {
        content.appendChild(UI.el('div', 'empty-note', 'You have not saved any creatures yet.'));
      }
      designs.forEach(function (entry) {
        var row = UI.el('div', 'list-row');
        var main = UI.el('div', 'list-row-main');
        var brainProfiles = Storage.getEvolvedBrainProfiles(entry);
        var brainSummary = brainProfiles.length
          ? ' · brains: ' + brainProfiles.map(function (profile) {
              return EVO.ObjectiveUtil.stringRepresentation(profile.task) + ' Gen ' + profile.generation;
            }).join(', ')
          : '';
        main.appendChild(UI.el('span', 'list-row-title', entry.name || 'Unnamed'));
        main.appendChild(
          UI.el(
            'span',
            'list-row-sub',
            entry.design.joints.length +
              ' joints · ' +
              entry.design.bones.length +
              ' bones · ' +
              entry.design.muscles.length +
              ' muscles' + brainSummary
          )
        );
        row.appendChild(main);
        row.appendChild(
          Widgets.buttonRow([
            {
              label: 'Edit',
              onClick: function () {
                App.show('editor', { design: entry.design, designId: entry.id });
              },
            },
            {
              label: 'Simulate',
              onClick: function () {
                App.chooseActionBrain(entry.design, entry.id, function (objective) {
                  return Storage.getEvolvedBrain(entry, objective);
                });
              },
            },
            {
              label: 'Delete',
              className: 'danger',
              onClick: function () {
                Modal.confirm('Delete "' + (entry.name || 'Unnamed') + '"?', function () {
                  Storage.deleteDesign(entry.id);
                  App.show('creatures');
                });
              },
            },
          ], 'compact')
        );
        content.appendChild(row);
      });

      content.appendChild(UI.el('div', 'list-section-title', 'Sample creatures'));
      EVO.DefaultCreatures.forEach(function (sample) {
        var row = UI.el('div', 'list-row');
        var main = UI.el('div', 'list-row-main');
        main.appendChild(UI.el('span', 'list-row-title', sample.name));
        main.appendChild(
          UI.el(
            'span',
            'list-row-sub',
            sample.design.joints.length +
              ' joints · ' +
              sample.design.bones.length +
              ' bones · ' +
              sample.design.muscles.length +
              ' muscles'
          )
        );
        row.appendChild(main);
        row.appendChild(
          Widgets.buttonRow([
            {
              label: 'Edit',
              onClick: function () {
                App.show('editor', { design: sample.design });
              },
            },
            {
              label: 'Simulate',
              onClick: function () {
                App.setDesign(sample.design, null);
                App.show('simulation', {});
              },
            },
          ], 'compact')
        );
        content.appendChild(row);
      });

      this.element.appendChild(content);
      void self;
    },
  };

  /** A simple top bar with a back button and a title. */
  function topBar(title, onBack, rightContent) {
    var bar = UI.el('div', 'top-bar');
    var back = UI.el('button', 'back-button');
    back.appendChild(UI.el('span', 'back-arrow', '\u2190'));
    back.appendChild(UI.el('span', null, 'Back'));
    back.addEventListener('click', onBack);
    bar.appendChild(back);
    bar.appendChild(UI.el('div', 'top-bar-title', title));
    var right = UI.el('div', 'top-bar-right');
    if (rightContent) right.appendChild(rightContent);
    bar.appendChild(right);
    return bar;
  }

  /* ================================================================== *
   * Settings screen
   * ================================================================== */
  var SettingsScreen = {
    show: function () {
      var element = this.element;
      element.appendChild(topBar('Settings', function () { App.show('home'); }));

      var content = UI.el('div', 'list-content settings-content');

      var appearance = Widgets.panel('Display');
      appearance.add(
        Widgets.dropdown({
          label: 'Theme',
          value: Settings.Theme,
          options: [
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ],
          onChange: function (value) {
            Settings.Theme = value;
            EVO.Theme.apply(Settings.Theme, true);
          },
        }).element
      );
      appearance.add(
        UI.el(
          'p',
          'panel-note theme-setting-note',
          'Changes immediately and is remembered in this browser, including canvas backgrounds and creature colours.'
        )
      );
      appearance.add(
        Widgets.toggle({
          label: 'Show muscles',
          value: Settings.ShowMuscles,
          onChange: function (value) {
            Settings.ShowMuscles = value;
          },
        }).element
      );
      appearance.add(
        Widgets.toggle({
          label: 'Show muscle contraction',
          value: Settings.ShowMuscleContraction,
          onChange: function (value) {
            Settings.ShowMuscleContraction = value;
          },
        }).element
      );
      appearance.add(
        Widgets.toggle({
          label: 'Grid in the editor',
          value: Settings.GridEnabled,
          onChange: function (value) {
            Settings.GridEnabled = value;
          },
        }).element
      );
      appearance.add(
        Widgets.slider({
          label: 'Grid visibility (simulation)',
          min: 0,
          max: 1,
          step: 0.05,
          value: Settings.DefaultGridVisibility,
          format: function (v) {
            return Math.round(v * 100) + '%';
          },
          onInput: function (value) {
            Settings.DefaultGridVisibility = value;
          },
        }).element
      );
      appearance.add(
        Widgets.slider({
          label: 'Grid visibility (flying)',
          min: 0,
          max: 1,
          step: 0.05,
          value: Settings.FlyingGridVisibility,
          format: function (v) {
            return Math.round(v * 100) + '%';
          },
          onInput: function (value) {
            Settings.FlyingGridVisibility = value;
          },
        }).element
      );
      appearance.add(
        Widgets.slider({
          label: 'Hidden creature opacity',
          min: 0,
          max: 1,
          step: 0.01,
          value: Settings.HiddenCreatureOpacity,
          format: function (v) {
            return Math.round(v * 100) + '%';
          },
          onInput: function (value) {
            Settings.HiddenCreatureOpacity = value;
          },
        }).element
      );
      content.appendChild(appearance);

      var simSettings = EVO.SimulationSettings.decode(Settings.SimulationSettings);
      var networkSettings = EVO.NeuralNetworkSettings.decode(Settings.NetworkSettings);
      content.appendChild(
        SimulationSettingsPanel.create(simSettings, networkSettings, function (updated, networkUpdated) {
          Settings.SimulationSettings = EVO.SimulationSettings.encode(updated);
          Settings.NetworkSettings = EVO.NeuralNetworkSettings.encode(networkUpdated);
        })
      );

      var saving = Widgets.panel('Saving');
      saving.add(
        Widgets.toggle({
          label: 'Auto save simulations',
          value: Settings.AutoSaveEnabled,
          onChange: function (value) {
            Settings.AutoSaveEnabled = value;
          },
        }).element
      );
      saving.add(
        Widgets.slider({
          label: 'Auto save distance',
          min: 1,
          max: 20,
          step: 1,
          value: Settings.AutoSaveDistance,
          format: function (v) {
            return 'every ' + v + (v === 1 ? ' generation' : ' generations');
          },
          onInput: function (value) {
            Settings.AutoSaveDistance = value;
          },
        }).element
      );
      content.appendChild(saving);

      var data = Widgets.panel('Data');
      data.add(
        Widgets.buttonRow([
          {
            label: 'Reset all settings',
            onClick: function () {
              Modal.confirm('Reset all settings to their defaults?', function () {
                [
                  'showMuscleContraction',
                  'SHOW_MUSCLES_KEY',
                  'SHOW_ONE_AT_ATIME_KEY',
                  'HIDDEN_CREATURE_OPACITY_KEY',
                  'DEFAULT_GRID_VISIBILITY_KEY',
                  'FLYING_GRID_VISIBILITY_KEY',
                  'GRID_ENABLED',
                  'GRID_SIZE',
                  'LANGUAGE_KEY',
                  'THEME_KEY',
                  'SHOW_ONBOARDING_KEY',
                  'AUTO_SAVE_ENABLED_KEY',
                  'AUTO_SAVE_DISTANCE_KEY',
                  'EVOLUTION_SETTINGS',
                  'NEURAL NETWORK SETTINGS',
                  'EDITOR_SETTINGS_KEY',
                ].forEach(function (key) {
                  Store.remove(key);
                });
                EVO.Theme.apply(Settings.Theme, false);
                App.show('settings');
              });
            },
          },
          {
            label: 'Delete all saves',
            className: 'danger',
            onClick: function () {
              Modal.confirm(
                'Delete all saved creatures, recordings and simulations?',
                function () {
                  Store.setJSON('designs', []);
                  Store.setJSON('recordings', []);
                  Store.setJSON('simulations', []);
                  Store.remove('LAST_CREATURE_DESIGN_KEY');
                  App.currentDesign = null;
                },
                'Delete everything'
              );
            },
          },
        ])
      );
      data.add(
        UI.el(
          'p',
          'panel-note',
          EVO.Store.available
            ? 'Your data is stored locally in this browser.'
            : 'Warning: this browser does not allow local storage for this page, so nothing can be saved.'
        )
      );
      content.appendChild(data);

      element.appendChild(content);
    },
  };

  /* ================================================================== *
   * Help screen
   * ================================================================== */
  var HelpScreen = {
    show: function () {
      var element = this.element;
      var settingsShortcut = UI.makeButton('Settings', 'small', function () {
        App.show('settings');
      });
      element.appendChild(
        topBar('Help', function () { App.show('home'); }, settingsShortcut)
      );

      var content = UI.el('div', 'list-content help-content');
      var intro = UI.el('section', 'help-intro');
      intro.appendChild(UI.el('div', 'help-eyebrow', 'Help centre'));
      intro.appendChild(UI.el('h1', 'help-heading', 'What would you like to do?'));
      intro.appendChild(
        UI.el(
          'p',
          'help-lead',
          'Start with a common task, or search the guide below. Topics are short and can be opened only when you need them.'
        )
      );
      var quickActions = UI.el('div', 'help-quick-actions');
      quickActions.appendChild(
        UI.makeButton('Start building', 'primary', function () {
          App.show('editor', { design: EVO.CreatureDesign.empty() });
        })
      );
      quickActions.appendChild(
        UI.makeButton('Browse examples', '', function () {
          App.show('creatures');
        })
      );
      quickActions.appendChild(
        UI.makeButton('Custom Creatures', '', function () {
          App.show('custom');
        })
      );
      intro.appendChild(quickActions);
      content.appendChild(intro);

      var topics = [
        {
          title: 'Your first five minutes',
          summary: 'Build a simple body, add one muscle and start an evolution run.',
          keywords: 'new beginner begin tutorial quick start',
          steps: [
            'Choose Start building above, place at least three joints and connect them with bones.',
            'Add a muscle between two different bones. A creature needs a muscle before its brain can move it.',
            'Name and save the creature, then choose Simulate.',
            'Pick Running first: it has a flat scene and makes changes easy to see.',
            'Let several generations finish, then use Save Brain when you want to keep that action.',
          ],
          tip: 'A small, balanced creature is easier to evolve than a large design with many muscles.',
        },
        {
          title: 'Designing a creature',
          summary: 'Joints, bones, muscles, wings, selection and editor shortcuts.',
          keywords: 'editor joint bone muscle wing decor erase select undo redo chord strength weight',
          paragraphs: [
            'Place joints, connect pairs with bones and connect two bones with a muscle. Select any component to edit its weight, strength or other properties in the side panel.',
            'For flight, use the Wing tool or press W and select a bone. Connect that wing to another bone with a muscle so contraction and expansion can power the stroke. Wing chord controls its effective area; Inverted reverses the powered direction.',
          ],
          bullets: [
            'Use Samples if you want a working body to study before building your own.',
            'Muscles with the same muscle id share one neural-network output.',
            'Undo and Redo cover component placement, movement and property changes.',
            'On touch screens, edit with one finger and pan or zoom with two fingers.',
          ],
        },
        {
          title: 'Choosing a task and evolving',
          summary: 'What each objective rewards and what happens between generations.',
          keywords: 'simulation run jump obstacle climb fly fitness generation population mutation task objective',
          paragraphs: [
            'Each creature in a generation receives a neural network. The best genomes are selected, recombined and mutated to make the next generation. Settings changed during a run apply to the next generation where required.',
          ],
          bullets: [
            'Running rewards horizontal distance on flat ground.',
            'Jumping rewards maximum height.',
            'Obstacle Jump rewards progress and clearing an endless course of blocks.',
            'Climbing rewards vertical progress on stairs.',
            'Flying rewards sustained airtime and average height after the initial drop.',
          ],
          tip: 'Start with the default population and mutation settings. Change one setting at a time so its effect is understandable.',
        },
        {
          title: 'Controls and shortcuts',
          summary: 'The fastest keyboard, mouse and touch controls for each screen.',
          keywords: 'keyboard mouse touch shortcut key pan zoom pause shock reset visibility editor',
          shortcuts: [
            ['Editor tools', 'V Select · J Joint · B Bone · W Wing · M Muscle · D Decor · E Erase'],
            ['Editor history', 'Ctrl/Cmd+Z Undo · Ctrl/Cmd+Shift+Z Redo · Delete removes selection'],
            ['Simulation', 'Space Pause/Resume · S Shock · V Visibility · R Reset camera'],
            ['Camera', 'Drag to pan · mouse wheel to zoom · two fingers to pan and pinch'],
            ['Dialogs', 'Escape closes a dialog or the Custom Creatures Explore panel'],
          ],
        },
        {
          title: 'Saving creatures, brains and runs',
          summary: 'Know which save option to use and avoid losing trained actions.',
          keywords: 'save brain replay run checkpoint creature export import gallery storage',
          paragraphs: [
            'A design and its action brains are related but saved separately by intent. Each action has its own brain, so saving Running does not replace Jumping, Climbing or Flying.',
          ],
          bullets: [
            'Save Brain updates only the current action on the existing My Creatures entry.',
            'Save Replay keeps a named movement recording in Gallery.',
            'Save Run stores a simulation checkpoint that can continue later.',
            'Export writes the design and all saved action brains to one compatible JSON file.',
            'Import restores a design; files carrying brains are also stored in My Creatures.',
          ],
        },
        {
          title: 'Custom Creatures',
          summary: 'Browse ready-made files, inspect their brains and copy or simulate them.',
          keywords: 'custom creatures cc json file manifest drop add copy explore rows grid',
          paragraphs: [
            'Custom Creatures reads files listed by cc/index.json when the app is served over HTTP. You can also drop a JSON creature file onto the screen or use Add file; session files do not require the manifest.',
          ],
          bullets: [
            'Explore shows the actions, generations and fitness values included in a file.',
            'Simulate runs directly from the file and does not add it to My Creatures.',
            'Copy is safe to press twice and never replaces an action brain you trained further.',
            'Use node tools/scan-cc.js after adding a repository file to refresh the manifest.',
          ],
        },
        {
          title: 'Ecosystem and Gallery',
          summary: 'Run several residents together and replay saved movement.',
          keywords: 'ecosystem residents shared world gallery recording replay playback',
          paragraphs: [
            'Ecosystem places two to six selected creatures in one shared objective scene. A saved action brain is reused when available; otherwise that resident receives a fresh exploratory brain.',
            'Gallery plays recordings of generation champions and manually saved replays. Select a recording, play or scrub it, and use the same pan and zoom gestures as the simulation.',
          ],
        },
        {
          title: 'Wing reflex and Shock',
          summary: 'Automatic flapping, AUTO FLAP and interrupting current behavior.',
          keywords: 'wing reflex auto flap shock stun flying airborne muscle',
          paragraphs: [
            'A winged creature automatically flaps while airborne or falling, so evolution does not have to discover the basic rhythm from scratch. The reflex rests on the ground and can be disabled with AUTO FLAP.',
            'Shock, or the S key, briefly pauses brains and reflexes, relaxes muscles and lets movement die down before normal behavior resumes. It is useful for seeing how a creature recovers.',
          ],
        },
        {
          title: 'Troubleshooting',
          summary: 'Fix loading, storage, performance and file problems.',
          keywords: 'problem error loading file local iphone ios storage performance slow json invalid clipboard appearance theme dark light',
          bullets: [
            'Use Settings → Display → Theme if you need a lighter or darker interface; the choice also changes canvas scenes.',
            'If the loading message remains, open a hosted HTTP or HTTPS address instead of an iOS Files preview.',
            'Keep index.html, css/, js/ and cc/ together when moving the project.',
            'If Custom Creatures cannot read cc/, serve the folder over HTTP or use Add file instead.',
            'If browser storage is unavailable, export files for anything you want to keep.',
            'For a slow simulation, reduce population size, enable batches or shorten simulation time.',
            'A rejected creature file names invalid JSON, missing references or duplicate ids in its notice.',
          ],
        },
        {
          title: 'How the brain works',
          summary: 'A concise explanation of inputs, outputs and genetic learning.',
          keywords: 'brain neural network genome input output sensor feed forward genetic algorithm technical',
          paragraphs: [
            'New brains use 11 universal inputs: ground distance, four fixed distance sensors, one rotating sensor, velocity, angular velocity, ground-contact count and creature rotation.',
            'The network has one output per unique muscle id plus an output that rotates the free sensor. Evolution changes the network weights; it does not directly script a movement.',
            'This approach follows Karl Sims’ Evolving Virtual Creatures and the original Evolution game by Keiwan Donyagard.',
          ],
        },
      ];

      var tools = UI.el('section', 'help-tools');
      var searchLabel = UI.el('label', 'help-search');
      searchLabel.appendChild(UI.el('span', 'help-search-label', 'Search help'));
      var searchInput = UI.el('input', 'help-search-input');
      searchInput.type = 'search';
      searchInput.placeholder = 'Try “save brain”, “touch” or “Custom Creatures”';
      searchInput.autocomplete = 'off';
      searchInput.setAttribute('aria-controls', 'helpTopics');
      searchLabel.appendChild(searchInput);
      tools.appendChild(searchLabel);

      var toolActions = UI.el('div', 'help-tool-actions');
      var expandAll = UI.makeButton('Expand all', 'small');
      var collapseAll = UI.makeButton('Collapse all', 'small');
      var clearSearch = UI.makeButton('Clear search', 'small');
      clearSearch.hidden = true;
      toolActions.appendChild(expandAll);
      toolActions.appendChild(collapseAll);
      toolActions.appendChild(clearSearch);
      tools.appendChild(toolActions);
      var resultStatus = UI.el('div', 'help-result-status');
      resultStatus.setAttribute('role', 'status');
      resultStatus.setAttribute('aria-live', 'polite');
      tools.appendChild(resultStatus);
      content.appendChild(tools);

      var topicHost = UI.el('div', 'help-topics');
      topicHost.id = 'helpTopics';
      var topicElements = [];

      var addList = function (host, items, ordered) {
        if (!items || !items.length) return;
        var list = UI.el(ordered ? 'ol' : 'ul', ordered ? 'help-steps' : 'help-bullets');
        items.forEach(function (text) {
          list.appendChild(UI.el('li', null, text));
        });
        host.appendChild(list);
      };

      topics.forEach(function (topic, index) {
        var details = UI.el('details', 'help-topic');
        details.open = index === 0;
        var summary = UI.el('summary', 'help-topic-summary');
        summary.appendChild(UI.el('span', 'help-topic-number', String(index + 1).padStart(2, '0')));
        var summaryCopy = UI.el('span', 'help-topic-summary-copy');
        summaryCopy.appendChild(UI.el('span', 'help-topic-title', topic.title));
        summaryCopy.appendChild(UI.el('span', 'help-topic-description', topic.summary));
        summary.appendChild(summaryCopy);
        summary.appendChild(UI.el('span', 'help-topic-marker', '+'));
        details.appendChild(summary);

        var body = UI.el('div', 'help-topic-body');
        (topic.paragraphs || []).forEach(function (text) {
          body.appendChild(UI.el('p', null, text));
        });
        addList(body, topic.steps, true);
        addList(body, topic.bullets, false);
        if (topic.shortcuts) {
          var shortcuts = UI.el('dl', 'help-shortcuts');
          topic.shortcuts.forEach(function (entry) {
            var row = UI.el('div', 'help-shortcut-row');
            row.appendChild(UI.el('dt', null, entry[0]));
            row.appendChild(UI.el('dd', null, entry[1]));
            shortcuts.appendChild(row);
          });
          body.appendChild(shortcuts);
        }
        if (topic.tip) {
          var tip = UI.el('p', 'help-tip');
          tip.appendChild(UI.el('strong', null, 'Tip: '));
          tip.appendChild(document.createTextNode(topic.tip));
          body.appendChild(tip);
        }
        details.appendChild(body);
        details.helpSearchText = [
          topic.title,
          topic.summary,
          topic.keywords,
          (topic.paragraphs || []).join(' '),
          (topic.steps || []).join(' '),
          (topic.bullets || []).join(' '),
          (topic.shortcuts || []).map(function (entry) { return entry.join(' '); }).join(' '),
        ].join(' ').toLowerCase();
        topicElements.push(details);
        topicHost.appendChild(details);
      });
      content.appendChild(topicHost);

      var noResults = UI.el('div', 'help-no-results');
      noResults.hidden = true;
      noResults.appendChild(UI.el('strong', null, 'No help topic matched that search.'));
      noResults.appendChild(
        UI.el('p', null, 'Try a shorter phrase, or clear the search and browse all topics.')
      );
      content.appendChild(noResults);

      var updateFilter = function () {
        var query = searchInput.value.trim().toLowerCase();
        var terms = query.split(/\s+/).filter(Boolean);
        var visible = 0;
        topicElements.forEach(function (topic) {
          var matches = terms.every(function (term) {
            return topic.helpSearchText.indexOf(term) >= 0;
          });
          topic.hidden = !matches;
          if (matches) {
            visible++;
            if (query) topic.open = true;
          }
        });
        clearSearch.hidden = !query;
        noResults.hidden = visible !== 0;
        resultStatus.textContent = query
          ? 'Showing ' + visible + ' of ' + topicElements.length + ' topics'
          : topicElements.length + ' help topics';
      };

      searchInput.addEventListener('input', updateFilter);
      clearSearch.addEventListener('click', function () {
        searchInput.value = '';
        updateFilter();
        searchInput.focus();
      });
      expandAll.addEventListener('click', function () {
        topicElements.forEach(function (topic) {
          if (!topic.hidden) topic.open = true;
        });
      });
      collapseAll.addEventListener('click', function () {
        topicElements.forEach(function (topic) {
          topic.open = false;
        });
      });
      updateFilter();
      element.appendChild(content);
    },
  };

  /* ================================================================== *
   * Shared simulation settings panel (used by the settings screen and the
   * simulation screen)
   * ================================================================== */
  var SimulationSettingsPanel = {
    /**
     * @param settings  SimulationSettings
     * @param networkSettings NeuralNetworkSettings
     * @param onChange  function(settings, networkSettings)
     */
    create: function (settings, networkSettings, onChange) {
      var panel = Widgets.panel('Simulation');

      var notify = function () {
        onChange(settings, networkSettings);
      };
      var batchSizeWidget = null;
      settings.BatchSize = Math.min(settings.BatchSize, settings.PopulationSize);

      panel.add(
        Widgets.dropdown({
          label: 'Task',
          numeric: true,
          value: settings.Objective,
          options: EVO.ObjectiveUtil.ALL_OBJECTIVES.map(function (objective) {
            return { value: objective, label: EVO.ObjectiveUtil.stringRepresentation(objective) };
          }),
          onChange: function (value) {
            settings.Objective = value;
            notify();
          },
        }).element
      );

      var simulationTimeWidget = Widgets.slider({
        label: 'Simulation time',
        min: 5,
        max: 60,
        step: 5,
        value: settings.SimulationTime,
        format: function (v) {
          return v + 's';
        },
        onInput: function (value) {
          settings.SimulationTime = value;
          notify();
        },
      });
      panel.add(simulationTimeWidget.element);

      panel.add(
        Widgets.slider({
          label: 'Population size',
          min: 2,
          max: 100,
          step: 1,
          value: settings.PopulationSize,
          format: function (v) {
            return v + ' creatures';
          },
          onInput: function (value) {
            settings.PopulationSize = value;
            if (settings.BatchSize > value) {
              settings.BatchSize = value;
              if (batchSizeWidget) batchSizeWidget.set(value);
            }
            notify();
          },
        }).element
      );

      panel.add(
        Widgets.toggle({
          label: 'Simulate in batches',
          value: settings.SimulateInBatches,
          onChange: function (value) {
            settings.SimulateInBatches = value;
            notify();
          },
        }).element
      );

      batchSizeWidget = Widgets.stepper({
        label: 'Batch size',
        min: 2,
        max: 50,
        value: settings.BatchSize,
        onChange: function (value) {
          settings.BatchSize = Math.min(value, settings.PopulationSize);
          batchSizeWidget.set(settings.BatchSize);
          notify();
        },
      });
      panel.add(batchSizeWidget.element);

      panel.add(
        Widgets.toggle({
          label: 'Keep best creatures',
          value: settings.KeepBestCreatures,
          onChange: function (value) {
            settings.KeepBestCreatures = value;
            notify();
          },
        }).element
      );

      panel.add(
        Widgets.slider({
          label: 'Mutation rate',
          min: 0.01,
          max: 1,
          step: 0.01,
          value: settings.MutationRate,
          format: function (v) {
            return Math.round(v * 100) + '%';
          },
          onInput: function (value) {
            settings.MutationRate = value;
            notify();
          },
        }).element
      );

      panel.add(
        Widgets.dropdown({
          label: 'Selection',
          numeric: true,
          value: settings.SelectionAlgorithm,
          options: [
            { value: 3, label: 'Rank proportional' },
            { value: 1, label: 'Fitness proportional' },
            { value: 2, label: 'Tournament' },
            { value: 0, label: 'Uniform' },
          ],
          onChange: function (value) {
            settings.SelectionAlgorithm = value;
            notify();
          },
        }).element
      );

      panel.add(
        Widgets.dropdown({
          label: 'Recombination',
          numeric: true,
          value: settings.RecombinationAlgorithm,
          options: [
            { value: 0, label: 'One point crossover' },
            { value: 1, label: 'Multi point crossover' },
            { value: 2, label: 'Uniform crossover' },
          ],
          onChange: function (value) {
            settings.RecombinationAlgorithm = value;
            notify();
          },
        }).element
      );

      panel.add(
        Widgets.dropdown({
          label: 'Mutation',
          numeric: true,
          value: settings.MutationAlgorithm,
          options: [
            { value: 1, label: 'Global' },
            { value: 0, label: 'Chunk' },
            { value: 2, label: 'Inversion' },
          ],
          onChange: function (value) {
            settings.MutationAlgorithm = value;
            notify();
          },
        }).element
      );

      /* --- Neural network ------------------------------------------- */
      var networkPanel = Widgets.panel('Neural Network');
      networkPanel.add(
        Widgets.slider({
          label: 'Hidden layers',
          min: 1,
          max: 5,
          step: 1,
          value: networkSettings.NodesPerIntermediateLayer.length,
          format: function (v) {
            return v + (v === 1 ? ' layer' : ' layers');
          },
          onInput: function (value) {
            var layers = networkSettings.NodesPerIntermediateLayer;
            while (layers.length < value) layers.push(10);
            while (layers.length > value) layers.pop();
            networkPanel.refreshLayers();
            notify();
          },
        }).element
      );

      var layerContainer = UI.el('div', 'layer-container');
      networkPanel.add(layerContainer);
      networkPanel.refreshLayers = function () {
        UI.clear(layerContainer);
        networkSettings.NodesPerIntermediateLayer.forEach(function (_, index) {
          layerContainer.appendChild(
            Widgets.slider({
              label: 'Nodes in layer ' + (index + 1),
              min: 1,
              max: 100,
              step: 1,
              value: networkSettings.NodesPerIntermediateLayer[index],
              format: function (v) {
                return v + ' nodes';
              },
              onInput: function (value) {
                networkSettings.NodesPerIntermediateLayer[index] = value;
                notify();
              },
            }).element
          );
        });
      };
      networkPanel.refreshLayers();

      var container = UI.el('div', 'settings-panels');
      container.appendChild(panel);
      container.appendChild(networkPanel);
      container.setSimulationTime = function (value) {
        simulationTimeWidget.set(value);
      };
      return container;
    },
  };

  EVO.Widgets = Widgets;
  EVO.Modal = Modal;
  EVO.Storage = Storage;
  EVO.App = App;
  EVO.Screens = EVO.Screens || {};
  EVO.Screens.home = HomeScreen;
  EVO.Screens.creatures = CreaturesScreen;
  EVO.Screens.settings = SettingsScreen;
  EVO.Screens.help = HelpScreen;
  EVO.SimulationSettingsPanel = SimulationSettingsPanel;
  EVO.makeId = makeId;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = EVO;
  }
})(typeof window !== 'undefined' ? window : globalThis);
