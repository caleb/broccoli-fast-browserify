var _          = require('lodash');
var fs         = require('fs');
var path       = require('path');
var RSVP       = require('rsvp');
var quickTemp  = require('quick-temp');
var mkdirp     = require('mkdirp');
var browserify = require('browserify');
var walkSync   = require('walk-sync');
var glob       = require('glob');
var hashTree   = require('broccoli-kitchen-sink-helpers').hashTree;

function FastBrowserify(inputTree, options) {
  if (!(this instanceof FastBrowserify)) { return new FastBrowserify(inputTree, options); }

  this.options = this.getOptions(options);
  this.destDir = quickTemp.makeOrRemake(this, 'tmpDestDir');

  this.inputTree = inputTree;

  this.bundles = {};
  this.cache = {};
  this.watchFiles = {};
  this.packageCache = {};
}

FastBrowserify.prototype.getOptions = function(options) {
  var bundleExtension = options.bundleExtension || '.browserify';
  var outputExtension = options.outputExtension || '.js';
  var self = this;

  if (bundleExtension[0] != '.') { bundleExtension = '.' + bundleExtension; }
  if (outputExtension[0] != '.') { outputExtension = '.' + outputExtension; }

  var defaultBundleConfig = {};
  defaultBundleConfig['**/*' + bundleExtension] = {
    glob: true,

    entryPoints: function(relativePath) {
      return [relativePath];
    },

    outputPath: function(relativePath) {
      // remove the bundle extension from the filename
      var regex = new RegExp(this.options.bundleExtension.replace(/\./, '\\.') + '$');
      var out = relativePath.replace(regex, '');

      // If the file already has the output file extension (e.g. bundle.js.browserify)
      // Then don't do anything, else add the output extension to the filename
      var outExtensionRegex = new RegExp(this.options.outputExtension.replace(/\./, '\\.') + '$');
      if (! out.match(outExtensionRegex)) {
        out = out + outputExtension;
      }

      return out;
    }
  }

  return _.extend({
    browserify: {},
    bundleExtension: bundleExtension,
    outputExtension: outputExtension,
    outputDirectory: null,
    bundles: defaultBundleConfig
  }, options);
};

FastBrowserify.prototype.cleanup = function() {
  quickTemp.remove(this, 'tmpDestDir');
};

FastBrowserify.prototype.read = function(readTree) {
  var self = this;
  var promises = [];

  return readTree(this.inputTree).then(function(srcDir) {
    // remove output files that don't have a corrisponding input file anymore
    self.cleanupBundles();
    var invalidatedBundles = self.invalidateCache();

    for (bundleNameOrGlob in self.options.bundles) {
      var bundleOptions = self.options.bundles[bundleNameOrGlob];
      var bundleFiles = [];

      // If we're dealing with multiple bundle files in a single declaration
      // then the bundle key is a glob to the files that serve as the basis to
      // determine which bundles to create (they are often the entrypoints to the bundle)
      if (bundleOptions.glob) {
        bundleFiles = glob.sync(bundleNameOrGlob, { cwd: srcDir, mark: true });
      } else {
        // If we're dealing with a single bundle declaration, then the bundle key
        // is the path to the output bundle, and the user must specify a list of
        // entryPoints
        bundleFiles = [bundleNameOrGlob]
      }

      bundleFiles.forEach(function(relativePath) {
        var bundle = self.bundles[relativePath];

        if (! bundle) {
          var outputBasename;
          var outputRelativePath;
          var outputAbsolutePath;
          var entryPointGlobs = [];
          var entryPoints = [];

          if (bundleOptions.glob) {
            if (! _.isFunction(bundleOptions.outputPath)) {
              throw "When glob == true, outputPath must be a function that returns the output bundle filename";
            }
            outputRelativePath = bundleOptions.outputPath.call(self, relativePath);
          } else {
            if (bundleOptions.outputPath) {
              throw "outputPath is only valid for glob bundle specifications, specify the output bundle filename in the key of the bundle specification";
            }
            outputRelativePath = relativePath;
          }

          // Add on the globally specified output directory if specified
          if (self.options.outputDirectory && _.isString(self.options.outputDirectory)) {
            outputRelativePath = path.join(self.options.outputDirectory, outputRelativePath);
          }

          if (_.isFunction(bundleOptions.entryPoints)) {
          entryPointGlobs = bundleOptions.entryPoints.call(self, relativePath);
          } else if (_.isArray(bundleOptions.entryPoints)) {
          entryPointGlobs = bundleOptions.entryPoints;
          } else if (_.isString(bundleOptions.entryPoints)) {
          entryPointGlobs = [bundleOptions.entryPoints];
          } else {
            // If this is a glob bundle specification, then let's assume that the entryPoints are the results of the glob
            if (bundleOptions.glob) {
            entryPointGlobs = [relativePath];
            } else {
              throw "You must specify entryPoints as a function, array, or string";
            }
          }

          // go through the entrypoints the user specified and resolve the globs
          entryPointGlobs.forEach(function(g) {
            entryPoints = entryPoints.concat(glob.sync(g, { cwd: srcDir, nodir: true }));
          });

          // GO through the entry points and prepend ./ to their names to make them relative
          for (var i = 0; i < entryPoints.length; ++i) {
            var entryPoint = entryPoints[i];
            if (entryPoint[0] !== '/') {
              entryPoints[i] = './' + entryPoint;
            }
          }

          outputBasename = path.basename(outputRelativePath);
          outputAbsolutePath = path.resolve(self.destDir, outputRelativePath);

          bundle = {
            browserify: null,
            entryPoints: entryPoints,
            outputBasename: outputBasename,
            outputFileName: outputAbsolutePath,
            browserifyOptions: {},
            dependentFileNames: {}
          };

          bundle.browserifyOptions = _.extend(bundle.browserifyOptions, {
            basedir: srcDir,
            cache: self.cache,
            packageCache: self.packageCache,
            fullPaths: true,
            extensions: ['.js', self.options.bundleExtension].concat(self.options.browserify.extensions || []),
            entries: entryPoints
          });

          console.log('creating bundle', outputRelativePath, bundle.browserifyOptions);

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
        mkdirp.sync(path.dirname(bundle.outputFileName));

        promise = self.bundle(bundle);
        promises.push(promise);
      });
    }

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
