const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const script = html.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1];
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(dist, 'manifest.json'), 'utf8'));
assert.equal([manifest.version.major, manifest.version.minor, manifest.version.patch].join('.'), pkg.version);
assert.ok(fs.existsSync(path.join(dist, 'docs', 'SMOKE_TEST.md')));
for (const name of ['logo.png', 'logo_large.png']) {
  const source = fs.readFileSync(path.join(root, 'public', name));
  assert.equal(source.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', name + ' must be a PNG');
  assert.deepEqual(fs.readFileSync(path.join(dist, name)), source, name + ' must be copied into the release');
}
for (const widget of ['index', 'smart_tts', 'config_popup', 'unknown', 'https://example.invalid/script', '']) {
  const assets = [];
  const document = {
    createElement: (tag) => ({ tag }),
    head: { appendChild: (node) => assets.push(node.href) },
    body: { appendChild: (node) => assets.push(node.src) },
  };
  vm.runInNewContext(script, { document, window: { location: { search: '?widgetName=' + encodeURIComponent(widget) } }, URLSearchParams });
  if (['index', 'smart_tts', 'config_popup'].includes(widget)) {
    assert.deepEqual(assets, [widget + '-sandbox.css', widget + '-sandbox.js']);
    for (const file of assets) assert.ok(fs.existsSync(path.join(dist, file)), file);
  } else {
    assert.deepEqual(assets, []);
    assert.match(document.body.textContent, /Unknown or missing/);
  }
}
console.log('Package checks passed: version, documentation, and sandbox JavaScript/styles.');

assert.equal(fs.readFileSync(path.join(dist, 'App.css'), 'utf8'), fs.readFileSync(path.join(root, 'src/style.css'), 'utf8'), 'SDK shared stylesheet must contain current plugin styles');
