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
    var name = EVO.ObjectiveUtil.stringRepresentation(objective).replace(/[^a-z0-9]/gi, '');
    return name ? name.charAt(0).toLowerCase() + name.substr(1) : 'running';
  }

  var Storage = {
    getDesigns: function () {
      var designs = Store.getJSON('designs', []);
      return designs.map(function (entry) {
        entry.design = EVO.CreatureDesign.decode(entry.design);
        return entry;
      });
    },

    saveDesign: function (design, existingId) {
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
      if (!replaced) designs.unshift(entry);
      Store.setJSON('designs', designs);
      return entry.id;
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
        this.bigButton('Settings', 'Algorithms, network and display settings', function () {
          App.show('settings');
        })
      );
      actions.appendChild(
        this.bigButton('Help', 'How the simulation works', function () {
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
                var actions = EVO.ObjectiveUtil.ALL_OBJECTIVES.map(function (objective) {
                  var profile = Storage.getEvolvedBrain(entry, objective);
                  var actionName = EVO.ObjectiveUtil.stringRepresentation(objective);
                  return {
                    label: profile
                      ? actionName + ' · saved Gen ' + profile.generation
                      : 'Train ' + actionName + ' brain',
                    primary: !!profile,
                    onClick: function () {
                      App.setDesign(entry.design, entry.id);
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
                        EVO.CreatureDesign.clone(entry.design),
                        scene
                      );
                      data.LibraryCreatureId = entry.id;
                      if (profile && profile.chromosome && profile.chromosome.length) {
                        data.CurrentChromosomes = [profile.chromosome.slice()];
                        data.LastV2SimulatedGeneration = profile.lastV2SimulatedGeneration || 0;
                      }
                      App.show('simulation', { data: data, designId: entry.id });
                    },
                  };
                });
                Modal.open({
                  title: 'Choose an action brain',
                  message: 'Choose a task to train, or continue from that task’s saved brain. Saving a brain replaces only that task and updates its best-generation replay.',
                  actions: actions.concat([{ label: 'Cancel' }]),
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
                  'SHOW_ONBOARDING_KEY',
                  'AUTO_SAVE_ENABLED_KEY',
                  'AUTO_SAVE_DISTANCE_KEY',
                  'EVOLUTION_SETTINGS',
                  'NEURAL NETWORK SETTINGS',
                  'EDITOR_SETTINGS_KEY',
                ].forEach(function (key) {
                  Store.remove(key);
                });
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
      element.appendChild(topBar('Help', function () { App.show('home'); }));
      var content = UI.el('div', 'list-content help-content');

      var sections = [
        {
          title: 'What is this?',
          body:
            'Evolution is a simulator that lets you design a creature out of joints, bones and muscles, ' +
            'and then evolves a neural network that teaches it to walk, jump, climb or fly. ' +
            'It is based on Karl Sims\' "Evolving Virtual Creatures" and on the original game by Keiwan Donyagard.',
        },
        {
          title: 'Designing a creature',
          body:
            'Place joints with the joint tool, connect them with bones and add muscles between two bones. ' +
            'Muscles contract or expand depending on the output of the creature\'s brain. ' +
            'Use the Wing tool, or press W, then tap a bone to mark it as a wing; tap it again to remove the wing. Connect each wing to another bone with a muscle so contraction and expansion can power its flap. Use the settings panel to change weights and muscle strengths, adjust wing chord, and invert the powered stroke.',
        },
        {
          title: 'How the evolution works',
          body:
            'Every generation consists of a population of creatures. Each creature\'s brain is a small ' +
            'feed forward neural network whose weights are the creature\'s genome. After each generation the ' +
            'best creatures are selected and their genomes are recombined and mutated to form the next generation. ' +
            'The fitness function depends on the task: running rewards horizontal distance, jumping the maximum ' +
            'height, climbing the vertical distance, flying sustained time above the ground and average height, ' +
            'and the obstacle jump rewards clearing an endless course of progressively larger blocks.',
        },
        {
          title: 'Brain inputs',
          body:
            'New simulations use the universal brain with 11 inputs: the distance to the ground, four distance ' +
            'sensors (forward, down-forward, down-back, back), one freely rotating sensor, the velocity, the ' +
            'angular velocity, the number of joints touching the ground and the rotation of the creature. ' +
            'Additionally, the network has one output per unique muscle id (muscles sharing an id are ' +
            'controlled together).',
        },
        {
          title: 'Wing reflex and shock',
          body:
            'Creatures with wings automatically know to flap: while a winged creature is airborne or falling, ' +
            'a built-in reflex drives its wing muscles through rhythmic downstrokes, so it does not have to ' +
            'evolve flapping from scratch. The reflex rests while the creature stands on the ground and can be ' +
            'switched off with the AUTO FLAP toggle in the simulation HUD. The Shock button (or the S key) ' +
            'startles the creatures and interrupts whatever they are doing right now: their brains and reflexes ' +
            'pause, their muscles relax and their motion dies down for a moment before normal behaviour resumes.',
        },
        {
          title: 'Keyboard, mouse and touch',
          body:
            'Drag with the left mouse button to pan, use the scroll wheel or a pinch gesture to zoom. ' +
            'On touch screens, drag with one finger to pan and use two fingers to pan and zoom. In the editor, ' +
            'drag from one joint to another to create a bone and from one bone to another to create a muscle. ' +
            'Use the Pause/Resume button or the space bar to pause and continue the simulation, and press S ' +
            '(or use the Shock button) to shock the creatures and interrupt their current behaviour.',
        },
        {
          title: 'Gallery',
          body:
            'Whenever a generation is evaluated, a recording of the best creature is kept. You can play back the ' +
            'best creatures of all previous generations and save your favourites to the gallery.',
        },
      ];

      sections.forEach(function (section) {
        var panel = Widgets.panel(section.title);
        panel.add(UI.el('p', 'panel-note', section.body));
        content.appendChild(panel);
      });

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
