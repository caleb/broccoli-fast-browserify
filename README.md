# broccoli-fast-browserify

The broccoli-fast-browserify-watchify plugin bundles your assets with 
[browserify](https://github.com/substack/browserify).

This plugin differs from the other watchify/browserify plugins for broccoli in
that it uses caching to significantly speed up compilation. There is a
broccoli-watchify plugin that would seem to use this caching, however it does
not detect changes through symlinks, which many broccoli plugins use under the
hood.

The way it currently works is that you specify a bundle extension
(by default .js.browserify), and those files will be compiled into output files
(with a default output extension of .js) with all of their requirements baked in.
At this time, the bundle files (\*.js.browserify) are passed in as entry files,
and there is no way to specify multiple entry files

The

## Installation

```bash
npm install --save-dev broccoli-fast-browserify
```

## Example

```js
var fastBrowserify = require('broccoli-fast-browserify');

var tree = fastBrowserify(tree);
```

## API

### fastBrowserify(tree, options)

* `tree`: A [broccoli tree](https://github.com/broccolijs/broccoli#plugin-api-specification) or a directory path as a string

####Options
 
* `browserify`: (defaults to `{}`) Options passed to the [browserify constructor](https://github.com/substack/node-browserify#var-b--browserifyfiles-or-opts)

## License

The 3 Clause BSD License (3-Clause-BSD). See [LICENSE](LICENSE) for details.

Copyright © 2014 Caleb Land.
