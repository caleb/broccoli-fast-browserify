var _ = require('lodash');
var fs = require('fs');
var path = require('path');
var RSVP = require('rsvp');
var quickTemp = require('quick-temp');
var mkdirp = require('mkdirp');
var browserify = require('browserify');
var walkSync  = require('walk-sync');
var hashTree = require('broccoli-kitchen-sink-helpers').hashTree;

function FastBrowserify(inputTree, options) {
  if (!(this instanceof FastBrowserify)) { return new FastBrowserify(inputTree, options); }

  this.options = _.extend(this.getDefaultOptions(), options);
  this.destDir = quickTemp.makeOrRemake(this, 'tmpDestDir');

  this.inputTree = inputTree;

  this.bundles = {};
  this.cache = {};
  this.watchFiles = {};
  this.packageCache = {};
}

FastBrowserify.prototype.getDefaultOptions = function() {
  return {
    browserify: {},
    bundleExtension: '.js.browserify',
    outputExtension: '.js'
  };
};

FastBrowserify.prototype.cleanup = function() {
  quickTemp.remove(this, 'tmpDestDir');
};

FastBrowserify.prototype.read = function(readTree) {
  var self = this;
  var promises = [];

  return readTree(this.inputTree).then(function(srcDir) {
    var paths = walkSync(srcDir);
    var extensionRegex = new RegExp(self.options.bundleExtension.replace(/\./, '\\.') + '$');
    var bundleFiles = paths.filter(function(relativePath) { return relativePath.match(extensionRegex); });

    // remove output files that don't have a corrisponding input file anymore
    self.cleanupBundles();
    var invalidatedBundles = self.invalidateCache();

    bundleFiles.forEach(function(relativePath) {
      var dir = path.dirname(relativePath);
      var bundle = self.bundles[relativePath];

      if (! bundle) {
        var outputBasename = relativePath.replace(extensionRegex, self.options.outputExtension);
        var outputAbsolutePath = path.resolve(srcDir, relativePath);

        bundle = {
          browserify: null,
          inputFileName: path.join(srcDir, relativePath),
          outputBasename: outputBasename,
          outputFileName: path.join(self.destDir, outputBasename),
          browserifyOptions: {},
          dependentFileNames: {}
        };

        bundle.browserifyOptions = _.extend(bundle.browserifyOptions, {
          basedir: srcDir,
          cache: self.cache,
          packageCache: self.packageCache,
          fullPaths: true,
          extensions: ['.js', self.options.bundleExtension],
          entries: [outputAbsolutePath]
        });

        bundle.browserify = browserify(bundle.browserifyOptions);

        bundle.browserify.on('dep', function(dep) {
          if (typeof dep.id == 'string') {
            bundle.browserifyOptions.cache[dep.id] = dep;
          }
          if (typeof dep.file == 'string') {
            var file = dep.file;
            if (file[0] == '.') {
              file = path.resolve(dep.basedir, file);
            }
            self.watchFiles[file] = hashTree(file);
            bundle.dependentFileNames[file] = file;
          }
        });

        bundle.browserify.on('file', function(file) {
          self.watchFiles[file] = hashTree(file);
          bundle.dependentFileNames[file] = file;
        });

        bundle.browserify.on('package', function(pkg) {
          var packageFile = path.join(pkg.__dirname, 'package.json');
          self.watchFiles[packageFile] = hashTree(packageFile);
          bundle.dependentFileNames[packageFile] = packageFile;
        });

        self.bundles[relativePath] = bundle;
      } else {
        // if this browserify bundle hasn't been invalidated
        // skip this file
        if (! _.include(invalidatedBundles, bundle)) {
          return;
        }
      }

      // Create the target directory in the destination
      mkdirp.sync(path.join(self.destDir, dir));

      promise = self.bundle(bundle);
      promises.push(promise);
    });

    return RSVP.all(promises).then(function(outputFiles) {
      return self.destDir;
    });
  });
};

FastBrowserify.prototype.invalidateCache = function() {
  var outputFileMTimes = {};
  var bundle;
  var bundleKey;
  var file;
  var i;
  var time;
  var fileMTime;

  for (bundleKey in this.bundles) {
    bundle = this.bundles[bundleKey];
    if (fs.existsSync(bundle.outputFileName)) {
      time = fs.statSync(bundle.outputFileName).mtime.getTime();
      outputFileMTimes[bundleKey] = time;
    }
  }

  var invalidatedBundles = [];
  var invalidatedFiles = [];

  // Look for watched files that have changed, and mark them for deletion
  for (file in this.watchFiles) {
    if (hashTree(file) !== this.watchFiles[file]) {
      // look through the bundles to see if any of them depend on this file and are older than this file
      for (bundleKey in this.bundles) {
        bundle = this.bundles[bundleKey];

        // look through this bundle's dependencies and test if they are newer than the output file
        if (bundle.dependentFileNames[file] && ! _.include(invalidatedBundles, bundle)) {
          invalidatedBundles.push(bundle);
        }
      }

      invalidatedFiles.push(file);
    }
  }

  // remove the invalidated files from the cache
  invalidatedFiles.forEach(function(file) {
    delete this.cache[file];
    delete this.watchFiles[file];
  }.bind(this));

  return invalidatedBundles;
};

FastBrowserify.prototype.cleanupBundles = function() {
  // remove stale output files
  var bundlesToDelete = [];
  for (var key in this.bundles) {
    var bundle = this.bundles[key];

    if (! fs.existsSync(bundle.inputFileName)) {
      if (fs.existsSync(bundle.outputFileName)) {
        fs.unlinkSync(bundle.outputFileName);
      }
      bundlesToDelete.push(key);
    }
  }

  bundlesToDelete.forEach(function(key) {
    delete this.bundles[key];
  }.bind(this));
};

FastBrowserify.prototype.bundle = function(bundle) {
  return new RSVP.Promise(function(resolve, reject) {
    // clear the dependent file name list
    // we want to have a fresh dependency list every time we build
    // this way, the bundle can be skipped if non of its dependencies change
    bundle.dependentFileNames = {};

    bundle.browserify.bundle(function(err, data) {
      if (err) {
        reject(err);
      } else {
        fs.writeFileSync(bundle.outputFileName, data);
        resolve(bundle.outputFileName);
      }
    });
  });
};

module.exports = FastBrowserify;
