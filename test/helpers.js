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

/**
 * Sets up a test environment with copies of the required test's files in a tmp
 * directory.
 *
 * t: The Tape context variable
 * relativePath: The path relative to the test directory that contains the files
 *               for this test. These files are copied into a tmp directory
 * brocfunc: This function is called with the newly created tmp directory (with
 *           the files from `relativePath` copied) and you should return a
 *           Broccoli tree built with the broccoli module you want to test
 *
 * Returns
 *
 * A hash { srcDir, tree, builder }, where srcDir is the tmp directory created
 * by this function, tree is the tree built by the `brocfunc`, and builder is
 * the broccoli builder created by this function.
 *
 */
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
  var outputPath = tree.outputPath;
  var absluteBundlePath = path.join(outputPath, bundlePath);

  t.ok(fs.existsSync(absluteBundlePath), bundlePath + " bundle exists");
}

function bundleContains(t, tree, bundlePath, regexes) {
  if (! _.isArray(regexes)) {
    regexes = [regexes];
  }

  var outputPath = tree.outputPath;
  var absluteBundlePath = path.join(outputPath, bundlePath);
  var bundleString = fs.readFileSync(absluteBundlePath).toString();

  regexes.forEach(function(regex) {
    t.ok(bundleString.match(regex), bundlePath + " contains " + regex.toString());
  });
}

function bundleDoesntContain(t, tree, bundlePath, regexes) {
  if (! _.isArray(regexes)) {
    regexes = [regexes];
  }

  var outputPath = tree.outputPath;
  var absluteBundlePath = path.join(outputPath, bundlePath);
  var bundleExists = fs.existsSync(absluteBundlePath);

  var bundleString = fs.readFileSync(absluteBundlePath).toString();
  regexes.forEach(function(regex) {
    t.notOk(bundleString.match(regex), bundlePath + " doesn't contain " + regex.toString());
  });
}
