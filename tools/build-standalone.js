#!/usr/bin/env node
/*
 * Build the self-contained edition of Evolution without the Custom Creatures
 * catalogue. All runtime CSS and JavaScript are inlined into standalone/index.html.
 *
 *   node tools/build-standalone.js         rebuild the HTML file
 *   node tools/build-standalone.js --check verify that it is current
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, 'standalone', 'index.html');
const SCRIPT_FILES = [
  'js/core/util.js',
  'js/core/network.js',
  'js/core/algorithms.js',
  'js/core/data.js',
  'js/data/defaultCreatures.js',
  'js/sim/physics.js',
  'js/sim/scene.js',
  'js/sim/creature.js',
  'js/sim/brain.js',
  'js/sim/builder.js',
  'js/sim/evolution.js',
  'js/sim/ecosystem.js',
  'js/sim/playback.js',
  'js/render/decorations.js',
  'js/render/renderer.js',
  'js/render/viewModel.js',
  'js/ui/app.js',
  'js/ui/editor.js',
  'js/ui/simulation.js',
  'js/ui/ecosystem.js',
  'js/ui/gallery.js',
  'js/boot.js',
];

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function replaceExactlyOnce(source, search, replacement, description) {
  const first = source.indexOf(search);
  if (first === -1 || source.indexOf(search, first + search.length) !== -1) {
    throw new Error('Expected exactly one ' + description + ' while building the standalone edition.');
  }
  return source.slice(0, first) + replacement + source.slice(first + search.length);
}

function replaceRegexExactlyOnce(source, pattern, replacement, description) {
  const flags = pattern.flags.replace(/g/g, '') + 'g';
  const matches = Array.from(source.matchAll(new RegExp(pattern.source, flags)));
  if (matches.length !== 1) {
    throw new Error(
      'Expected exactly one ' + description + ' while building the standalone edition; found ' + matches.length + '.'
    );
  }
  return source.replace(pattern, replacement);
}

function createStandaloneAppSource() {
  let source = readProjectFile('js/ui/app.js');

  source = replaceRegexExactlyOnce(
    source,
    /      actions\.appendChild\(\n        this\.bigButton\('Custom Creatures',[\s\S]*?\n      \);\n/,
    '',
    'home-screen Custom Creatures button'
  );
  source = replaceRegexExactlyOnce(
    source,
    /      quickActions\.appendChild\(\n        UI\.makeButton\('Custom Creatures',[\s\S]*?\n      \);\n/,
    '',
    'Help-screen Custom Creatures shortcut'
  );
  source = replaceRegexExactlyOnce(
    source,
    /        \{\n          title: 'Custom Creatures',[\s\S]*?\n        \},\n(?=        \{\n          title: 'Ecosystem and Gallery')/,
    '',
    'Custom Creatures Help topic'
  );
  source = replaceExactlyOnce(
    source,
    "            ['Dialogs', 'Escape closes a dialog or the Custom Creatures Explore panel'],",
    "            ['Dialogs', 'Escape closes an open dialog'],",
    'Custom Creatures keyboard-help reference'
  );
  source = replaceExactlyOnce(
    source,
    "            'Keep index.html, css/, js/ and cc/ together when moving the project.',",
    "            'This edition is a single HTML file; no sibling CSS or JavaScript folders are needed.',",
    'multi-file troubleshooting guidance'
  );
  source = replaceExactlyOnce(
    source,
    "            'If Custom Creatures cannot read cc/, serve the folder over HTTP or use Add file instead.',\n",
    '',
    'Custom Creatures troubleshooting guidance'
  );
  source = replaceExactlyOnce(
    source,
    '      searchInput.placeholder = \'Try “save brain”, “touch” or “Custom Creatures”\';',
    '      searchInput.placeholder = \'Try “save brain”, “touch” or “keyboard shortcuts”\';',
    'Custom Creatures Help-search hint'
  );

  return source;
}

function createStandaloneViewModelSource() {
  let source = readProjectFile('js/render/viewModel.js');
  source = replaceExactlyOnce(
    source,
    ' * `buildRenderModel` and `frameDesign` used to live on the editor screen; they\n' +
      ' * are shared now so the Custom Creatures screen can draw posters of designs\n' +
      ' * that were never opened in the editor. The editor delegates to them.\n' +
      ' *\n' +
      ' * Pure geometry plus `drawPoster`, which only touches the canvas it is given.\n',
    ' * `buildRenderModel`, `designBounds` and `frameDesign` serve the editor without\n' +
      ' * requiring a live simulation. This module contains pure geometry helpers.\n',
    'view-model feature comment'
  );
  source = replaceRegexExactlyOnce(
    source,
    /  \/\*\*\n   \* Like `buildRenderModel`,[\s\S]*?\n  }\n\n(?=  \/\*\* Joint bounds)/,
    '',
    'catalogue-only safe-render helper'
  );
  source = replaceRegexExactlyOnce(
    source,
    /  \/\*\*\n   \* Aspect-aware framing for posters and the hero:[\s\S]*?(?=  EVO\.ViewModel = \{)/,
    '',
    'catalogue-only poster and hero drawing helpers'
  );
  source = replaceExactlyOnce(
    source,
    '  EVO.ViewModel = {\n' +
      '    buildRenderModel: buildRenderModel,\n' +
      '    buildSafeRenderModel: buildSafeRenderModel,\n' +
      '    designBounds: designBounds,\n' +
      '    frameDesign: frameDesign,\n' +
      '    fitCamera: fitCamera,\n' +
      '    drawPoster: drawPoster,\n' +
      '  };',
    '  EVO.ViewModel = {\n' +
      '    buildRenderModel: buildRenderModel,\n' +
      '    designBounds: designBounds,\n' +
      '    frameDesign: frameDesign,\n' +
      '  };',
    'view-model exports'
  );
  return source;
}

function createStandaloneCss() {
  const source = readProjectFile('css/style.css');
  const marker = '/* ================================================================== *\n * Custom Creatures\n';
  const start = source.indexOf(marker);
  if (start === -1 || source.indexOf(marker, start + marker.length) !== -1) {
    throw new Error('Could not identify exactly one Custom Creatures stylesheet section.');
  }
  return source.slice(0, start).trimEnd() + '\n';
}

function makeInlineScript(relativePath) {
  let source = relativePath === 'js/ui/app.js'
    ? createStandaloneAppSource()
    : relativePath === 'js/render/viewModel.js'
      ? createStandaloneViewModelSource()
      : readProjectFile(relativePath);

  if (/<\/script/i.test(source)) {
    throw new Error('Cannot safely inline a closing script tag from ' + relativePath + '.');
  }
  return '\n    <script>\n      /* Source: ' + relativePath + ' */\n' + source + '\n    </script>';
}

function buildHtml() {
  const css = createStandaloneCss();
  if (/<\/style/i.test(css)) {
    throw new Error('Cannot safely inline a closing style tag from css/style.css.');
  }
  const favicon = Buffer.from(readProjectFile('favicon.svg'), 'utf8').toString('base64');
  const scripts = SCRIPT_FILES.map(makeInlineScript).join('\n');

  return '<!DOCTYPE html>\n' +
    '<html lang="en">\n' +
    '  <head>\n' +
    '    <meta charset="utf-8" />\n' +
    '    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />\n' +
    '    <meta name="theme-color" content="#ededed" />\n' +
    '    <meta name="color-scheme" content="light dark" />\n' +
    '    <meta name="mobile-web-app-capable" content="yes" />\n' +
    '    <meta name="apple-mobile-web-app-capable" content="yes" />\n' +
    '    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />\n' +
    '    <meta name="apple-mobile-web-app-title" content="Evolution" />\n' +
    '    <meta name="format-detection" content="telephone=no" />\n' +
    '    <meta name="description" content="A self-contained Evolution simulator that demonstrates machine learning with evolutionary algorithms. Design virtual creatures and evolve their neural networks." />\n' +
    '    <title>Evolution — Standalone Edition</title>\n' +
    '    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml;base64,' + favicon + '" />\n' +
    '    <style>\n' +
    '      /* Inlined from css/style.css; catalogue-only styles are omitted. */\n' +
    css +
    '    </style>\n' +
    scripts + '\n' +
    '  </head>\n' +
    '  <body>\n' +
    '    <!-- Single-file variant: no external stylesheets, scripts, or data files. -->\n' +
    '    <div id="startup-notice" class="startup-notice" role="status" aria-live="polite">\n' +
    '      <h1>EVOLUTION</h1>\n' +
    '      <p>Loading the interactive simulator…</p>\n' +
    '      <p class="startup-note">\n' +
    '        If this message remains, this browser preview may not run JavaScript. Open this file in a modern browser or use a hosted web address.\n' +
    '        This edition already contains its styles and scripts; no companion folders are required.\n' +
    '      </p>\n' +
    '    </div>\n' +
    '    <div id="screens"></div>\n' +
    '    <noscript>\n' +
    '      <p style="padding: 20px">Evolution needs JavaScript to run. Please enable JavaScript and reload the page.</p>\n' +
    '    </noscript>\n' +
    '  </body>\n' +
    '</html>\n';
}

function main() {
  const html = buildHtml();
  if (process.argv.includes('--check')) {
    if (!fs.existsSync(OUTPUT) || fs.readFileSync(OUTPUT, 'utf8') !== html) {
      console.error('Standalone HTML is out of date. Run: node tools/build-standalone.js');
      process.exitCode = 1;
      return;
    }
    console.log('Standalone HTML is up to date.');
    return;
  }

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, html);
  console.log('Wrote ' + path.relative(ROOT, OUTPUT) + ' (' + Buffer.byteLength(html, 'utf8') + ' bytes).');
}

try {
  main();
} catch (error) {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
}
