var tape                = require('tape');
var path                = require('path');
var fs                  = require('fs');
var broccoli            = require('broccoli');
var walkSync            = require('walk-sync');
var quickTemp           = require('quick-temp');
var copyDereferenceSync = require('copy-dereference').sync;
var _                   = require('lodash');

module.exports.setup = setup;
module.exports.teardown = teardown;
module.exports.setupSrcDir = setupSrcDir;
module.exports.bundleExists = bundleExists;
module.exports.bundleContains = bundleContains;
module.exports.bundleDoesntContain = bundleDoesntContain;

function setup(t, relativePath, brocfunc) {
  var srcDir = setupSrcDir(t, relativePath);
  var tree = brocfunc(srcDir);
  var builder = new broccoli.Builder(tree);

  return {
    srcDir: srcDir,
    tree: tree,
    builder: builder
  };
}

function setupSrcDir(t, relativePath) {
  var srcDir = path.join(__dirname, relativePath);
  var tmpDir = path.join(quickTemp.makeOrRemake(t, "tmpSrcDir"), "copy");
  copyDereferenceSync(srcDir, tmpDir);

  return tmpDir;
}

function teardown(t, testBroc) {
  quickTemp.remove(t, "tmpSrcDir");
}

function bundleExists(t, tree, bundlePath) {
  var destDir = tree.destDir;
  var absluteBundlePath = path.join(destDir, bundlePath);

  t.ok(fs.existsSync(absluteBundlePath), bundlePath + " bundle exists");
}

function bundleContains(t, tree, bundlePath, regexes) {
  if (! _.isArray(regexes)) {
    regexes = [regexes];
  }

  var destDir = tree.destDir;
  var absluteBundlePath = path.join(destDir, bundlePath);
  var bundleString = fs.readFileSync(absluteBundlePath).toString();

  regexes.forEach(function(regex) {
    t.ok(bundleString.match(regex), bundlePath + " contains " + regex.toString());
  });
}

function bundleDoesntContain(t, tree, bundlePath, regexes) {
  if (! _.isArray(regexes)) {
    regexes = [regexes];
  }

  var destDir = tree.destDir;
  var absluteBundlePath = path.join(destDir, bundlePath);
  var bundleExists = fs.existsSync(absluteBundlePath);

  var bundleString = fs.readFileSync(absluteBundlePath).toString();
  regexes.forEach(function(regex) {
    t.notOk(bundleString.match(regex), bundlePath + " doesn't contain " + regex.toString());
  });
}
