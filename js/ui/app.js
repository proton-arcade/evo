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
          button.addEventListener('click', function () {
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
          designs[i] = entry;
          replaced = true;
          break;
        }
      }
      if (!replaced) designs.unshift(entry);
      Store.setJSON('designs', designs);
      return entry.id;
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

    saveRecording: function (recording) {
      var recordings = Store.getJSON('recordings', []);
      var entry = {
        id: makeId(),
        generation: recording.generation,
        task: recording.task,
        date: new Date().toISOString(),
        fitness: recording.stats.unclampedFitness,
        recording: EVO.CreatureRecording.encode(recording),
      };
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

    register: function (name, screen) {
      EVO.Screens = EVO.Screens || {};
      EVO.Screens[name] = screen;
    },

    start: function () {
      this.root = document.getElementById('screens');
      if (!this.root) {
        this.root = document.body;
      }
      this.show('home');
      window.addEventListener('resize', function () {
        if (App.current && App.current.resize) App.current.resize();
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

    setDesign: function (design) {
      this.currentDesign = design;
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
          App.show('editor', { design: null });
        })
      );
      actions.appendChild(
        this.bigButton('Start Simulation', 'Evolve the current creature design', function () {
          App.show('simulation', {});
        })
      );
      actions.appendChild(
        this.bigButton('My Creatures', 'Load, edit or delete your saved designs', function () {
          App.show('creatures');
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
              ' muscles'
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
                App.setDesign(entry.design);
                App.show('simulation', {});
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
                App.setDesign(sample.design);
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

      var algorithms = Widgets.panel('Evolution');
      var simSettings = EVO.SimulationSettings.decode(Settings.SimulationSettings);
      var networkSettings = EVO.NeuralNetworkSettings.decode(Settings.NetworkSettings);
      content.appendChild(algorithms);
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
            'Use the settings panel to change weights, muscle strengths and to mark bones as wings.',
        },
        {
          title: 'How the evolution works',
          body:
            'Every generation consists of a population of creatures. Each creature\'s brain is a small ' +
            'feed forward neural network whose weights are the creature\'s genome. After each generation the ' +
            'best creatures are selected and their genomes are recombined and mutated to form the next generation. ' +
            'The fitness function depends on the task: running rewards horizontal distance, jumping the maximum ' +
            'height, climbing the vertical distance, flying the time spent above the ground and the height, ' +
            'and the obstacle jump rewards jumping over the rolling obstacles without touching them.',
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
          title: 'Keyboard and mouse',
          body:
            'Drag with the left mouse button to pan, use the scroll wheel or a pinch gesture to zoom. ' +
            'In the editor, drag from one joint to another to create a bone and from one bone to another to ' +
            'create a muscle. The space bar pauses the simulation.',
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

      panel.add(
        Widgets.slider({
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
        }).element
      );

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
            if (settings.BatchSize > value) settings.BatchSize = value;
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

      panel.add(
        Widgets.stepper({
          label: 'Batch size',
          min: 2,
          max: 50,
          value: settings.BatchSize,
          onChange: function (value) {
            settings.BatchSize = value;
            notify();
          },
        }).element
      );

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
