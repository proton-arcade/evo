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
      'The best creature of every generation is recorded. Save its evolved brain to My Creatures, or save its movement replay to the Gallery.'
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

  function start() {
    try {
      EVO.App.start();

      if (EVO.Settings.ShowOnboarding) {
        showOnboarding();
      }

      if (!EVO.Store.available) {
        EVO.Modal.open({
          title: 'Storage unavailable',
          message:
            'This browser does not allow local storage for pages that are opened from the file system, ' +
            'so your creatures and simulations can only be saved as files. Everything else works normally.',
          actions: [{ label: 'OK', primary: true }],
        });
      }
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
