var _          = require('lodash');
var fs         = require('fs');
var path       = require('path');
var RSVP       = require('rsvp');
var quickTemp  = require('quick-temp');
var mkdirp     = require('mkdirp');
var browserify = require('browserify');
var walkSync   = require('walk-sync');
var glob       = require('glob');
var through    = require('through2');
var xtend      = require('xtend');
var hashTree   = require('broccoli-kitchen-sink-helpers').hashTree;

function FastBrowserify(inputTree, options) {
  if (!(this instanceof FastBrowserify)) { return new FastBrowserify(inputTree, options); }

  this.options = this.getOptions(options || {});
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

  var defaultBundleTemplate = {};
  defaultBundleTemplate['**/*' + bundleExtension] = {
    key: '**/*' + bundleExtension,
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
  };

  // add the bundle's key to the bundle's config, for convenience
  if (_.isObject(options.bundles)) {
    for (var key in options.bundles) {
      options.bundles[key].key = key;
    }
  }

  return _.extend({
    browserify: {
      debug: true
    },
    externals: [],
    bundleExtension: bundleExtension,
    outputExtension: outputExtension,
    outputDirectory: null,
    bundles: defaultBundleTemplate
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
    self.invalidateCache();

    for (var bundleNameOrGlob in self.options.bundles) {
      var bundleTemplate = self.options.bundles[bundleNameOrGlob];
      var bundleFiles = [];

      // If we're dealing with multiple bundle files in a single declaration
      // then the bundle key is a glob to the files that serve as the basis to
      // determine which bundles to create (they are often the entrypoints to the bundle)
      if (bundleTemplate.glob) {
        bundleFiles = glob.sync(bundleNameOrGlob, { cwd: srcDir, mark: true });
      } else {
        // If we're dealing with a single bundle declaration, then the bundle key
        // is the path to the output bundle, and the user must specify a list of
        // entryPoints
        bundleFiles = [bundleNameOrGlob];
      }

      bundleFiles.forEach(function(relativePath) {
        var bundle = self.bundles[relativePath];

        if (! bundle) {
          var outputBasename;
          var outputRelativePath;
          var outputAbsolutePath;
          var entryPoints;

          if (bundleTemplate.glob) {
            if (! _.isFunction(bundleTemplate.outputPath)) {
              throw "When glob == true, outputPath must be a function that returns the output bundle filename";
            }
            outputRelativePath = bundleTemplate.outputPath.call(self, relativePath);
          } else {
            if (bundleTemplate.outputPath) {
              throw "outputPath is only valid for glob bundle specifications, specify the output bundle filename in the key of the bundle specification";
            }
            outputRelativePath = relativePath;
          }

          // Add on the globally specified output directory if specified
          if (self.options.outputDirectory && _.isString(self.options.outputDirectory)) {
            outputRelativePath = path.join(self.options.outputDirectory, outputRelativePath);
          }

          entryPoints = self.readEntryPoints(srcDir, relativePath, bundleTemplate);

          if (entryPoints.absolute.length === 0 && !bundleTemplate.require) {
            console.log("Bundle specified by \"", relativePath, "\" does not have any entry files nor required modules.");
          } else {
            // hash the entryPoints so we can tell if they change so we can update
            // the browerify options with the new files
            var entryPointsHashes = [];
            for (var i = 0; i < entryPoints.absolute.length; ++i) {
              entryPointsHashes.push(hashTree(entryPoints.absolute[i]));
            }

            outputBasename = path.basename(outputRelativePath);
            outputAbsolutePath = path.resolve(self.destDir, outputRelativePath);

            bundle = {
              key: relativePath,
              srcDir: srcDir,
              template: bundleTemplate,
              browserify: null,
              entryPoints: entryPoints.absolute,
              entryPointsHashes: entryPointsHashes,
              outputBasename: outputBasename,
              outputFileName: outputAbsolutePath,
              browserifyOptions: _.clone(self.options.browserify),
              dependentFileNames: {}
            };

            bundle.browserifyOptions = _.extend(bundle.browserifyOptions, {
              basedir: srcDir,
              cache: self.cache,
              packageCache: self.packageCache,
              extensions: ['.js', self.options.bundleExtension].concat(self.options.browserify.extensions || []),
              entries: entryPoints.relative
            });

            bundle.browserify = browserify(bundle.browserifyOptions);
            
            // Make sure any files are added at the beginning, in case polyfills are added.
            if (bundleTemplate.add) {
              // Set up the transforms
              bundle.browserify.add(bundleTemplate.add)
            }

            // Set up the external files
            [].concat(self.options.externals).concat(bundleTemplate.externals).filter(Boolean).forEach(function(external) {
              var externalFile;
              var externalSplit = external.split(/:/);
              // var externalOptions = { basedir: srcDir };
              var externalOptions = { };

              if (externalSplit.length === 2) {
                externalFile = externalSplit[0];
                var externalExpose = externalSplit[1];

                externalOptions = xtend({
                  expose: externalExpose
                }, externalOptions);
              } else {
                externalFile = external;
              }

              if (/^[\/.]/.test(externalFile)) {
                // externalFile = path.resolve(srcDir, externalFile);
                externalFile = path.resolve(externalFile);
              }

              bundle.browserify.external(externalFile, externalOptions);
            });

            if (bundleTemplate.transform) {
              // Set up the transforms
              bundleTemplate.transform = [].concat(bundleTemplate.transform);
              bundleTemplate.transform.forEach(function (transform) {
                if (_.isPlainObject(transform)) {
                  bundle.browserify.transform(transform.tr, transform.options || {});
                } else {
                  bundle.browserify.transform.apply(bundle.browserify, Array.prototype.concat(transform));
                }
              });
            }

            if (bundleTemplate.require) {
              // Set up the requires
              bundleTemplate.require = Array.prototype.concat(bundleTemplate.require);
              bundleTemplate.require.forEach(function (require) {
                browserify.prototype.require.apply(bundle.browserify, Array.prototype.concat(require))
              });
            }

            // Watch dependencies for changes and invalidate the cache when needed
            var collect = function() {
              bundle.browserify.pipeline.get('deps').push(through.obj(function(row, enc, next) {
                var file = row.expose ? bundle.browserify._expose[row.id] : row.file;

                if (self.cache) {
                  bundle.browserifyOptions.cache[file] = {
                    source: row.source,
                    deps: xtend({}, row.deps)
                  };
                }

                this.push(row);
                next();
              }));
            };

            // Cache the dependencies and re-run the cache when we re-bundle
            bundle.browserify.on('reset', collect);
            collect();

            bundle.browserify.on('file', function(file) {
              self.watchFiles[file] = hashTree(file);
              bundle.dependentFileNames[file] = file;
            });

            bundle.browserify.on('package', function(pkg) {
              var packageFile = path.join(pkg.__dirname, 'package.json');
              if (fs.existsSync(packageFile)) {
                self.watchFiles[packageFile] = hashTree(packageFile);
                bundle.dependentFileNames[packageFile] = packageFile;
              }
            });

            self.bundles[relativePath] = bundle;

            // Create the target directory in the destination
            mkdirp.sync(path.dirname(bundle.outputFileName));

            promise = self.bundle(bundle);
            promises.push(promise);
          }
        }
      });
    }

    return RSVP.all(promises).then(function(outputFiles) {
      return self.destDir;
    });
  });
};

FastBrowserify.prototype.readEntryPoints = function(srcDir, bundleKey, bundleTemplate) {
  var entryPoints = [];
  var entryPointsAbsolute = [];
  var entryPointGlobs = [];
  var i;
  var entryPoint;

  if (bundleTemplate.entryPoints === undefined) {
    entryPointGlobs = [];
  } else if (_.isFunction(bundleTemplate.entryPoints)) {
    entryPointGlobs = bundleTemplate.entryPoints.call(this, bundleKey);
  } else if (_.isArray(bundleTemplate.entryPoints)) {
    entryPointGlobs = bundleTemplate.entryPoints;
  } else if (_.isString(bundleTemplate.entryPoints)) {
    entryPointGlobs = [bundleTemplate.entryPoints];
  } else {
    // If this is a glob bundle specification, then let's assume that the entryPoints are the results of the glob
    if (bundleTemplate.glob) {
      entryPointGlobs = [bundleKey];
    } else {
      throw "You must specify entryPoints as a function, array, or string";
    }
  }

  // go through the entrypoints the user specified and resolve the globs
  entryPointGlobs.forEach(function(g) {
    entryPoints = entryPoints.concat(glob.sync(g, { cwd: srcDir, nodir: true }));
  });

  for (i = 0; i < entryPoints.length; ++i) {
    entryPoint = entryPoints[i];
    if (entryPoint[0] !== '/') {
      entryPointsAbsolute[i] = path.resolve(srcDir, entryPoint);
    }
  }

  // GO through the entry points and prepend ./ to their names to make them relative commonjs modules
  for (i = 0; i < entryPoints.length; ++i) {
    entryPoint = entryPoints[i];
    if (entryPoint[0] !== '/' && ! entryPoint.match(/^\.\//)) {
      entryPoints[i] = './' + entryPoint;
    }
  }

  return {
    relative: entryPoints,
    absolute: entryPointsAbsolute
  };
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
    if (! fs.existsSync(file) || hashTree(file) !== this.watchFiles[file]) {
      invalidatedFiles.push(file);

      // look through the bundles to see if any of them depend on this file and are older than this file
      for (bundleKey in this.bundles) {
        bundle = this.bundles[bundleKey];

        // look through this bundle's dependencies and test if they are newer than the output file
        // or check through the entry points and test if they are newer than the output file
        if (bundle.dependentFileNames[file] && ! _.include(invalidatedBundles, bundleKey)) {
          invalidatedBundles.push(bundleKey);
        } else if (_.include(bundle.entryPoints, file) && ! _.include(invalidatedBundles, bundleKey)) {
          invalidatedBundles.push(bundleKey);
        }
      }
    }
  }

  // if the entry file names are different now than before, invalidate the bundle
  for (bundleKey in this.bundles) {
    bundle = this.bundles[bundleKey];
    var newEntries = this.readEntryPoints(bundle.srcDir, bundle.key, bundle.template);
    var entries = bundle.entryPoints;
    // if the entrypoints have changed, invalidate the bundle so we can rebuild with the new entry point
    for (i = 0; i < newEntries.absolute.length; ++i) {
      if (i >= entries.length || newEntries.absolute[i] != entries[i]) {
        if (! _.include(invalidatedBundles, bundleKey)) {
          invalidatedBundles.push(bundleKey);
        }
      }
    }
  }

  // remove the invalidated files from the cache
  invalidatedFiles.forEach(function(file) {
    delete this.cache[file];
    delete this.watchFiles[file];
  }.bind(this));

  invalidatedBundles.forEach(function(bundleKey) {
    delete this.bundles[bundleKey];
  }.bind(this));
};

FastBrowserify.prototype.cleanupBundles = function() {
  // remove stale output files
  var bundlesToDelete = [];

  for (var key in this.bundles) {
    var bundle = this.bundles[key];

    var anyFilesExist = _.any(bundle.entryPoints, fs.existsSync);

    if (! anyFilesExist) {
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
