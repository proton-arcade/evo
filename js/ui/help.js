/*
 * Evolution (Web Edition) — ui/help.js
 * ---------------------------------------------------------------
 * The help area: a searchable manual of everything in the game — every
 * screen, every tool, every property, every setting, every shortcut and
 * everything about how the simulation, the evolution and the storage work.
 *
 * The content is plain data (blocks) so that it can be searched, filtered
 * and printed without touching the DOM by hand.
 */
(function (global) {
  'use strict';

  var EVO = (global.EVO = global.EVO || {});
  var UI = EVO.UI;
  var App = EVO.App;

  /* ================================================================== *
   * Inline text: `code`, **bold** and search highlighting
   * ================================================================== */
  function appendHighlighted(parent, text, query) {
    if (!query) {
      parent.appendChild(document.createTextNode(text));
      return;
    }
    var lower = text.toLowerCase();
    var offset = 0;
    var index = lower.indexOf(query);
    while (index !== -1) {
      if (index > offset) parent.appendChild(document.createTextNode(text.slice(offset, index)));
      parent.appendChild(UI.el('mark', 'help-mark', text.substr(index, query.length)));
      offset = index + query.length;
      index = lower.indexOf(query, offset);
    }
    if (offset < text.length) parent.appendChild(document.createTextNode(text.slice(offset)));
  }

  function appendInline(parent, text, query) {
    var tokens = String(text === undefined || text === null ? '' : text).split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
    tokens.forEach(function (token) {
      if (!token) return;
      if (token.length > 2 && token.charAt(0) === '`' && token.charAt(token.length - 1) === '`') {
        parent.appendChild(UI.el('code', 'help-code', token.slice(1, -1)));
        return;
      }
      if (token.length > 4 && token.slice(0, 2) === '**' && token.slice(-2) === '**') {
        parent.appendChild(UI.el('strong', null, token.slice(2, -2)));
        return;
      }
      appendHighlighted(parent, token, query);
    });
  }

  /* ================================================================== *
   * Blocks
   * ================================================================== */
  function blockText(block) {
    switch (block.t) {
      case 'p':
      case 'note':
      case 'h':
        return block.text;
      case 'ul':
      case 'ol':
        return (block.items || []).join(' ');
      case 'table':
        return [block.head || []]
          .concat(typeof block.rows === 'function' ? block.rows() : block.rows || [])
          .map(function (row) {
            return row.join(' ');
          })
          .join(' ');
      case 'def':
        return (block.items || [])
          .map(function (item) {
            return item.term + ' ' + item.text;
          })
          .join(' ');
      case 'keys':
        return (block.items || [])
          .map(function (item) {
            return item[0] + ' ' + item[1];
          })
          .join(' ');
      default:
        return String(block.text || '');
    }
  }

  function renderBlock(block, query) {
    var node;
    switch (block.t) {
      case 'note':
        node = UI.el('p', 'help-note');
        appendInline(node, block.text, query);
        return node;

      case 'h':
        node = UI.el('h3', 'help-subheading');
        appendInline(node, block.text, query);
        return node;

      case 'ul':
      case 'ol':
        node = UI.el(block.t === 'ul' ? 'ul' : 'ol', 'help-list');
        (block.items || []).forEach(function (item) {
          var li = UI.el('li', 'help-list-item');
          appendInline(li, item, query);
          node.appendChild(li);
        });
        return node;

      case 'table': {
        var rows = typeof block.rows === 'function' ? block.rows() : block.rows || [];
        node = UI.el('table', 'help-table');
        if (block.head) {
          var head = UI.el('thead');
          var headRow = UI.el('tr');
          block.head.forEach(function (cell) {
            var th = UI.el('th');
            appendInline(th, cell, query);
            headRow.appendChild(th);
          });
          head.appendChild(headRow);
          node.appendChild(head);
        }
        var body = UI.el('tbody');
        rows.forEach(function (row) {
          var tr = UI.el('tr');
          row.forEach(function (cell, index) {
            var td = UI.el('td', index === 0 ? 'help-cell-first' : null);
            appendInline(td, cell, query);
            tr.appendChild(td);
          });
          body.appendChild(tr);
        });
        node.appendChild(body);
        var wrapper = UI.el('div', 'help-table-wrapper');
        wrapper.appendChild(node);
        return wrapper;
      }

      case 'def': {
        node = UI.el('dl', 'help-definition');
        (block.items || []).forEach(function (item) {
          var dt = UI.el('dt', 'help-term');
          appendInline(dt, item.term, query);
          var dd = UI.el('dd', 'help-description');
          appendInline(dd, item.text, query);
          node.appendChild(dt);
          node.appendChild(dd);
        });
        return node;
      }

      case 'keys': {
        node = UI.el('table', 'help-table help-keys');
        var keyBody = UI.el('tbody');
        (block.items || []).forEach(function (item) {
          var tr = UI.el('tr');
          var tdKey = UI.el('td', 'help-key-cell');
          String(item[0])
            .split('+')
            .forEach(function (part, index, all) {
              if (index > 0) tdKey.appendChild(UI.el('span', 'help-key-plus', '+'));
              tdKey.appendChild(UI.el('span', 'help-key', part));
              void all;
            });
          var tdText = UI.el('td');
          appendInline(tdText, item[1], query);
          tr.appendChild(tdKey);
          tr.appendChild(tdText);
          keyBody.appendChild(tr);
        });
        node.appendChild(keyBody);
        return node;
      }

      case 'p':
      default:
        node = UI.el('p', 'help-paragraph');
        appendInline(node, block.text, query);
        return node;
    }
  }

  /* ================================================================== *
   * Short helpers for the content below
   * ================================================================== */
  function p(text) {
    return { t: 'p', text: text };
  }
  function note(text) {
    return { t: 'note', text: text };
  }
  function h(text) {
    return { t: 'h', text: text };
  }
  function ul(items) {
    return { t: 'ul', items: items };
  }
  function ol(items) {
    return { t: 'ol', items: items };
  }
  function table(head, rows) {
    return { t: 'table', head: head, rows: rows };
  }
  function def(items) {
    return { t: 'def', items: items };
  }
  function keys(items) {
    return { t: 'keys', items: items };
  }
  function sampleRows() {
    return function () {
      var descriptions = {
        FROGGER: 'a low, wide body — a reliable runner and jumper',
        ROO: 'a tall two-footed body — good for jumping and climbing',
        HAILER: 'a light frame with only two muscles — quick to evolve, good at obstacle jumping',
        SPIDER: 'many legs and muscles — slow to evolve, but very versatile',
        SPRING: 'a vertical chain of bones with muscles along it — the classic jumper',
      };
      return (EVO.DefaultCreatures || []).map(function (sample) {
        return [
          sample.name,
          String(sample.design.joints.length),
          String(sample.design.bones.length),
          String(sample.design.muscles.length),
          descriptions[sample.name] || 'a sample design',
        ];
      });
    };
  }

  /* ================================================================== *
   * The content
   * ================================================================== */
  var CATEGORIES = [
    /* ---------------------------------------------------------------- */
    {
      id: 'start',
      title: 'Start here',
      short: 'Start',
      sections: [
        {
          id: 'what',
          title: 'What is Evolution?',
          blocks: [
            p(
              'Evolution is a sandbox simulator that demonstrates machine learning with ' +
                'evolutionary algorithms. You design a creature out of **joints**, **bones** and ' +
                '**muscles**, and the game then evolves a small neural network — the brain — that ' +
                'teaches that body how to run, jump, climb or fly.'
            ),
            p(
              'Nothing about the movement is scripted. Every creature starts out flopping around ' +
                'and only improves because the best brains of every generation are selected, ' +
                'recombined and mutated. That is the idea of Karl Sims\' *Evolving Virtual ' +
                'Creatures* (SIGGRAPH \'94), and this web edition is a complete, dependency free ' +
                'port of the game **Evolution** by Keiwan Donyagard.'
            ),
            note(
              'Everything runs inside this page: no account, no server, no internet connection. ' +
                'Open `index.html` and it works. Your creatures, recordings, simulations and ' +
                'settings are kept in your browser — with an optional copy in cookies.'
            ),
          ],
        },
        {
          id: 'screens',
          title: 'The seven screens',
          blocks: [
            table(
              ['Screen', 'What it is', 'How to get there'],
              [
                ['**Home**', 'The menu: one button for every part of the game, a summary of the design you are working on, and a card to continue where you left off.', 'Everything leads back here'],
                ['**Creature editor**', 'Build a creature out of joints, bones, muscles and decorations.', 'Home → Create a Creature, or Back → Editor'],
                ['**Simulation**', 'Run the evolution, watch the whole population, and play back the best creature of every generation.', 'Home → Start Simulation, or Simulate in the editor'],
                ['**My creatures**', 'Your saved designs plus the five sample creatures. Edit, simulate, export or delete them.', 'Home → My Creatures'],
                ['**Gallery**', 'Every recording you saved, with a player, camera controls and actions.', 'Home → Gallery'],
                ['**Settings**', 'Display, evolution, neural network, saving and storage settings.', 'Home → Settings'],
                ['**Help**', 'This manual. Use the search box at the top to find anything.', 'Home → Help'],
              ]
            ),
          ],
        },
        {
          id: 'first',
          title: 'Your first five minutes',
          blocks: [
            ol([
              'Open the editor with **Create a Creature**. It starts with the sample creature FROGGER; press **Samples** to load a different one.',
              'Press **Simulate**. The evolution starts right away with the default settings: task Running, 10 creatures, 10 seconds each.',
              'Watch the HUD: **GENERATION**, the live **FITNESS**, and the phase (simulating or playback). After each generation the best creature of that generation is replayed.',
              'Press **NEXT →** (or simply wait, with **AUTOPLAY** on) to breed the next generation. After 10–30 generations the first creatures usually start to shuffle forwards.',
              'Press **SAVE** in the playback bar to keep the replay in the gallery, or **Exit** and open **Gallery** to watch your favourites again.',
            ]),
            note(
              'If nothing moves after 30 generations, the design is probably too floppy: add more ' +
                '**bones** (a triangle of bones makes a body rigid) and give the creature **muscles** ' +
                'that span across joints.'
            ),
          ],
        },
        {
          id: 'samples',
          title: 'The sample creatures',
          blocks: [
            p(
              'Five designs ship with the game. Open them in the editor with **Samples** — they are ' +
                'ordinary designs, so you can take them apart, change their muscles and see what happens.'
            ),
            table(['Name', 'Joints', 'Bones', 'Muscles', 'Character'], sampleRows()),
          ],
        },
      ],
    },

    /* ---------------------------------------------------------------- */
    {
      id: 'editor',
      title: 'Creature editor',
      short: 'Editor',
      sections: [
        {
          id: 'editor-layout',
          title: 'The editor at a glance',
          blocks: [
            p(
              'The editor is one big canvas with a **top bar**, a **toolbar** and a **properties ' +
                'panel**. A hint line at the bottom of the canvas always tells you what the active ' +
                'tool expects next.'
            ),
            def([
              { term: 'Canvas', text: 'The creature. Tap to use the active tool, drag a joint or a bone to move it, drag empty space to pan and scroll (or pinch) to zoom.' },
              { term: 'Top bar', text: 'The name of the creature and the buttons Undo, Redo, New, Samples, Import, Export, Save and Simulate.' },
              { term: 'Toolbar', text: 'The six tools: Select, Joint, Bone, Muscle, Decor and Erase.' },
              { term: 'Properties panel', text: 'The settings of the selected component — or the grid settings when nothing is selected. The panel also shows how many joints, bones, muscles and decorations the design has.' },
              { term: 'Hint line', text: 'One short sentence at the bottom of the canvas describing the next step of the active tool ("Tap a joint to start a bone", …).' },
            ]),
            note(
              'The editor saves continuously: whatever you are building is stored while you work, ' +
                'so it is still there after a reload, a crash or a closed tab.'
            ),
          ],
        },
        {
          id: 'tools',
          title: 'The six tools',
          blocks: [
            table(
              ['Tool', 'Key', 'How to use it', 'Rules'],
              [
                ['**Select**', '`V`', 'Tap a joint, bone, muscle or decoration to select it and edit it in the properties panel. Drag a joint or a bone to move it, drag empty space to pan.', 'Dragging a joint moves it together with everything attached to it.'],
                ['**Joint**', '`J`', 'Tap empty space to place a joint.', 'Joints may not overlap — a new joint has to stay at least 0.6 units away from every other joint (a joint has a radius of 0.5).'],
                ['**Bone**', '`B`', 'Tap a joint, then tap a second joint to connect them.', 'The two joints must be different, and the same pair of joints can only be connected once. Bones are rigid: they never stretch or bend.'],
                ['**Muscle**', '`M`', 'Tap a bone, then tap a second bone to connect them with a muscle.', 'A muscle needs two different bones and duplicates are ignored. The muscle pulls the two bones together when its brain output is negative, and pushes them apart when it is positive (if **Can expand** is on).'],
                ['**Decor**', '`D`', 'Pick a decoration in the picker that opens, then tap the bone it should sit on.', 'Purely cosmetic: decorations are drawn on the bone and never change the physics or the fitness. 42 different decorations are available (eyes, pupils, eyebrows, mouths, noses, moustaches, ears, hands, feet, shoes, brain, bone, cat parts).'],
                ['**Erase**', '`E`', 'Tap any component to delete it.', 'Deleting a joint also deletes every bone attached to it, every muscle on those bones and every decoration on those bones.'],
              ]
            ),
            note(
              'Press `Esc` at any time to cancel a bone or muscle you started, and `Delete` to ' +
                'remove the current selection.'
            ),
          ],
        },
        {
          id: 'editor-top',
          title: 'The top bar',
          blocks: [
            def([
              { term: 'Name', text: 'Up to 40 characters. It is used in My creatures, in saved simulations, in exported files and as the file name when you export a design.' },
              { term: 'Undo / Redo', text: '40 steps of history. `Ctrl/Cmd+Z` undoes, `Ctrl/Cmd+Shift+Z` redoes.' },
              { term: 'New', text: 'Throws the current design away and starts from an empty canvas (you are asked to confirm).' },
              { term: 'Samples', text: 'Opens the five sample creatures and, below them, every creature you saved. Picking one replaces the current design.' },
              { term: 'Import', text: 'Paste the JSON of a creature design — one you exported, or one from the Unity version of the game (all save file versions v1, v2 and v3 are understood).' },
              { term: 'Export', text: 'Downloads the design as a `.json` file so that you can keep it outside of the browser or move it to another device.' },
              { term: 'Save', text: 'Stores the design under its name in My creatures (and, if the cookie copy is on, in the cookies as well).' },
              { term: 'Simulate', text: 'Leaves the editor and starts a simulation with this design.' },
            ]),
          ],
        },
        {
          id: 'joint-props',
          title: 'Joint properties',
          blocks: [
            p('Select a joint with the **Select** tool to change these values.'),
            def([
              { term: 'Weight', text: '`0.2×` to `5×`, default `1×`. The mass of the joint. Heavy joints fall faster, push harder against the ground and make a creature sluggish; very light joints get flung around by the muscles.' },
              { term: 'Fitness penalty', text: '`0%` to `50%` in 5% steps, default `0%`. How much fitness is subtracted while this joint touches the ground. Use it to tell evolution "this part should stay in the air" — for example the head, or the tip of a wing.' },
            ]),
            note(
              'Joints are the only parts that collide: with the ground, with the obstacles of the ' +
                'Obstacle Jump task and with other joints. A joint is a circle with a radius of 0.5 ' +
                'units; bones and muscles never collide.'
            ),
          ],
        },
        {
          id: 'bone-props',
          title: 'Bone properties',
          blocks: [
            def([
              { term: 'Weight', text: '`0.5×` to `5×`, default `1×`. The mass of the bone, split half and half onto its two joints. Heavy bones make a creature stable but slow; light bones make it quick but twitchy.' },
              { term: 'Wing', text: 'Off by default. A wing bone generates a lift force perpendicular to itself while it moves — the force grows with the speed of the bone and is strongest when the bone moves sideways. Wings are what makes the Flying task possible.' },
              { term: 'Invert', text: 'Only shown when **Wing** is on. Flips the side the wing generates lift for, so a wing can push "up" while moving downwards (and the other way round).' },
            ]),
            note(
              'Bones are rigid hinge constraints: they keep the distance between their two joints ' +
                'fixed, but the joints can rotate freely. Three bones that form a triangle make a ' +
                'rigid body — that is the trick behind most working creatures.'
            ),
          ],
        },
        {
          id: 'muscle-props',
          title: 'Muscle properties',
          blocks: [
            def([
              { term: 'Strength', text: '`0×` to `3.0×` (shown as a multiple of the default force of 1500), default `1.0×`. How hard the muscle can pull (and push). Weak muscles cannot move a heavy body; very strong muscles make the creature jump around and often overshoot.' },
              { term: 'Can expand', text: 'On by default. When it is on, a positive brain output pushes the two bones apart; when it is off, the muscle can only contract and simply relaxes on a positive output.' },
              { term: 'Id', text: 'Empty by default. Muscles that share the same id are driven by the **same network output**, so they always contract and expand together. Leave it empty to give every muscle its own output.' },
            ]),
            p(
              'Every muscle is also a spring (spring 1000, damper 50), so it always tries to return ' +
                'to its rest length even when the brain does nothing. The brain output is mapped ' +
                'from `0…1` to `-1…1`: negative contracts, positive expands.'
            ),
            note(
              'Give the legs of a creature the same id (for example `leg`) and the two sides move ' +
                'together like a muscle group — and the network gets one output less to learn.'
            ),
          ],
        },
        {
          id: 'decoration-props',
          title: 'Decoration properties',
          blocks: [
            def([
              { term: 'Decoration', text: 'Picked when you place it with the **Decor** tool. The panel shows its name; change it by deleting the decoration and placing another one.' },
              { term: 'Scale', text: '`0.20×` to `4.00×`, default `1.00×`.' },
              { term: 'Rotation', text: '`-180°` to `180°`, default `0°`.' },
              { term: 'Flip horizontally / vertically', text: 'Mirror the drawing — handy for the second eye, ear or shoe.' },
              { term: 'Bring forward / Send backward', text: 'Changes the draw order: decorations that are further back are drawn below the others.' },
              { term: 'Duplicate / Delete', text: 'Copy the selected decoration onto the same bone, or remove it.' },
            ]),
            note('Decorations are attached to a bone and follow it while the creature moves.'),
          ],
        },
        {
          id: 'grid',
          title: 'The grid (nothing selected)',
          blocks: [
            def([
              { term: 'Snap to grid', text: 'Off by default. When it is on, new joints snap to the grid and dragging moves in grid steps.' },
              { term: 'Grid size', text: '`1.0` to `3.0` in steps of 0.5, default `1.0`. Only shown while snapping is on. It is also the spacing of the grid that is drawn in the editor.' },
            ]),
            p('Both values are part of your settings and are remembered, together with everything else you change.'),
          ],
        },
        {
          id: 'editor-navigation',
          title: 'Selecting, moving and viewing',
          blocks: [
            ul([
              '**Tap** a component to select it; **tap empty space** with the Select tool to deselect.',
              '**Drag a joint** to move it — every bone, muscle and decoration attached to it follows.',
              '**Drag empty space** to pan the view, **scroll** (mouse wheel) or **pinch** to zoom.',
              'On a touch screen: one finger uses the tool or drags a component, two fingers pan and zoom. A touch edit is applied when the finger lifts, so starting a pinch never places a component by accident.',
              'The view is framed automatically when you load a design; `Esc` cancels a placement in progress.',
            ]),
          ],
        },
        {
          id: 'editor-rules',
          title: 'Rules, limits and what cannot be built',
          blocks: [
            ul([
              'A joint must keep **0.6 units** of distance from every other joint — joints cannot overlap.',
              'A bone needs **two different joints**, and the same pair can only be connected once.',
              'A muscle needs **two different bones**, and the same pair can only be connected once.',
              'Deleting a joint deletes its bones, the muscles on those bones and the decorations on those bones.',
              'A creature needs **at least one joint** before you can save or simulate it.',
              'The undo history keeps **40 steps**.',
              'Names are limited to **40 characters**, muscle ids to **1000**.',
              'A design without muscles can be simulated, but of course nothing will ever learn to move.',
            ]),
          ],
        },
        {
          id: 'editor-keys',
          title: 'Editor shortcuts',
          blocks: [
            keys([
              ['V', 'Select tool'],
              ['J', 'Joint tool'],
              ['B', 'Bone tool'],
              ['M', 'Muscle tool'],
              ['D', 'Decoration tool'],
              ['E', 'Erase tool'],
              ['Ctrl+Z', 'Undo (Cmd+Z on a Mac)'],
              ['Ctrl+Shift+Z', 'Redo (Cmd+Shift+Z on a Mac)'],
              ['Delete', 'Delete the selected component (Backspace works too)'],
              ['Esc', 'Cancel the bone or muscle you started'],
            ]),
            note('Shortcuts are ignored while you type in a text field, so naming a creature never triggers a tool.'),
          ],
        },
      ],
    },

    /* ---------------------------------------------------------------- */
    {
      id: 'simulation',
      title: 'Simulation screen',
      short: 'Simulation',
      sections: [
        {
          id: 'simulation-start',
          title: 'Starting and running a simulation',
          blocks: [
            p(
              'A simulation starts with the creature you are working on and evolves it for the ' +
                'chosen **task**. Generation 1 is completely random: every creature in the ' +
                'population receives a different random brain, and only the best of them survive.'
            ),
            p(
              'Each generation runs for **Simulation time** seconds of simulated time. The whole ' +
                'population is simulated at once, or in batches if **Simulate in batches** is on. ' +
                'When a generation is finished, the recording of the best creature is played back.'
            ),
          ],
        },
        {
          id: 'hud',
          title: 'The HUD, control by control',
          blocks: [
            h('Top left'),
            def([
              { term: 'GENERATION', text: 'The number of the generation that is running (or that was just played back).' },
              { term: 'Task', text: 'The current task: Running, Jumping, Obstacle Jump, Climbing or Flying.' },
              { term: 'FITNESS', text: 'The live fitness of the creature you are watching, as a percentage of a "perfect" run. It is the same value the evolution sorts by.' },
              { term: 'Phase and time', text: '`SIMULATING` or `PLAYBACK`, together with how much of the simulation time has passed.' },
              { term: 'CREATURE ‹ ›', text: 'Which creature of the current batch you are watching. Arrow keys do the same.' },
              { term: 'AUTOPLAY', text: 'On by default: the next generation starts automatically after the playback. Turn it off to stay on a playback until you press `NEXT →`.' },
              { term: 'DURATION', text: 'How long each creature is simulated, `5` to `60` seconds in steps of 5. Changes apply from the next generation on.' },
            ]),
            h('Top right'),
            def([
              { term: 'Exit', text: 'Stops the simulation and returns to the home screen. Your settings and the creature design are kept.' },
              { term: 'Thumbnail', text: 'A small preview of the best creature of the generation, with its generation number — the same picture that is saved into the gallery.' },
              { term: 'Visibility', text: 'Switches between watching **all** creatures of the population at once and following only the one you selected.' },
              { term: 'Camera', text: 'Resets the camera: back to automatic tracking of the creature and back to the initial zoom.' },
              { term: 'Settings', text: 'Opens the settings drawer with the task, the evolution settings and the neural network. Changes apply from the next generation onwards.' },
              { term: 'Save / Load', text: 'Save the whole simulation (settings, scene, best creatures and chromosomes) in this browser or as a file — and load it again to continue where you stopped.' },
            ]),
            h('Bottom left'),
            def([
              { term: 'GENERATION HISTORY', text: 'One bar per generation: the fitness of the best creature of that generation, newest at the bottom. It is the quickest way to see whether the evolution is still improving.' },
            ]),
            h('Bottom centre (playback)'),
            def([
              { term: '▶ / ❚❚', text: 'Play or pause the replay of the best creature.' },
              { term: 'Seek bar', text: 'Scrub through the recording; the time next to it shows the position.' },
              { term: 'SAVE', text: 'Stores the recording in the gallery (together with its design, task, generation and fitness).' },
              { term: 'NEXT →', text: 'Breeds and starts the next generation.' },
            ]),
            h('Bottom right'),
            def([
              { term: 'SPEED', text: 'Playback and simulation speed, `0.25×` to `4×`, default `1×`. It only changes how fast time passes, never the result.' },
            ]),
          ],
        },
        {
          id: 'ghost',
          title: 'The ghost and the camera',
          blocks: [
            p(
              'While a generation is simulated, the best creature of the **previous** generation is ' +
                'drawn as a faded *ghost*. It makes it easy to see whether the new generation is ' +
                'actually better than the old one.'
            ),
            ul([
              '**Drag** to pan the camera, **scroll** or **pinch** to zoom — the camera then stops following the creature until you press **Camera**.',
              'On a touch screen: one finger pans, two fingers pan and zoom.',
              'Press `R` to reset the camera, `V` to switch between all creatures and one creature.',
            ]),
          ],
        },
        {
          id: 'simulation-save',
          title: 'Saving and loading a simulation',
          blocks: [
            p(
              '**Save** stores the complete state of the evolution: the settings, the network, the ' +
                'scene, the creature design, the best creature of every generation and the ' +
                'chromosomes of the current population. Loading it continues the evolution exactly ' +
                'where it stopped.'
            ),
            ul([
              '**Save in this browser** keeps it in the browser storage (and in the cookie copy, if it fits). Up to 10 simulations are kept.',
              '**Download file** writes the simulation as a `.json` file that you can keep outside of the browser.',
              '**Load** lists everything you saved in this browser; each entry can be loaded or deleted. You can also open a simulation file you downloaded earlier.',
              '**Auto save** (Settings → Saving) saves the running simulation automatically every N generations, so a long run is never lost.',
            ]),
            note(
              'The recording of a generation can be saved with **SAVE** in the playback bar, and it ' +
                'then appears in the **Gallery**.'
            ),
          ],
        },
        {
          id: 'simulation-keys',
          title: 'Simulation shortcuts',
          blocks: [
            keys([
              ['Space', 'Pause or continue the simulation'],
              ['V', 'Switch between all creatures and the watched creature'],
              ['R', 'Reset the camera'],
              ['←', 'Previous creature — or one second back during a playback'],
              ['→', 'Next creature — or one second forward during a playback'],
              ['↑', 'Next creature of the batch'],
              ['↓', 'Previous creature of the batch'],
            ]),
          ],
        },
      ],
    },

    /* ---------------------------------------------------------------- */
    {
      id: 'evolution',
      title: 'Evolution & fitness',
      short: 'Evolution',
      sections: [
        {
          id: 'generations',
          title: 'How a generation works',
          blocks: [
            ol([
              'The **population** is created: every creature is a copy of your design with its own random brain (in generation 1) or a brain bred from the parents (from generation 2 on).',
              'All creatures are simulated at the same time (or in batches) for **Simulation time** seconds. Every creature is recorded.',
              'The **fitness** of every creature is calculated with the tracker of the current task.',
              'The creatures are **sorted by fitness**. The best one is played back and kept as the "best creature" of that generation.',
              'The next generation is bred: **selection** picks the parents, **recombination** mixes two parent chromosomes, **mutation** changes the result.',
            ]),
            p(
              'A **chromosome** is the flattened list of all connection weights of the neural ' +
                'network — it *is* the genome of the creature. Nothing about the body evolves, only ' +
                'the brain: joints, bones, muscles and decorations stay exactly as you designed them.'
            ),
          ],
        },
        {
          id: 'tasks',
          title: 'The five tasks and how fitness is calculated',
          blocks: [
            p(
              'Fitness is shown in the HUD as a percentage: `1.0` (100%) is a "perfect" creature ' +
                'for that task. The formulas are the ones of the original game.'
            ),
            table(
              ['Task', 'Scene', 'Fitness'],
              [
                ['**Running**', 'Flat ground', 'Horizontal distance travelled, divided by `55 × simulation time`.'],
                ['**Jumping**', 'Flat ground', 'The highest weighted average height reached, divided by `20`. The height is `(4 × distance of the lowest joint from the ground + total height of the creature) / 5`.'],
                ['**Obstacle Jump**', 'Two walls and rolling obstacles', '`max(0.5 × collision fitness, 0.3 × height fitness + 0.7 × collision fitness)`. Height fitness is the highest jump divided by `20`; collision fitness is `1 − average time an obstacle touched a joint / 0.4` seconds.'],
                ['**Climbing**', 'An endless staircase', 'Vertical distance climbed, divided by `100 × simulation time / 10`, plus `0.5`.'],
                ['**Flying**', 'Flat ground', 'The average of the height fitness (highest height, scaled by the simulation time, divided by `40`, capped at 1) and the fraction of time **no joint** touched the ground.'],
              ]
            ),
            p(
              'On top of that, every joint with a **fitness penalty** subtracts its penalty from the ' +
                'fitness while it touches the ground — that is how you keep a creature from dragging ' +
                'its head or its wings along the floor.'
            ),
          ],
        },
        {
          id: 'selection',
          title: 'Selection: who becomes a parent',
          blocks: [
            table(
              ['Algorithm', 'How it works', 'When to use it'],
              [
                ['**Rank proportional** (default)', 'Every creature gets a weight by its rank: the best gets the highest weight, the worst the lowest.', 'The safe default. It keeps the pressure on even when all fitness values are close together.'],
                ['**Fitness proportional**', 'The chance of being picked is proportional to the fitness itself.', 'Good when the fitness values differ a lot; a single super-creature can otherwise take over.'],
                ['**Tournament**', 'Three creatures are picked at random and the best of the three wins.', 'A good middle ground: weaker creatures still get a chance.'],
                ['**Uniform**', 'Every creature has exactly the same chance.', 'Almost no selection pressure — useful to see how much evolution actually does.'],
              ]
            ),
          ],
        },
        {
          id: 'recombination',
          title: 'Recombination: mixing two brains',
          blocks: [
            table(
              ['Algorithm', 'How it works'],
              [
                ['**One point crossover** (default)', 'Both parent chromosomes are cut at the same random index and the halves are swapped — producing two children.'],
                ['**Multi point crossover**', 'The chromosome is cut into five parts that are swapped alternately — a much rougher mix.'],
                ['**Uniform crossover**', 'Every single weight is taken at random from one of the two parents.'],
              ]
            ),
          ],
        },
        {
          id: 'mutation',
          title: 'Mutation and mutation rate',
          blocks: [
            p(
              '**Mutation rate** (`1%` to `100%`, default `50%`) is the probability that an ' +
                'individual child chromosome is mutated at all. If it is mutated, one of these ' +
                'algorithms changes it:'
            ),
            table(
              ['Algorithm', 'How it works'],
              [
                ['**Global** (default)', 'Every single weight is changed with a 75% probability by a random gaussian offset.'],
                ['**Chunk**', 'A block of 2 to 15 consecutive weights is changed — a local, "structural" change.'],
                ['**Inversion**', 'A random section of the chromosome is reversed, which reorders whole groups of weights.'],
              ]
            ),
            note(
              'A high mutation rate explores more but forgets good solutions; a low one converges ' +
                'quickly and then gets stuck. `50%` with **Global** mutation is a good starting ' +
                'point; lower it to `10–20%` once the creatures move well.'
            ),
          ],
        },
        {
          id: 'population',
          title: 'Population, batches and keeping the best',
          blocks: [
            def([
              { term: 'Population size', text: '`2` to `100` creatures, default `10`. More creatures = more variety per generation, but each generation takes proportionally longer.' },
              { term: 'Simulate in batches', text: 'Off by default. When it is on, only **Batch size** creatures are simulated at the same time. That is much lighter on a phone, and you can watch a smaller group more closely.' },
              { term: 'Batch size', text: '`2` to `50`, default `10`. Never larger than the population.' },
              { term: 'Keep best creatures', text: 'On by default. The best creatures of the previous generations are carried over unchanged, so the best fitness can never get worse.' },
            ]),
            note(
              'Performance tip: population `10–20` with `10` seconds of simulation time runs ' +
                'smoothly on a phone. `100` creatures with `60` seconds each will need a fast ' +
                'computer — and patience.'
            ),
          ],
        },
        {
          id: 'tips',
          title: 'Tips for better creatures',
          blocks: [
            ul([
              'Build rigid triangles: three bones between three joints make a body that does not collapse.',
              'Muscles have to span **across** a joint to move it — a muscle between two bones that share a joint acts like a hinge.',
              'Fewer muscle ids means fewer network outputs, which is much easier to learn. Try two or three groups (for example `left`, `right`, `back`).',
              'Heavy joints low, light joints high: a low centre of mass makes a runner stable.',
              'For Flying you need **wings** — mark the bones that should generate lift, and use the Flying task.',
              'If the fitness stops improving for many generations, raise the mutation rate, or add another muscle.',
            ]),
          ],
        },
      ],
    },

    /* ---------------------------------------------------------------- */
    {
      id: 'brain',
      title: 'Brains & networks',
      short: 'Brains',
      sections: [
        {
          id: 'brain-basics',
          title: 'What the brain is',
          blocks: [
            p(
              'Every creature owns a small **feed forward neural network** with sigmoid ' +
                'activations. Its inputs describe what the creature feels, its outputs drive the ' +
                'muscles. The weights of the network are the chromosome that evolution changes — ' +
                'there is no learning while a creature is alive.'
            ),
            p(
              'New simulations always use the **universal brain** with 11 inputs. Older save files ' +
                '(v2) keep their own, simpler brains with 6 or 7 inputs so that they behave exactly ' +
                'as they did in the original game.'
            ),
          ],
        },
        {
          id: 'brain-inputs',
          title: 'The 11 inputs of the universal brain',
          blocks: [
            table(
              ['#', 'Input', 'Meaning'],
              [
                ['1', 'Distance to the ground', 'How far the lowest point of the creature is above the ground.'],
                ['2', 'Distance sensor: forward', 'Raycast from the centre straight ahead, up to 20 units.'],
                ['3', 'Distance sensor: down–forward', 'Raycast diagonally down and forward.'],
                ['4', 'Distance sensor: down–back', 'Raycast diagonally down and back.'],
                ['5', 'Distance sensor: back', 'Raycast straight back.'],
                ['6', 'Rotating distance sensor', 'Raycast in a direction the network controls itself — the last output rotates it. The angle is smoothed (10% new value) so it cannot flicker.'],
                ['7', 'Velocity X', 'Horizontal speed of the centre of the creature.'],
                ['8', 'Velocity Y', 'Vertical speed of the centre of the creature.'],
                ['9', 'Angular velocity', 'How fast the creature is rotating.'],
                ['10', 'Joints touching the ground', 'How many joints currently touch the ground.'],
                ['11', 'Rotation', 'The orientation of the creature.'],
              ]
            ),
          ],
        },
        {
          id: 'brain-outputs',
          title: 'The outputs',
          blocks: [
            ul([
              '**One output per unique muscle id.** Muscles with the same id share one output, muscles with an empty id each get their own.',
              '**One extra output** that rotates the free distance sensor (input 6).',
              'An output is mapped from `0…1` to `-1…1`: **negative contracts** the muscle, **positive expands** it (only if **Can expand** is on).',
            ]),
            note(
              'A creature with 6 muscles and 2 shared ids therefore has 2 + 1 = 3 outputs — and a ' +
                'much smaller brain to evolve.'
            ),
          ],
        },
        {
          id: 'network-shape',
          title: 'The shape of the network',
          blocks: [
            def([
              { term: 'Hidden layers', text: '`1` to `5` layers, default `1`. Deep networks can express more complicated movements, but need far more generations to evolve.' },
              { term: 'Nodes in layer N', text: '`1` to `100` nodes per hidden layer, default `10`. The input and output layers are fixed by the creature and the brain.' },
            ]),
            p(
              'The number of weights (and therefore the length of the chromosome) is ' +
                '`inputs × first hidden layer + … + last hidden layer × outputs`. With 11 inputs, ' +
                '10 hidden nodes and 6 outputs that is `110 + 60 = 170` weights.'
            ),
            note(
              'Changing the network shape makes the old chromosomes meaningless: the next ' +
                'generation then starts from newly randomised brains within the new shape.'
            ),
          ],
        },
        {
          id: 'legacy-brains',
          title: 'Legacy brains (old save files)',
          blocks: [
            table(
              ['Brain', 'Inputs', 'Used for'],
              [
                ['Running brain', '6', 'Simulations started with a v2 save file, task Running.'],
                ['Jumping brain', '6', 'v2 save files, task Jumping.'],
                ['Climbing brain', '6', 'v2 save files, task Climbing.'],
                ['Obstacle jump brain', '7', 'v2 save files, task Obstacle Jump (the extra input sees the obstacle).'],
                ['Universal brain', '11', 'Every new simulation, and every v3 save file.'],
              ]
            ),
          ],
        },
      ],
    },

    /* ---------------------------------------------------------------- */
    {
      id: 'settings',
      title: 'Every setting',
      short: 'Settings',
      sections: [
        {
          id: 'settings-display',
          title: 'Settings → Display',
          blocks: [
            table(
              ['Setting', 'Range', 'Default', 'What it does'],
              [
                ['Show muscles', 'on / off', 'on', 'Draws the muscles of the creatures. Turn it off to see the skeleton only.'],
                ['Show muscle contraction', 'on / off', 'off', 'Colours every muscle by how strongly it currently contracts — very useful to understand what a brain is doing.'],
                ['Grid in the editor', 'on / off', 'off', 'Draws the editor grid and enables snapping (see Editor → Grid).'],
                ['Grid visibility (simulation)', '0–100%', '0%', 'How strongly the grid is drawn behind a running simulation.'],
                ['Grid visibility (flying)', '0–100%', '50%', 'The same for the Flying task, where a grid helps to see height.'],
                ['Hidden creature opacity', '0–100%', '22.5%', 'How visible the other creatures of the population are while you follow a single one.'],
              ]
            ),
          ],
        },
        {
          id: 'settings-evolution',
          title: 'Settings → Evolution (and the simulation drawer)',
          blocks: [
            p('The same panel is used in **Settings** and in the **Settings** drawer of the simulation. In the simulation, changes apply from the next generation onwards.'),
            table(
              ['Setting', 'Range', 'Default', 'What it does'],
              [
                ['Task', 'Running, Jumping, Obstacle Jump, Climbing, Flying', 'Running', 'Chooses the scene and the fitness function.'],
                ['Simulation time', '5–60 s in steps of 5', '10 s', 'How long every creature is simulated (and recorded).'],
                ['Population size', '2–100', '10', 'How many creatures live in one generation.'],
                ['Simulate in batches', 'on / off', 'off', 'Simulate only a part of the population at the same time.'],
                ['Batch size', '2–50', '10', 'How many creatures are simulated at once when batching is on.'],
                ['Keep best creatures', 'on / off', 'on', 'Carries the best creatures of the previous generations over unchanged.'],
                ['Mutation rate', '1–100%', '50%', 'The probability that a child chromosome is mutated.'],
                ['Selection', 'Rank proportional, Fitness proportional, Tournament, Uniform', 'Rank proportional', 'How the parents of the next generation are picked.'],
                ['Recombination', 'One point, Multi point, Uniform crossover', 'One point crossover', 'How two parent chromosomes are mixed.'],
                ['Mutation', 'Global, Chunk, Inversion', 'Global', 'How a mutated chromosome is changed.'],
              ]
            ),
          ],
        },
        {
          id: 'settings-network',
          title: 'Settings → Neural Network',
          blocks: [
            table(
              ['Setting', 'Range', 'Default', 'What it does'],
              [
                ['Hidden layers', '1–5', '1', 'How many hidden layers the network has. Adding a layer pushes the nodes of the new layer to 10.'],
                ['Nodes in layer N', '1–100', '10', 'How many nodes the N-th hidden layer has.'],
              ]
            ),
            note('A network with more layers or nodes has more weights — and needs more generations before it does anything sensible.'),
          ],
        },
        {
          id: 'settings-saving',
          title: 'Settings → Saving',
          blocks: [
            table(
              ['Setting', 'Range', 'Default', 'What it does'],
              [
                ['Auto save simulations', 'on / off', 'off', 'Saves the running simulation automatically, so that a long run survives a reload.'],
                ['Auto save distance', 'every 1–20 generations', '5', 'How often the automatic save happens.'],
                ['Remember where I left off', 'on / off', 'on', 'Offers a "Continue where you left off" card on the home screen that takes you back to the editor, My creatures or the gallery.'],
              ]
            ),
          ],
        },
        {
          id: 'settings-storage',
          title: 'Settings → Storage & cookies',
          blocks: [
            p('This panel shows where your data lives and lets you back it up.'),
            table(
              ['Control', 'What it does'],
              [
                ['Kept in', 'Browser storage (localStorage), cookies, or "this session only" if the browser allows no storage at all.'],
                ['Your data', 'How many bytes and how many entries are stored.'],
                ['Cookies', 'How many of the cookies of the budget are used and how many bytes they take.'],
                ['Keep a copy in cookies', 'On by default. Mirrors everything you save into cookies as well, and restores from them if the browser storage is empty.'],
                ['Cookie budget', 'Small (~11 KB), Medium (~22 KB), Large (~56 KB) or Maximum (~125 KB). A page opened from a file starts at Large, a page on a web server starts at Small (see below).'],
                ['Back up now', 'Copies everything into the cookies immediately.'],
                ['Restore', 'Replaces the data in the browser with the copy from the cookies.'],
                ['Clear cookies', 'Deletes the cookie copy (the data in the browser storage stays).'],
                ['Export all data', 'Downloads one `.json` file with every creature, recording, simulation and setting.'],
                ['Import a backup', 'Reads such a file back — either added to your data or replacing everything.'],
              ]
            ),
          ],
        },
        {
          id: 'settings-data',
          title: 'Settings → Data',
          blocks: [
            table(
              ['Button', 'What it does'],
              [
                ['Reset all settings', 'Sets every setting back to its default. Your creatures, recordings and simulations are **kept**.'],
                ['Delete all saves', 'Deletes all saved creatures, recordings and simulations — in the browser storage and in the cookies.'],
              ]
            ),
          ],
        },
        {
          id: 'settings-editor',
          title: 'Settings changed inside the editor',
          blocks: [
            table(
              ['Setting', 'Range', 'Default', 'Where'],
              [
                ['Snap to grid', 'on / off', 'off', 'Editor → Grid (nothing selected)'],
                ['Grid size', '1.0–3.0', '1.0', 'Editor → Grid'],
                ['Joint weight', '0.2×–5×', '1×', 'Editor → joint selected'],
                ['Fitness penalty', '0–50%', '0%', 'Editor → joint selected'],
                ['Bone weight', '0.5×–5×', '1×', 'Editor → bone selected'],
                ['Wing / Invert', 'on / off', 'off', 'Editor → bone selected'],
                ['Muscle strength', '0×–3.0×', '1.0×', 'Editor → muscle selected'],
                ['Can expand', 'on / off', 'on', 'Editor → muscle selected'],
                ['Muscle id', 'text', 'empty', 'Editor → muscle selected'],
                ['Decoration scale / rotation / flip / order', '0.2–4 / ±180° / on-off / forward-back', '1, 0, off', 'Editor → decoration selected'],
              ]
            ),
          ],
        },
      ],
    },

    /* ---------------------------------------------------------------- */
    {
      id: 'saving',
      title: 'Saving, cookies & files',
      short: 'Saving',
      sections: [
        {
          id: 'where',
          title: 'Where your data is kept',
          blocks: [
            p(
              'The game keeps everything in **your browser** — nothing is uploaded anywhere, and ' +
                'there is no server involved. Two places are used:'
            ),
            def([
              { term: 'Browser storage (localStorage)', text: 'The main storage: several megabytes, fast, and it survives a reload. It is cleared when you clear the site data of your browser.' },
              { term: 'Cookies', text: 'A second, mirrored copy. Cookies are tiny (about 4 KB each) but they survive in browsers that do not allow storage for pages opened from the file system, and they can be moved between browsers more easily.' },
              { term: 'This session only', text: 'If the browser allows neither, the game still runs — it just cannot keep anything. Use **Export** in that case.' },
            ]),
            p(
              'Whenever something is saved it is written to the browser storage **and** (a moment ' +
                'later) into the cookies. If the browser storage is missing or was cleared, the ' +
                'cookie copy is read back automatically — you do not have to do anything.'
            ),
          ],
        },
        {
          id: 'cookie-details',
          title: 'How the cookie copy works',
          blocks: [
            ul([
              'Every value is compressed into **base64url** and then split into cookies of about 1.4 KB, so even a large design fits into several small cookies.',
              'The size of the whole backup is limited by the **cookie budget** (Small 11 KB … Maximum 125 KB).',
              'When a list does not fit, the **newest entries** are kept: recordings and simulations are shortened from the front, and the panel tells you which entries did not fit.',
              'If the budget runs out, the least important data is dropped first: recordings, then simulations, then designs. Settings and the creature you are working on always come first.',
              'Every cookie is kept for **one year** and is only readable by this page.',
              'A page opened from a file (`file://`) starts with the **Large** budget because nothing is ever sent; a page on a web server starts with **Small**, because cookies are sent to the server with every request and a huge cookie header can make a site refuse to load.',
            ]),
            note(
              'Clearing the cookies of your browser deletes the cookie copy. Clearing the site data ' +
                'deletes everything — make a backup with **Export all data** before you do that.'
            ),
          ],
        },
        {
          id: 'what-is-saved',
          title: 'What exactly is saved',
          blocks: [
            table(
              ['Data', 'Where it is stored', 'How it is kept'],
              [
                ['The creature you are working on', 'browser storage + cookies', 'Saved continuously while you edit, restored when the editor opens.'],
                ['Saved creatures (My creatures)', 'browser storage + cookies', 'Unlimited in the browser; as many as fit into the cookies.'],
                ['Gallery recordings', 'browser storage + cookies', 'The newest 20 recordings in the browser; as many as fit into the cookies.'],
                ['Simulations', 'browser storage + cookies', 'The newest 10 in the browser; as many as fit into the cookies.'],
                ['Settings (display, evolution, network, grid, …)', 'browser storage + cookies', 'Every change is stored immediately.'],
                ['The screen you left off on', 'browser storage + cookies', 'Used by the "Continue where you left off" card.'],
              ]
            ),
          ],
        },
        {
          id: 'export-import',
          title: 'Exporting and importing',
          blocks: [
            def([
              { term: 'Export all data (Settings → Storage)', text: 'Downloads `evolution-backup.json` with every creature, recording, simulation and setting. This is the file to keep if you want a backup that is bigger than the cookies.' },
              { term: 'Import a backup', text: 'Reads that file back. You choose between "Add to my data" (existing entries are kept) and "Replace everything".' },
              { term: 'Export / Import in the editor', text: 'A single creature design as `.json`. The format is the one of the original game, so designs can be moved between the web edition and the Unity version.' },
              { term: 'Save / Load in the simulation', text: 'A whole simulation, either in the browser or as a file, including the chromosomes of the current population.' },
              { term: 'Export in the gallery', text: 'A single recording as a `.json` file.' },
            ]),
          ],
        },
        {
          id: 'formats',
          title: 'File formats',
          blocks: [
            ul([
              'Creature designs, simulations and recordings use the same JSON as the original game; the save file versions **v1**, **v2** and **v3** are all understood when reading, and v3 is written.',
              'Decorations (v4) are part of the creature design and are ignored by older versions of the game.',
              'The backup file (`evolution-backup.json`) is specific to this web edition: it simply contains every stored value under its storage key.',
            ]),
          ],
        },
        {
          id: 'storage-problems',
          title: 'When saving does not work',
          blocks: [
            def([
              { term: '"This browser does not allow any storage"', text: 'The page was opened in a way that blocks storage (a private window, a very strict setting, or some browsers with `file://`). Open the page in a normal window, or use Export to keep your creatures as files.' },
              { term: 'Cookies are unavailable', text: 'Chrome, for example, does not allow cookies for pages opened from the file system. The game then uses the browser storage alone and tells you so on the home screen and in Settings.' },
              { term: '"The gallery is full"', text: 'Only the newest 20 recordings are kept; the oldest ones are removed automatically. Export the ones you want to keep.' },
              { term: '"The last change did not fit"', text: 'The storage of the browser is full (or the cookie budget is). Delete old recordings or simulations, or export a backup and start fresh.' },
            ]),
          ],
        },
        {
          id: 'privacy',
          title: 'Privacy',
          blocks: [
            p(
              'The game never sends anything anywhere: no analytics, no accounts, no network ' +
                'requests. Everything stays on your device. The only exception is the cookie copy, ' +
                'which — like every cookie — is sent to the server that serves this page when the ' +
                'page is hosted on the web. That is exactly why the budget is small there.'
            ),
          ],
        },
      ],
    },

    /* ---------------------------------------------------------------- */
    {
      id: 'gallery',
      title: 'Gallery',
      short: 'Gallery',
      sections: [
        {
          id: 'gallery-basics',
          title: 'What the gallery is',
          blocks: [
            p(
              'The gallery keeps the recordings you saved during a simulation. A recording stores ' +
                'the position of every joint **30 times per second**, plus the muscle forces, so it ' +
                'can be replayed exactly — but it is also the largest thing the game saves.'
            ),
            note('At most 20 recordings are kept in the browser; when a new one is saved, the oldest is dropped.'),
          ],
        },
        {
          id: 'gallery-playing',
          title: 'Playing a recording',
          blocks: [
            def([
              { term: 'The list', text: 'Every recording with its generation, its task, its fitness and the date it was saved. Tap one to play it.' },
              { term: '▶ / ❚❚', text: 'Play or pause. Space does the same.' },
              { term: 'Seek bar', text: 'Scrub through the replay; dragging pauses it.' },
              { term: 'Camera', text: 'Drag to pan, scroll or pinch to zoom — the replay keeps running while you look around.' },
            ]),
          ],
        },
        {
          id: 'gallery-actions',
          title: 'What you can do with a recording',
          blocks: [
            def([
              { term: 'Load design', text: 'Opens the design of the recorded creature in the editor, so you can improve the body and evolve it again.' },
              { term: 'Export', text: 'Downloads the recording as a `.json` file.' },
              { term: 'Save as simulation', text: 'Creates a saved simulation from the recording, so you can continue evolving exactly this creature.' },
              { term: 'Delete', text: 'Removes the recording (you are asked to confirm).' },
            ]),
          ],
        },
      ],
    },

    /* ---------------------------------------------------------------- */
    {
      id: 'controls',
      title: 'Controls reference',
      short: 'Controls',
      sections: [
        {
          id: 'controls-editor',
          title: 'Editor',
          blocks: [
            keys([
              ['V / J / B / M / D / E', 'Select, Joint, Bone, Muscle, Decor, Erase tool'],
              ['Ctrl+Z', 'Undo'],
              ['Ctrl+Shift+Z', 'Redo'],
              ['Delete', 'Delete the selection'],
              ['Esc', 'Cancel the placement in progress'],
              ['Drag joint / bone', 'Move it (with everything attached)'],
              ['Drag empty space', 'Pan the view'],
              ['Wheel / pinch', 'Zoom'],
              ['Two fingers', 'Pan and zoom at the same time (touch)'],
            ]),
          ],
        },
        {
          id: 'controls-simulation',
          title: 'Simulation',
          blocks: [
            keys([
              ['Space', 'Pause / continue'],
              ['V', 'All creatures / one creature'],
              ['R', 'Reset the camera'],
              ['← →', 'Previous / next creature, or 1 second back / forward in a playback'],
              ['↑ ↓', 'Next / previous creature of the batch'],
              ['Drag', 'Pan the camera'],
              ['Wheel / pinch', 'Zoom the camera'],
              ['Two fingers', 'Pan and zoom (touch)'],
            ]),
          ],
        },
        {
          id: 'controls-gallery',
          title: 'Gallery',
          blocks: [
            keys([
              ['Space', 'Play / pause the replay'],
              ['Drag', 'Pan the camera'],
              ['Wheel / pinch', 'Zoom the camera'],
              ['Two fingers', 'Pan and zoom (touch)'],
            ]),
          ],
        },
        {
          id: 'controls-touch',
          title: 'Touch screens in general',
          blocks: [
            ul([
              'The game uses Pointer Events, so it works on current iOS, iPadOS and Android browsers with a single build.',
              'A tap uses the active tool; on touch screens the edit is applied when the finger **lifts**, so starting a second finger (a pinch) never places a component by accident.',
              'Buttons and list rows have larger tap targets on touch devices; panels and lists scroll with touch momentum.',
              'Rotating the device or opening the on-screen keyboard re-measures the layout, and canvases are capped at 2× device pixel ratio to keep phones fast.',
              'If the browser interrupts a gesture (for example when you switch apps), the gesture state is cleared so nothing stays stuck.',
            ]),
          ],
        },
      ],
    },

    /* ---------------------------------------------------------------- */
    {
      id: 'technical',
      title: 'Under the hood',
      short: 'Technical',
      sections: [
        {
          id: 'physics',
          title: 'The physics engine',
          blocks: [
            ul([
              'A small 2D rigid body engine with an impulse/constraint solver on the XY plane.',
              'Joints are circle bodies (radius 0.5) whose mass is the joint weight; the mass of a bone is split half and half onto its two joints.',
              'Bones are hinge constraints that keep the distance between two joints fixed.',
              'Muscles are spring constraints between the centres of two bones (spring 1000, damper 50) that can additionally contract or expand with a force of up to the muscle strength (1500 per 1.0×).',
              'Wing bones add a lift force perpendicular to the bone, depending on its rotation and velocity (only above a speed of 1, strongest when moving sideways).',
              'The simulation runs with a fixed timestep of 1/60 s, 3 physics substeps and 4 solver iterations, with at most 40 steps per frame so that a slow device cannot spiral out of control.',
              'A static broad-phase grid keeps collisions cheap, so a whole population can live in one world.',
            ]),
          ],
        },
        {
          id: 'recording-details',
          title: 'Recordings',
          blocks: [
            ul([
              '30 samples per second: the position of every joint and the muscle forces.',
              'Playback interpolates between the samples, which is why scrubbing is smooth.',
              'The best creature of a generation is recorded, played back after the generation and can be saved to the gallery from the playback bar.',
            ]),
          ],
        },
        {
          id: 'rendering',
          title: 'Rendering and performance',
          blocks: [
            ul([
              'Everything is drawn with the 2D canvas API — no WebGL, no libraries, no build step.',
              'The canvas resolution is capped at 2× device pixel ratio to limit memory on high density screens.',
              'The heaviest part is the population: 100 creatures with 6 muscles each is roughly 100 × 170 physics contacts per step. Use batches on a phone.',
              'The SPEED control (0.25× to 4×) changes how much simulated time passes per frame; it never changes the outcome.',
            ]),
          ],
        },
        {
          id: 'structure',
          title: 'How the code is organised',
          blocks: [
            table(
              ['File', 'What is in it'],
              [
                ['`index.html`', 'The app — loads the scripts in dependency order.'],
                ['`css/style.css`', 'All styles.'],
                ['`js/core/util.js`', 'Math helpers, touch gestures, storage, cookies and settings.'],
                ['`js/core/network.js`', 'The neural networks and the network settings.'],
                ['`js/core/algorithms.js`', 'Selection, recombination, mutation, objectives and fitness helpers.'],
                ['`js/core/data.js`', 'Creature designs, stats, recordings and the save file encoding.'],
                ['`js/data/defaultCreatures.js`', 'The five sample creatures.'],
                ['`js/sim/physics.js`', 'The 2D rigid body engine.'],
                ['`js/sim/scene.js`', 'The scenes: ground, walls, staircase, obstacle spawner, camera.'],
                ['`js/sim/creature.js`', 'The creature: joints, bones, muscles, wings, contacts and statistics.'],
                ['`js/sim/brain.js`', 'The brains and the fitness trackers.'],
                ['`js/sim/builder.js`', 'The model behind the editor: placing, deleting and the undo history.'],
                ['`js/sim/evolution.js`', 'The evolution loop: batches, evaluation and breeding.'],
                ['`js/sim/playback.js`', 'Playback of a recorded creature.'],
                ['`js/render/decorations.js`', 'The vector drawings of all 42 decorations.'],
                ['`js/render/renderer.js`', 'The canvas renderer and the cameras.'],
                ['`js/ui/app.js`', 'Screens, widgets, modals, storage and the home / creature / settings screens.'],
                ['`js/ui/editor.js`', 'The creature editor.'],
                ['`js/ui/simulation.js`', 'The simulation screen (HUD, playback, save/load).'],
                ['`js/ui/gallery.js`', 'The recording gallery.'],
                ['`js/ui/help.js`', 'This manual.'],
                ['`js/boot.js`', 'Startup and error handling.'],
              ]
            ),
            note(
              'Everything lives in the global `EVO` namespace and is loaded as classic scripts, on ' +
                'purpose: ES modules are blocked by the browser for `file://` pages.'
            ),
          ],
        },
        {
          id: 'browser-support',
          title: 'Browsers',
          blocks: [
            p(
              'The game runs in every current browser that supports the 2D canvas and Pointer ' +
                'Events — Chrome, Edge, Firefox and Safari, on desktop and on mobile. JavaScript ' +
                'has to be enabled; there is no other requirement and no build step.'
            ),
          ],
        },
      ],
    },

    /* ---------------------------------------------------------------- */
    {
      id: 'faq',
      title: 'Questions & answers',
      short: 'FAQ',
      sections: [
        {
          id: 'faq-list',
          title: 'Frequently asked questions',
          blocks: [
            def([
              { term: 'Why does nothing move?', text: 'In the first generations that is normal — the brains are random. Check that the creature has muscles that span across joints, and that the body is rigid enough (triangles!). After 20–40 generations something should twitch.' },
              { term: 'Why does my creature only drag itself along the ground?', text: 'Give the joints that should stay in the air a fitness penalty, or make the lower joints heavier so the creature has a low centre of mass.' },
              { term: 'Can I evolve the body too?', text: 'No — like the original game, only the brains evolve. The body is your design.' },
              { term: 'Where did my creatures go?', text: 'They are stored in this browser for this page. Clearing the browser data, opening the page from a different folder or using a private window starts with an empty storage. If the cookie copy was on, it is restored automatically — otherwise import a backup file.' },
              { term: 'Why are some things missing from the cookie copy?', text: 'Cookies only hold a few kilobytes each. Long recordings and big simulations often do not fit; the game keeps the newest entries that do fit and tells you in Settings → Storage. Use Export all data for a complete backup.' },
              { term: 'Does the game need the internet?', text: 'No. Everything is in this folder. You can copy it to a USB stick and open `index.html` anywhere.' },
              { term: 'Can I move my creatures to the Unity version?', text: 'Yes — the creature, simulation and recording files use the same JSON format (v1, v2 and v3). Use Export in the editor or in the gallery.' },
              { term: 'Is the simulation deterministic?', text: 'Every run is random: the population, the recombination and the mutation all use random numbers. Two runs with the same design will find different solutions — that is the point of the game.' },
              { term: 'Why is the simulation slow?', text: 'Lower the population size, shorten the simulation time or turn on batches. The physics cost grows with the number of creatures and with the number of joints.' },
              { term: 'How do I start completely over?', text: 'Settings → Data → Delete all saves removes your creatures, recordings and simulations. Reset all settings only resets the settings and keeps your data.' },
            ]),
          ],
        },
      ],
    },

    /* ---------------------------------------------------------------- */
    {
      id: 'credits',
      title: 'Credits',
      short: 'Credits',
      sections: [
        {
          id: 'credits-text',
          title: 'Credits and license',
          blocks: [
            p(
              'The original game — its design, levels, sample creatures and code — is ' +
                '**Copyright (c) Keiwan Donyagard**. It is not technically open source: it may be ' +
                'downloaded, modified and played around with for personal and educational purposes ' +
                'only (no relicensing, no selling, no redistributing builds).'
            ),
            p(
              'This web edition is an independent, educational re-implementation of that game in ' +
                'plain HTML, CSS and JavaScript for personal use, with no affiliation to or ' +
                'endorsement by the original author. All credits for the game design, the creature ' +
                'designs (FROGGER, ROO, HAILER, SPIDER, SPRING) and the algorithms go to Keiwan ' +
                'Donyagard.'
            ),
            p(
              'Karl Sims\' paper *Evolving Virtual Creatures* (SIGGRAPH \'94) is the original ' +
                'inspiration for the simulation.'
            ),
          ],
        },
      ],
    },
  ];

  /* ================================================================== *
   * The help screen
   * ================================================================== */
  var HelpScreen = {
    show: function () {
      this.query = '';
      this.activeCategory = this.activeCategory || CATEGORIES[0].id;
      if (!this.collapsed) this.collapsed = {};
      this.buildLayout();
      this.renderSidebar();
      this.renderContent();
    },

    resize: function () {
      /* The layout is fluid, nothing to re-measure. */
    },

    /* --- layout ---------------------------------------------------- */
    buildLayout: function () {
      var self = this;
      var element = this.element;
      UI.clear(element);

      var bar = UI.el('div', 'top-bar help-top-bar');
      var back = UI.el('button', 'back-button');
      back.appendChild(UI.el('span', 'back-arrow', '\u2190'));
      back.appendChild(UI.el('span', null, 'Back'));
      back.addEventListener('click', function () {
        App.show('home');
      });
      bar.appendChild(back);
      bar.appendChild(UI.el('div', 'top-bar-title', 'Help'));

      var search = UI.el('input', 'help-search');
      search.type = 'search';
      search.placeholder = 'Search the help\u2026';
      search.setAttribute('aria-label', 'Search the help');
      search.addEventListener('input', function () {
        self.setQuery(search.value);
      });
      this.searchInput = search;
      var searchWrapper = UI.el('div', 'top-bar-right help-search-wrapper');
      searchWrapper.appendChild(search);
      bar.appendChild(searchWrapper);
      element.appendChild(bar);

      var layout = UI.el('div', 'help-layout');
      this.sidebar = UI.el('aside', 'help-sidebar');
      this.categoriesElement = UI.el('nav', 'help-categories');
      this.sidebar.appendChild(this.categoriesElement);
      layout.appendChild(this.sidebar);

      var main = UI.el('div', 'help-main');
      this.toolbar = UI.el('div', 'help-toolbar');
      main.appendChild(this.toolbar);
      this.contentElement = UI.el('div', 'help-content help-sections');
      main.appendChild(this.contentElement);
      layout.appendChild(main);

      element.appendChild(layout);
    },

    /* --- sidebar --------------------------------------------------- */
    renderSidebar: function () {
      var self = this;
      UI.clear(this.categoriesElement);
      var query = this.query;

      CATEGORIES.forEach(function (category) {
        var count = query ? self.countMatches(category, query) : 0;
        if (query && count === 0) return;

        var button = UI.el(
          'button',
          'help-category' + (category.id === self.activeCategory && !query ? ' active' : '')
        );
        button.appendChild(UI.el('span', 'help-category-title', category.title));
        if (query) {
          button.appendChild(UI.el('span', 'help-category-count', String(count)));
        }
        button.addEventListener('click', function () {
          self.setCategory(category.id);
        });
        self.categoriesElement.appendChild(button);

        if (category.id === self.activeCategory && !query) {
          var sub = UI.el('div', 'help-section-links');
          category.sections.forEach(function (section) {
            var link = UI.el('button', 'help-section-link', section.title);
            link.addEventListener('click', function () {
              self.scrollToSection(section.id);
            });
            sub.appendChild(link);
          });
          self.categoriesElement.appendChild(sub);
        }
      });
    },

    /* --- toolbar --------------------------------------------------- */
    renderToolbar: function (visibleSections) {
      var self = this;
      UI.clear(this.toolbar);
      var info = UI.el('div', 'help-toolbar-info');
      if (this.query) {
        var total = 0;
        CATEGORIES.forEach(function (category) {
          total += self.countMatches(category, self.query);
        });
        info.appendChild(
          UI.el('span', null, total === 0 ? 'No matches' : total + (total === 1 ? ' match' : ' matches'))
        );
      } else {
        info.appendChild(UI.el('span', null, visibleSections + ' sections'));
      }
      this.toolbar.appendChild(info);

      var actions = UI.el('div', 'help-toolbar-actions');
      var expand = UI.el('button', 'evo-button small', 'Expand all');
      expand.addEventListener('click', function () {
        self.collapsed = {};
        self.renderContent();
      });
      var collapse = UI.el('button', 'evo-button small', 'Collapse all');
      collapse.addEventListener('click', function () {
        CATEGORIES.forEach(function (category) {
          category.sections.forEach(function (section) {
            self.collapsed[section.id] = true;
          });
        });
        self.renderContent();
      });
      actions.appendChild(expand);
      actions.appendChild(collapse);
      this.toolbar.appendChild(actions);
    },

    /* --- content --------------------------------------------------- */
    renderContent: function () {
      var self = this;
      UI.clear(this.contentElement);
      var query = this.query;

      if (query) {
        this.renderToolbar(0);
        var found = 0;
        CATEGORIES.forEach(function (category) {
          category.sections.forEach(function (section) {
            var blocks = section.blocks.filter(function (block) {
              return blockText(block).toLowerCase().indexOf(query) !== -1;
            });
            if (blocks.length) {
              found += blocks.length;
              self.contentElement.appendChild(self.buildResultSection(category, section, blocks, query));
            }
          });
        });
        if (!found) {
          var empty = UI.el('div', 'help-empty');
          empty.appendChild(
            UI.el('p', 'help-paragraph', 'Nothing was found for \u201C' + self.query + '\u201D.')
          );
          empty.appendChild(
            UI.el(
              'p',
              'help-note',
              'Try a shorter word — for example "muscle", "cookie", "fitness" or "shortcut".'
            )
          );
          this.contentElement.appendChild(empty);
        }
        return;
      }

      var category = this.categoryById(this.activeCategory) || CATEGORIES[0];
      this.renderToolbar(category.sections.length);
      category.sections.forEach(function (section) {
        self.contentElement.appendChild(self.buildSection(category, section, ''));
      });
    },

    buildSection: function (category, section, query) {
      var self = this;
      var wrapper = UI.el('section', 'help-section');
      wrapper.id = 'help-section-' + section.id;

      var header = UI.el('button', 'help-section-header');
      header.appendChild(UI.el('span', 'help-section-marker', this.collapsed[section.id] ? '\u25B8' : '\u25BE'));
      var title = UI.el('h2', 'help-section-title');
      appendInline(title, section.title, query);
      header.appendChild(title);
      header.addEventListener('click', function () {
        self.collapsed[section.id] = !self.collapsed[section.id];
        self.renderContent();
      });
      wrapper.appendChild(header);

      if (!this.collapsed[section.id]) {
        var body = UI.el('div', 'help-section-body');
        section.blocks.forEach(function (block) {
          body.appendChild(renderBlock(block, query));
        });
        wrapper.appendChild(body);
      }
      void category;
      return wrapper;
    },

    buildResultSection: function (category, section, blocks, query) {
      var wrapper = UI.el('section', 'help-section help-result');
      var header = UI.el('div', 'help-result-header');
      header.appendChild(
        UI.el('span', 'help-result-path', category.title + ' \u203A ' + section.title)
      );
      wrapper.appendChild(header);
      var body = UI.el('div', 'help-section-body');
      blocks.forEach(function (block) {
        body.appendChild(renderBlock(block, query));
      });
      wrapper.appendChild(body);
      return wrapper;
    },

    /* --- helpers --------------------------------------------------- */
    categoryById: function (id) {
      for (var i = 0; i < CATEGORIES.length; i++) {
        if (CATEGORIES[i].id === id) return CATEGORIES[i];
      }
      return null;
    },

    countMatches: function (category, query) {
      var count = 0;
      category.sections.forEach(function (section) {
        section.blocks.forEach(function (block) {
          if (blockText(block).toLowerCase().indexOf(query) !== -1) count++;
        });
      });
      return count;
    },

    setCategory: function (id) {
      this.activeCategory = id;
      this.query = '';
      if (this.searchInput) this.searchInput.value = '';
      this.renderSidebar();
      this.renderContent();
      if (this.contentElement) this.contentElement.scrollTop = 0;
    },

    setQuery: function (value) {
      this.query = String(value || '').trim().toLowerCase();
      this.renderSidebar();
      this.renderContent();
    },

    scrollToSection: function (id) {
      var node = document.getElementById('help-section-' + id);
      if (!node) return;
      if (node.scrollIntoView) {
        node.scrollIntoView({ block: 'start' });
      }
    },
  };

  EVO.Help = { categories: CATEGORIES, renderBlock: renderBlock, blockText: blockText };
  EVO.Screens = EVO.Screens || {};
  EVO.Screens.help = HelpScreen;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = EVO;
  }
})(typeof window !== 'undefined' ? window : globalThis);
