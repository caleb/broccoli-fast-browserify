var tape                = require('tape');
var broccoli            = require('broccoli');
var path                = require('path');
var fs                  = require('fs');
var walkSync            = require('walk-sync');
var quickTemp           = require('quick-temp')
var copyDereferenceSync = require('copy-dereference').sync;
var _                   = require('lodash');

function setup(t, srcDir) {
  var srcDir = path.join(__dirname, srcDir);
  var tmpDir = path.join(quickTemp.makeOrRemake(t, "tmpSrcDir"), "src");
  copyDereferenceSync(srcDir, tmpDir);
  process.chdir(tmpDir);

  var tree = require(path.join(tmpDir, 'Brocfile.js'));
  var builder = new broccoli.Builder(tree);

  return {
    srcDir: tmpDir,
    tree: tree,
    builder: builder
  };
}

function teardown(t, testBroc) {
  quickTemp.remove(t, "tmpSrcDir");
}

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

tape.test("simple case", function(t) {
  t.test("builds the correct bundles", function(t) {
    var testBroc = setup(t, 'simple');

    testBroc.builder.build().then(function(hash) {
      bundleExistsAndContains(t, testBroc.tree, "index.js", /I am a module/);
      bundleExistsAndContains(t, testBroc.tree, "bundle.js", [/this is another bundle/,
                                                              /this is a required module/]);
      t.end();
    }).finally(function() {
      teardown(t, testBroc);
    });
  });

  t.test("builds new bundles that are added", function(t) {
    var testBroc = setup(t, 'simple');

    testBroc.builder.build().then(function() {
      fs.writeFileSync(path.join(testBroc.srcDir, 'lib/new-bundle.js.browserify'), "console.log(\"this is a new bundle\");");
      return testBroc.builder.build();
    }).then(function() {
      bundleExistsAndContains(t, testBroc.tree, "new-bundle.js", /this is a new bundle/);
      t.end();
    }).finally(function() {
      teardown(t, testBroc);
    });
  });

  t.test("deletes bundles that are deleted", function(t) {
    var testBroc = setup(t, 'simple');

    testBroc.builder.build().then(function() {
      fs.unlinkSync(path.join(testBroc.srcDir, 'lib/bundle.js.browserify'))
      return testBroc.builder.build();
    }).then(function() {
      t.notOk(fs.existsSync(path.join(testBroc.tree.destDir, 'bundle.js')), "Removed bundle file source file removes corresponding output file");
      t.end();
    }).finally(function() {
      teardown(t, testBroc);
    });
  });

  t.test("rebuilds bundle if required file is changed", function(t) {
    var testBroc = setup(t, 'simple');

    testBroc.builder.build().then(function() {
      fs.writeFileSync(path.join(testBroc.srcDir, 'lib/required-module.js'), "console.log(\"changed required file\");");
      return testBroc.builder.build();
    }).then(function() {
      bundleExistsAndContains(t, testBroc.tree, "bundle.js", /changed required file/);
      bundleDoesntContain(t, testBroc.tree, "bundle.js", /this is a required module/);
      t.end();
    }).finally(function() {
      teardown(t, testBroc);
    });
  });

  t.test("rebuilds bundle without required dependency when dependency is removed from bundle", function(t) {
    var testBroc = setup(t, 'simple');

    testBroc.builder.build().then(function() {
      fs.writeFileSync(path.join(testBroc.srcDir, 'lib/bundle.js.browserify'), "console.log(\"removed require from entry file\");");
      return testBroc.builder.build();
    }).then(function() {
      bundleExistsAndContains(t, testBroc.tree, "bundle.js", /removed require from entry file/);
      bundleDoesntContain(t, testBroc.tree, "bundle.js", /this is a required module/);
      t.end();
    }).finally(function() {
      teardown(t, testBroc);
    });
  });

  t.end();
});
