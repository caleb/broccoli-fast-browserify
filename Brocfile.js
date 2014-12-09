var path = require('path');
var merge = require('broccoli-merge-trees');
var fastBrowserify = require('./index');

var simpleBundle = fastBrowserify('test/simple', {
  outputDirectory: 'simple'
});
var simpleWithCustomization = fastBrowserify('test/simple-with-customization', {
  bundleExtension: '.bundle',
  outputExtension: 'my-custom-extension',
  outputDirectory: 'simple-with-customization'
});
var nonGlob = fastBrowserify('test/non-glob', {
  bundles: {
    'non-glob/bundle.js': {
      entryPoints: ['index.js']
    }
  }
});
var multipleEntries = fastBrowserify('test/multiple-entries', {
  outputDirectory: 'multiple-entries',
  bundles: {
    'bundle.js': {
      entryPoints: ['**/*.js']
    }
  }
});
var fancyMultipleEntries = fastBrowserify('test/fancy-multiple-entries', {
  outputDirectory: 'fancy-multiple-entries',
  bundles: {
    'bundle.js': {
      entryPoints: function(relativePath) {
        var entryPoints = [relativePath];
        var dir = path.dirname(relativePath);
        entryPoints.push(path.join(dir, '**/bootstrap.js'));

        return entryPoints;
      }
    }
  }
});
var directoryGlobBundles = fastBrowserify('test/directory-glob-bundles', {
  outputDirectory: 'directory-glob-bundles',
  bundles: {
    'packages/*': {
      glob: true,
      entryPoints: function(p) {
        return [p + 'index.js']
      },
      outputPath: function(p) {
        return p + 'bundle.js';
      }
    }
  }
});

module.exports = simpleWithCustomization;
return;

module.exports = merge([simpleBundle,
                        simpleWithCustomization,
                        nonGlob,
                        multipleEntries,
                        fancyMultipleEntries,
                        directoryGlobBundles]);
