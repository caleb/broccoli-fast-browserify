var _              = require('lodash');
var fastBrowserify = require('../');
var fs             = require('fs');
var helpers        = require('./helpers');
var mkdirp         = require('mkdirp');
var path           = require('path');
var tape           = require('tape');

function setup(t) {
  return helpers.setup(t, 'externals', function(srcDir) {
    return fastBrowserify(srcDir, {
      externals: ['globallyExternal'],
      outputDirectory: 'externals',
      bundles: {
        'bundle.js': {
          externals: ['bundleExternalNonExistantModule', './included'],
          entryPoints: ['index.js']
        },
        'all.js': {
          externals: ['bundleExternalNonExistantModule'],
          entryPoints: ['index.js']
        }
      }
    });
  });
}

tape.test("handles modules declared as external in the global configuration and bundle configuration", function(t) {
  t.test("builds the correct bundles in the correct output directory", function(t) {
    t.plan(6);

    var testBroc = setup(t);
    testBroc.builder.build().then(function() {
      helpers.bundleExists(t, testBroc.tree, "externals/bundle.js");
      helpers.bundleContains(t, testBroc.tree, "externals/bundle.js", [
          /this bundle should not include the globally or bundle excluded modules/
      ]);
      helpers.bundleDoesntContain(t, testBroc.tree, "externals/bundle.js", [
          /marked external in one bundle/
      ]);

      helpers.bundleExists(t, testBroc.tree, "externals/all.js");
      helpers.bundleContains(t, testBroc.tree, "externals/all.js", [
          /this bundle should not include the globally or bundle excluded modules/,
          /marked external in one bundle/
      ]);

      t.end();
    }).finally(function() {
      helpers.teardown(t, testBroc);
    });
  });
});
