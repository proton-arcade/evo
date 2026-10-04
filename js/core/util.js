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

  /* ------------------------------------------------------------------ *
   * Cookies
   *
   * A second, portable place to keep the data of the game.  Cookies are
   * much smaller than the Web Storage API (about 4 KB per cookie and only
   * a few dozen cookies per site), but they are also available in browsers
   * that block localStorage for pages which are opened from the file
   * system.  Large values are therefore split into several cookies and the
   * total size of the cookie backup is capped, so that the cookie header
   * of a request never grows beyond what a web server accepts.
   * ------------------------------------------------------------------ */
  var COOKIE_PREFIX = 'evo.';
  var COOKIE_CHUNK_SEPARATOR = '~';
  var COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // one year

  var Cookie = {
    enabled: false,
    doc: null,
    maxAge: COOKIE_MAX_AGE,

    /** Detects whether cookies can be written and read at all. */
    init: function () {
      var doc = global.document;
      if (!doc || typeof doc.cookie !== 'string') {
        this.enabled = false;
        return false;
      }
      this.doc = doc;
      var testKey = COOKIE_PREFIX + 'cookieTest';
      try {
        doc.cookie = testKey + '=1; path=/; max-age=60; SameSite=Lax';
        this.enabled = doc.cookie.indexOf(testKey + '=1') !== -1;
        if (this.enabled) doc.cookie = testKey + '=; path=/; max-age=0; SameSite=Lax';
      } catch (error) {
        this.enabled = false;
      }
      return this.enabled;
    },

    raw: function () {
      return this.enabled && this.doc ? this.doc.cookie : '';
    },

    get: function (name) {
      if (!this.enabled) return null;
      var parts = String(this.doc.cookie || '').split(';');
      for (var i = 0; i < parts.length; i++) {
        var index = parts[i].indexOf('=');
        if (index < 0) continue;
        var key = parts[i].slice(0, index).replace(/^\s+/, '');
        if (key === name) return parts[i].slice(index + 1);
      }
      return null;
    },

    set: function (name, value, maxAge) {
      if (!this.enabled) return false;
      try {
        this.doc.cookie =
          name + '=' + value + '; path=/; max-age=' + (maxAge || this.maxAge) + '; SameSite=Lax';
        // Verify the write: browsers silently drop cookies that are too
        // large or that exceed the cookie limit of the site.
        return this.get(name) === value;
      } catch (error) {
        return false;
      }
    },

    remove: function (name) {
      if (!this.enabled) return false;
      try {
        this.doc.cookie = name + '=; path=/; max-age=0; SameSite=Lax';
      } catch (error) {
        return false;
      }
      return true;
    },
  };

  /* --- Text <-> cookie safe payload ---------------------------------- */
  function utf8Bytes(string) {
    var bytes = [];
    for (var i = 0; i < string.length; i++) {
      var code = string.charCodeAt(i);
      if (code < 0x80) {
        bytes.push(code);
      } else if (code < 0x800) {
        bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
      } else if (code >= 0xd800 && code <= 0xdbff && i + 1 < string.length) {
        var next = string.charCodeAt(i + 1);
        var point = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        i++;
        bytes.push(
          0xf0 | (point >> 18),
          0x80 | ((point >> 12) & 0x3f),
          0x80 | ((point >> 6) & 0x3f),
          0x80 | (point & 0x3f)
        );
      } else {
        bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
      }
    }
    return bytes;
  }

  function bytesToUtf8(bytes) {
    var result = '';
    for (var i = 0; i < bytes.length; i++) {
      var byte = bytes[i];
      if (byte < 0x80) {
        result += String.fromCharCode(byte);
      } else if (byte < 0xe0) {
        result += String.fromCharCode(((byte & 0x1f) << 6) | (bytes[++i] & 0x3f));
      } else if (byte < 0xf0) {
        result += String.fromCharCode(
          ((byte & 0x0f) << 12) | ((bytes[++i] & 0x3f) << 6) | (bytes[++i] & 0x3f)
        );
      } else {
        var point =
          ((byte & 0x07) << 18) |
          ((bytes[++i] & 0x3f) << 12) |
          ((bytes[++i] & 0x3f) << 6) |
          (bytes[++i] & 0x3f);
        point -= 0x10000;
        result += String.fromCharCode(0xd800 + (point >> 10), 0xdc00 + (point & 0x3ff));
      }
    }
    return result;
  }

  function canBase64() {
    return typeof global.btoa === 'function' && typeof global.atob === 'function';
  }

  /** Base64url of the UTF-8 bytes of `string` (cookie safe). */
  function base64UrlEncode(string) {
    var bytes = utf8Bytes(string);
    var binary = '';
    var BLOCK = 0x4000;
    for (var i = 0; i < bytes.length; i += BLOCK) {
      binary += String.fromCharCode.apply(null, bytes.slice(i, i + BLOCK));
    }
    return global.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function base64UrlDecode(encoded) {
    var base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) base64 += '=';
    var binary = global.atob(base64);
    var bytes = new Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i) & 0xff;
    return bytesToUtf8(bytes);
  }

  function byteLength(string) {
    return utf8Bytes(string).length;
  }

  /** Encodes a value for a cookie: "b:" base64url, "p:" percent encoded. */
  function encodePayload(string) {
    if (canBase64()) {
      try {
        return 'b:' + base64UrlEncode(string);
      } catch (error) {
        /* fall through to the percent encoding */
      }
    }
    return 'p:' + encodeURIComponent(string);
  }

  function decodePayload(encoded) {
    if (!encoded) return '';
    var type = encoded.slice(0, 2);
    var body = encoded.slice(2);
    if (type === 'b:' && canBase64()) {
      try {
        return base64UrlDecode(body);
      } catch (error) {
        /* fall through */
      }
    }
    if (type === 'p:') {
      try {
        return decodeURIComponent(body);
      } catch (error) {
        return body;
      }
    }
    try {
      return decodeURIComponent(encoded);
    } catch (error) {
      return encoded;
    }
  }

  function safeDecodeURIComponent(value) {
    try {
      return decodeURIComponent(value);
    } catch (error) {
      return value;
    }
  }

  /* ------------------------------------------------------------------ *
   * CookieStore — a key/value store that keeps large values in several
   * cookies.  Values are addressed by their logical key (the same key
   * that `Store` uses), chunked values are kept in `evo.<key>~0`, …
   * ------------------------------------------------------------------ */
  /**
   * How much space the cookie backup may use.  Every cookie is sent to a
   * server with each request, so a page that is hosted on the web keeps a
   * much smaller backup than a page that is opened from the file system
   * (where nothing is ever sent).
   */
  var COOKIE_BUDGETS = {
    small: { label: 'Small (~11 KB)', maxTotalChunks: 8, maxChunksPerKey: 6 },
    medium: { label: 'Medium (~22 KB)', maxTotalChunks: 16, maxChunksPerKey: 12 },
    large: { label: 'Large (~56 KB)', maxTotalChunks: 40, maxChunksPerKey: 30 },
    maximum: { label: 'Maximum (~125 KB)', maxTotalChunks: 90, maxChunksPerKey: 60 },
  };

  function cookieBudgetForProtocol() {
    var protocol = global.location && global.location.protocol;
    if (protocol === 'file:') return 'large';
    if (protocol === 'http:' || protocol === 'https:') return 'small';
    return 'medium';
  }

  function CookieStore(budget) {
    this.available = Cookie.enabled;
    // ~1.4 KB per cookie keeps every browser and every server happy.
    this.chunkSize = 1400;
    this.maxAge = COOKIE_MAX_AGE;
    this.cache = Object.create(null);
    this.applyBudget(budget || cookieBudgetForProtocol());
  }

  CookieStore.prototype.applyBudget = function (budget) {
    var preset = COOKIE_BUDGETS[budget] || COOKIE_BUDGETS[cookieBudgetForProtocol()];
    this.budget = budget;
    this.maxTotalChunks = preset.maxTotalChunks;
    this.maxChunksPerKey = preset.maxChunksPerKey;
    return this;
  };

  CookieStore.prototype.budgetLabel = function () {
    var preset = COOKIE_BUDGETS[this.budget];
    return preset ? preset.label : this.budget;
  };

  CookieStore.prototype.nameFor = function (key, index) {
    var name = COOKIE_PREFIX + encodeURIComponent(key).replace(/~/g, '%7E');
    if (index !== undefined && index !== null) name += COOKIE_CHUNK_SEPARATOR + index;
    return name;
  };

  CookieStore.prototype.keyFor = function (name) {
    if (name.indexOf(COOKIE_PREFIX) !== 0) return null;
    var rest = name.slice(COOKIE_PREFIX.length);
    var separator = rest.lastIndexOf(COOKIE_CHUNK_SEPARATOR);
    var isChunk = false;
    if (separator > 0 && /^\d+$/.test(rest.slice(separator + 1))) {
      rest = rest.slice(0, separator);
      isChunk = true;
    }
    return { key: safeDecodeURIComponent(rest), chunk: isChunk };
  };

  CookieStore.prototype.cookies = function () {
    var result = [];
    if (!this.available) return result;
    var parts = String(Cookie.raw() || '').split(';');
    for (var i = 0; i < parts.length; i++) {
      var index = parts[i].indexOf('=');
      if (index <= 0) continue;
      var name = parts[i].slice(0, index).replace(/^\s+/, '');
      if (name.indexOf(COOKIE_PREFIX) !== 0) continue;
      result.push({ name: name, value: parts[i].slice(index + 1), length: parts[i].length });
    }
    return result;
  };

  CookieStore.prototype.keys = function () {
    var seen = Object.create(null);
    var result = [];
    var self = this;
    this.cookies().forEach(function (cookie) {
      var parsed = self.keyFor(cookie.name);
      if (!parsed || parsed.chunk || seen[parsed.key]) return;
      seen[parsed.key] = true;
      result.push(parsed.key);
    });
    return result;
  };

  CookieStore.prototype.getItem = function (key) {
    if (!this.available) return null;
    if (Object.prototype.hasOwnProperty.call(this.cache, key)) return this.cache[key];

    var header = Cookie.get(this.nameFor(key));
    if (header === null) return null;
    var parts = header.split(':');
    var value;

    if (parts[0] === 'v1') {
      value = decodePayload(header.slice(3));
    } else if (parts[0] === 'c1') {
      var count = parseInt(parts[1], 10);
      var expectedLength = parseInt(parts[2], 10);
      var encoding = parts[3] === 'b' ? 'b' : 'p';
      if (!isFinite(count) || count <= 0) return null;
      var payload = '';
      for (var i = 0; i < count; i++) {
        var chunk = Cookie.get(this.nameFor(key, i));
        if (chunk === null) return null;
        payload += chunk;
      }
      value = decodePayload(encoding + ':' + payload);
      // A dropped chunk (cookie limit) must never produce broken data.
      if (isFinite(expectedLength) && byteLength(value) !== expectedLength) return null;
    } else {
      return null;
    }

    this.cache[key] = value;
    return value;
  };

  /**
   * How many cookies a value needs — a chunked value also needs one cookie
   * for its header, and that cookie counts towards the budget as well.
   */
  CookieStore.prototype.chunksFor = function (value) {
    var encoded = encodePayload(String(value));
    var chunks = Math.max(1, Math.ceil(Math.max(0, encoded.length - 2) / this.chunkSize));
    return chunks === 1 ? 1 : chunks + 1;
  };

  CookieStore.prototype.usedChunks = function (excludeKey) {
    var count = 0;
    var self = this;
    this.cookies().forEach(function (cookie) {
      var parsed = self.keyFor(cookie.name);
      if (!parsed) return;
      if (excludeKey && parsed.key === excludeKey) return;
      count += 1;
    });
    return count;
  };

  CookieStore.prototype.availableChunks = function (excludeKey) {
    return Math.max(0, this.maxTotalChunks - this.usedChunks(excludeKey));
  };

  CookieStore.prototype.setItem = function (key, value) {
    if (!this.available) return false;
    value = String(value);
    var encoded = encodePayload(value);
    // `encoded` starts with the type of the encoding ("b:" or "p:").  For a
    // chunked value that marker moves into the header cookie, so that the
    // chunks can simply be concatenated again when the value is read.
    var encoding = encoded.slice(0, 1);
    var body = encoded.slice(2);
    var chunks = Math.max(1, Math.ceil(body.length / this.chunkSize));
    var needed = chunks === 1 ? 1 : chunks + 1; // + the header cookie
    if (needed > this.maxChunksPerKey) return false;
    if (this.availableChunks(key) < needed) return false;

    this.removeItem(key, true);
    var name = this.nameFor(key);
    if (chunks === 1) {
      if (!Cookie.set(name, 'v1:' + encoded, this.maxAge)) return false;
    } else {
      if (
        !Cookie.set(name, 'c1:' + chunks + ':' + byteLength(value) + ':' + encoding, this.maxAge)
      ) {
        return false;
      }
      for (var i = 0; i < chunks; i++) {
        var part = body.substr(i * this.chunkSize, this.chunkSize);
        if (!Cookie.set(this.nameFor(key, i), part, this.maxAge)) {
          this.removeItem(key, true);
          return false;
        }
      }
    }
    this.cache[key] = value;
    return true;
  };

  CookieStore.prototype.removeItem = function (key, keepCache) {
    if (!this.available) return;
    var self = this;
    this.cookies().forEach(function (cookie) {
      var parsed = self.keyFor(cookie.name);
      if (parsed && parsed.key === key) Cookie.remove(cookie.name);
    });
    if (!keepCache) delete this.cache[key];
  };

  CookieStore.prototype.clear = function () {
    var self = this;
    this.cookies().forEach(function (cookie) {
      Cookie.remove(cookie.name);
    });
    this.cache = Object.create(null);
  };

  CookieStore.prototype.usage = function () {
    var cookies = this.cookies();
    var bytes = 0;
    cookies.forEach(function (cookie) {
      bytes += cookie.length;
    });
    return {
      keys: this.keys().length,
      cookies: cookies.length,
      bytes: bytes,
      maxCookies: this.maxTotalChunks,
    };
  };

  /* ------------------------------------------------------------------ *
   * The store that the game uses: localStorage when the browser allows
   * it, cookies as a second (mirrored) copy and an in-memory store as a
   * last resort.
   * ------------------------------------------------------------------ */
  var localStorageAvailable = false;
  try {
    var testKey = '__evo_test__';
    global.localStorage.setItem(testKey, '1');
    global.localStorage.removeItem(testKey);
    localStorageAvailable = true;
  } catch (e) {
    localStorageAvailable = false;
  }

  Cookie.init();
  var cookieStore = Cookie.enabled ? new CookieStore() : null;
  var backingStore = localStorageAvailable ? global.localStorage : cookieStore || new MemoryStore();
  // Cookies are used as a backup whenever localStorage is the main store.
  var mirrorStore = localStorageAvailable ? cookieStore : null;

  /**
   * The keys of a storage object.  `localStorage` exposes the `length`/`key`
   * pair of the Storage interface and (depending on the browser) a `keys()`
   * method that returns an iterator, while the small stores of this file
   * return plain arrays — so all of them are handled here.
   */
  function storeKeys(store) {
    var result = [];
    if (!store) return result;
    var index;
    if (typeof store.length === 'number' && typeof store.key === 'function') {
      for (index = 0; index < store.length; index++) {
        var entry = store.key(index);
        if (entry !== null && entry !== undefined) result.push(entry);
      }
      return result;
    }
    if (typeof store.keys === 'function') {
      var keys = store.keys();
      if (keys && typeof keys.length === 'number') return Array.prototype.slice.call(keys);
      if (keys && typeof keys.next === 'function') {
        var step = keys.next();
        var guard = 0;
        while (!step.done && guard++ < 100000) {
          result.push(step.value);
          step = keys.next();
        }
        return result;
      }
    }
    return Object.keys(store);
  }

  /** Strips the "evo." prefix that the stores of this file use. */
  function normalizeKey(name) {
    return String(name).indexOf('evo.') === 0 ? String(name).slice(4) : String(name);
  }

  /** Lower numbers are dropped first when the cookie budget runs out. */
  var MIRROR_PRIORITY = { recordings: 0, simulations: 1, designs: 2 };
  var MIRROR_DEBOUNCE = 400;
  var mirrorStatus = Object.create(null);
  var mirrorPending = Object.create(null);
  var mirrorTimers = Object.create(null);

  function mirrorPriorityOf(key) {
    return MIRROR_PRIORITY[key] === undefined ? 3 : MIRROR_PRIORITY[key];
  }

  /** Drops the least important mirrored value to make room for another. */
  function evictMirroredValue(priority) {
    if (!mirrorStore) return false;
    var candidate = null;
    var candidatePriority = Infinity;
    var candidateSize = -1;
    mirrorStore.keys().forEach(function (key) {
      var keyPriority = mirrorPriorityOf(key);
      if (keyPriority >= priority) return;
      var value = mirrorStore.getItem(key);
      var size = value ? value.length : 0;
      if (keyPriority < candidatePriority || (keyPriority === candidatePriority && size > candidateSize)) {
        candidate = key;
        candidatePriority = keyPriority;
        candidateSize = size;
      }
    });
    if (!candidate) return false;
    mirrorStore.removeItem(candidate);
    mirrorStatus[candidate] = 'evicted';
    return true;
  }

  /**
   * Cookies only hold a fraction of what localStorage can keep.  Lists of
   * recordings or simulations are therefore shortened to the newest
   * entries that still fit into the cookie budget.
   */
  function trimArrayValue(value, store, maxChunks) {
    if (!value || value.charAt(0) !== '[') return null;
    var array;
    try {
      array = JSON.parse(value);
    } catch (error) {
      return null;
    }
    if (!array || typeof array.length !== 'number' || array.length < 2) return null;
    var limit = Math.max(1, Math.min(store.maxChunksPerKey, maxChunks || store.maxChunksPerKey));
    var low = 1;
    var high = array.length;
    var best = null;
    while (low <= high) {
      var middle = Math.floor((low + high) / 2);
      var candidate = JSON.stringify(array.slice(0, middle));
      if (store.chunksFor(candidate) <= limit) {
        best = candidate;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    return best;
  }

  var Store = {
    available: localStorageAvailable || !!cookieStore,
    backend: localStorageAvailable ? 'localStorage' : cookieStore ? 'cookies' : 'memory',
    localStorageAvailable: localStorageAvailable,
    cookieAvailable: !!cookieStore,
    /** Set when a value could not be written at all (quota). */
    quotaExceeded: false,

    getString: function (key, defaultValue) {
      var value = backingStore.getItem('evo.' + key);
      if ((value === null || value === undefined) && mirrorStore) {
        value = mirrorStore.getItem(key);
        if (value !== null && value !== undefined) {
          // Restore the backup into the main store, e.g. after the browser
          // cleared localStorage or after the folder was moved.
          try {
            backingStore.setItem('evo.' + key, value);
          } catch (error) {
            /* the main store is full — the cookie copy is still there */
          }
        }
      }
      return value === null || value === undefined ? defaultValue : value;
    },

    setString: function (key, value) {
      var stored = false;
      try {
        backingStore.setItem('evo.' + key, value);
        stored = true;
      } catch (error) {
        stored = false;
      }
      if (mirrorStore) {
        var status = this.mirror(key, value);
        if (!stored && (status === 'ok' || status === 'partial')) stored = true;
      }
      this.quotaExceeded = !stored;
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
    /**
     * Copies a value into the cookies.  Writes are debounced because the
     * editor saves the design on every slider movement.
     */
    mirror: function (key, value, immediate) {
      if (!mirrorStore) {
        mirrorStatus[key] = 'unavailable';
        return 'unavailable';
      }
      if (!Settings || !Settings.CookieBackup) {
        mirrorStatus[key] = 'disabled';
        return 'disabled';
      }
      if (immediate) {
        if (mirrorTimers[key]) {
          clearTimeout(mirrorTimers[key]);
          delete mirrorTimers[key];
        }
        return this.writeMirror(key, value);
      }
      mirrorPending[key] = value;
      if (mirrorTimers[key]) clearTimeout(mirrorTimers[key]);
      var self = this;
      mirrorTimers[key] = setTimeout(function () {
        delete mirrorTimers[key];
        var pending = mirrorPending[key];
        delete mirrorPending[key];
        self.writeMirror(key, pending);
      }, MIRROR_DEBOUNCE);
      return 'pending';
    },

    /** Makes room if necessary and writes one value into the cookies. */
    tryWriteMirror: function (key, value, priority) {
      var needed = mirrorStore.chunksFor(value);
      if (needed > mirrorStore.maxChunksPerKey) return 'too-big';
      var guard = 0;
      while (mirrorStore.availableChunks(key) < needed && guard++ < 20) {
        if (!evictMirroredValue(priority)) break;
      }
      return mirrorStore.setItem(key, value) ? 'ok' : 'failed';
    },

    writeMirror: function (key, value) {
      if (!mirrorStore) return 'unavailable';
      if (!Settings || !Settings.CookieBackup) {
        mirrorStatus[key] = 'disabled';
        return 'disabled';
      }
      var priority = mirrorPriorityOf(key);
      if (this.tryWriteMirror(key, value, priority) === 'ok') {
        mirrorStatus[key] = 'ok';
        return 'ok';
      }

      // A list (recordings, simulations, designs) can be shortened: keep the
      // newest entries that still fit into the remaining cookie budget.
      var trimmed = trimArrayValue(value, mirrorStore, mirrorStore.availableChunks(key));
      if (trimmed !== null && this.tryWriteMirror(key, trimmed, priority) === 'ok') {
        mirrorStatus[key] = 'partial';
        return 'partial';
      }

      // Do not keep a stale copy that no longer matches the stored value.
      mirrorStore.removeItem(key);
      mirrorStatus[key] = 'too-big';
      return 'too-big';
    },

    setCookieBudget: function (name) {
      if (!mirrorStore) return false;
      mirrorStore.applyBudget(name);
      this.backupToCookies();
      return true;
    },

    cookieBudget: function () {
      return mirrorStore ? mirrorStore.budget : cookieBudgetForProtocol();
    },

    cookieBudgetLabel: function () {
      return mirrorStore ? mirrorStore.budgetLabel() : '';
    },

    /** Writes every pending cookie backup immediately. */
    flushMirror: function () {
      var self = this;
      Object.keys(mirrorPending).forEach(function (key) {
        if (mirrorTimers[key]) {
          clearTimeout(mirrorTimers[key]);
          delete mirrorTimers[key];
        }
        var pending = mirrorPending[key];
        delete mirrorPending[key];
        self.writeMirror(key, pending);
      });
    },

    mirrorStatus: function () {
      return mirrorStatus;
    },

    /** Copies everything that is stored into the cookies right now. */
    backupToCookies: function () {
      this.flushMirror();
      if (!mirrorStore) {
        return { available: false, copied: 0, skipped: [], partial: [] };
      }
      var self = this;
      var copied = 0;
      var partial = [];
      var skipped = [];
      this.keys().forEach(function (key) {
        var value = self.getString(key, null);
        if (value === null || value === undefined) return;
        var status = self.writeMirror(key, value);
        if (status === 'ok') copied++;
        else if (status === 'partial') partial.push(key);
        else skipped.push(key);
      });
      return { available: true, copied: copied, skipped: skipped, partial: partial };
    },

    /**
     * Reads the cookie backup back into the main store.  Only missing
     * keys are restored unless `overwrite` is true.
     */
    restoreFromCookies: function (overwrite) {
      if (!mirrorStore) return 0;
      var restored = 0;
      mirrorStore.keys().forEach(function (key) {
        var existing = backingStore.getItem('evo.' + key);
        if (existing !== null && existing !== undefined && !overwrite) return;
        var value = mirrorStore.getItem(key);
        if (value === null || value === undefined) return;
        try {
          backingStore.setItem('evo.' + key, value);
          restored++;
        } catch (error) {
          /* ignore */
        }
      });
      return restored;
    },

    /** How many of the stored keys are also kept in the cookies. */
    cookieCoverage: function () {
      if (!mirrorStore) return { backed: 0, missing: [], total: 0 };
      var keys = this.keys();
      var backed = [];
      mirrorStore.keys().forEach(function (key) {
        backed.push(key);
      });
      var missing = keys.filter(function (key) {
        return backed.indexOf(key) === -1;
      });
      return { backed: backed.length, missing: missing, total: keys.length };
    },

    cookieUsage: function () {
      return mirrorStore
        ? mirrorStore.usage()
        : { keys: 0, cookies: 0, bytes: 0, maxCookies: 0 };
    },

    /** Approximate size of everything that is stored, in bytes. */
    usage: function () {
      var bytes = 0;
      var self = this;
      this.keys().forEach(function (key) {
        var value = self.getString(key, '');
        bytes += key.length + (value ? byteLength(value) : 0);
      });
      return bytes;
    },

    remove: function (key) {
      backingStore.removeItem('evo.' + key);
      if (mirrorStore) mirrorStore.removeItem(key);
      if (mirrorTimers[key]) {
        clearTimeout(mirrorTimers[key]);
        delete mirrorTimers[key];
      }
      delete mirrorPending[key];
      delete mirrorStatus[key];
    },

    /** The keys that are held in the main (non cookie) store. */
    primaryKeys: function () {
      return storeKeys(backingStore).map(normalizeKey);
    },

    keys: function () {
      var seen = Object.create(null);
      var result = [];
      function add(name) {
        if (!name || seen[name]) return;
        seen[name] = true;
        result.push(name);
      }
      storeKeys(backingStore).forEach(function (key) {
        add(normalizeKey(key));
      });
      if (mirrorStore) {
        storeKeys(mirrorStore).forEach(function (key) {
          add(normalizeKey(key));
        });
      }
      return result;
    },

    deleteAll: function () {
      var self = this;
      this.keys().forEach(function (key) {
        self.remove(key);
      });
      if (mirrorStore) mirrorStore.clear();
      mirrorStatus = Object.create(null);
    },

    /** Removes everything that belongs to the game, including cookies. */
    clearCookies: function () {
      if (mirrorStore) mirrorStore.clear();
      mirrorStatus = Object.create(null);
    },
  };

  // Flush pending cookie backups before the page goes away.
  if (global.addEventListener && global.document) {
    var flush = function () {
      Store.flushMirror();
    };
    global.addEventListener('pagehide', flush);
    global.addEventListener('beforeunload', flush);
    if (global.document.addEventListener) {
      global.document.addEventListener('visibilitychange', function () {
        if (global.document.visibilityState === 'hidden') flush();
      });
    }
  }

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

    /* --- Cookies and session ---------------------------------------- */
    /** Mirror everything into cookies as well (see Store.mirror). */
    get CookieBackup() {
      return Store.getBool('COOKIE_BACKUP_KEY', true);
    },
    set CookieBackup(v) {
      Store.setBool('COOKIE_BACKUP_KEY', v);
    },

    /** How much space the cookie backup may use (see COOKIE_BUDGETS). */
    get CookieBudget() {
      return Store.getString('COOKIE_BUDGET_KEY', cookieBudgetForProtocol());
    },
    set CookieBudget(v) {
      Store.setString('COOKIE_BUDGET_KEY', v);
    },

    /** Offer to continue where the game was left. */
    get RememberLastScreen() {
      return Store.getBool('REMEMBER_LAST_SCREEN_KEY', true);
    },
    set RememberLastScreen(v) {
      Store.setBool('REMEMBER_LAST_SCREEN_KEY', v);
    },

    get LastScreen() {
      return Store.getString('LAST_SCREEN_KEY', '');
    },
    set LastScreen(v) {
      Store.setString('LAST_SCREEN_KEY', v);
    },

    get LastScreenTitle() {
      return Store.getString('LAST_SCREEN_TITLE_KEY', '');
    },
    set LastScreenTitle(v) {
      Store.setString('LAST_SCREEN_TITLE_KEY', v);
    },

    /** Every key that holds a setting (never designs, recordings, …). */
    SETTING_KEYS: [
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
      'COOKIE_BACKUP_KEY',
      'COOKIE_BUDGET_KEY',
      'REMEMBER_LAST_SCREEN_KEY',
    ],

    /** Resets the settings only — saves and creatures are kept. */
    reset: function () {
      this.SETTING_KEYS.forEach(function (key) {
        Store.remove(key);
      });
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
  EVO.Cookie = Cookie;
  EVO.CookieStore = CookieStore;
  EVO.COOKIE_BUDGETS = COOKIE_BUDGETS;
  EVO.byteLength = byteLength;
  EVO.Store = Store;
  EVO.Settings = Settings;
  EVO.UI = UI;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = EVO;
  }
})(typeof window !== 'undefined' ? window : globalThis);
