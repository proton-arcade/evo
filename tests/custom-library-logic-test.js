/* The logic behind the Custom Creatures screen (js/core/customLibrary.js):
 * reading a creature file, rejecting designs the builder would quietly change,
 * dropping brains that do not fit, grouping rows, and copying to My Creatures
 * without duplicating or overwriting anything.
 * Run with: node tests/custom-library-logic-test.js
 */
'use strict';

var assert = require('assert');
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
var Lib = EVO.CustomLibrary;

var source = fs.readFileSync(path.join(__dirname, '..', 'cc', 'g8t7r.json'), 'utf8');
function fresh() {
  return JSON.parse(source);
}
function parse(json, filename) {
  return Lib.parseFile(JSON.stringify(json), filename || 'file.json');
}

/* --- a good file ------------------------------------------------------ */
var good = parse(fresh(), 'g8t7r.json');
assert.ok(good.ok, 'the shipped file parses');
var entry = good.entry;
assert.strictEqual(entry.name, 'g8t7r');
assert.strictEqual(Lib.countsText(entry), '11 joints · 13 bones · 16 muscles');
assert.strictEqual(entry.brainList.length, 5);
assert.strictEqual(entry.warnings.length, 0);
assert.strictEqual(
  Lib.brainSummary(entry).split(' · ').slice(0, 2).join(' · '),
  'Running Gen 294 · Jumping Gen 252',
  'brains are listed in action order'
);
assert.strictEqual(Lib.brainChipText(entry.brainList[0]), 'Running · Gen 294 · 0.1532');

/* --- the name falls back to the file name ------------------------------ */
var unnamed = fresh();
delete unnamed.name;
assert.strictEqual(parse(unnamed, 'mystery.json').entry.name, 'mystery');
unnamed.name = '   ';
assert.strictEqual(parse(unnamed, 'blank.json').entry.name, 'blank');

/* --- a design-only file needs nothing else ----------------------------- */
var plain = fresh();
delete plain.brains;
var plainResult = parse(plain, 'plain.json');
assert.ok(plainResult.ok && plainResult.entry.brainList.length === 0);
assert.ok(/No evolved brains/.test(Lib.brainSummary(plainResult.entry)));

/* --- files that must be rejected --------------------------------------- */
function rejected(mutate, pattern, label) {
  var json = fresh();
  mutate(json);
  var result = parse(json);
  assert.strictEqual(result.ok, false, label + ' is rejected');
  assert.ok(
    result.errors.some(function (message) {
      return pattern.test(message);
    }),
    label + ': ' + result.errors.join(' | ')
  );
}
rejected(function (json) { json.bones[0].startJointID = 999; }, /bone.*joint that does not exist/, 'a dangling bone');
rejected(function (json) { json.muscles[0].endBoneID = 999; }, /muscle.*bone that does not exist/, 'a dangling muscle');
rejected(function (json) { json.joints[1].id = json.joints[0].id; }, /share an id/, 'duplicate joint ids');
rejected(function (json) { json.joints = []; json.bones = []; json.muscles = []; }, /no joints/, 'an empty design');
rejected(function (json) { json.joints = 'nope'; }, /could not be read/, 'a malformed design');
assert.strictEqual(Lib.parseFile('{not json', 'x.json').ok, false, 'invalid JSON is rejected');
assert.strictEqual(Lib.parseFile('[]', 'x.json').ok, false, 'an array is rejected');
assert.strictEqual(Lib.parseFile('null', 'x.json').ok, false, 'null is rejected');

/* --- brains that do not fit are dropped with a warning ----------------- */
var short = fresh();
short.brains.running.chromosome = [1, 2, 3];
var shortResult = parse(short);
assert.ok(shortResult.ok, 'the creature is kept');
assert.ok(!shortResult.entry.brains.running, 'the misfit brain is dropped');
assert.strictEqual(shortResult.entry.brainList.length, 4);
assert.ok(/Running brain was left out.*needs 280/.test(shortResult.entry.warnings[0]), shortResult.entry.warnings[0]);

var nan = fresh();
nan.brains.jumping.chromosome[0] = null;
var nanResult = parse(nan);
assert.ok(nanResult.ok && !nanResult.entry.brains.jumping, 'non-numeric weights are dropped');

/* --- rows -------------------------------------------------------------- */
var twin = fresh();
twin.name = 'Twin';
delete twin.brains.climbing;
delete twin.brains.flying;
var bare = fresh();
bare.name = 'Bare';
delete bare.brains;
var entries = [entry, parse(twin, 'twin.json').entry, parse(bare, 'bare.json').entry];
var rows = Lib.buildRows(entries);
assert.deepStrictEqual(
  rows.map(function (row) { return row.title + ':' + row.entries.length; }),
  [
    'All creatures:3',
    'Has a Running brain:2',
    'Has a Jumping brain:2',
    'Has a Obstacle Jump brain:2',
    'Has a Climbing brain:1',
    'Has a Flying brain:1',
  ]
);
assert.deepStrictEqual(Lib.buildRows([]), [], 'no creatures, no rows');
assert.deepStrictEqual(
  Lib.buildRows([entries[2]]).map(function (row) { return row.id; }),
  ['all'],
  'actions nobody has get no row'
);

/* --- copy to My Creatures ---------------------------------------------- */
EVO.Store.deleteAll();
var designs = [];
var storage = {
  getDesigns: function () {
    return designs.map(function (saved) {
      return { id: saved.id, name: saved.name, design: EVO.CreatureDesign.decode(EVO.CreatureDesign.encode(saved.design)), evolvedBrains: saved.evolvedBrains };
    });
  },
  getEvolvedBrain: function (saved, objective) {
    return (saved.evolvedBrains || {})[EVO.BrainProfile.keyForObjective(objective)] || null;
  },
  saveDesign: function (design, existingId, brains) {
    var saved = designs.filter(function (d) { return d.id === existingId; })[0];
    if (!saved) {
      saved = { id: 'id' + (designs.length + 1), evolvedBrains: {} };
      designs.unshift(saved);
    }
    saved.name = design.name;
    saved.design = design;
    saved.evolvedBrains = Object.assign({}, saved.evolvedBrains, brains);
    return saved.id;
  },
};

var first = Lib.copyToMyCreatures(entries[0], storage);
assert.ok(first.created && first.added.length === 5);
assert.strictEqual(designs.length, 1);
assert.strictEqual(designs[0].name, 'g8t7r');

var again = Lib.copyToMyCreatures(entries[0], storage);
assert.ok(!again.created && again.added.length === 0 && again.id === first.id, 'copying twice changes nothing');
assert.strictEqual(designs.length, 1, 'no "g8t7r (2)"');

/* A brain the player trained further is never replaced by the file's. */
designs[0].evolvedBrains.running = { generation: 999, chromosome: [9] };
delete designs[0].evolvedBrains.flying;
var topUp = Lib.copyToMyCreatures(entries[0], storage);
assert.deepStrictEqual(topUp.added, ['flying'], 'only the missing action is added');
assert.strictEqual(designs[0].evolvedBrains.running.generation, 999, 'the trained brain is kept');
assert.strictEqual(designs.length, 1);

/* Same name, different design: a different creature, added next to it. */
var edited = fresh();
edited.joints[0].x += 1;
var editedEntry = parse(edited, 'g8t7r.json').entry;
var different = Lib.copyToMyCreatures(editedEntry, storage);
assert.ok(different.created && designs.length === 2, 'an edited design is not merged into the original');

/* --- the manifest ------------------------------------------------------ */
var manifest = Lib.parseManifest({
  files: ['a.json', 'a.json', 'index.json', '../secret.json', 'sub/b.json', '.hidden.json', 'c.txt', 7, 'ok two.json'],
});
assert.deepStrictEqual(manifest.files, ['a.json', 'ok two.json']);
assert.strictEqual(manifest.rejected.length, 6);
assert.deepStrictEqual(Lib.parseManifest(['x.json']).files, ['x.json'], 'a bare array works too');
assert.throws(function () { Lib.parseManifest({ nope: 1 }); });

console.log('Custom library logic checks passed (' + rows.length + ' rows, ' + designs.length + ' copies).');
