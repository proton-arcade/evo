/*
 * Evolution (Web Edition) — ui/custom.js
 * ---------------------------------------------------------------
 * The Custom Creatures screen: the creature files kept in cc/ (or dropped onto
 * the page), laid out like a streaming catalogue — a featured creature on
 * top, then horizontal rows of posters, and a slide-in panel to explore one.
 *
 * Reading, checking, grouping and copying live in core/customLibrary.js; the
 * pictures come from render/viewModel.js. This file is the DOM around them.
 */
(function (global) {
  'use strict';

  var EVO = (global.EVO = global.EVO || {});
  var UI = EVO.UI;
  var Modal = EVO.Modal;
  var Storage = EVO.Storage;
  var App = EVO.App;
  var Lib = EVO.CustomLibrary;
  var ViewModel = EVO.ViewModel;

  var ROTATE_MS = 5000;
  var MAX_FEATURED = 6;
  var MAX_FILE_BYTES = 8 * 1024 * 1024;
  var VIEW_KEY = 'CUSTOM_CREATURES_VIEW';
  var PANEL_MS = 220;

  /* Files dropped onto the screen live for as long as the page is open. */
  var droppedEntries = {};
  var droppedFailures = {};

  /* ------------------------------------------------------------------ *
   * Small helpers
   * ------------------------------------------------------------------ */
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var ICONS = {
    play: 'M8 5v14l11-7z',
    copy: 'M16 1H4a2 2 0 0 0-2 2v14h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2zm0 16H8V7h11v14z',
    explore: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z',
    back: 'M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z',
    file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 7V3.5L18.5 9H13z',
  };

  function icon(name, size) {
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', String(size || 22));
    svg.setAttribute('height', String(size || 22));
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    var path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', ICONS[name]);
    path.setAttribute('fill', 'currentColor');
    svg.appendChild(path);
    return svg;
  }

  function brainKeyFor(objective) {
    return EVO.BrainProfile.keyForObjective(objective);
  }

  function plural(count, noun) {
    return count + ' ' + noun + (count === 1 ? '' : 's');
  }

  function readFileText(file) {
    if (typeof file.text === 'function') return file.text();
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        resolve(String(reader.result));
      };
      reader.onerror = function () {
        reject(reader.error || new Error('the file could not be read'));
      };
      reader.readAsText(file);
    });
  }

  function reducedMotion() {
    return !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  /* ------------------------------------------------------------------ *
   * The screen
   * ------------------------------------------------------------------ */
  var CustomScreen = {
    show: function () {
      var self = this;
      this.disposed = false;
      this.loadToken = 0;
      this.status = 'loading'; // loading | ok | failed
      this.statusMessage = '';
      this.manifestEntries = [];
      this.manifestFailures = [];
      this.entries = [];
      this.featuredIndex = 0;
      this.posters = [];
      this.hover = false;
      this.focusWithin = false;
      this.detailsEntry = null;
      this.view = EVO.Store.getString(VIEW_KEY, 'rows') === 'grid' ? 'grid' : 'rows';

      this.buildLayout();
      this.attachEvents();
      this.render();
      this.loadManifest();
      void self;
    },

    hide: function () {
      this.disposed = true;
      this.loadToken++;
      this.stopRotation();
      clearTimeout(this.toastTimer);
      clearTimeout(this.panelTimer);
      this.detachEvents();
      this.posters = [];
      this.hero = null;
    },

    /* --- layout ------------------------------------------------------- */
    buildLayout: function () {
      var self = this;
      var element = this.element;

      var actions = UI.el('div', 'cc-bar-actions');
      this.addButton = UI.makeButton('Add file', '', function () {
        self.fileInput.click();
      });
      this.refreshButton = UI.makeButton('Refresh', '', function () {
        self.loadManifest();
      });
      actions.appendChild(this.addButton);
      actions.appendChild(this.refreshButton);
      this.topBar = this.makeTopBar(actions);
      element.appendChild(this.topBar);

      this.fileInput = UI.el('input');
      this.fileInput.type = 'file';
      this.fileInput.accept = '.json,application/json';
      this.fileInput.multiple = true;
      this.fileInput.hidden = true;
      this.fileInput.addEventListener('change', function () {
        self.addFiles(self.fileInput.files);
        self.fileInput.value = '';
      });
      element.appendChild(this.fileInput);

      this.scroll = UI.el('div', 'cc-scroll');
      this.scroll.appendChild(
        UI.el('div', 'cc-dropzone-hint', 'Drop a creature file anywhere, or use Add file')
      );
      this.noticesEl = UI.el('div', 'cc-notices');
      this.heroHost = UI.el('div', 'cc-hero-host');
      this.toolbarEl = UI.el('div', 'cc-toolbar');
      this.rowsEl = UI.el('div');
      this.rowsEl.id = 'ccRows';
      this.emptyEl = UI.el('div', 'empty-state');
      this.emptyEl.hidden = true;
      [this.noticesEl, this.heroHost, this.toolbarEl, this.rowsEl, this.emptyEl].forEach(function (node) {
        self.scroll.appendChild(node);
      });
      element.appendChild(this.scroll);

      this.buildDetails();

      this.toast = UI.el('div', 'cc-toast');
      this.toast.setAttribute('role', 'status');
      this.toast.setAttribute('aria-live', 'polite');
      this.toast.setAttribute('aria-atomic', 'true');
      element.appendChild(this.toast);
    },

    makeTopBar: function (rightContent) {
      // Same bar as every other screen: back button, title, then our actions.
      var bar = UI.el('div', 'top-bar');
      var back = UI.el('button', 'back-button');
      back.appendChild(UI.el('span', 'back-arrow', '\u2190'));
      back.appendChild(UI.el('span', null, 'Back'));
      back.addEventListener('click', function () {
        App.show('home');
      });
      bar.appendChild(back);
      bar.appendChild(UI.el('div', 'top-bar-title', 'Custom Creatures'));
      var right = UI.el('div', 'top-bar-right');
      right.appendChild(rightContent);
      bar.appendChild(right);
      return bar;
    },

    buildDetails: function () {
      var self = this;
      var panel = UI.el('div');
      panel.id = 'ccDetails';
      panel.hidden = true;
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-modal', 'true');

      var header = UI.el('header');
      this.detailsBack = UI.el('button', 'cc-icon-button');
      this.detailsBack.setAttribute('aria-label', 'Back to Custom Creatures');
      this.detailsBack.appendChild(icon('back', 24));
      this.detailsBack.addEventListener('click', function () {
        self.closeDetails();
      });
      header.appendChild(this.detailsBack);
      header.appendChild(UI.el('h1', null, 'Explore'));
      panel.appendChild(header);

      var main = UI.el('main');
      var cover = UI.el('div', 'details-cover');
      this.detailsCanvas = UI.el('canvas', 'details-canvas');
      this.detailsCanvas.setAttribute('aria-hidden', 'true');
      cover.appendChild(this.detailsCanvas);
      cover.appendChild(UI.el('div', 'background'));
      this.detailsTitle = UI.el('h2');
      this.detailsTitle.id = 'ccDetailsTitle';
      cover.appendChild(this.detailsTitle);
      panel.setAttribute('aria-labelledby', 'ccDetailsTitle');
      main.appendChild(cover);

      var body = UI.el('div', 'details-body');
      this.detailsSub = UI.el('p', 'sub');
      this.detailsTags = UI.el('div', 'tag-row');
      this.detailsNotes = UI.el('div');
      var actions = UI.el('div', 'details-actions');
      var copyJson = UI.el('button', 'ghost', 'Copy JSON');
      copyJson.addEventListener('click', function () {
        if (self.detailsEntry) self.copyJson(self.detailsEntry);
      });
      var copyToMine = UI.el('button', 'ghost', 'Copy to My Creatures');
      copyToMine.addEventListener('click', function () {
        if (self.detailsEntry) self.copyToMyCreatures(self.detailsEntry);
      });
      actions.appendChild(copyJson);
      actions.appendChild(copyToMine);
      body.appendChild(this.detailsSub);
      body.appendChild(this.detailsTags);
      body.appendChild(this.detailsNotes);
      body.appendChild(actions);
      main.appendChild(body);
      panel.appendChild(main);

      var footer = UI.el('footer');
      var simulate = UI.el('button', 'play-cta', 'Simulate');
      simulate.addEventListener('click', function () {
        if (self.detailsEntry) self.simulate(self.detailsEntry);
      });
      footer.appendChild(simulate);
      panel.appendChild(footer);

      this.details = panel;
      this.element.appendChild(panel);
    },

    /* --- events ------------------------------------------------------- */
    attachEvents: function () {
      var self = this;
      var dragDepth = 0;
      var hasFiles = function (event) {
        var types = event.dataTransfer && event.dataTransfer.types;
        return !!types && Array.prototype.indexOf.call(types, 'Files') >= 0;
      };

      this.onDragEnter = function (event) {
        if (!hasFiles(event)) return;
        event.preventDefault();
        dragDepth++;
        self.element.classList.add('drop-active');
      };
      this.onDragOver = function (event) {
        if (!hasFiles(event)) return;
        // Without this the browser would open the file instead of handing it over.
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      };
      this.onDragLeave = function (event) {
        if (!hasFiles(event)) return;
        dragDepth = Math.max(0, dragDepth - 1);
        if (!dragDepth) self.element.classList.remove('drop-active');
      };
      this.onDrop = function (event) {
        if (!hasFiles(event)) return;
        event.preventDefault();
        dragDepth = 0;
        self.element.classList.remove('drop-active');
        self.addFiles(event.dataTransfer.files);
      };
      this.element.addEventListener('dragenter', this.onDragEnter);
      this.element.addEventListener('dragover', this.onDragOver);
      this.element.addEventListener('dragleave', this.onDragLeave);
      this.element.addEventListener('drop', this.onDrop);

      this.onKeyDown = function (event) {
        if (event.key === 'Escape' && self.isDetailsOpen() && !Modal.root) self.closeDetails();
      };
      document.addEventListener('keydown', this.onKeyDown);
    },

    detachEvents: function () {
      if (this.onKeyDown) document.removeEventListener('keydown', this.onKeyDown);
      this.onKeyDown = null;
      // The drag listeners sit on the screen element, which is discarded with it.
    },

    resize: function () {
      if (this.disposed || !this.scroll) return;
      this.drawHero();
      this.drawPosters();
      if (this.isDetailsOpen()) this.drawDetailsCover();
    },

    /* --- loading ------------------------------------------------------ */
    loadManifest: function () {
      var self = this;
      var token = ++this.loadToken;
      this.status = 'loading';
      this.refreshButton.disabled = true;
      this.render();

      var finish = function (apply) {
        if (self.disposed || token !== self.loadToken) return;
        apply();
        self.refreshButton.disabled = false;
        self.render();
      };

      if (typeof fetch !== 'function') {
        finish(function () {
          self.status = 'failed';
          self.statusMessage = 'this browser cannot fetch files';
          self.manifestEntries = [];
          self.manifestFailures = [];
        });
        return;
      }

      var fetchText = function (url) {
        return fetch(url, { cache: 'no-store' }).then(function (response) {
          if (!response.ok) throw new Error('HTTP ' + response.status);
          return response.text();
        });
      };

      fetchText(Lib.MANIFEST_PATH)
        .then(function (text) {
          return Lib.parseManifest(JSON.parse(text));
        })
        .then(function (manifest) {
          var failures = manifest.rejected.map(function (name) {
            return {
              ok: false,
              filename: name,
              errors: ['The manifest should list plain .json file names inside cc/.'],
            };
          });
          return Promise.all(
            manifest.files.map(function (name) {
              return fetchText('cc/' + encodeURIComponent(name)).then(
                function (text) {
                  return Lib.parseFile(text, name);
                },
                function (error) {
                  return { ok: false, filename: name, errors: ['The file could not be loaded (' + error.message + ').'] };
                }
              );
            })
          ).then(function (results) {
            return { results: results, failures: failures };
          });
        })
        .then(
          function (loaded) {
            finish(function () {
              self.status = 'ok';
              self.manifestEntries = [];
              self.manifestFailures = loaded.failures;
              loaded.results.forEach(function (result) {
                if (result.ok) {
                  result.entry.source = 'cc';
                  self.manifestEntries.push(result.entry);
                } else {
                  self.manifestFailures.push(result);
                }
              });
            });
          },
          function (error) {
            finish(function () {
              self.status = 'failed';
              self.statusMessage = error && error.message ? error.message : 'unknown error';
              self.manifestEntries = [];
              self.manifestFailures = [];
            });
          }
        );
    },

    /** Reads files the player dropped or picked, and adds the valid ones. */
    addFiles: function (fileList) {
      var self = this;
      var files = Array.prototype.slice.call(fileList || []);
      if (!files.length) return;

      Promise.all(
        files.map(function (file) {
          if (!/\.json$/i.test(file.name)) {
            return { ok: false, filename: file.name, errors: ['Only .json creature files can be added.'] };
          }
          if (file.size > MAX_FILE_BYTES) {
            return { ok: false, filename: file.name, errors: ['This file is too large to be a creature (over 8 MB).'] };
          }
          return readFileText(file).then(
            function (text) {
              return Lib.parseFile(text, file.name);
            },
            function (error) {
              return { ok: false, filename: file.name, errors: ['The file could not be read (' + error.message + ').'] };
            }
          );
        })
      ).then(function (results) {
        var added = 0;
        results.forEach(function (result) {
          if (result.ok) {
            result.entry.source = 'dropped';
            droppedEntries[result.entry.id] = result.entry;
            delete droppedFailures[result.entry.filename];
            added++;
          } else {
            droppedFailures[result.filename] = result;
          }
        });
        if (self.disposed) return;
        self.render();
        if (added) self.showToast(added === 1 ? 'Added 1 creature' : 'Added ' + added + ' creatures');
        else self.showToast('Nothing was added — see the notice above');
      });
    },

    /** Everything on the shelf: the cc/ files, with dropped files on top of or after them. */
    collectEntries: function () {
      var seen = Object.create(null);
      var entries = this.manifestEntries.map(function (entry) {
        var override = droppedEntries[entry.id];
        seen[entry.id] = true;
        return override || entry;
      });
      Object.keys(droppedEntries).forEach(function (id) {
        if (!seen[id]) entries.push(droppedEntries[id]);
      });
      return entries;
    },

    /* --- rendering ---------------------------------------------------- */
    render: function () {
      this.stopRotation();
      this.posters = [];
      this.entries = this.collectEntries();
      if (this.featuredIndex >= Math.min(this.entries.length, MAX_FEATURED)) this.featuredIndex = 0;

      this.renderNotices();
      this.renderHero();
      this.renderToolbar();
      this.renderRows();
      this.renderEmpty();
      this.drawHero();
      this.drawPosters();
      this.startRotation();
      if (this.detailsEntry && this.isDetailsOpen()) {
        var stillThere = this.entries.indexOf(this.detailsEntry) >= 0;
        if (!stillThere) this.closeDetails();
      }
    },

    renderNotices: function () {
      var host = this.noticesEl;
      UI.clear(host);

      var failures = this.manifestFailures.concat(
        Object.keys(droppedFailures).map(function (name) {
          return droppedFailures[name];
        })
      );
      failures.forEach(function (failure) {
        var notice = UI.el('div', 'cc-notice');
        notice.setAttribute('role', 'alert');
        notice.appendChild(UI.el('strong', null, '“' + failure.filename + '” could not be added'));
        var list = UI.el('ul');
        failure.errors.forEach(function (message) {
          list.appendChild(UI.el('li', null, message));
        });
        notice.appendChild(list);
        host.appendChild(notice);
      });

      this.entries.forEach(function (entry) {
        if (!entry.warnings.length) return;
        var notice = UI.el('div', 'cc-notice');
        notice.setAttribute('role', 'status');
        notice.appendChild(UI.el('strong', null, '“' + entry.name + '” was added with a problem'));
        var list = UI.el('ul');
        entry.warnings.forEach(function (message) {
          list.appendChild(UI.el('li', null, message));
        });
        notice.appendChild(list);
        host.appendChild(notice);
      });

      if (this.status === 'failed' && this.entries.length) {
        var info = UI.el('div', 'cc-notice');
        info.setAttribute('role', 'status');
        info.appendChild(
          UI.el(
            'strong',
            null,
            'The cc/ folder could not be read (' + this.statusMessage + ')'
          )
        );
        info.appendChild(
          UI.el(
            'p',
            null,
            'Showing only the files you added. Serve the app over http and run node tools/scan-cc.js to list the folder.'
          )
        );
        host.appendChild(info);
      }
      host.hidden = !host.firstChild;
    },

    renderHero: function () {
      var self = this;
      UI.clear(this.heroHost);
      this.hero = null;
      var featured = this.entries.slice(0, MAX_FEATURED);
      if (!featured.length) return;

      var wrapper = UI.el('div', 'cover-wrapper');
      wrapper.setAttribute('aria-roledescription', 'carousel');
      wrapper.setAttribute('aria-label', 'Featured creatures');
      var canvas = UI.el('canvas', 'cover');
      canvas.id = 'ccHeroCover';
      canvas.setAttribute('aria-hidden', 'true');
      wrapper.appendChild(canvas);
      wrapper.appendChild(UI.el('div', 'hero-shade'));

      var content = UI.el('div', 'hero-content');
      var kicker = UI.el('div', 'hero-kicker');
      var title = UI.el('h1', 'hero-title');
      var meta = UI.el('div', 'hero-meta');
      var overview = UI.el('p', 'hero-overview');
      content.appendChild(kicker);
      content.appendChild(title);
      content.appendChild(meta);
      content.appendChild(overview);

      var options = UI.el('div', 'options');
      var simulate = UI.el('button', 'play-btn');
      simulate.appendChild(icon('play', 22));
      simulate.appendChild(UI.el('span', null, 'Simulate'));
      simulate.addEventListener('click', function () {
        self.simulate(self.currentFeatured());
      });
      var copy = UI.el('button', 'flat-btn');
      copy.appendChild(icon('copy', 24));
      copy.appendChild(UI.el('span', null, 'Copy'));
      copy.addEventListener('click', function () {
        self.copyToMyCreatures(self.currentFeatured());
      });
      var explore = UI.el('button', 'flat-btn');
      explore.appendChild(icon('explore', 24));
      explore.appendChild(UI.el('span', null, 'Explore'));
      explore.addEventListener('click', function () {
        self.openDetails(self.currentFeatured(), explore);
      });
      options.appendChild(simulate);
      options.appendChild(copy);
      options.appendChild(explore);
      content.appendChild(options);

      var dots = UI.el('div', 'hero-dots');
      dots.setAttribute('role', 'group');
      dots.setAttribute('aria-label', 'Choose a featured creature');
      var dotButtons = featured.map(function (entry, index) {
        var dot = UI.el('button');
        dot.setAttribute('aria-label', 'Show ' + entry.name);
        dot.addEventListener('click', function () {
          self.setFeatured(index);
        });
        dots.appendChild(dot);
        return dot;
      });
      dots.hidden = featured.length < 2;
      content.appendChild(dots);
      wrapper.appendChild(content);

      // Rotation pauses while the pointer or keyboard focus is on the hero.
      wrapper.addEventListener('mouseenter', function () {
        self.hover = true;
      });
      wrapper.addEventListener('mouseleave', function () {
        self.hover = false;
      });
      wrapper.addEventListener('focusin', function () {
        self.focusWithin = true;
      });
      wrapper.addEventListener('focusout', function (event) {
        if (!event.relatedTarget || !wrapper.contains(event.relatedTarget)) self.focusWithin = false;
      });

      this.heroHost.appendChild(wrapper);
      this.hero = {
        wrapper: wrapper,
        canvas: canvas,
        kicker: kicker,
        title: title,
        meta: meta,
        overview: overview,
        dots: dotButtons,
      };
      this.hover = false;
      this.focusWithin = false;
      this.fillHero();
    },

    currentFeatured: function () {
      return this.entries[this.featuredIndex] || this.entries[0];
    },

    /** Writes the featured creature's text into the hero; the canvas is drawn separately. */
    fillHero: function () {
      if (!this.hero) return;
      var entry = this.currentFeatured();
      this.hero.kicker.textContent = entry.source === 'dropped' ? 'DROPPED FILE' : 'FROM cc/';
      this.hero.title.textContent = entry.name;
      this.hero.meta.textContent = Lib.countsText(entry);
      this.hero.overview.textContent = Lib.brainSummary(entry);
      var index = this.featuredIndex;
      this.hero.dots.forEach(function (dot, i) {
        dot.classList.toggle('selected', i === index);
        if (i === index) dot.setAttribute('aria-current', 'true');
        else dot.removeAttribute('aria-current');
      });
    },

    setFeatured: function (index) {
      this.featuredIndex = index;
      this.fillHero();
      this.drawHero();
    },

    drawHero: function () {
      if (!this.hero) return;
      var entry = this.currentFeatured();
      // The creature gets the space above the text, however tall the text is.
      var height = this.hero.canvas.clientHeight || 1;
      var textTop = this.hero.kicker.offsetTop || height * 0.55;
      ViewModel.drawPoster(this.hero.canvas, entry.design, {
        region: {
          left: 0.12,
          top: Math.min(0.2, 8 / height + 0.05),
          right: 0.88,
          bottom: Math.max(0.3, Math.min(0.55, (textTop - 16) / height)),
        },
      });
    },

    /* --- hero rotation ------------------------------------------------ */
    startRotation: function () {
      var self = this;
      this.stopRotation();
      if (!this.hero || this.hero.dots.length < 2) return;
      this.rotationTimer = setInterval(function () {
        if (self.rotationPaused()) return;
        self.setFeatured((self.featuredIndex + 1) % self.hero.dots.length);
      }, ROTATE_MS);
    },

    stopRotation: function () {
      if (this.rotationTimer) clearInterval(this.rotationTimer);
      this.rotationTimer = null;
    },

    /** Same rules as the arcade's spotlight, plus: not while the panel is open or the tab is hidden. */
    rotationPaused: function () {
      return (
        this.hover ||
        this.focusWithin ||
        this.isDetailsOpen() ||
        !!Modal.root ||
        reducedMotion() ||
        (typeof document !== 'undefined' && document.hidden === true)
      );
    },

    renderToolbar: function () {
      var self = this;
      UI.clear(this.toolbarEl);
      this.toolbarEl.hidden = !this.entries.length;
      if (!this.entries.length) return;

      this.toolbarEl.appendChild(
        UI.el('div', 'cc-toolbar-label', plural(this.entries.length, 'creature'))
      );
      var group = UI.el('div', 'cc-toggle');
      group.setAttribute('role', 'group');
      group.setAttribute('aria-label', 'Layout');
      [
        ['rows', 'Rows'],
        ['grid', 'Grid'],
      ].forEach(function (option) {
        var button = UI.el('button', null, option[1]);
        button.setAttribute('aria-pressed', self.view === option[0] ? 'true' : 'false');
        button.addEventListener('click', function () {
          if (self.view === option[0]) return;
          self.view = option[0];
          EVO.Store.setString(VIEW_KEY, self.view);
          self.renderToolbar();
          self.renderRows();
          self.drawPosters();
        });
        group.appendChild(button);
      });
      this.toolbarEl.appendChild(group);
    },

    renderRows: function () {
      var self = this;
      UI.clear(this.rowsEl);
      this.posters = [];
      this.rowsEl.hidden = !this.entries.length;
      if (!this.entries.length) return;

      if (this.view === 'grid') {
        var grid = UI.el('div', 'search-grid');
        this.entries.forEach(function (entry) {
          grid.appendChild(self.makePoster(entry));
        });
        this.rowsEl.appendChild(grid);
        return;
      }

      Lib.buildRows(this.entries).forEach(function (row) {
        var section = UI.el('section', 'flix-row');
        var heading = UI.el('h2', null, row.title);
        heading.appendChild(UI.el('span', 'row-count', row.entries.length));
        section.appendChild(heading);
        var gallery = UI.el('div', 'gallery');
        row.entries.forEach(function (entry) {
          gallery.appendChild(self.makePoster(entry));
        });
        section.appendChild(gallery);
        self.rowsEl.appendChild(section);
      });
    },

    makePoster: function (entry) {
      var self = this;
      var card = UI.el('button', 'movie creature-card');
      var brainCount = entry.brainList.length;
      card.setAttribute(
        'aria-label',
        entry.name + ', ' + (brainCount ? plural(brainCount, 'evolved brain') : 'no evolved brains') + '. Explore'
      );
      var item = UI.el('span', 'item');
      var canvas = UI.el('canvas');
      canvas.setAttribute('aria-hidden', 'true');
      item.appendChild(canvas);
      if (brainCount) item.appendChild(UI.el('span', 'item-badge', brainCount));
      item.appendChild(UI.el('span', 'item-label', entry.name));
      card.appendChild(item);
      card.addEventListener('click', function () {
        self.openDetails(entry, card);
      });
      this.posters.push({ canvas: canvas, entry: entry });
      return card;
    },

    drawPosters: function () {
      this.posters.forEach(function (poster) {
        ViewModel.drawPoster(poster.canvas, poster.entry.design);
      });
    },

    renderEmpty: function () {
      var host = this.emptyEl;
      UI.clear(host);
      var show = !this.entries.length;
      host.hidden = !show;
      if (!show) return;

      host.setAttribute('role', this.status === 'loading' ? 'status' : 'region');
      if (this.status === 'loading') {
        host.appendChild(UI.el('h3', null, 'Loading creatures…'));
        return;
      }
      var glyph = UI.el('div', 'empty-icon');
      glyph.appendChild(icon('file', 48));
      host.appendChild(glyph);
      host.appendChild(UI.el('h3', null, 'Drop a creature file to add one'));
      host.appendChild(
        UI.el(
          'p',
          null,
          this.status === 'failed'
            ? 'The cc/ folder could not be read (' + this.statusMessage + '). Serve the app over http and run node tools/scan-cc.js to list it — or just drop a file here.'
            : 'cc/ has no creature files yet. Put .json files in it and run node tools/scan-cc.js — or just drop a file here.'
        )
      );
      var screen = this;
      var pick = UI.makeButton('Add a file', 'primary', function () {
        screen.fileInput.click();
      });
      host.appendChild(pick);
    },

    /* --- actions ------------------------------------------------------ */
    simulate: function (entry) {
      if (!entry) return;
      // The creature is simulated straight from the file, with its brains; it is
      // not added to My Creatures unless the player copies it.
      App.chooseActionBrain(entry.design, null, function (objective) {
        return entry.brains[brainKeyFor(objective)] || null;
      });
    },

    copyToMyCreatures: function (entry) {
      if (!entry) return;
      var result;
      try {
        result = Lib.copyToMyCreatures(entry, Storage);
      } catch (error) {
        Modal.alert('Could not copy “' + entry.name + '”: ' + error.message, 'Copy failed');
        return;
      }
      var brains = plural(result.added.length, 'brain');
      if (result.created) {
        this.showToast('Copied “' + entry.name + '” to My Creatures' + (result.added.length ? ' with ' + brains : ''));
      } else if (result.added.length) {
        this.showToast('“' + entry.name + '” was already in My Creatures — added ' + brains);
      } else {
        this.showToast('“' + entry.name + '” is already in My Creatures');
      }
    },

    copyJson: function (entry) {
      if (!entry) return;
      var self = this;
      var text = JSON.stringify(entry.json, null, 2);
      var fallback = function () {
        self.showJsonModal(entry, text);
      };
      var clipboard = global.navigator && global.navigator.clipboard;
      // The Clipboard API needs a secure context (https or localhost), so it
      // fails from file://. Then the text is shown to be copied by hand.
      if (!clipboard || typeof clipboard.writeText !== 'function' || global.isSecureContext === false) {
        fallback();
        return;
      }
      clipboard.writeText(text).then(function () {
        self.showToast('Copied the JSON of “' + entry.name + '”');
      }, fallback);
    },

    showJsonModal: function (entry, text) {
      var textarea = UI.el('textarea', 'import-textarea');
      textarea.readOnly = true;
      textarea.value = text;
      textarea.setAttribute('aria-label', 'Creature JSON');
      var content = UI.el('div', 'import-content');
      content.appendChild(textarea);
      var select = function () {
        textarea.focus();
        textarea.select();
      };
      Modal.open({
        title: 'Copy “' + entry.name + '”',
        message: 'Your browser did not allow copying automatically. Select the text and copy it.',
        content: content,
        actions: [
          { label: 'Select all', close: false, onClick: select },
          { label: 'Done', primary: true },
        ],
      });
      select();
    },

    showToast: function (message) {
      var self = this;
      if (this.disposed) return;
      this.toast.textContent = message;
      this.toast.classList.add('visible');
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(function () {
        if (self.toast) self.toast.classList.remove('visible');
      }, 2600);
    },

    /* --- the Explore panel -------------------------------------------- */
    isDetailsOpen: function () {
      return !!this.details && this.details.classList.contains('open');
    },

    openDetails: function (entry, opener) {
      var self = this;
      if (!entry) return;
      this.detailsEntry = entry;
      this.detailsOpener = opener || null;

      this.detailsTitle.textContent = entry.name;
      this.detailsSub.textContent =
        Lib.countsText(entry) +
        ' · ' +
        (entry.source === 'dropped'
          ? entry.filename + ' (added this session)'
          : 'cc/' + entry.filename);

      UI.clear(this.detailsTags);
      if (entry.brainList.length) {
        entry.brainList.forEach(function (brain) {
          self.detailsTags.appendChild(UI.el('span', null, Lib.brainChipText(brain)));
        });
      } else {
        this.detailsTags.appendChild(UI.el('span', null, 'No evolved brains yet'));
      }
      UI.clear(this.detailsNotes);
      entry.warnings.forEach(function (message) {
        var notice = UI.el('div', 'cc-notice');
        notice.setAttribute('role', 'status');
        notice.appendChild(UI.el('p', null, message));
        self.detailsNotes.appendChild(notice);
      });

      clearTimeout(this.panelTimer);
      this.details.hidden = false;
      void this.details.offsetWidth; // let the browser see the off-screen position first
      this.details.classList.add('open');
      this.setBackgroundInert(true);
      this.details.querySelector('main').scrollTop = 0;
      this.drawDetailsCover();
      this.detailsBack.focus();
    },

    closeDetails: function () {
      var self = this;
      if (!this.isDetailsOpen()) return;
      this.details.classList.remove('open');
      this.setBackgroundInert(false);
      var opener = this.detailsOpener;
      this.detailsOpener = null;
      if (opener && opener.focus && opener.isConnected !== false) opener.focus();
      clearTimeout(this.panelTimer);
      this.panelTimer = setTimeout(function () {
        if (self.details && !self.details.classList.contains('open')) self.details.hidden = true;
      }, PANEL_MS + 40);
    },

    /** The page behind an open panel can be neither tabbed to nor clicked. */
    setBackgroundInert: function (inert) {
      [this.topBar, this.scroll].forEach(function (node) {
        if (!node) return;
        node.inert = inert;
        if (inert) node.setAttribute('aria-hidden', 'true');
        else node.removeAttribute('aria-hidden');
      });
    },

    drawDetailsCover: function () {
      if (!this.detailsEntry) return;
      // Clear of the back button at the top and the title at the bottom.
      var height = this.detailsCanvas.clientHeight || 1;
      ViewModel.drawPoster(this.detailsCanvas, this.detailsEntry.design, {
        region: {
          left: 0.1,
          top: Math.min(0.3, 64 / height),
          right: 0.9,
          bottom: Math.max(0.5, 1 - (this.detailsTitle.offsetHeight + 12) / height),
        },
      });
    },
  };

  EVO.CustomScreen = CustomScreen;
  EVO.Screens = EVO.Screens || {};
  EVO.Screens.custom = CustomScreen;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = EVO;
  }
})(typeof window !== 'undefined' ? window : globalThis);
