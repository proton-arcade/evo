/*
 * Evolution (Web Edition) — js/boot.js
 * ---------------------------------------------------------------
 * Starts the application.  This is the last script that is loaded.
 */
(function (global) {
  'use strict';

  var EVO = global.EVO;
  var UI = EVO.UI;

  /** Shows a readable message if something goes wrong. */
  function showFatalError(message, details) {
    var overlay = UI.el('div', 'modal-overlay');
    var dialog = UI.el('div', 'modal');
    dialog.appendChild(UI.el('div', 'modal-title', 'Something went wrong'));
    var body = UI.el('div', 'modal-body');
    body.appendChild(UI.el('p', 'modal-message', message));
    if (details) {
      var pre = UI.el('pre', 'error-details', String(details));
      body.appendChild(pre);
    }
    dialog.appendChild(body);
    var actions = UI.el('div', 'modal-actions');
    var button = UI.el('button', 'evo-button primary', 'Reload');
    button.addEventListener('click', function () {
      global.location.reload();
    });
    actions.appendChild(button);
    dialog.appendChild(actions);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
  }

  global.addEventListener('error', function (event) {
    if (event && event.message) {
      showFatalError('An unexpected error occurred.', event.message);
    }
  });

  function showOnboarding() {
    var content = UI.el('div', 'onboarding');
    var paragraphs = [
      'Design a creature out of joints, bones and muscles — then let evolution teach it how to move.',
      'Start with one of the sample creatures in the editor, or place joints with the joint tool and connect them with bones.',
      'Add muscles between two bones. Each muscle contracts or expands depending on the output of the creature\'s brain.',
      'Choose a task in the simulation (running, jumping, obstacle jumping, climbing or flying), press play and watch the population evolve.',
      'The best creature of every generation is recorded — you can watch it again in the gallery or save its design.',
      'Everything you create is stored in this browser (and in a cookie copy) as you work, so it is still there after a reload. Help → Saving, cookies & files explains it.',
    ];
    paragraphs.forEach(function (text) {
      content.appendChild(UI.el('p', 'modal-message', text));
    });

    var toggle = EVO.Widgets.toggle({
      label: 'Show this message on startup',
      value: true,
      onChange: function (value) {
        EVO.Settings.ShowOnboarding = value;
      },
    });

    EVO.Modal.open({
      title: 'Welcome to Evolution',
      content: content,
      actions: [{ label: 'Let\'s go', primary: true }],
    });
    EVO.Modal.root.querySelector('.modal-body').appendChild(toggle.element);
  }

  /**
   * If the browser storage is empty but the cookies still hold a copy of the
   * data (because the browser cleared the storage, or because the folder was
   * moved), the cookie copy is read back.
   */
  function restoreFromCookieBackup() {
    var Store = EVO.Store;
    if (!Store.cookieAvailable || Store.backend !== 'localStorage') return 0;
    if (Store.primaryKeys().length) return 0;
    var restored = Store.restoreFromCookies(true);
    if (restored > 0) {
      EVO.App.loadLastDesign();
      EVO.Modal.open({
        title: 'Your data is back',
        message:
          'The browser storage of this page was empty, so ' +
          restored +
          (restored === 1 ? ' entry was' : ' entries were') +
          ' restored from the cookie copy: your creatures, recordings, simulations and settings.',
        actions: [{ label: 'OK', primary: true }],
      });
    }
    return restored;
  }

  function showStorageNotice() {
    var Store = EVO.Store;
    if (Store.backend === 'memory') {
      EVO.Modal.open({
        title: 'Nothing can be saved',
        message:
          'This browser does not allow any storage for this page and it does not allow cookies ' +
          'either, so your creatures and simulations can only be saved as files. ' +
          'Use Export in the editor to keep a design. Everything else works normally.',
        actions: [{ label: 'OK', primary: true }],
      });
    } else if (Store.backend === 'cookies') {
      EVO.Modal.open({
        title: 'Saving in cookies',
        message:
          'This browser does not allow local storage for this page, so everything is kept in the ' +
          'cookies instead. Cookies are small: long recordings and big simulations may not fit. ' +
          'Use Export all data in the settings for a complete backup.',
        actions: [{ label: 'OK', primary: true }],
      });
    }
  }

  function start() {
    try {
      restoreFromCookieBackup();
      EVO.App.start();

      if (EVO.Settings.ShowOnboarding) {
        showOnboarding();
      }

      showStorageNotice();
    } catch (error) {
      showFatalError('The application could not be started.', error && error.stack ? error.stack : error);
    }
  }

  global.EVO.boot = start;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})(typeof window !== 'undefined' ? window : globalThis);
