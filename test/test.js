var tape     = require('tape');
var broccoli = require('broccoli');
var path     = require('path');
var fs       = require('fs');
var walkSync = require('walk-sync');
var _        = require('lodash');

function bundleExistsAndContains(t, tree, bundlePath, regexes) {
  if (! _.isArray(regexes)) {
    regexes = [regexes];
  }
  var destDir = tree.destDir;
  var absluteBundlePath = path.join(destDir, bundlePath);
  var bundleExists = fs.existsSync(absluteBundlePath);

  t.ok(bundleExists, bundlePath + " bundle exists");
  if (bundleExists) {
    var bundleString = fs.readFileSync(absluteBundlePath).toString();
    regexes.forEach(function(regex) {
      t.ok(bundleString.match(regex), bundlePath + " contains " + regex.toString());
    });
  }
};

tape.test("simple case", function(t) {
  var tree = require(path.join(__dirname, 'simple', 'Brocfile.js'));
  process.chdir(path.join(__dirname, 'simple'));

  var builder = new broccoli.Builder(tree);

  builder.build().then(function(hash) {
    bundleExistsAndContains(t, tree, "index.js", /I am a module/);
    bundleExistsAndContains(t, tree, "bundle.js", [/this is another bundle/,
                                                   /this is a required module/]);
    t.end();
  });
});
