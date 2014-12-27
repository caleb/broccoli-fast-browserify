var external1 = require('globallyExternal');
var external2 = require('bundleExternalNonExistantModule');
var included = require('./included');

console.log('this bundle should not include the globally or bundle excluded modules');
