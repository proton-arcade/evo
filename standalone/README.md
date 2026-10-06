# Evolution — standalone edition

`index.html` is a self-contained copy of the Evolution web simulator. Its HTML, CSS, JavaScript, favicon and five sample-creature designs are bundled in that one file, so it does not need the rest of the repository at runtime.

This edition omits the **Custom Creatures** catalogue and its file/manifest loader. The editor, My Creatures, simulations, Ecosystem, Gallery, Settings and the in-app **Help** centre remain available. Help keeps its quick-start guidance, search and accordion topics, with catalogue-only instructions removed.

## Run it

Open `index.html` in a modern browser. If a mobile file preview does not run JavaScript, open the file in the browser or serve it from an `http://` or `https://` address instead. Creature and simulation saves use browser storage when available; export important work as files for portability.

## Rebuild from the repository

From the repository root, run:

```sh
node tools/build-standalone.js
```

To check that the generated file matches the current source, run:

```sh
node tools/build-standalone.js --check
```

The full multi-file edition and its documentation remain at the repository root; this directory is the separate single-file variant.
