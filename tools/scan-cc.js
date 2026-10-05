/*
 * Evolution (Web Edition) — tools/scan-cc.js
 * ---------------------------------------------------------------
 * A browser cannot list a folder, so the Custom Creatures screen finds the
 * files in cc/ through a manifest. This writes it: cc/index.json, the sorted
 * names of every creature file (*.json) in cc/.
 *
 *   node tools/scan-cc.js            write cc/index.json
 *   node tools/scan-cc.js --check    exit 1 if cc/index.json is out of date
 *
 * Each file is also read with the app's own checks, and problems are printed.
 * A file that fails is still listed — the screen shows the same message next
 * to it instead of the file silently going missing.
 *
 * Without running this the screen still works: drop a file onto it.
 */
'use strict';

var fs = require('fs');
var path = require('path');

require('../js/core/util.js');
require('../js/core/network.js');
require('../js/core/algorithms.js');
require('../js/core/data.js');
require('../js/sim/scene.js');
require('../js/sim/brain.js');
require('../js/core/customLibrary.js');

var EVO = global.EVO;
var check = process.argv.indexOf('--check') >= 0;
var ccDir = path.join(__dirname, '..', 'cc');
var manifestPath = path.join(ccDir, 'index.json');

var names = fs
  .readdirSync(ccDir)
  .filter(function (name) {
    return /\.json$/i.test(name) && name.toLowerCase() !== 'index.json' && name.charAt(0) !== '.';
  })
  .sort();

var problems = 0;
names.forEach(function (name) {
  var result = EVO.CustomLibrary.parseFile(fs.readFileSync(path.join(ccDir, name), 'utf8'), name);
  if (!result.ok) {
    problems++;
    result.errors.forEach(function (message) {
      console.warn('  ✗ ' + name + ': ' + message);
    });
  } else {
    result.entry.warnings.forEach(function (message) {
      console.warn('  ! ' + name + ': ' + message);
    });
  }
});

var text = JSON.stringify({ files: names }, null, 2) + '\n';
var current = fs.existsSync(manifestPath) ? fs.readFileSync(manifestPath, 'utf8') : null;

if (check) {
  if (current !== text) {
    console.error('cc/index.json is out of date — run: node tools/scan-cc.js');
    process.exit(1);
  }
  console.log('cc/index.json is up to date (' + names.length + ' file' + (names.length === 1 ? '' : 's') + ').');
} else {
  if (current !== text) fs.writeFileSync(manifestPath, text);
  console.log(
    (current === text ? 'cc/index.json unchanged' : 'Wrote cc/index.json') +
      ': ' + names.length + ' creature file' + (names.length === 1 ? '' : 's') +
      (problems ? ', ' + problems + ' with problems' : '') + '.'
  );
}
