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
* **My Creatures** — your saved designs (and the five samples: FROGGER, ROO, HAILER, SPIDER, SPRING).
* **Gallery** — replays of the best creature of every saved generation.
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

Properties (weight, fitness penalty, bone weight, wing/inverted flags, muscle strength, muscle id,
decoration scale/rotation/flip/order) are edited in the right-hand panel. Muscles that share a
**muscle id** are contracted and expanded together by a single network output.

Keyboard: `V` select, `J` joint, `B` bone, `M` muscle, `D` decoration, `E` erase, `Ctrl/Cmd+Z`
undo, `Ctrl/Cmd+Shift+Z` redo, `Delete` removes the selection, `Esc` cancels a pending placement.

---

## The simulation

* **Tasks**: Running, Jumping, Obstacle Jump, Climbing, Flying. Each task has its own scene
  (flat ground, walls with rolling obstacles, or an endless staircase) and its own fitness function.
* **Evolution**: every generation evaluates a population of neural networks, sorts them by fitness
  and breeds the next generation by selection, recombination and mutation. The best creatures can be
  kept unchanged (*keep best creatures*).
* **Brain**: a feed-forward neural network (sigmoid activations) with the 11 universal inputs of the
  original: distance to the ground, four distance sensors, a rotating sensor, velocity, angular
  velocity, ground contacts and rotation. One output per unique muscle id, plus one output that
  rotates the distance sensor.
* **HUD**: generation, live fitness, phase, autoplay, duration, creature selector, generation history,
  best-of-generation thumbnail, playback controls, speed, visibility and camera controls.
* **Playback**: after each generation the recording of the best creature is played back. You can scrub
  through it, save it to the gallery, or continue to the next generation.
* **Ghost**: while a generation is running, the best creature of the previous generation is drawn as a
  faded "ghost".

Keyboard: `Space` pause/continue, `V` toggle visibility, `R` reset the camera, arrow keys switch the
watched creature (or scrub the playback). Mouse: drag to pan, wheel/pinch to zoom.

---

## Saving and loading

* **Creatures** — saved in the browser and exported/imported as JSON files.
* **Recordings** — the best creature of a generation can be saved to the gallery, played back and
  exported as a JSON file.
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
js/core/util.js             math helpers, storage (localStorage with an in-memory fallback), settings, DOM helpers
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
js/sim/playback.js          playback of recorded creatures
js/render/decorations.js    the vector drawings of all decorations
js/render/renderer.js       the canvas 2D renderer and the editor/simulation camera
js/ui/app.js                screens, widgets, modals, storage and the home/creature/settings/help screens
js/ui/editor.js             the creature editor
js/ui/simulation.js         the simulation screen (HUD, playback, save/load)
js/ui/gallery.js            the recording gallery
js/boot.js                  startup and error handling
```

---

## How it works

* **Physics**: a small impulse/constraint solver on the XY plane. Joints are circle bodies whose mass
  is the joint weight, bones are hinge constraints between two joints, muscles are spring constraints
  between two bones that can additionally contract or expand with a force proportional to the muscle
  strength. Wing bones add a lift force depending on the bone's rotation and velocity. A static
  broad-phase grid keeps collisions between many creatures cheap, so a whole population can be
  simulated in one world (also in visible batches).
* **Fitness**: the objective trackers match the original formulas, including the per-joint ground
  contact penalties, so the values are comparable to the Unity version.
* **Recordings**: 30 samples per second of joint positions and muscle forces, played back with
  interpolation.

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
