var _                   = require('lodash');
var fastBrowserify      = require('../');
var fs                  = require('fs');
var helpers             = require('./helpers');
var path                = require('path');
var tape                = require('tape');

function setup(t) {
  return helpers.setup(t, 'simple-with-customization', function(srcDir) {
    return fastBrowserify(srcDir, {
      bundleExtension: '.bundle',
      outputExtension: 'my-custom-extension',
      outputDirectory: 'simple-with-customization'
    });
  });
}

tape.test("customized extensions and output directory", function(t) {
  t.test("builds the correct bundles in the correct output directory", function(t) {
    t.plan(5);

    var testBroc = setup(t);
    testBroc.builder.build().then(function() {
      helpers.bundleExists(t, testBroc.tree, "simple-with-customization/bundle.my-custom-extension");
      helpers.bundleExists(t, testBroc.tree, "simple-with-customization/index.js.my-custom-extension");
      helpers.bundleContains(t, testBroc.tree, "simple-with-customization/bundle.my-custom-extension", [
          /this is another bundle/,
          /this is a required module/
      ]);
      helpers.bundleContains(t, testBroc.tree, "simple-with-customization/index.js.my-custom-extension", /I am a module/);
      t.end();
    }).finally(function() {
      helpers.teardown(t, testBroc);
    });
  });
});
