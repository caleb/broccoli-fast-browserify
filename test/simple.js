var _                   = require('lodash');
var fastBrowserify      = require('../');
var fs                  = require('fs');
var helpers             = require('./helpers');
var path                = require('path');
var tape                = require('tape');

function setup(t) {
  return helpers.setup(t, 'simple', function(srcDir) {
    return fastBrowserify(srcDir);
  });
}

tape.test("simple case", function(t) {
  t.test("builds the correct bundles", function(t) {
    t.test(5);
    var testBroc = setup(t);

    testBroc.builder.build().then(function(hash) {
      helpers.bundleExists(t, testBroc.tree, "index.js");
      helpers.bundleExists(t, testBroc.tree, "bundle.js");

      helpers.bundleContains(t, testBroc.tree, "index.js", /I am a module/);
      helpers.bundleContains(t, testBroc.tree, "bundle.js", [/this is another bundle/,
                                                             /this is a required module/]);
      t.end();
    }).finally(function() {
      helpers.teardown(t, testBroc);
    });
  });

  t.test("builds new bundles that are added", function(t) {
    t.plan(2);
    var testBroc = setup(t);

    testBroc.builder.build().then(function() {
      fs.writeFileSync(path.join(testBroc.srcDir, 'new-bundle.js.browserify'), "console.log(\"this is a new bundle\");");
      return testBroc.builder.build();
    }).then(function() {
      helpers.bundleExists(t, testBroc.tree, "new-bundle.js");
      helpers.bundleContains(t, testBroc.tree, "new-bundle.js", /this is a new bundle/);
      t.end();
    }).finally(function() {
      helpers.teardown(t, testBroc);
    });
  });

  t.test("deletes bundles that are deleted", function(t) {
    t.plan(1);
    var testBroc = setup(t);

    testBroc.builder.build().then(function() {
      fs.unlinkSync(path.join(testBroc.srcDir, 'bundle.js.browserify'));
      return testBroc.builder.build();
    }).then(function() {
      t.notOk(fs.existsSync(path.join(testBroc.tree.destDir, 'bundle.js')), "Removed bundle file source file removes corresponding output file");
      t.end();
    }).finally(function() {
      helpers.teardown(t, testBroc);
    });
  });

  t.test("rebuilds bundle if required file is changed", function(t) {
    t.plan(3);

    var testBroc = setup(t);

    testBroc.builder.build().then(function() {
      fs.writeFileSync(path.join(testBroc.srcDir, 'required-module.js'), "console.log(\"changed required file\");");
      return testBroc.builder.build();
    }).then(function() {
      helpers.bundleExists(t, testBroc.tree, "bundle.js");
      helpers.bundleContains(t, testBroc.tree, "bundle.js", /changed required file/);
      helpers.bundleDoesntContain(t, testBroc.tree, "bundle.js", /this is a required module/);
      t.end();
    }).finally(function() {
      helpers.teardown(t, testBroc);
    });
  });

  t.test("rebuilds bundle without required dependency when dependency is removed from bundle", function(t) {
    t.plan(3);

    var testBroc = setup(t);

    testBroc.builder.build().then(function() {
      fs.writeFileSync(path.join(testBroc.srcDir, 'bundle.js.browserify'), "console.log(\"removed require from entry file\");");
      return testBroc.builder.build();
    }).then(function() {
      helpers.bundleExists(t, testBroc.tree, "bundle.js");
      helpers.bundleContains(t, testBroc.tree, "bundle.js", /removed require from entry file/);
      helpers.bundleDoesntContain(t, testBroc.tree, "bundle.js", /this is a required module/);
      t.end();
    }).finally(function() {
      helpers.teardown(t, testBroc);
    });
  });

  t.test("rebuilds bundle when dependency has changed and then entry point has changed", function(t) {
    t.plan(6);

    var testBroc = setup(t);

    testBroc.builder.build().then(function() {
      fs.writeFileSync(path.join(testBroc.srcDir, 'required-module.js'), "console.log(\"changed required file\");");
      return testBroc.builder.build();
    }).then(function() {
      helpers.bundleExists(t, testBroc.tree, "bundle.js");
      helpers.bundleContains(t, testBroc.tree, "bundle.js", /changed required file/);
      helpers.bundleDoesntContain(t, testBroc.tree, "bundle.js", /this is a required module/);
    }).then(function() {
      fs.writeFileSync(path.join(testBroc.srcDir, 'bundle.js.browserify'), "var r = require('./required-module'); console.log(\"changed main bundle file\");");
      return testBroc.builder.build();
    }).then(function() {
      helpers.bundleExists(t, testBroc.tree, "bundle.js");
      helpers.bundleContains(t, testBroc.tree, "bundle.js", /changed main bundle file/);
      helpers.bundleDoesntContain(t, testBroc.tree, "bundle.js", /this is a required module/);
      t.end();
    }).finally(function() {
      helpers.teardown(t, testBroc);
    });
  });

  t.end();
});
