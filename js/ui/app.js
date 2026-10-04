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
      panel.clear = function () {
        UI.clear(body);
      };
      return panel;
    },

    /** A small key/value line, used by information panels. */
    infoRow: function (label, value, className) {
      var row = UI.el('div', 'info-row' + (className ? ' ' + className : ''));
      row.appendChild(UI.el('span', 'info-label', label));
      row.appendChild(UI.el('span', 'info-value', value === undefined || value === null ? '—' : String(value)));
      return row;
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
   * Files (export and import)
   * ================================================================== */
  var Files = {
    /** Offers a JSON (or text) string as a download. */
    download: function (filename, text, type) {
      var blob = new Blob([text], { type: type || 'application/json' });
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(function () {
        URL.revokeObjectURL(url);
      }, 1000);
    },

    /** Shows a file picker and hands the text of the chosen file back. */
    open: function (accept, onLoaded) {
      var input = UI.el('input');
      input.type = 'file';
      input.accept = accept || 'application/json,.json';
      input.style.display = 'none';
      input.addEventListener('change', function () {
        var file = input.files && input.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          onLoaded(String(reader.result), file.name);
        };
        reader.onerror = function () {
          Modal.alert('The file could not be read.', 'Import failed');
        };
        reader.readAsText(file);
      });
      document.body.appendChild(input);
      input.click();
      setTimeout(function () {
        if (input.parentNode) input.parentNode.removeChild(input);
      }, 1000);
    },
  };

  /* ================================================================== *
   * Storage of designs, recordings and simulations
   * ================================================================== */
  function makeId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
  }

  /** Human readable byte sizes. */
  function formatBytes(bytes) {
    if (!isFinite(bytes) || bytes <= 0) return '0 KB';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
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

    /* --- Everything at once ----------------------------------------- */
    /** Readable names for the keys that the game stores. */
    keyDescription: function (key) {
      var names = {
        designs: 'saved creatures',
        recordings: 'gallery recordings',
        simulations: 'saved simulations',
        LAST_CREATURE_DESIGN_KEY: 'the creature you are working on',
        EVOLUTION_SETTINGS: 'evolution settings',
        'NEURAL NETWORK SETTINGS': 'network settings',
        EDITOR_SETTINGS_KEY: 'editor settings',
      };
      return names[key] || key;
    },

    /** Everything the game keeps, as one portable document. */
    exportAll: function () {
      var data = {};
      Store.keys().forEach(function (key) {
        var value = Store.getString(key, null);
        if (value === null || value === undefined) return;
        data[key] = value;
      });
      return {
        format: 'evolution-web-backup',
        version: 1,
        createdAt: new Date().toISOString(),
        data: data,
      };
    },

    /** Writes a document created by `exportAll` back into the storage. */
    importAll: function (backup, overwrite) {
      if (!backup || typeof backup !== 'object' || !backup.data) {
        throw new Error('This file does not contain an Evolution backup.');
      }
      var data = backup.data;
      var imported = [];
      Object.keys(data).forEach(function (key) {
        if (!overwrite && Store.getString(key, null) !== null) return;
        Store.setString(key, data[key]);
        imported.push(key);
      });
      return imported;
    },

    downloadBackup: function () {
      Files.download('evolution-backup.json', JSON.stringify(this.exportAll(), null, 2));
    },

    /** How much of the data is mirrored into cookies. */
    backupReport: function () {
      var coverage = Store.cookieCoverage();
      var status = Store.mirrorStatus();
      var tooBig = [];
      var partial = [];
      Object.keys(status).forEach(function (key) {
        if (status[key] === 'too-big') tooBig.push(key);
        if (status[key] === 'partial') partial.push(key);
      });
      return {
        coverage: coverage,
        tooBig: tooBig,
        partial: partial,
        usage: Store.cookieUsage(),
        bytes: Store.usage(),
      };
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

    /** Names of the screens, used by the "continue" card. */
    SCREEN_TITLES: {
      home: 'Home',
      editor: 'Creature editor',
      creatures: 'My creatures',
      simulation: 'Simulation',
      gallery: 'Gallery',
      settings: 'Settings',
      help: 'Help',
    },

    start: function () {
      this.root = document.getElementById('screens');
      if (!this.root) {
        this.root = document.body;
      }
      this.loadLastDesign();
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

      this.currentName = name;
      this.current = screen;
      screen.element = UI.el('div', 'screen screen-' + name);
      this.root.appendChild(screen.element);
      screen.element.classList.add('visible');
      if (screen.show) screen.show(params || {});
      if (screen.resize) screen.resize();

      // Remember where the game was left so that the home screen can offer
      // to continue there (see the "Remember where I left off" setting).
      if (Settings.RememberLastScreen) {
        Settings.LastScreen = name;
        Settings.LastScreenTitle = this.SCREEN_TITLES[name] || name;
      }
    },

    /** Loads the creature that was edited last, if there is one. */
    loadLastDesign: function () {
      var stored = Settings.LastCreatureDesign;
      if (!stored) return null;
      try {
        this.currentDesign = EVO.CreatureDesign.decode(JSON.parse(stored));
      } catch (error) {
        this.currentDesign = null;
      }
      return this.currentDesign;
    },

    /** The screen to offer on the home screen, or null. */
    resumableScreen: function () {
      if (!Settings.RememberLastScreen) return null;
      var name = Settings.LastScreen;
      if (!name || name === 'home') return null;
      if (name !== 'editor' && name !== 'creatures' && name !== 'gallery') return null;
      if (!EVO.Screens[name]) return null;
      return {
        name: name,
        title: Settings.LastScreenTitle || this.SCREEN_TITLES[name] || name,
      };
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

      var resume = this.buildResumeCard();
      if (resume) content.appendChild(resume);

      var info = UI.el('div', 'home-info');
      var design = App.currentDesign;
      var summary = design
        ? (design.name ? design.name + ' — ' : '') +
          design.joints.length + ' joints · ' + design.bones.length + ' bones · ' + design.muscles.length + ' muscles'
        : 'No creature design loaded';
      info.appendChild(UI.el('div', 'home-info-title', 'Current design'));
      info.appendChild(UI.el('div', 'home-info-sub', summary));
      content.appendChild(info);

      var storageNote = UI.el('div', 'home-storage-note');
      storageNote.appendChild(
        UI.el('span', 'footer-note', HomeScreen.storageSummary())
      );
      content.appendChild(storageNote);

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

    /** The "continue where you left off" card. */
    buildResumeCard: function () {
      var screen = App.resumableScreen();
      if (!screen) return null;
      var card = UI.el('div', 'home-resume');
      var main = UI.el('div', 'home-resume-main');
      main.appendChild(UI.el('div', 'home-resume-title', 'Continue where you left off'));
      main.appendChild(UI.el('div', 'home-resume-sub', screen.title));
      card.appendChild(main);
      var button = UI.el('button', 'evo-button primary', 'Resume');
      button.addEventListener('click', function () {
        App.show(screen.name, screen.name === 'editor' ? { design: null } : {});
      });
      card.appendChild(button);
      var dismiss = UI.el('button', 'home-resume-dismiss', '\u00D7');
      dismiss.title = 'Hide';
      dismiss.addEventListener('click', function () {
        Settings.LastScreen = 'home';
        if (card.parentNode) card.parentNode.removeChild(card);
      });
      card.appendChild(dismiss);
      return card;
    },

    /** One line about where the data of this game is kept. */
    storageSummary: function () {
      if (Store.backend === 'memory') {
        return 'This browser does not allow any storage, so nothing is kept — use Export to save your creatures as files.';
      }
      var report = Storage.backupReport();
      var text = Store.backend === 'localStorage' ? 'Saved in this browser' : 'Saved in cookies';
      text += ' · ' + formatBytes(report.bytes);
      if (Store.cookieAvailable && Settings.CookieBackup) {
        text +=
          ' · cookie backup: ' + report.coverage.backed + ' of ' + report.coverage.total + ' entries';
      } else if (!Store.cookieAvailable) {
        text += ' · cookies are unavailable, use Export for a backup';
      }
      return text;
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
      saving.add(
        Widgets.toggle({
          label: 'Remember where I left off',
          value: Settings.RememberLastScreen,
          onChange: function (value) {
            Settings.RememberLastScreen = value;
          },
        }).element
      );
      saving.add(
        UI.el(
          'p',
          'panel-note',
          'The creature you are working on is saved continuously, so it is still there after a reload.'
        )
      );
      content.appendChild(saving);

      /* --- Storage & cookies ---------------------------------------- */
      var storage = Widgets.panel('Storage & cookies');
      content.appendChild(storage);

      var refreshStorage = function () {
        storage.clear();
        var report = Storage.backupReport();
        var backendLabel =
          Store.backend === 'localStorage'
            ? 'Browser storage (localStorage)'
            : Store.backend === 'cookies'
            ? 'Cookies (no browser storage)'
            : 'This session only — nothing is kept';

        storage.add(Widgets.infoRow('Kept in', backendLabel));
        storage.add(
          Widgets.infoRow(
            'Your data',
            formatBytes(report.bytes) + ' · ' + report.coverage.total + ' entries'
          )
        );
        storage.add(
          Widgets.infoRow(
            'Cookies',
            Store.cookieAvailable
              ? report.usage.cookies +
                  ' of ' +
                  report.usage.maxCookies +
                  ' · ' +
                  formatBytes(report.usage.bytes) +
                  ' (' +
                  Store.cookieBudgetLabel() +
                  ')'
              : 'not available in this browser'
          )
        );

        if (Settings.CookieBackup && Store.cookieAvailable) {
          storage.add(
            Widgets.toggle({
              label: 'Keep a copy in cookies',
              value: true,
              onChange: function (value) {
                Settings.CookieBackup = value;
                if (value) {
                  Store.backupToCookies();
                  refreshStorage();
                  return;
                }
                Modal.open({
                  title: 'Stop keeping a copy in cookies?',
                  message:
                    'Your creatures and settings are then only kept in the storage of this browser. ' +
                    'The cookies that were already written stay until you clear them.',
                  actions: [
                    {
                      label: 'Keep backing up',
                      onClick: function () {
                        Settings.CookieBackup = true;
                        refreshStorage();
                      },
                    },
                    {
                      label: 'Turn off',
                      primary: true,
                      onClick: function () {
                        refreshStorage();
                      },
                    },
                  ],
                });
              },
            }).element
          );
          storage.add(
            Widgets.dropdown({
              label: 'Cookie budget',
              value: Store.cookieBudget(),
              options: Object.keys(EVO.COOKIE_BUDGETS).map(function (key) {
                return { value: key, label: EVO.COOKIE_BUDGETS[key].label };
              }),
              onChange: function (value) {
                Settings.CookieBudget = value;
                Store.setCookieBudget(value);
                refreshStorage();
              },
            }).element
          );
          storage.add(
            Widgets.buttonRow([
              {
                label: 'Back up now',
                onClick: function () {
                  var result = Store.backupToCookies();
                  refreshStorage();
                  var message =
                    result.copied + ' entries were copied into cookies.' +
                    (result.partial.length ? ' ' + result.partial.length + ' only partly (the newest entries).' : '') +
                    (result.skipped.length ? ' ' + result.skipped.length + ' did not fit.' : '');
                  Modal.alert(message, 'Cookie backup');
                },
              },
              {
                label: 'Restore',
                onClick: function () {
                  Modal.confirm(
                    'Replace the data in this browser with the copy that is kept in cookies?',
                    function () {
                      var count = Store.restoreFromCookies(true);
                      App.loadLastDesign();
                      refreshStorage();
                      Modal.alert(count + ' entries were restored from the cookies.', 'Restored');
                    },
                    'Restore'
                  );
                },
              },
              {
                label: 'Clear cookies',
                className: 'danger',
                onClick: function () {
                  Modal.confirm(
                    'Delete the cookie copy of your creatures, recordings and settings?',
                    function () {
                      Store.clearCookies();
                      refreshStorage();
                    },
                    'Clear'
                  );
                },
              },
            ], 'compact')
          );
        } else {
          storage.add(
            Widgets.toggle({
              label: 'Keep a copy in cookies',
              value: false,
              onChange: function (value) {
                Settings.CookieBackup = value;
                if (value) {
                  Store.backupToCookies();
                }
                refreshStorage();
              },
            }).element
          );
        }

        storage.add(
          Widgets.buttonRow([
            {
              label: 'Export all data',
              onClick: function () {
                Storage.downloadBackup();
                Modal.alert(
                  'A file with all of your creatures, recordings, simulations and settings was downloaded.',
                  'Exported'
                );
              },
            },
            {
              label: 'Import a backup',
              onClick: function () {
                Files.open('application/json,.json', function (text) {
                  var backup;
                  try {
                    backup = JSON.parse(text);
                  } catch (error) {
                    Modal.alert('That file is not valid JSON.', 'Import failed');
                    return;
                  }
                  if (!backup || !backup.data) {
                    Modal.alert('That file does not contain an Evolution backup.', 'Import failed');
                    return;
                  }
                  var keys = Object.keys(backup.data);
                  Modal.open({
                    title: 'Import backup',
                    message:
                      'The backup contains ' +
                      keys.length +
                      ' entries (creatures, recordings, simulations and settings).',
                    actions: [
                      { label: 'Cancel' },
                      {
                        label: 'Add to my data',
                        onClick: function () {
                          var imported = Storage.importAll(backup, false);
                          App.loadLastDesign();
                          Modal.alert(imported.length + ' entries were added.', 'Imported');
                          App.show('settings');
                        },
                      },
                      {
                        label: 'Replace everything',
                        primary: true,
                        onClick: function () {
                          var imported = Storage.importAll(backup, true);
                          App.loadLastDesign();
                          Modal.alert(imported.length + ' entries were restored.', 'Imported');
                          App.show('settings');
                        },
                      },
                    ],
                  });
                });
              },
            },
          ], 'compact')
        );

        var notes = [];
        if (!Store.cookieAvailable) {
          notes.push(
            'This browser does not allow cookies for this page, so nothing can be kept outside of the browser storage.'
          );
        } else if (Settings.CookieBackup) {
          if (report.coverage.missing.length) {
            notes.push(
              'Not in the cookie backup: ' +
                report.coverage.missing
                  .map(function (key) {
                    return Storage.keyDescription(key);
                  })
                  .join(', ') +
                '.'
            );
          }
          if (report.partial.length) {
            notes.push(
              'Only the newest entries of ' +
                report.partial
                  .map(function (key) {
                    return Storage.keyDescription(key);
                  })
                  .join(', ') +
                ' fit into the cookies.'
            );
          }
          if (Store.backend === 'cookies') {
            notes.push('Cookies are the only storage of this browser — keep the backup file as well.');
          }
        } else if (Store.cookieAvailable) {
          notes.push(
            'The cookie copy is turned off, so your data is only kept in the storage of this browser.'
          );
        }
        if (Store.quotaExceeded) {
          notes.push('The last change did not fit into the storage — export a backup and delete old recordings.');
        }
        if (!notes.length) {
          notes.push('Everything you saved is also kept in the cookies of this browser.');
        }
        notes.push(
          'Cookies are small (a few kilobytes each). Use "Export all data" for a backup that keeps everything.'
        );
        notes.forEach(function (note) {
          storage.add(UI.el('p', 'panel-note', note));
        });
      };
      refreshStorage();

      var data = Widgets.panel('Data');
      data.add(
        Widgets.buttonRow([
          {
            label: 'Reset all settings',
            onClick: function () {
              Modal.confirm(
                'Reset all settings to their defaults? Your creatures, recordings and simulations are kept.',
                function () {
                  Settings.reset();
                  App.show('settings');
                },
                'Reset settings'
              );
            },
          },
          {
            label: 'Delete all saves',
            className: 'danger',
            onClick: function () {
              Modal.confirm(
                'Delete all saved creatures, recordings and simulations — in the browser and in the cookies?',
                function () {
                  Store.setJSON('designs', []);
                  Store.setJSON('recordings', []);
                  Store.setJSON('simulations', []);
                  refreshStorage();
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
          Store.available
            ? 'Your data never leaves this browser: it is stored locally' +
              (Store.cookieAvailable ? ', with a copy in the cookies of this page.' : '.')
            : 'Warning: this browser does not allow storage for this page, so nothing can be saved. Use Export to keep your creatures as files.'
        )
      );
      content.appendChild(data);

      element.appendChild(content);
    },
  };

  /* ================================================================== *
   * Help screen
   *
   * The content of the help area lives in js/ui/help.js — it is a small
   * manual of everything in the game.
   * ================================================================== */

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
  EVO.Files = Files;
  EVO.App = App;
  EVO.Screens = EVO.Screens || {};
  EVO.Screens.home = HomeScreen;
  EVO.Screens.creatures = CreaturesScreen;
  EVO.Screens.settings = SettingsScreen;
  EVO.SimulationSettingsPanel = SimulationSettingsPanel;
  EVO.makeId = makeId;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = EVO;
  }
})(typeof window !== 'undefined' ? window : globalThis);
