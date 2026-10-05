# cc — custom creatures

A drop folder for creature files that already carry their evolved brains. They show up on
the home screen under **Custom Creatures**: a featured creature, rows of posters, and an
Explore panel per creature.

## Adding a file

1. Put the `.json` file in this folder.
2. Run `node tools/scan-cc.js` — a browser cannot list a folder, so this writes the
   manifest `cc/index.json` that the screen reads. (`--check` verifies it is current; a test
   does the same.)
3. Serve the app over http. Opened straight from `file://`, the browser blocks reading
   `cc/`; the screen then says so.

No tooling needed: **drop a file onto the Custom Creatures screen** (or press **Add file**)
and it appears at once. Files added that way last until the page is closed.

A file only needs a design. Counts, brain chips and the poster are worked out when it is
read, and the name falls back to the file name. A file the app would quietly change — a bone
whose joint is missing, a muscle whose bone is missing, duplicate ids, invalid JSON — is
not added; the screen shows a notice saying what is wrong. A brain whose weights do not fit
the design is left out with a notice.

**Copy** puts the creature in My Creatures with all its brains. Pressing it again does not
add a second copy, and never replaces a brain you trained further.

## Using a file in the editor

Open the app, go to **Create a Creature → Import**, and paste the file's contents. The
design loads into the editor and, because the file carries brains, the creature is also
saved to **My Creatures** with every action brain attached — so you can simulate any of
its actions straight away instead of re-evolving them.

Equivalently, **Export** on a creature that has saved brains writes a file of exactly this
shape.

## File format

The plain creature design keys, plus one extra entry:

```jsonc
{
  "name": "g8t7r",
  "joints": [ /* … */ ],
  "bones": [ /* … */ ],
  "muscles": [ /* … */ ],
  "decorations": [],
  "brains": {
    "running": { "task": 0, "generation": 294, "chromosome": [ /* 280 weights */ ],
                 "networkSettings": { "NodesPerIntermediateLayer": [10] },
                 "scene": { /* … */ }, "stats": { /* … */ },
                 "lastV2SimulatedGeneration": 0 }
    // jumping, obstacleJump, climbing, flying …
  }
}
```

`brains` is additive. Older web editions and the Unity version still read these files as
plain designs and simply ignore it.

## Regenerating a file

```sh
node tools/train-creature.js cc/g8t7r.json Running 300 40 .scratch/results   # one action
node tools/build-creature-file.js cc/g8t7r.json .scratch/results cc/g8t7r.json
```

`train-creature.js` runs the app's own evolution loop headlessly; `build-creature-file.js`
assembles the results with the same encoder the editor's Export button uses.

## g8t7r

11 joints, 13 bones, 16 muscles, no wings. Trained with 5 actions × 300 generations ×
population 40 = **60,000 simulated creatures** (1344 s of summed trainer time, run two
actions at a time on two cores), using the default network of 11 inputs, one hidden layer
of 10, and 17 outputs.

| Action | Best at gen | Fitness | What it does |
| --- | --- | --- | --- |
| Running | 294 | 0.1532 | Covers 84.3 units of ground in 10 s (avg speed 8.4). |
| Jumping | 252 | 0.4791 | Peaks 2.98 units off the ground. |
| Obstacle Jump | 154 | 0.4914 | Clears blocks and travels 18.3 units down the course. |
| Climbing | 216 | 0.4371 | Below the 0.5 stand-still baseline — see the note below. |
| Flying | 286 | 0.2850 | Hops to 4.24 units; the design has no wings, so it cannot fly. |

Fitness curves were still rising at generation 300 for Running and Flying, so both would
improve with a longer run. Climbing is a poor fit for this shape: on the 45° staircase with
3-unit steps, a creature 12 units wide spans several steps at once and evolution only
reduced how far it slides back (from about 9.4 units down at generation 1 to 6.3 units down
at its best). It never achieved a net climb.
