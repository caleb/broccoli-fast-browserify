var tape                = require('tape');
var path                = require('path');
var fs                  = require('fs');
var _                   = require('lodash');
var helpers             = require('./helpers');
var fastBrowserify      = require('../');

function setup(t) {
  return helpers.setup(t, 'non-glob', function(srcDir) {
    return fastBrowserify(srcDir, {
      bundles: {
        'non-glob/bundle.js': {
          entryPoints: ['index.js']
        }
      }
    });
  });
}

tape.test("non-glob browserify configuration", function(t) {
  t.test("builds the correct bundles in the correct output directory", function(t) {
    t.plan(6);

    var testBroc = setup(t);
    testBroc.builder.build().then(function() {
      helpers.bundleExists(t, testBroc.tree, "non-glob/bundle.js");
      helpers.bundleContains(t, testBroc.tree, "non-glob/bundle.js", [
          /this is a non-glob bundle declaration/,
          /this is a required, non-entry point, module/
      ]);
      helpers.bundleDoesntContain(t, testBroc.tree, "non-glob/bundle.js", /this module isn\\'t required, you shouldn\\'t see this/);
      t.notOk(fs.existsSync(path.join(testBroc.tree.destDir, 'non-glob/non-entry-point.js')), "non-entry point files not in output tree");
      t.notOk(fs.existsSync(path.join(testBroc.tree.destDir, 'non-glob/non-required.js')), "non-required file not in output tree");
      t.end();
    }).finally(function() {
      helpers.teardown(t, testBroc);
    });
  });
});
