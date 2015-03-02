var through = require('through');

module.exports = function (file) {
  var data = '';
  return through(write, end);

  function write (buf) { data += buf; }
  function end () {
    // simple transformation
    this.queue(data.replace('foo', 'bar'));
    this.queue(null);
  }
};
