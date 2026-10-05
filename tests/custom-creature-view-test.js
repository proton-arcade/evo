/* Drawing a design without an editor (js/render/viewModel.js) and keeping
 * cc/index.json in step with the files in cc/.
 * Run with: node tests/custom-creature-view-test.js
 */
'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

require('../js/core/util.js');
require('../js/core/network.js');
require('../js/core/algorithms.js');
require('../js/core/data.js');
require('../js/sim/physics.js');
require('../js/sim/scene.js');
require('../js/sim/creature.js');
require('../js/render/renderer.js');
require('../js/render/viewModel.js');

var EVO = global.EVO;
var VM = EVO.ViewModel;
var design = EVO.CreatureDesign.decode(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'cc', 'g8t7r.json'), 'utf8')));

/* --- the shared render model matches what the editor drew -------------- */
var model = VM.buildRenderModel(design);
assert.strictEqual(model.joints.length, 11);
assert.strictEqual(model.bones.length, 13);
assert.strictEqual(model.muscles.length, 16);
assert.ok(model.bones.every(function (bone) { return bone.startJoint && bone.endJoint; }));

/* --- a dangling reference is skipped, not thrown ----------------------- */
var broken = EVO.CreatureDesign.clone(design);
broken.bones[0].startJointID = 999;
var fakeCtx = new Proxy({}, {
  get: function (target, name) {
    if (name === 'createRadialGradient') return function () { return { addColorStop: function () {} }; };
    return function () {};
  },
  set: function () { return true; },
});
var camera = new EVO.Camera();
camera.resize(120, 180);
VM.fitCamera(broken, camera);
var safe = VM.buildSafeRenderModel(broken);
assert.strictEqual(safe.bones.length, 12, 'the bone with a missing joint is left out');
assert.ok(safe.muscles.length < 16, 'muscles on the missing bone are left out');
assert.doesNotThrow(function () {
  EVO.Renderer.drawCreature(fakeCtx, safe, camera, { showMuscles: true });
}, 'the safe model draws');

var dangling = EVO.CreatureDesign.clone(design);
dangling.muscles[0].endBoneID = 999;
assert.throws(function () {
  EVO.Renderer.drawCreature(fakeCtx, VM.buildRenderModel(dangling), camera, { showMuscles: true });
}, 'a muscle with a missing bone crashes the unchecked model, which is why posters use the safe one');
assert.doesNotThrow(function () {
  EVO.Renderer.drawCreature(fakeCtx, VM.buildSafeRenderModel(dangling), camera, { showMuscles: true });
});
assert.strictEqual(VM.buildSafeRenderModel(dangling).muscles.length, 15);

/* --- fitting ------------------------------------------------------------ */
function fits(width, height, region) {
  var cam = new EVO.Camera();
  cam.resize(width, height);
  VM.fitCamera(design, cam, region);
  var bounds = VM.designBounds(design);
  var corners = [
    [bounds.minX, bounds.minY],
    [bounds.maxX, bounds.maxY],
  ].map(function (c) {
    return { x: cam.worldToScreenX(c[0]), y: cam.worldToScreenY(c[1]) };
  });
  var r = region || { left: 0.1, top: 0.1, right: 0.9, bottom: 0.9 };
  var eps = 0.5;
  corners.forEach(function (p) {
    assert.ok(p.x >= r.left * width - eps && p.x <= r.right * width + eps, 'x inside region: ' + p.x);
    assert.ok(p.y >= r.top * height - eps && p.y <= r.bottom * height + eps, 'y inside region: ' + p.y);
  });
}
fits(120, 180); // a poster
fits(900, 560, { left: 0.12, top: 0.1, right: 0.88, bottom: 0.5 }); // a wide hero
fits(375, 420, { left: 0.12, top: 0.15, right: 0.88, bottom: 0.4 }); // a phone hero

var empty = new EVO.Camera();
empty.resize(100, 100);
assert.doesNotThrow(function () { VM.fitCamera(EVO.CreatureDesign.empty(), empty); }, 'an empty design still frames');

/* The editor's own framing is unchanged by the extraction. */
var editorCamera = new EVO.Camera();
VM.frameDesign(design, editorCamera);
var bounds = VM.designBounds(design);
var width = Math.max(6, bounds.maxX - bounds.minX);
var height = Math.max(6, bounds.maxY - bounds.minY);
assert.strictEqual(editorCamera.x, (bounds.minX + bounds.maxX) / 2);
assert.strictEqual(editorCamera.y, (bounds.minY + bounds.maxY) / 2);
assert.strictEqual(
  editorCamera.orthographicSize,
  Math.min(40, Math.max(3, Math.max(width * 0.75, height * 0.9)))
);
var blank = new EVO.Camera();
VM.frameDesign(EVO.CreatureDesign.empty(), blank);
assert.deepStrictEqual([blank.x, blank.y, blank.orthographicSize], [0, 3, 10], 'an empty design uses the editor default');

/* --- the manifest is up to date ---------------------------------------- */
var ccDir = path.join(__dirname, '..', 'cc');
var names = fs
  .readdirSync(ccDir)
  .filter(function (name) { return /\.json$/i.test(name) && name !== 'index.json'; })
  .sort();
var manifest = JSON.parse(fs.readFileSync(path.join(ccDir, 'index.json'), 'utf8'));
assert.deepStrictEqual(manifest.files, names, 'cc/index.json lists every creature file — run: node tools/scan-cc.js');

console.log('Custom creature view checks passed.');
