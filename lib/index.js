var Extension = require("./extension.js");
// load up the extension
function extension(filename, options) {
  var ext = new Extension(module.parent, filename, options);
  return ext.getExports();
}
module.exports = extension;
// deleting self from module cache so the parent module is always up to date
delete require.cache[__filename];
