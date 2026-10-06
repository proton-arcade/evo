# Evolution — Web Edition

A complete, dependency-free web port of the sandbox game **Evolution** by Keiwan Donyagard
([keiwando.com/evolution](https://keiwando.com/evolution/)) — a simulator that demonstrates machine
learning with evolutionary algorithms, inspired by Karl Sims' *Evolving Virtual Creatures*.

The whole game is written in plain **HTML, CSS and JavaScript**. Desktop browsers can open the project
folder directly with no build step or package manager. For a phone or tablet, serve the folder from any
static web host or local web server and open its `http://` or `https://` address; iOS does not reliably
run a multi-file interactive app from a local `file://` document.

A separate [single-file edition](standalone/index.html) bundles the app's HTML, styles and scripts into one
page, keeps the in-app Help centre, and omits the Custom Creatures catalogue. See
[`standalone/README.md`](standalone/README.md) for run and rebuild instructions; the full edition described
below is unchanged.

---

## Getting started

1. Download or copy the entire folder — `index.html`, `css/`, and `js/` must stay together (keep `cc/`
   too if you want the Custom Creatures screen to show the bundled creature).
2. On desktop, open `index.html` with Chrome, Firefox, Edge, Safari or another modern browser.
3. On iPhone or iPad, use a hosted `https://` address (or a local-network web server) rather than
   opening a `file://` copy from Safari or Files. Apple's document preview does not reliably load the
   sibling scripts that make the simulator interactive.
4. (Optional) The Custom Creatures screen reads the `cc/` folder with `fetch`, which browsers block for
   `file://` pages. Serve the folder over `http://` to see the files in `cc/`; dropping a creature file onto
   the screen works either way.
5. (Optional) If your browser restricts local storage for a local page, everything still works — only
   the in-browser save slots are disabled and you are asked to save as files instead.

### First steps

* **Create a Creature** — the editor. Start from a sample creature or build one from scratch.
* **Start Simulation** — evolve a brain for the current design.
* **My Creatures** — your saved designs with independent evolved brain profiles for each action (and the five samples: FROGGER, ROO, HAILER, SPIDER, SPRING).
* **Ecosystem** — choose two to six creatures to inhabit one shared simulation world.
* **Gallery** — saved movement replays of the best creature from a generation.
* **Custom Creatures** — a catalogue of ready-made creatures with evolved brains, from the `cc/` folder or dropped in.
* **Settings** — light/dark theme, display, evolution and neural-network settings.
* **Help** — searchable quick starts, controls, saving guidance and troubleshooting.

---

## Appearance and in-app help

Choose **Settings → Display → Theme** to switch between **Light** and **Dark**. The choice applies
immediately, is remembered in the browser and covers both the interface and canvas-rendered scenes,
including the editor, simulations, gallery and Custom Creatures artwork. Resetting all settings returns
the theme to Light.

The **Help** screen is designed for quick answers rather than one long article. It has direct actions for
starting a design or browsing creatures, a search field, Expand all / Collapse all controls and ten concise
accordion topics covering first steps, design, evolution, controls, saves, Custom Creatures, Ecosystem,
Gallery, wing behavior, troubleshooting and brain basics. A Settings shortcut is available from its top bar.

---

## The creature editor

| Tool | What it does |
| --- | --- |
| **Select** | Tap a component to edit it; drag joints/bones to move them; drag empty space to pan. |
| **Joint** | Tap to place a joint (joints cannot overlap). |
| **Bone** | Tap a joint, then a second joint, to connect them with a bone. |
| **Wing** | Tap a bone to mark it as a wing; tap the same winged bone again to remove it. |
| **Muscle** | Tap a bone, then a second bone, to add a muscle between them. |
| **Decor** | Pick a cosmetic decoration (eyes, mouths, noses, hands, shoes, …) and tap a bone to attach it. |
| **Erase** | Tap a component to delete it (deleting a joint deletes its bones and muscles). |

Properties (weight, fitness penalty, bone weight, wing/inverted flags, wing chord, muscle strength,
muscle id, decoration scale/rotation/flip/order) are edited in the right-hand panel. Marked wings are
highlighted in teal. Connect a wing to another bone with a muscle: its contraction and expansion power
the wing stroke, while an unconnected wing cannot flap. Muscles that share a **muscle id** are
contracted and expanded together by a single network output.

Keyboard: `V` select, `J` joint, `B` bone, `W` wing, `M` muscle, `D` decoration, `E` erase,
`Ctrl/Cmd+Z` undo, `Ctrl/Cmd+Shift+Z` redo, `Delete` removes the selection, `Esc` cancels a pending placement.

On touch screens, tap to use the active tool, drag a selected joint/bone or empty space with one
finger, and use two fingers to pan and zoom the editor view. A touch edit is applied when the finger
lifts, so beginning a two-finger gesture will not accidentally place a component.

---

## The simulation

* **Tasks**: Running, Jumping, Obstacle Jump, Climbing, Flying. Each task has its own scene
  (flat ground, an endless course that generates progressively larger blocks ahead of the creature,
  or an endless staircase) and its own fitness function. The Obstacle Jump course opens with a
  visible stretch of fifteen blocks and keeps extending beyond them.
* **Evolution**: every generation evaluates a population of neural networks, sorts them by fitness
  and breeds the next generation by selection, recombination and mutation. The best creatures can be
  kept unchanged (*keep best creatures*).
* **Brain**: a feed-forward neural network (sigmoid activations) with the 11 universal inputs of the
  original: distance to the ground, four distance sensors, a rotating sensor, velocity, angular
  velocity, ground contacts and rotation. One output per unique muscle id, plus one output that
  rotates the distance sensor.
* **HUD**: generation, live fitness, phase, autoplay, a skip-recap toggle, an auto-flap toggle,
  duration, creature selector, generation history, best-of-generation thumbnail, a Pause/Resume
  button, a Shock button, playback controls, speed, visibility and camera controls. Flying also
  offers live wing-speed, angle-of-attack, lift/drag, estimated-weight and airtime diagnostics with
  per-wing force vectors. Visibility can focus the previous generation's champion in front of the
  current population.
* **Wing reflex**: creatures with powered wings automatically flap while they are airborne or
  falling, so flight does not have to be discovered from scratch by evolution. The reflex rests on
  the ground and can be switched off with the AUTO FLAP toggle.
* **Shock**: the Shock button (or the `S` key) startles every creature in the current batch,
  interrupting whatever it is doing — brains and reflexes pause, muscles relax and motion dies down
  for a moment before normal behaviour resumes. A lightning bolt and flash mark each stunned
  creature. The ecosystem screen offers the same control for its residents.
* **Playback and saves**: after each generation the recording of the best creature is played back by
  default. You can scrub through it, skip recaps, or use **Save run** to name a replay or run checkpoint.
  **Save Brain** overwrites only the current action (Running, Jumping, Obstacle Jump, Climbing or
  Flying) on the existing My Creatures entry and updates that action's best-generation replay in the
  Gallery. My Creatures lets you choose which saved action brain to continue or retrain.
* **Ecosystem**: choose two to six library or sample creatures and a shared objective scene. Library
  entries reuse the saved brain for the selected action when available; otherwise they receive a fresh
  exploratory brain. Residents share ground and obstacle physics, with Pause/Resume, run length and speed controls.
* **Ghost**: while a generation is running, the best creature of the previous generation is drawn as a
  faded "ghost".

Keyboard: `Space` pause/continue (or use the on-screen Pause/Resume button), `S` shock the
creatures, `V` toggle visibility, `R` reset the camera, arrow keys switch the watched creature (or
scrub the playback). Mouse: drag to pan, wheel/pinch to zoom. On touch screens, drag with one
finger to pan and use two fingers to pan and zoom.

---

## Custom Creatures

The **Custom Creatures** screen browses creature files — a design plus its evolved action brains, the same
format the editor's Export writes — without importing them first. It follows a streaming-catalogue layout:

* **Featured creature** — a large picture of the creature with its name, joint/bone/muscle counts and brain
  summary, and **Simulate**, **Copy** and **Explore** buttons. Up to six creatures take turns every five
  seconds; rotation pauses while the pointer or keyboard focus is on it, while the Explore panel is open and
  when the tab is hidden, and it does not run at all if the system asks for reduced motion. The dots choose a
  creature by hand.
* **Rows** — *All creatures*, then one *Has a … brain* row per action (Running, Jumping, Obstacle Jump,
  Climbing, Flying) that at least one creature has. Each poster is the creature drawn from its design, with a
  badge counting its brains. A **Rows / Grid** toggle swaps the rows for a grid, and remembers the choice.
* **Explore** — a slide-in panel with one chip per brain (action, generation and fitness), **Copy JSON** and
  **Copy to My Creatures**. `Esc` or the back arrow closes it.
* **Simulate** — pick an action and run the creature straight from the file, continuing from its saved brain
  where it has one. The creature is not added to My Creatures unless you copy it.
* **Copy to My Creatures** — stores the design with all its brains. Pressing it again does not add a second
  copy, and it never replaces a brain you trained further; it only adds actions that creature has no brain for.
  A same-named creature with a different design is added as a separate entry.
* **Copy JSON** — copies the file's text to the clipboard. Where the browser refuses (for example from a
  `file://` page) the text is shown in a dialog to select and copy.

**Adding creatures.** Put `.json` files in `cc/` and run `node tools/scan-cc.js`, which writes the manifest
`cc/index.json` (a browser cannot list a folder; `--check` reports whether it is current). Or drop a file onto
the screen, or press **Add file** — no tooling needed, and the file stays until the page is closed.

**Bad files.** A file needs only a design; its name falls back to the file name. A file the app would
quietly change is not added — a bone or muscle that refers to something missing, duplicate ids, invalid
JSON, an empty design — and a notice names the problem. A brain whose weights do not fit its design is left
out with a notice, and the creature is still added. See [`cc/README.md`](cc/README.md).

---

## Mobile and touch screens

Evolution uses Pointer Events for touch input and works in current browsers with Pointer Events
support (including iOS/iPadOS 13+ and Android Chrome 55+). iOS's local-file and Files preview modes
are not reliable for interactive multi-file pages: host the folder or use a local-network server, then
open the resulting `http://` or `https://` address in Safari. The app now keeps a visible startup
message in local previews instead of leaving a blank screen.

* **Editor:** one-finger taps use the selected tool; drag a joint/bone to move it or empty space to
  pan. Two fingers pan and zoom. Touch edits are committed on lift to avoid accidental placements
  when a second finger starts a gesture.
* **Simulation:** drag with one finger to move the camera; two fingers pan and pinch to zoom. Mouse
  wheel zoom remains available on desktop.
* **Gallery:** use two fingers on the recording canvas to pan and zoom the replay.
* **Ecosystem:** tap multiple resident cards, then pan with one finger or pan/zoom with two fingers.
* **Custom Creatures:** posters scroll sideways with snap points, the hero dots have enlarged tap areas, and
  **Add file** replaces drag-and-drop where a file cannot be dragged in.
* Controls have larger tap targets on touch devices, and editor panels, settings and recording lists
  can be scrolled with touch momentum. The layout adapts for narrow portrait and landscape screens.
* Safe-area insets are respected on notched phones. Screen dimensions are refreshed after rotation,
  browser chrome changes and visual viewport changes such as the on-screen keyboard opening.
* Canvas backing resolution is capped at 2× device pixel ratio to limit memory and rendering cost on
  high-density phones and tablets. If the browser interrupts a gesture (for example, when switching
  apps), the gesture state is cleared so a drag cannot remain stuck.

---

## Saving and loading

* **Creatures** — designs are saved in the browser and exported/imported as JSON files. **Save Brain**
  updates the selected existing design in place; each action has its own chromosome and network settings,
  so saving Running will not replace Jumping, Obstacle Jump, Climbing or Flying. It also updates the
  Gallery replay linked to that action. It does not create a duplicate creature snapshot.
* **Creature files** — the editor's **Export** writes the design *together with every evolved action
  brain* of that creature: each brain travels as a `brains` entry holding its task, generation,
  chromosome, network topology, scene and stats. **Import** reads them back, so a trained creature can
  be moved between browsers or machines without re-evolving anything. A file that carries brains is
  stored in My Creatures on import (brains belong to a library entry); a design-only file is simply
  loaded into the editor as before. The `brains` entry is additive — the file keeps the plain
  `name`/`joints`/`bones`/`muscles`/`decorations` keys, so the Unity version and older web editions
  still read it and just ignore the brains. The browser-local Gallery replay reference is not exported.
* **Custom Creatures** — creature files in `cc/` (or dropped onto that screen) are read-only. **Copy to My
  Creatures** is how one becomes a library entry with its brains attached.
* **Recordings** — **Save replay** stores a named movement recording in the Gallery. The brain save also
  keeps the best-generation replay for that action up to date.
* **Simulations** — a simulation (settings, scene, best creatures, current chromosomes) can be saved
  in the browser or downloaded as a file, and loaded again later so the evolution continues where it
  stopped. Auto-saving can be enabled in the settings.
* All JSON formats (`v1`, `v2` and `v3`) are compatible with the save files of the Unity version of
  Evolution, so designs and simulations can be moved between the two.

---

## Project structure

```
index.html                  the app (loads the scripts in dependency order)
css/style.css               all styles
js/core/util.js             math helpers, capped display pixel ratio, touch gesture helpers, storage, settings and DOM helpers
js/core/network.js          feed-forward neural networks and network settings
js/core/algorithms.js       selection, recombination, mutation, objectives and fitness utilities
js/core/data.js             creature designs, stats, recordings, save data and encoding/decoding
js/core/customLibrary.js     reads, checks and groups the creature files in cc/; copies them to My Creatures
js/data/defaultCreatures.js the five sample creatures
js/sim/physics.js           the 2D rigid body engine (bodies, joints, boxes, circles, raycasts, contacts)
js/sim/scene.js             the simulation scenes (ground, walls, staircase, obstacle spawner, camera)
js/sim/creature.js          the creature (joints, bones, muscles, wings, contacts, statistics)
js/sim/brain.js             the brains and the objective trackers
js/sim/builder.js           the model behind the editor (placing/deleting components, undo history)
js/sim/evolution.js         the evolution loop (batches, evaluation, breeding)
js/sim/ecosystem.js         multiple creatures in a shared physics world
js/sim/playback.js          playback of recorded creatures
js/render/decorations.js    the vector drawings of all decorations
js/render/renderer.js       the canvas 2D renderer and the editor/simulation camera
js/render/viewModel.js      draws a creature design without an editor (render model, framing, posters)
js/ui/app.js                screens, widgets, modals, storage and the home/creature/settings/help screens
js/ui/editor.js             the creature editor
js/ui/simulation.js         the simulation screen (HUD, playback, save/load)
js/ui/ecosystem.js           resident selection and shared-world ecosystem controls
js/ui/gallery.js            the recording gallery
js/ui/custom.js             the Custom Creatures screen (hero, poster rows, Explore panel)
js/boot.js                  startup and error handling
standalone/index.html       generated single-file edition, retaining Help but omitting Custom Creatures
standalone/README.md        run and rebuild instructions for the single-file edition
tools/                      headless helpers and build tools, not loaded by index.html
tools/train-creature.js     trains one action brain for a creature file with the real evolution loop
tools/build-creature-file.js assembles trained brains into an exportable creature file
tools/scan-cc.js            writes cc/index.json, the list of creature files the Custom Creatures screen reads
tools/build-standalone.js   generates or checks standalone/index.html
cc/                         custom creature files (design + evolved brains), shown on the Custom Creatures screen
```

---

## How it works

* **Physics**: a small impulse/constraint solver on the XY plane. Joints are circle bodies whose mass
  is the joint weight, bones are hinge constraints between two joints, muscles are spring constraints
  between two bones that can additionally contract or expand with a force proportional to the muscle
  strength. Wings use their length × editable chord as an area proxy and include rotational wing-point
  velocity, bounded lift/drag forces and a powered flap direction. A static
  broad-phase grid accelerates scene-geometry contacts; ecosystem mode also resolves cross-creature
  joint contacts so residents can share the same world.
* **Fitness**: Running, Jumping and Climbing retain their original trackers. Obstacle Jump rewards
  cleared blocks and course progress; Flying ignores the initial drop and gives extra weight to
  average height and sustained airtime. Per-joint ground-contact penalties are still applied.
* **Recordings**: 30 samples per second of joint positions and muscle forces, played back with
  interpolation.

---

## Regression diagnostics

Run the dependency-free checks with Node.js:

```sh
for test in tests/*.js; do node "$test"; done
```

The suite includes a deterministic muscle-driven flying creature that must take off and sustain
airtime after ground contact (plus a no-flap control), the automatic wing-flap reflex and the shock
interrupt (in both the evolution loop and the ecosystem), editor-to-simulation scenarios, in-place
action-brain/replay updates, creature-file export/import round trips that must keep the evolved action
brains, the Custom Creatures logic (file checks, rows, idempotent copy, manifest, drawing a design without
the editor), persisted light/dark canvas palettes, the searchable Help structure, ecosystem selection and
shared physics, floor friction, simulation playback, and mobile/touch layout checks.

---

## Credits and license

The original game — its design, levels, sample creatures and code — is
**Copyright (c) Keiwan Donyagard**, and is *not* technically open source; it may be downloaded,
modified and played around with for personal and educational purposes only (no relicensing, no
selling or redistributing builds). See the original
[README](https://github.com/keiwando/evolution) for the full terms.

This folder is an independent, educational re-implementation of that game in plain web technologies
for personal use, with no affiliation to or endorsement by the original author. All credits for the
game design, the creature designs (FROGGER, ROO, HAILER, SPIDER, SPRING) and the algorithms go to
Keiwan Donyagard. Karl Sims' paper *Evolving Virtual Creatures* (SIGGRAPH '94) is the original
inspiration for the simulation.
