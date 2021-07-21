const child_process = require('child_process')

module.exports = function(filename, callback) {
  child_process.exec(filename + ' -v', function(error, stdout) {
    if (error != null) {
      callback(error);
      return;
    }

    let version = null;
    if (stdout != null) {
      version = stdout.toString().trim();
    }

    child_process.exec(filename + " -p 'process.arch'", function(error, stdout) {
      let arch = null;
      if (stdout != null) {
        arch = stdout.toString().trim();
      }
      callback(error, version, arch);
    })
  });
}
