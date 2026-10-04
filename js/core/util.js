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
  EVO.UI = UI;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = EVO;
  }
})(typeof window !== 'undefined' ? window : globalThis);
