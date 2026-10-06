/* Checks the generated one-file edition for completeness and feature removal.
 * Run with: node tests/standalone-bundle-test.js
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const htmlPath = path.join(root, 'standalone', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

execFileSync(process.execPath, [path.join(root, 'tools', 'build-standalone.js'), '--check'], {
  cwd: root,
  stdio: 'pipe',
});

assert.doesNotMatch(html, /<script\b[^>]*\bsrc\s*=/i, 'JavaScript must be inlined');
assert.doesNotMatch(html, /<link\b[^>]*\brel\s*=\s*["']stylesheet/i, 'CSS must be inlined');
assert.doesNotMatch(
  html,
  /Custom Creatures|cc\/|customLibrary\.js|ui\/custom\.js|screen-custom/i,
  'the catalogue feature must not be present in the standalone page'
);
assert.match(html, /href="data:image\/svg\+xml;base64,[^"]+"/, 'favicon should be embedded');
assert.match(html, /<style>/, 'application styles should be inlined');
assert.match(html, /buildRenderModel: buildRenderModel/, 'the editor render model should remain available');
assert.match(html, /frameDesign: frameDesign/, 'editor framing should remain available');
assert.doesNotMatch(html, /drawPoster: drawPoster|buildSafeRenderModel: buildSafeRenderModel/, 'catalogue-only poster helpers should be removed');

const helpTopics = [
  'Your first five minutes',
  'Designing a creature',
  'Choosing a task and evolving',
  'Controls and shortcuts',
  'Saving creatures, brains and runs',
  'Ecosystem and Gallery',
  'Wing reflex and Shock',
  'Troubleshooting',
  'How the brain works',
];
for (const topic of helpTopics) {
  assert.ok(html.includes("title: '" + topic + "'"), 'Help topic should be retained: ' + topic);
}
assert.match(html, /Help centre/, 'the in-app Help centre should be retained');
assert.match(html, /Search help/, 'Help search should be retained');

const scripts = Array.from(html.matchAll(/<script>([\s\S]*?)<\/script>/g));
assert.strictEqual(scripts.length, 22, 'expected all 22 non-catalogue runtime scripts inline');
for (let index = 0; index < scripts.length; index += 1) {
  new vm.Script(scripts[index][1], { filename: 'standalone-inline-' + (index + 1) + '.js' });
}

console.log('standalone bundle: all checks passed');
