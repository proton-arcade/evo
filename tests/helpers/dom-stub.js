/*
 * A very small DOM stub for the tests — just enough of `document`, `window`
 * and the canvas 2D API to build the screens of the game in node.
 *
 * It is deliberately tiny: it is used to check that the screens can be
 * built (and that the new storage and help code runs), not to check pixels.
 */
'use strict';

function createContext2D() {
  var target = {
    measureText: function () {
      return { width: 8 };
    },
    createLinearGradient: function () {
      return { addColorStop: function () {} };
    },
    getImageData: function () {
      return { data: [] };
    },
    canvas: null,
  };
  return new Proxy(target, {
    get: function (object, key) {
      if (key in object) return object[key];
      return function () {
        return object;
      };
    },
    set: function (object, key, value) {
      object[key] = value;
      return true;
    },
  });
}

function Element(tag) {
  this.tagName = String(tag || 'div').toUpperCase();
  this.className = '';
  this.children = [];
  this.style = {};
  this.attributes = {};
  this.listeners = {};
  this.parentNode = null;
  this._text = '';
  this.value = '';
  this.checked = false;
  this.clientWidth = 800;
  this.clientHeight = 600;
  this.width = 800;
  this.height = 600;
  this.classList = {
    add: (function (self) {
      return function (name) {
        if (!self._hasClass(name)) self.className = (self.className + ' ' + name).trim();
      };
    })(this),
    remove: (function (self) {
      return function (name) {
        self.className = self.className
          .split(/\s+/)
          .filter(function (entry) {
            return entry && entry !== name;
          })
          .join(' ');
      };
    })(this),
    toggle: (function (self) {
      return function (name, on) {
        var has = self._hasClass(name);
        var value = on === undefined ? !has : !!on;
        if (value) self.classList.add(name);
        else self.classList.remove(name);
      };
    })(this),
    contains: (function (self) {
      return function (name) {
        return self._hasClass(name);
      };
    })(this),
  };
}

Element.prototype._hasClass = function (name) {
  return this.className.split(/\s+/).indexOf(name) !== -1;
};

Element.prototype.appendChild = function (child) {
  if (child.parentNode) child.parentNode.removeChild(child);
  child.parentNode = this;
  this.children.push(child);
  return child;
};

Element.prototype.removeChild = function (child) {
  var index = this.children.indexOf(child);
  if (index !== -1) this.children.splice(index, 1);
  child.parentNode = null;
  return child;
};

Element.prototype.insertBefore = function (child, reference) {
  var index = this.children.indexOf(reference);
  if (index === -1) return this.appendChild(child);
  if (child.parentNode) child.parentNode.removeChild(child);
  child.parentNode = this;
  this.children.splice(index, 0, child);
  return child;
};

Element.prototype.addEventListener = function (name, handler) {
  (this.listeners[name] = this.listeners[name] || []).push(handler);
};

Element.prototype.removeEventListener = function (name, handler) {
  var list = this.listeners[name] || [];
  var index = list.indexOf(handler);
  if (index !== -1) list.splice(index, 1);
};

Element.prototype.setAttribute = function (name, value) {
  this.attributes[name] = value;
};

Element.prototype.getAttribute = function (name) {
  return this.attributes[name];
};

Element.prototype.querySelector = function (selector) {
  return find(this, selector);
};

Element.prototype.querySelectorAll = function (selector) {
  var result = [];
  collect(this, selector, result);
  return result;
};

Element.prototype.contains = function (node) {
  var current = node;
  while (current) {
    if (current === this) return true;
    current = current.parentNode;
  }
  return false;
};

Element.prototype.getBoundingClientRect = function () {
  return { left: 0, top: 0, right: this.clientWidth, bottom: this.clientHeight, width: this.clientWidth, height: this.clientHeight };
};

Element.prototype.getContext = function () {
  if (!this._context) {
    this._context = createContext2D();
    this._context.canvas = this;
  }
  return this._context;
};

Element.prototype.focus = function () {};
Element.prototype.click = function () {
  dispatch(this, 'click', { target: this });
};
Element.prototype.toDataURL = function () {
  return 'data:,';
};

Object.defineProperty(Element.prototype, 'firstChild', {
  get: function () {
    return this.children[0] || null;
  },
});

Object.defineProperty(Element.prototype, 'textContent', {
  get: function () {
    if (this._isTextNode) return this._text;
    return this.children
      .map(function (child) {
        return child.textContent;
      })
      .join('');
  },
  set: function (value) {
    this.children.length = 0;
    this._text = String(value);
    if (this._isTextNode) return;
    if (this._text) this.appendChild(document.createTextNode(this._text));
  },
});

function matches(node, selector) {
  if (selector.charAt(0) === '.') return node._hasClass(selector.slice(1));
  if (selector.charAt(0) === '#') return node.id === selector.slice(1);
  return node.tagName === selector.toUpperCase();
}

function collect(node, selector, result) {
  node.children.forEach(function (child) {
    if (!child._isTextNode && matches(child, selector)) result.push(child);
    collect(child, selector, result);
  });
}

function find(node, selector) {
  var result = [];
  collect(node, selector, result);
  return result[0] || null;
}

function dispatch(node, name, event) {
  event = event || {};
  event.target = event.target || node;
  (node.listeners[name] || []).forEach(function (handler) {
    handler.call(node, event);
  });
}

/** Walks a tree and returns every element whose text is `label`. */
function findByText(node, label, tagName) {
  var result = [];
  (function walk(current) {
    if (!current._isTextNode) {
      if (
        current.textContent === label &&
        (!tagName || current.tagName === tagName.toUpperCase()) &&
        current.listeners.click
      ) {
        result.push(current);
      }
      current.children.forEach(walk);
    }
  })(node);
  return result;
}

function install(global) {
  // The game is written for browsers and uses the bare `window` in a few
  // places; in node it is simply the global object itself.
  if (!global.window) {
    try {
      global.window = global;
    } catch (error) {
      /* some environments define window as a getter */
    }
  }

  var document = {
    _elements: {},
    readyState: 'complete',
    visibilityState: 'visible',
    listeners: {},
    createElement: function (tag) {
      return new Element(tag);
    },
    createTextNode: function (text) {
      var node = new Element('#text');
      node._isTextNode = true;
      node._text = String(text);
      return node;
    },
    getElementById: function (id) {
      return this._elements[id] || null;
    },
    addEventListener: function (name, handler) {
      (this.listeners[name] = this.listeners[name] || []).push(handler);
    },
    removeEventListener: function () {},
    querySelector: function (selector) {
      return find(this.body, selector);
    },
    querySelectorAll: function (selector) {
      var result = [];
      collect(this.body, selector, result);
      return result;
    },
  };
  document.body = new Element('body');
  document.documentElement = new Element('html');

  // A cookie jar with the real "name=value; attributes" syntax.
  var jar = {};
  document._cookieJar = jar;
  Object.defineProperty(document, 'cookie', {
    configurable: true,
    get: function () {
      return Object.keys(jar)
        .map(function (name) {
          return name + '=' + jar[name];
        })
        .join('; ');
    },
    set: function (value) {
      var pair = String(value).split(';')[0];
      var index = pair.indexOf('=');
      if (index < 0) return;
      var name = pair.slice(0, index);
      var cookieValue = pair.slice(index + 1);
      if (/max-age=0(\D|$)/.test(value)) delete jar[name];
      else jar[name] = cookieValue;
    },
  });

  var screens = new Element('div');
  screens.id = 'screens';
  document._elements.screens = screens;
  document.body.appendChild(screens);

  global.document = document;
  global.devicePixelRatio = 1;
  global.innerWidth = 1024;
  global.innerHeight = 768;
  global.requestAnimationFrame = function () {
    return 0;
  };
  global.cancelAnimationFrame = function () {};
  global.addEventListener = function () {};
  global.removeEventListener = function () {};
  global.location = global.location || { protocol: 'http:', reload: function () {} };
  if (!global.navigator) {
    try {
      global.navigator = { maxTouchPoints: 0 };
    } catch (error) {
      /* node 22 defines navigator as a read only getter — nothing to do */
    }
  }
  global.btoa = global.btoa || function (value) {
    return Buffer.from(value, 'binary').toString('base64');
  };
  global.atob = global.atob || function (value) {
    return Buffer.from(value, 'base64').toString('binary');
  };
  if (!global.localStorage) {
    var memory = {};
    global.localStorage = {
      getItem: function (key) {
        return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null;
      },
      setItem: function (key, value) {
        memory[key] = String(value);
      },
      removeItem: function (key) {
        delete memory[key];
      },
      key: function (index) {
        return Object.keys(memory)[index] || null;
      },
      get length() {
        return Object.keys(memory).length;
      },
    };
  }
  if (typeof global.localStorage.keys !== 'function') {
    global.localStorage.keys = function () {
      var names = [];
      for (var index = 0; index < this.length; index++) names.push(this.key(index));
      return names;
    };
  }

  return { document: document, Element: Element, dispatch: dispatch, findByText: findByText };
}

module.exports = { install: install, Element: Element, dispatch: dispatch, findByText: findByText };
