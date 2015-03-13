var _                   = require('lodash');
var fastBrowserify      = require('../');
var fs                  = require('fs');
var helpers             = require('./helpers');
var path                = require('path');
var tape                = require('tape');

var fooToBar            = require('./transformed/transformify');
var babelify            = require('babelify');

function setup(t) {
  return helpers.setup(t, 'transformed', function(srcDir) {
    return fastBrowserify(srcDir, {
      bundles: {
        'simple/bundle.js': {
          entryPoints: ['simple/index.js'],
          transform: fooToBar
        }
      }
    });
  });
}

function setupBabelify(t) {
  return helpers.setup(t, 'transformed', function(srcDir) {
    return fastBrowserify(srcDir, {
      browserify: {
        extensions: [".babel"]
      },
      bundles: {
        'babelify/bundle.js': {
          entryPoints: ['babelify/es2015-modules.babel'],
          transform: {
            tr: babelify,
            options: {
              extensions: [".babel"]
            }
          }
        }
      }
    });
  });
}

tape.test("transform test", function(t) {
  t.test("builds the correct bundles and runs the specified transforms", function(t) {
    t.plan(2);
    var testBroc = setup(t);

    testBroc.builder.build().then(function(hash) {
      helpers.bundleExists(t, testBroc.tree, "simple/bundle.js");

      helpers.bundleContains(t, testBroc.tree, "simple/bundle.js", /Hello, my dear bar/);

      t.end();
    }).finally(function() {
      helpers.teardown(t, testBroc);
    });
  });

  t.test("builds es2015 modules with babelify", function(t) {
    t.plan(2);
    var testBroc = setupBabelify(t);

    testBroc.builder.build().then(function(hash) {
      helpers.bundleExists(t, testBroc.tree, "babelify/bundle.js");

      helpers.bundleContains(t, testBroc.tree, "babelify/bundle.js", /I am an es2015 module/);

      t.end();
    }).finally(function() {
      helpers.teardown(t, testBroc);
    });
  });
});
