/*
 * Evolution (Web Edition) — core/util.js
 * ---------------------------------------------------------------
 * Port of the helper code of the original Unity project:
 *   Assets/Scripts/Util/*
 *   Assets/Scripts/Data/Settings.cs
 *
 * Everything in the web edition lives in the global `EVO` namespace so that
 * the game can be started directly from the file system (file://) without
 * a web server.  Classic scripts are used on purpose: ES modules are blocked
 * by the browser's CORS rules for file:// URLs.
 */
(function (global) {
  'use strict';

  var EVO = (global.EVO = global.EVO || {});

  /* ------------------------------------------------------------------ *
   * Math helpers
   * ------------------------------------------------------------------ */

  var MathUtils = {
    PI: Math.PI,
    TWO_PI: Math.PI * 2,
    Deg2Rad: Math.PI / 180,
    Rad2Deg: 180 / Math.PI,

    clamp: function (v, min, max) {
      return v < min ? min : v > max ? max : v;
    },

    /** Unity's Mathf.Repeat */
    repeat: function (t, length) {
      return t - Math.floor(t / length) * length;
    },

    lerp: function (a, b, t) {
      return a + (b - a) * t;
    },

    /** Unity's Mathf.SmoothStep / Easing.EaseInOutQuad */
    easeInOutQuad: function (t) {
      t = MathUtils.clamp(t, 0, 1);
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    },

    /** Maps a value from one range into another (unclamped). */
    map: function (value, inMin, inMax, outMin, outMax) {
      if (inMax - inMin === 0) return outMin;
      return outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin);
    },

    sign: function (v) {
      return v < 0 ? -1 : v > 0 ? 1 : 0;
    },

    distance: function (ax, ay, bx, by) {
      var dx = bx - ax,
        dy = by - ay;
      return Math.sqrt(dx * dx + dy * dy);
    },

    /** 2D cross product (z component of the 3D cross product) */
    cross: function (ax, ay, bx, by) {
      return ax * by - ay * bx;
    },

    /**
     * Unity's Random.Range(float, float) — inclusive of the lower bound,
     * (practically) exclusive of the upper bound for floats.
     */
    randomRange: function (min, max) {
      return min + Math.random() * (max - min);
    },

    randomInt: function (minInclusive, maxExclusive) {
      if (maxExclusive <= minInclusive) return minInclusive;
      return Math.floor(minInclusive + Math.random() * (maxExclusive - minInclusive));
    },

    randomElement: function (array) {
      return array[Math.floor(Math.random() * array.length)];
    },

    /** Unity's Random.Range(int, int) — max exclusive [min, max) */
    round: function (value) {
      return Math.round(value);
    },

    roundTo: function (value, step) {
      return Math.round(value / step) * step;
    },

    /** Rounds to 4 decimal places, used to keep save files small. */
    round4: function (v) {
      return Math.round(v * 10000) / 10000;
    },
  };

  /** Return a canvas pixel ratio that balances sharpness and mobile cost. */
  MathUtils.displayPixelRatio = function (maxRatio) {
    var ratio = Number(global.devicePixelRatio);
    if (!isFinite(ratio) || ratio <= 0) ratio = 1;
    maxRatio = Number(maxRatio);
    if (!isFinite(maxRatio) || maxRatio <= 0) maxRatio = 2;
    return Math.min(ratio, maxRatio);
  };

  /** Best-effort touch capability check (not a user-agent sniff). */
  MathUtils.hasTouchScreen = function () {
    var navigator = global.navigator || {};
    return (
      Number(navigator.maxTouchPoints || navigator.msMaxTouchPoints || 0) > 0 ||
      'ontouchstart' in global
    );
  };

  /**
   * Attach a small Pointer Events based two-finger gesture recognizer.
   * Centroids are returned in element-local CSS pixels; pan deltas are CSS
   * pixels. Pinch scale is incremental (new distance / previous distance).
   */
  MathUtils.addTouchGestures = function (element, handlers) {
    handlers = handlers || {};
    if (!element || !element.addEventListener) {
      return { active: false, pointerCount: 0, detach: function () {} };
    }

    var pointers = Object.create(null);
    var pointerOrder = [];
    var gestureActive = false;
    var lastMetrics = null;
    var detached = false;
    var controller = {
      active: false,
      pointerCount: 0,
      detach: detach,
    };

    function pointerId(event) {
      return event.pointerId === undefined || event.pointerId === null ? 1 : event.pointerId;
    }

    function updatePointerCount() {
      controller.pointerCount = pointerOrder.length;
    }

    function elementMetrics() {
      var ids = pointerOrder.slice(0, 2);
      if (ids.length < 2) return null;
      var first = pointers[ids[0]];
      var second = pointers[ids[1]];
      var rect = element.getBoundingClientRect ? element.getBoundingClientRect() : { left: 0, top: 0 };
      return {
        x: (first.x + second.x) / 2,
        y: (first.y + second.y) / 2,
        cx: (first.x + second.x) / 2 - (rect.left || 0),
        cy: (first.y + second.y) / 2 - (rect.top || 0),
        distance: MathUtils.distance(first.x, first.y, second.x, second.y),
      };
    }

    function onPointerDown(event) {
      // Mouse and pen retain their native one-pointer behaviour. Only touch
      // pointers participate in the two-finger recognizer.
      if (detached || !event || event.pointerType !== 'touch') return;
      var id = pointerId(event);
      if (!Object.prototype.hasOwnProperty.call(pointers, id)) pointerOrder.push(id);
      pointers[id] = { x: event.clientX || 0, y: event.clientY || 0 };
      updatePointerCount();
      if (!gestureActive && controller.pointerCount >= 2) {
        gestureActive = true;
        controller.active = true;
        lastMetrics = elementMetrics();
        if (handlers.onGestureStart) handlers.onGestureStart(lastMetrics, event);
      }
    }

    function onPointerMove(event) {
      if (detached || !event) return;
      var id = pointerId(event);
      if (!Object.prototype.hasOwnProperty.call(pointers, id)) return;
      pointers[id] = { x: event.clientX || 0, y: event.clientY || 0 };
      if (!gestureActive) return;

      var metrics = elementMetrics();
      if (!metrics || !lastMetrics) {
        lastMetrics = metrics;
        return;
      }
      var dx = metrics.x - lastMetrics.x;
      var dy = metrics.y - lastMetrics.y;
      var scale = lastMetrics.distance > 0 ? metrics.distance / lastMetrics.distance : 1;
      lastMetrics = metrics;

      if (isFinite(scale) && Math.abs(scale - 1) > 0.0001 && handlers.onPinch) {
        handlers.onPinch(scale, metrics.cx, metrics.cy, event);
      }
      if ((dx !== 0 || dy !== 0) && handlers.onPan) {
        handlers.onPan(dx, dy, metrics.cx, metrics.cy, event);
      }
    }

    function finishPointer(event) {
      if (detached || !event) return;
      var id = pointerId(event);
      if (!Object.prototype.hasOwnProperty.call(pointers, id)) return;
      delete pointers[id];
      pointerOrder = pointerOrder.filter(function (pointer) {
        return pointer !== id;
      });
      updatePointerCount();

      if (gestureActive && controller.pointerCount < 2) {
        gestureActive = false;
        controller.active = false;
        lastMetrics = null;
        if (handlers.onGestureEnd) handlers.onGestureEnd(event);
      } else if (gestureActive) {
        // A third finger may have been present. Establish a fresh baseline
        // after one of the tracked pair is lifted to avoid a jump.
        lastMetrics = elementMetrics();
      }
    }

    function reset(event, notify) {
      var wasActive = gestureActive;
      pointers = Object.create(null);
      pointerOrder = [];
      gestureActive = false;
      lastMetrics = null;
      controller.active = false;
      controller.pointerCount = 0;
      if (wasActive && notify && handlers.onGestureEnd) handlers.onGestureEnd(event || null);
    }

    function onVisibilityChange(event) {
      reset(event, true);
    }

    function detach() {
      if (detached) return;
      detached = true;
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointerup', finishPointer);
      element.removeEventListener('pointercancel', finishPointer);
      global.removeEventListener('pointermove', onPointerMove);
      global.removeEventListener('pointerup', finishPointer);
      global.removeEventListener('pointercancel', finishPointer);
      global.removeEventListener('blur', onWindowBlur);
      if (global.document) global.document.removeEventListener('visibilitychange', onVisibilityChange);
      reset(null, false);
    }

    function onWindowBlur(event) {
      reset(event, true);
    }

    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('pointerup', finishPointer);
    element.addEventListener('pointercancel', finishPointer);
    // Pointer events bubble to window, including releases outside the element.
    // Listening there avoids stale pointer state when a finger leaves the canvas.
    global.addEventListener('pointermove', onPointerMove);
    global.addEventListener('pointerup', finishPointer);
    global.addEventListener('pointercancel', finishPointer);
    global.addEventListener('blur', onWindowBlur);
    if (global.document) global.document.addEventListener('visibilitychange', onVisibilityChange);

    return controller;
  };

  /* ------------------------------------------------------------------ *
   * GaussianPRNG (Box-Muller transform) — port of Util/GaussianPRNG.cs
   * ------------------------------------------------------------------ */
  function GaussianPRNG(mu, sigma) {
    this.mu = mu === undefined ? 0 : mu;
    this.sigma = sigma === undefined ? 1 : sigma;
    this.z1 = 0;
    this.generate = false;
  }
  GaussianPRNG.EPSILON = 1e-7;

  GaussianPRNG.prototype.next = function () {
    this.generate = !this.generate;
    if (!this.generate) return this.z1 * this.sigma + this.mu;

    var u1, u2;
    do {
      u1 = Math.random();
      u2 = Math.random();
    } while (u1 <= GaussianPRNG.EPSILON);

    var mag = Math.sqrt(-2 * Math.log(u1));
    var z0 = mag * Math.cos(MathUtils.TWO_PI * u2);
    this.z1 = mag * Math.sin(MathUtils.TWO_PI * u2);
    return z0 * this.sigma + this.mu;
  };

  /* ------------------------------------------------------------------ *
   * RandomPicker — port of Util/RandomPicker.cs (cumulative distribution)
   * ------------------------------------------------------------------ */
  function RandomPicker() {
    this.cdf = [];
    this.totalWeight = 0;
  }

  RandomPicker.prototype.add = function (element, weight) {
    this.totalWeight += weight;
    this.cdf.push({ element: element, cumulativeWeight: this.totalWeight });
  };

  RandomPicker.prototype.next = function () {
    if (this.cdf.length === 0) return undefined;
    if (this.totalWeight <= 0) {
      return this.cdf[MathUtils.randomInt(0, this.cdf.length)].element;
    }
    var pick = Math.random() * this.totalWeight;
    // Binary search over the cumulative weights.
    var low = 0,
      high = this.cdf.length - 1;
    while (low < high) {
      var mid = (low + high) >> 1;
      if (this.cdf[mid].cumulativeWeight <= pick) low = mid + 1;
      else high = mid;
    }
    return this.cdf[low].element;
  };

  /* ------------------------------------------------------------------ *
   * Storage — a tiny abstraction that mirrors the PlayerPrefs based
   * `Settings` of the original.  Falls back to an in-memory store when
   * localStorage is unavailable (e.g. some browsers on file://).
   * ------------------------------------------------------------------ */
  function MemoryStore() {
    this.data = {};
  }
  MemoryStore.prototype.getItem = function (key) {
    return Object.prototype.hasOwnProperty.call(this.data, key) ? this.data[key] : null;
  };
  MemoryStore.prototype.setItem = function (key, value) {
    this.data[key] = String(value);
  };
  MemoryStore.prototype.removeItem = function (key) {
    delete this.data[key];
  };
  MemoryStore.prototype.keys = function () {
    return Object.keys(this.data);
  };

  var localStorageAvailable = false;
  try {
    var testKey = '__evo_test__';
    global.localStorage.setItem(testKey, '1');
    global.localStorage.removeItem(testKey);
    localStorageAvailable = true;
  } catch (e) {
    localStorageAvailable = false;
  }

  var backingStore = localStorageAvailable ? global.localStorage : new MemoryStore();

  var Store = {
    available: localStorageAvailable,
    getString: function (key, defaultValue) {
      var value = backingStore.getItem('evo.' + key);
      return value === null || value === undefined ? defaultValue : value;
    },
    setString: function (key, value) {
      backingStore.setItem('evo.' + key, value);
    },
    getBool: function (key, defaultValue) {
      var value = this.getString(key, null);
      if (value === null) return defaultValue;
      return value === '1' || value === 'true';
    },
    setBool: function (key, value) {
      this.setString(key, value ? '1' : '0');
    },
    getInt: function (key, defaultValue) {
      var value = this.getString(key, null);
      if (value === null) return defaultValue;
      var parsed = parseInt(value, 10);
      return isNaN(parsed) ? defaultValue : parsed;
    },
    setInt: function (key, value) {
      this.setString(key, String(Math.round(value)));
    },
    getFloat: function (key, defaultValue) {
      var value = this.getString(key, null);
      if (value === null) return defaultValue;
      var parsed = parseFloat(value);
      return isNaN(parsed) ? defaultValue : parsed;
    },
    setFloat: function (key, value) {
      this.setString(key, String(value));
    },
    getJSON: function (key, defaultValue) {
      var value = this.getString(key, null);
      if (value === null || value === '') return defaultValue;
      try {
        return JSON.parse(value);
      } catch (e) {
        return defaultValue;
      }
    },
    setJSON: function (key, value) {
      this.setString(key, JSON.stringify(value));
    },
    remove: function (key) {
      backingStore.removeItem('evo.' + key);
    },
    keys: function () {
      return backingStore.keys().filter(function (k) {
        return k.indexOf('evo.') === 0;
      });
    },
    deleteAll: function () {
      var self = this;
      this.keys().forEach(function (key) {
        backingStore.removeItem(key);
      });
    },
  };

  /* ------------------------------------------------------------------ *
   * Settings — port of Data/Settings.cs
   * ------------------------------------------------------------------ */
  var Settings = {
    get ShowMuscleContraction() {
      return Store.getBool('showMuscleContraction', false);
    },
    set ShowMuscleContraction(v) {
      Store.setBool('showMuscleContraction', v);
    },

    get ShowMuscles() {
      return Store.getBool('SHOW_MUSCLES_KEY', true);
    },
    set ShowMuscles(v) {
      Store.setBool('SHOW_MUSCLES_KEY', v);
    },

    get ShowOneAtATime() {
      return Store.getBool('SHOW_ONE_AT_ATIME_KEY', false);
    },
    set ShowOneAtATime(v) {
      Store.setBool('SHOW_ONE_AT_ATIME_KEY', v);
    },

    get SkipGenerationRecap() {
      return Store.getBool('SKIP_GENERATION_RECAP_KEY', false);
    },
    set SkipGenerationRecap(v) {
      Store.setBool('SKIP_GENERATION_RECAP_KEY', v);
    },

    get AutoFlapEnabled() {
      return Store.getBool('AUTO_FLAP_ENABLED_KEY', true);
    },
    set AutoFlapEnabled(v) {
      Store.setBool('AUTO_FLAP_ENABLED_KEY', v);
    },

    get HiddenCreatureOpacity() {
      return Store.getFloat('HIDDEN_CREATURE_OPACITY_KEY', 0.225);
    },
    set HiddenCreatureOpacity(v) {
      Store.setFloat('HIDDEN_CREATURE_OPACITY_KEY', v);
    },

    get DefaultGridVisibility() {
      return Store.getFloat('DEFAULT_GRID_VISIBILITY_KEY', 0.0);
    },
    set DefaultGridVisibility(v) {
      Store.setFloat('DEFAULT_GRID_VISIBILITY_KEY', v);
    },

    get FlyingGridVisibility() {
      return Store.getFloat('FLYING_GRID_VISIBILITY_KEY', 0.5);
    },
    set FlyingGridVisibility(v) {
      Store.setFloat('FLYING_GRID_VISIBILITY_KEY', v);
    },

    get GridEnabled() {
      return Store.getBool('GRID_ENABLED', false);
    },
    set GridEnabled(v) {
      Store.setBool('GRID_ENABLED', v);
    },

    get GridSize() {
      return Store.getFloat('GRID_SIZE', 1.0);
    },
    set GridSize(v) {
      Store.setFloat('GRID_SIZE', v);
    },

    get AutoSaveEnabled() {
      return Store.getBool('AUTO_SAVE_ENABLED_KEY', false);
    },
    set AutoSaveEnabled(v) {
      Store.setBool('AUTO_SAVE_ENABLED_KEY', v);
    },

    get AutoSaveDistance() {
      return Store.getInt('AUTO_SAVE_DISTANCE_KEY', 5);
    },
    set AutoSaveDistance(v) {
      Store.setInt('AUTO_SAVE_DISTANCE_KEY', v);
    },

    get Language() {
      return Store.getString('LANGUAGE_KEY', 'en');
    },
    set Language(v) {
      Store.setString('LANGUAGE_KEY', v);
    },

    get Theme() {
      return Store.getString('THEME_KEY', 'light') === 'dark' ? 'dark' : 'light';
    },
    set Theme(v) {
      Store.setString('THEME_KEY', v === 'dark' ? 'dark' : 'light');
    },

    get ShowOnboarding() {
      return Store.getBool('SHOW_ONBOARDING_KEY', true);
    },
    set ShowOnboarding(v) {
      Store.setBool('SHOW_ONBOARDING_KEY', v);
    },

    /* --- Simulation / editor state, mirrors Settings.cs string blobs --- */
    get SimulationSettings() {
      return Store.getJSON('EVOLUTION_SETTINGS', null);
    },
    set SimulationSettings(v) {
      Store.setJSON('EVOLUTION_SETTINGS', v);
    },

    get NetworkSettings() {
      return Store.getJSON('NEURAL NETWORK SETTINGS', null);
    },
    set NetworkSettings(v) {
      Store.setJSON('NEURAL NETWORK SETTINGS', v);
    },

    get EditorSettings() {
      return Store.getJSON('EDITOR_SETTINGS_KEY', null);
    },
    set EditorSettings(v) {
      Store.setJSON('EDITOR_SETTINGS_KEY', v);
    },

    get LastCreatureDesign() {
      return Store.getString('LAST_CREATURE_DESIGN_KEY', '');
    },
    set LastCreatureDesign(v) {
      Store.setString('LAST_CREATURE_DESIGN_KEY', v);
    },

    reset: function () {
      Store.deleteAll();
    },
  };

  /* ------------------------------------------------------------------ *
   * Theme — applies the saved light/dark appearance to both DOM and canvas
   * renderers. Kept here so it runs in the document head before app startup.
   * ------------------------------------------------------------------ */
  var Theme = {
    normalize: function (value) {
      return value === 'dark' ? 'dark' : 'light';
    },

    apply: function (value, redraw) {
      var theme = this.normalize(value);
      var doc = global.document;
      if (doc && doc.documentElement) {
        var root = doc.documentElement;
        if (typeof root.setAttribute === 'function') root.setAttribute('data-theme', theme);
        if (root.style) root.style.colorScheme = theme;
        var themeColor = doc.querySelector && doc.querySelector('meta[name="theme-color"]');
        if (themeColor && typeof themeColor.setAttribute === 'function') {
          themeColor.setAttribute('content', theme === 'dark' ? '#17191c' : '#ededed');
        }
      }
      if (EVO.Renderer && typeof EVO.Renderer.setTheme === 'function') {
        EVO.Renderer.setTheme(theme);
      }
      if (EVO.SceneTheme && typeof EVO.SceneTheme.setTheme === 'function') {
        EVO.SceneTheme.setTheme(theme);
      }
      if (redraw !== false && EVO.App && EVO.App.current) {
        if (typeof EVO.App.current.resize === 'function') EVO.App.current.resize();
        else if (typeof EVO.App.current.render === 'function') EVO.App.current.render();
      }
      return theme;
    },
  };

  // Applying in the head avoids a light flash before a saved dark theme loads.
  Theme.apply(Settings.Theme, false);

  /* ------------------------------------------------------------------ *
   * Misc DOM helpers
   * ------------------------------------------------------------------ */
  var UI = {
    /** Creates an element with the given class name, text and attributes. */
    el: function (tag, className, text) {
      var node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined && text !== null) node.textContent = String(text);
      return node;
    },
    makeButton: function (label, className, onClick) {
      var button = UI.el('button', 'evo-button' + (className ? ' ' + className : ''), label);
      if (onClick) button.addEventListener('click', onClick);
      return button;
    },
    clear: function (node) {
      while (node.firstChild) node.removeChild(node.firstChild);
    },
    setVisible: function (node, visible) {
      node.style.display = visible ? '' : 'none';
    },
  };

  EVO.Utils = MathUtils;
  EVO.GaussianPRNG = GaussianPRNG;
  EVO.RandomPicker = RandomPicker;
  EVO.Store = Store;
  EVO.Settings = Settings;
  EVO.Theme = Theme;
  EVO.UI = UI;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = EVO;
  }
})(typeof window !== 'undefined' ? window : globalThis);
