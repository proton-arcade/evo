# Evolution — Web Edition

A complete, dependency-free web port of the sandbox game **Evolution** by Keiwan Donyagard
([keiwando.com/evolution](https://keiwando.com/evolution/)) — a simulator that demonstrates machine
learning with evolutionary algorithms, inspired by Karl Sims' *Evolving Virtual Creatures*.

The whole game is written in plain **HTML, CSS and JavaScript** and runs directly from the file
system: **open `index.html` in a browser** (double click it). There is no build step, no server, no
package manager and no network access required.

---

## Getting started

1. Download or copy this folder.
2. Open `index.html` with Chrome, Firefox, Edge, Safari or any other modern browser.
3. (Optional) If your browser restricts local storage for `file://` pages, everything still works —
   only the in-browser save slots are disabled and you are asked to save as files instead.

### First steps

* **Create a Creature** — the editor. Start from a sample creature or build one from scratch.
* **Start Simulation** — evolve a brain for the current design.
* **My Creatures** — your saved designs with independent evolved brain profiles for each action (and the five samples: FROGGER, ROO, HAILER, SPIDER, SPRING).
* **Ecosystem** — choose two to six creatures to inhabit one shared simulation world.
* **Gallery** — saved movement replays of the best creature from a generation.
* **Settings** — display, evolution and neural-network settings.
* **Help** — a short explanation of the simulation.

---

## The creature editor

| Tool | What it does |
| --- | --- |
| **Select** | Tap a component to edit it; drag joints/bones to move them; drag empty space to pan. |
| **Joint** | Tap to place a joint (joints cannot overlap). |
| **Bone** | Tap a joint, then a second joint, to connect them with a bone. |
| **Muscle** | Tap a bone, then a second bone, to add a muscle between them. |
| **Decor** | Pick a cosmetic decoration (eyes, mouths, noses, hands, shoes, …) and tap a bone to attach it. |
| **Erase** | Tap a component to delete it (deleting a joint deletes its bones and muscles). |

Properties (weight, fitness penalty, bone weight, wing/inverted flags, wing chord, muscle strength,
muscle id, decoration scale/rotation/flip/order) are edited in the right-hand panel. Marked wings are
highlighted in teal. Muscles that share a
**muscle id** are contracted and expanded together by a single network output.

Keyboard: `V` select, `J` joint, `B` bone, `M` muscle, `D` decoration, `E` erase, `Ctrl/Cmd+Z`
undo, `Ctrl/Cmd+Shift+Z` redo, `Delete` removes the selection, `Esc` cancels a pending placement.

On touch screens, tap to use the active tool, drag a selected joint/bone or empty space with one
finger, and use two fingers to pan and zoom the editor view. A touch edit is applied when the finger
lifts, so beginning a two-finger gesture will not accidentally place a component.

---

## The simulation

* **Tasks**: Running, Jumping, Obstacle Jump, Climbing, Flying. Each task has its own scene
  (flat ground, a course of progressively larger blocks, or an endless staircase) and its own fitness function.
* **Evolution**: every generation evaluates a population of neural networks, sorts them by fitness
  and breeds the next generation by selection, recombination and mutation. The best creatures can be
  kept unchanged (*keep best creatures*).
* **Brain**: a feed-forward neural network (sigmoid activations) with the 11 universal inputs of the
  original: distance to the ground, four distance sensors, a rotating sensor, velocity, angular
  velocity, ground contacts and rotation. One output per unique muscle id, plus one output that
  rotates the distance sensor.
* **HUD**: generation, live fitness, phase, autoplay, a skip-recap toggle, duration, creature selector,
  generation history, best-of-generation thumbnail, a Pause/Resume button, playback controls, speed,
  visibility and camera controls. Flying also offers live wing-speed, angle-of-attack, lift/drag,
  estimated-weight and airtime diagnostics with per-wing force vectors. Visibility can focus the previous
  generation's champion in front of the current population.
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

Keyboard: `Space` pause/continue (or use the on-screen Pause/Resume button), `V` toggle visibility,
`R` reset the camera, arrow keys switch the watched creature (or scrub the playback). Mouse: drag to
pan, wheel/pinch to zoom. On touch screens, drag with one finger to pan and use two fingers to pan
and zoom.

---

## Mobile and touch screens

Evolution uses Pointer Events for touch input and works in current browsers with Pointer Events
support (including iOS/iPadOS 13+ and Android Chrome 55+). No app installation or network connection
is needed; the same `index.html` can be opened locally.

* **Editor:** one-finger taps use the selected tool; drag a joint/bone to move it or empty space to
  pan. Two fingers pan and zoom. Touch edits are committed on lift to avoid accidental placements
  when a second finger starts a gesture.
* **Simulation:** drag with one finger to move the camera; two fingers pan and pinch to zoom. Mouse
  wheel zoom remains available on desktop.
* **Gallery:** use two fingers on the recording canvas to pan and zoom the replay.
* **Ecosystem:** tap multiple resident cards, then pan with one finger or pan/zoom with two fingers.
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
js/ui/app.js                screens, widgets, modals, storage and the home/creature/settings/help screens
js/ui/editor.js             the creature editor
js/ui/simulation.js         the simulation screen (HUD, playback, save/load)
js/ui/ecosystem.js           resident selection and shared-world ecosystem controls
js/ui/gallery.js            the recording gallery
js/boot.js                  startup and error handling
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
airtime after ground contact (plus a no-flap control), editor-to-simulation scenarios, in-place
action-brain/replay updates, ecosystem selection and shared physics, floor friction, simulation playback, and mobile/touch
layout checks.

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
