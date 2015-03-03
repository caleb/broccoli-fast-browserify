var _                   = require('lodash');
var fastBrowserify      = require('../');
var fs                  = require('fs');
var helpers             = require('./helpers');
var path                = require('path');
var tape                = require('tape');

var fooToBar           = require('./transformed/transformify');

function setup(t) {
  return helpers.setup(t, 'transformed', function(srcDir) {
    return fastBrowserify(srcDir, {
      bundles: {
        'bundle.js': {
          entryPoints: ['index.js'],
          transform: fooToBar
        }
      }
    });
  });
}

tape.test("transform test", function(t) {
  t.test("builds the correct bundles and runs the specified transforms", function(t) {
    t.test(2);
    var testBroc = setup(t);

    testBroc.builder.build().then(function(hash) {
      helpers.bundleExists(t, testBroc.tree, "bundle.js");

      helpers.bundleContains(t, testBroc.tree, "bundle.js", /Hello, my dear bar/);

      t.end();
    }).finally(function() {
      helpers.teardown(t, testBroc);
    });
  });
});
