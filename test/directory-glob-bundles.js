var _              = require('lodash');
var fastBrowserify = require('../');
var fs             = require('fs');
var helpers        = require('./helpers');
var mkdirp         = require('mkdirp');
var path           = require('path');
var tape           = require('tape');

function setup(t) {
  return helpers.setup(t, 'directory-glob-bundles', function(srcDir) {
    return fastBrowserify(srcDir, {
      outputDirectory: 'directory-glob-bundles',
      bundles: {
        'packages/*': {
          glob: true,
          entryPoints: function(p) {
            return [p + 'index.js'];
          },
          outputPath: function(p) {
            return p + 'bundle.js';
          }
        },
        'all.js': {
          entryPoints: ['packages/*/index.js']
        }
      }
    });
  });
}

tape.test("handles bundles being built off of directories (i.e. the bundle glob matches directories)", function(t) {
  t.test("builds the correct bundles in the correct output directory", function(t) {
    t.plan(15);

    var testBroc = setup(t);
    testBroc.builder.build().then(function() {
      helpers.bundleExists(t, testBroc.tree, "directory-glob-bundles/packages/package1/bundle.js");
      helpers.bundleExists(t, testBroc.tree, "directory-glob-bundles/packages/package2/bundle.js");
      helpers.bundleExists(t, testBroc.tree, "directory-glob-bundles/packages/package3/bundle.js");
      helpers.bundleExists(t, testBroc.tree, "directory-glob-bundles/all.js");

      helpers.bundleContains(t, testBroc.tree, "directory-glob-bundles/packages/package1/bundle.js", [
          /this is the bundle file in package1/,
          /this is required by package1/
      ]);
      helpers.bundleContains(t, testBroc.tree, "directory-glob-bundles/packages/package2/bundle.js", /this is package2/);
      helpers.bundleContains(t, testBroc.tree, "directory-glob-bundles/packages/package3/bundle.js", /this is package3/);
      helpers.bundleContains(t, testBroc.tree, "directory-glob-bundles/all.js", [
          /this is the bundle file in package1/,
          /this is required by package1/,
          /this is package2/,
          /this is package3/
      ]);

      t.notOk(fs.existsSync(path.join(testBroc.tree.outputPath, 'directory-glob-bundles/packages/package1/index.js')), "non bundle file not in output tree");
      t.notOk(fs.existsSync(path.join(testBroc.tree.outputPath, 'directory-glob-bundles/packages/package2/index.js')), "non bundle file not in output tree");
      t.notOk(fs.existsSync(path.join(testBroc.tree.outputPath, 'directory-glob-bundles/packages/package3/index.js')), "non bundle file not in output tree");
      t.end();
    }).finally(function() {
      helpers.teardown(t, testBroc);
    });
  });

  t.test("detects new bundles to create", function(t) {
    t.plan(2);

    var testBroc = setup(t);

    testBroc.builder.build().then(function() {
      // make a new package directory
      var newPackageDir = path.join(testBroc.srcDir, "packages", "newPackage");
      mkdirp.sync(newPackageDir);
      fs.writeFileSync(path.join(newPackageDir, "index.js"), "console.log(\"new package\");");

      return testBroc.builder.build();
    }).then(function() {
      // check
      helpers.bundleExists(t, testBroc.tree, "directory-glob-bundles/packages/newPackage/bundle.js");
      helpers.bundleContains(t, testBroc.tree, "directory-glob-bundles/packages/newPackage/bundle.js", /new package/);

      t.end();
    }).finally(function() {
      helpers.teardown(t, testBroc);
    });
  });

  t.test("deletes bundles that lose their entry files", function(t) {
    t.plan(2);

    var testBroc = setup(t);

    testBroc.builder.build().then(function() {
      // Verify that the bundle exists before it's only entry point is removed
      helpers.bundleExists(t, testBroc.tree, "directory-glob-bundles/packages/package2/bundle.js");

      // Remove the sole entry point for package2 and rebuild
      var package2Entry = path.join(testBroc.srcDir, "packages", "package2", "index.js");

      fs.unlinkSync(package2Entry);
      return testBroc.builder.build();
    }).then(function() {
      // check
      t.notOk(fs.existsSync(path.join(testBroc.tree.outputPath, 'directory-glob-bundles/packages/package2/bundle.js')), "bundle with no entry points not in output");

      t.end();
    }).finally(function() {
      helpers.teardown(t, testBroc);
    });
  });
});
