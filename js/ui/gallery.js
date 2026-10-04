/*
 * Evolution (Web Edition) — ui/gallery.js
 * ---------------------------------------------------------------
 * The gallery of saved creature recordings.  Port of the original
 * best-creatures gallery: pick a recording of a generation and watch it
 * again, export it or load its design back into the editor.
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

  function percent(value) {
    return (Utils.clamp(value || 0, 0, 1) * 100).toFixed(2) + '%';
  }

  var GalleryScreen = {
    show: function (params) {
      params = params || {};
      this.recordings = Storage.getRecordings();
      this.selectedId = params.id || (this.recordings[0] ? this.recordings[0].id : null);
      this.playbackTime = 0;
      this.playbackPlaying = true;
      this.speed = 1;
      this.playback = null;

      this.buildLayout();
      this.resize();
      this.attachEvents();
      this.selectRecording(this.selectedId);
      this.loop();
    },

    hide: function () {
      if (this.animationFrame) {
        cancelAnimationFrame(this.animationFrame);
        this.animationFrame = null;
      }
      this.detachEvents();
    },

    buildLayout: function () {
      var self = this;
      var element = this.element;

      var bar = UI.el('div', 'top-bar');
      var back = UI.el('button', 'back-button');
      back.appendChild(UI.el('span', 'back-arrow', '\u2190'));
      back.appendChild(UI.el('span', null, 'Back'));
      back.addEventListener('click', function () {
        App.show('home');
      });
      bar.appendChild(back);
      bar.appendChild(UI.el('div', 'top-bar-title', 'Gallery'));
      bar.appendChild(UI.el('div', 'top-bar-right'));
      element.appendChild(bar);

      var content = UI.el('div', 'gallery-content');

      /* Left: the list of recordings */
      this.listElement = UI.el('div', 'gallery-list');
      content.appendChild(this.listElement);

      /* Right: the player */
      var player = UI.el('div', 'gallery-player');
      var canvasContainer = UI.el('div', 'gallery-canvas-container');
      this.canvas = UI.el('canvas', 'gallery-canvas');
      canvasContainer.appendChild(this.canvas);
      player.appendChild(canvasContainer);
      this.canvasContainer = canvasContainer;

      var controls = UI.el('div', 'gallery-controls');
      this.playButton = UI.el('button', 'hud-button play-button', '\u25B6');
      this.playButton.addEventListener('click', function () {
        self.playbackPlaying = !self.playbackPlaying;
      });
      controls.appendChild(this.playButton);

      this.seekSlider = UI.el('input', 'hud-slider seek-slider');
      this.seekSlider.type = 'range';
      this.seekSlider.min = '0';
      this.seekSlider.max = '1';
      this.seekSlider.step = '0.001';
      this.seekSlider.addEventListener('input', function () {
        if (!self.playback) return;
        self.playbackPlaying = false;
        self.playbackTime = parseFloat(self.seekSlider.value) * self.duration();
        self.playback.seek(self.playbackTime);
      });
      controls.appendChild(this.seekSlider);

      this.timeLabel = UI.el('span', 'hud-row-value', '0.0s');
      controls.appendChild(this.timeLabel);

      this.infoLabel = UI.el('span', 'gallery-info', '');
      controls.appendChild(this.infoLabel);
      player.appendChild(controls);

      var actions = Widgets.buttonRow(
        [
          {
            label: 'Load design',
            onClick: function () {
              if (!self.playback) return;
              App.show('editor', { design: self.currentRecording().creatureDesign });
            },
          },
          {
            label: 'Export',
            onClick: function () {
              self.exportRecording();
            },
          },
          {
            label: 'Save as simulation',
            onClick: function () {
              self.saveAsSimulation();
            },
          },
          {
            label: 'Delete',
            className: 'danger',
            onClick: function () {
              if (!self.selectedId) return;
              Modal.confirm('Delete this recording?', function () {
                Storage.deleteRecording(self.selectedId);
                App.show('gallery');
              });
            },
          },
        ],
        'compact'
      );
      player.appendChild(actions);
      content.appendChild(player);

      element.appendChild(content);
    },

    resize: function () {
      if (!this.canvas) return;
      var width = this.canvasContainer.clientWidth || 600;
      var height = this.canvasContainer.clientHeight || 400;
      var ratio = global.devicePixelRatio || 1;
      this.canvas.width = Math.floor(width * ratio);
      this.canvas.height = Math.floor(height * ratio);
      this.canvas.style.width = width + 'px';
      this.canvas.style.height = height + 'px';
      this.pixelRatio = ratio;
      this.camera = new EVO.Camera({ orthographicSize: 12.24 });
      this.camera.resize(width, height);
    },

    refreshList: function () {
      var self = this;
      UI.clear(this.listElement);
      this.recordings = Storage.getRecordings();
      if (!this.recordings.length) {
        this.listElement.appendChild(
          UI.el(
            'p',
            'empty-note',
            'No recordings yet. During a simulation you can save the best creature of a generation ' +
              'with the SAVE button.'
          )
        );
        return;
      }
      this.recordings.forEach(function (entry) {
        var button = UI.el('button', 'gallery-entry');
        button.classList.toggle('active', entry.id === self.selectedId);
        button.appendChild(UI.el('span', 'gallery-entry-title', 'Generation ' + entry.generation));
        button.appendChild(
          UI.el(
            'span',
            'gallery-entry-sub',
            EVO.ObjectiveUtil.stringRepresentation(entry.task) +
              ' · ' +
              percent(entry.fitness) +
              ' · ' +
              new Date(entry.date).toLocaleDateString()
          )
        );
        button.addEventListener('click', function () {
          self.selectRecording(entry.id);
        });
        self.listElement.appendChild(button);
      });
    },

    currentRecording: function () {
      for (var i = 0; i < this.recordings.length; i++) {
        if (this.recordings[i].id === this.selectedId) return this.recordings[i].recording;
      }
      return null;
    },

    selectRecording: function (id) {
      this.selectedId = id;
      this.playbackTime = 0;
      this.playbackPlaying = true;
      var recording = this.currentRecording();
      this.playback = recording ? new EVO.PlaybackCreature(recording) : null;
      this.bounds = this.playback ? this.playback.getBounds() : null;
      this.refreshList();

      if (this.playback) {
        var stats = recording.stats;
        this.infoLabel.textContent =
          'GEN ' + recording.generation + ' · ' + percent(stats.fitness) + ' · ' +
          stats.numberOfBones + ' bones · ' + stats.numberOfMuscles + ' muscles';
      } else {
        this.infoLabel.textContent = '';
      }
      this.refreshPlayButton();
    },

    duration: function () {
      return this.playback ? Math.max(0.1, this.playback.getDuration()) : 0.1;
    },

    refreshPlayButton: function () {
      this.playButton.textContent = this.playbackPlaying ? '\u2016' : '\u25B6';
    },

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
      if (!this.playback || !this.playbackPlaying) return;
      this.playbackTime += dt * this.speed;
      var duration = this.duration();
      if (this.playbackTime >= duration) {
        this.playbackTime = duration;
      }
      this.playback.seek(this.playbackTime);
    },

    draw: function () {
      if (!this.camera) return;
      var ctx = this.canvas.getContext('2d');
      if (!ctx) return;
      var ratio = this.pixelRatio || 1;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      Renderer.drawBackground(ctx, this.camera);

      if (!this.playback) {
        ctx.fillStyle = '#9a9a9a';
        ctx.font = '16px "Helvetica Neue", Helvetica, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('No recording selected', this.camera.width / 2, this.camera.height / 2);
        return;
      }

      if (this.bounds) {
        this.camera.x = (this.bounds.minX + this.bounds.maxX) / 2;
        this.camera.y = (this.bounds.minY + this.bounds.maxY) / 2;
        var width = Math.max(6, this.bounds.maxX - this.bounds.minX);
        var height = Math.max(6, this.bounds.maxY - this.bounds.minY);
        this.camera.orthographicSize = Utils.clamp(Math.max(width * 0.6, height), 3, 60);
      }

      Renderer.drawPlaybackCreature(ctx, this.playback, this.camera, {
        opacity: 1,
        showMuscles: EVO.Settings.ShowMuscles,
        showContraction: EVO.Settings.ShowMuscleContraction,
      });

      this.seekSlider.value = String(Utils.clamp(this.playbackTime / this.duration(), 0, 1));
      this.timeLabel.textContent = this.playbackTime.toFixed(1) + 's / ' + this.duration().toFixed(1) + 's';
      this.refreshPlayButton();
    },

    exportRecording: function () {
      var recording = this.currentRecording();
      if (!recording) return;
      var json = JSON.stringify(EVO.CreatureRecording.encode(recording), null, 2);
      var blob = new Blob([json], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = 'generation-' + recording.generation + '-recording.json';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    },

    saveAsSimulation: function () {
      var recording = this.currentRecording();
      if (!recording) return;
      var settings = EVO.SimulationSettings.decode(EVO.Settings.SimulationSettings);
      settings.Objective = recording.task;
      var networkSettings = recording.networkSettings
        ? EVO.NeuralNetworkSettings.decode(recording.networkSettings)
        : EVO.NeuralNetworkSettings.decode(EVO.Settings.NetworkSettings);
      var scene =
        recording.sceneDescription ||
        EVO.DefaultSimulationScenes.defaultSceneForObjective(recording.task);
      var data = EVO.SimulationData.create(
        settings,
        networkSettings,
        EVO.CreatureDesign.clone(recording.creatureDesign),
        scene
      );
      App.show('simulation', { data: data });
    },

    attachEvents: function () {
      var self = this;
      this.onResize = function () {
        self.resize();
      };
      this.onKeyDown = function (event) {
        if (event.target && /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
        if (event.key === ' ') {
          event.preventDefault();
          self.playbackPlaying = !self.playbackPlaying;
        }
      };
      global.addEventListener('resize', this.onResize);
      global.addEventListener('keydown', this.onKeyDown);
    },

    detachEvents: function () {
      global.removeEventListener('resize', this.onResize);
      global.removeEventListener('keydown', this.onKeyDown);
    },
  };

  EVO.GalleryScreen = GalleryScreen;
  EVO.Screens.gallery = GalleryScreen;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = EVO;
  }
})(typeof window !== 'undefined' ? window : globalThis);
