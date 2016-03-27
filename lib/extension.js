"use strict";

var Module = require("module"),
    fs = require("fs"),
    getImportGlobalsSrc = require("./getImportGlobalsSrc.js"),
    getDefinePropertySrc = require("./getDefinePropertySrc.js"),
    detectStrictMode = require("./detectStrictMode.js");
var path = require('path');
var CSS = require('css-modules-loader-core-sync');
var BABEL = require("babel-core");
var SASS = require('node-sass');

class Extension {

  constructor(parentModulePath, targetPath, options) {

    this.css_cache = [];
    this.css_counter = 0;
    this.moduleWrapper0 = Module.wrapper[0];
    this.moduleWrapper1 = Module.wrapper[1];
    this.originalExtensions = {};
    this.nodeRequire;
    this.currentModule;

    this.setup();

    var targetModule,
        prelude,
        appendix,
        src;

    // Checking params
    if (typeof targetPath !== "string") { throw new TypeError("Filename must be a string"); }

    // Resolve full filename relative to the parent module
    targetPath = Module._resolveFilename(targetPath, parentModulePath);

    // Create testModule as it would be created by require()
    targetModule = new Module(targetPath, parentModulePath);

    // We prepend a list of all globals declared with var so they can be overridden (without changing original globals)
    prelude = getImportGlobalsSrc();

    // Wrap module src inside IIFE so that function declarations do not clash with global variables
    prelude += "(function () { ";
    // We append our special setter and getter.
    appendix = "\n" + getDefinePropertySrc();
    // End of IIFE
    appendix += "})();";

    // Ensure that "use strict"; stays at the beginning of the module.
    src = fs.readFileSync(targetPath, "utf8");
    if (detectStrictMode(src) === true) {
        prelude = ' "use strict"; ' + prelude;
    }

    this.inject(prelude, appendix);
    this.load(targetModule);

    this.targetModule = targetModule;
  }

  pathFetcher(filename, relativeTo) {
    var filename = path.resolve(path.dirname(relativeTo), filename.replace( /^["']|["']$/g, ""));
    var opts = {};
    var processor = new CSS();
    var content = stripBOM(fs.readFileSync(filename, "utf8"));
    var result = processor.load(content, filename, this.css_counter++, this.pathFetcher);
    this.css_cache.push(result.injectableSource);
    return result.exportTokens;
  }

  setup() {
    var self = this;

    self.processors = {
      'sass': function(module, code, filename) {
        var result = SASS.renderSync({
          file: filename,
          data: code
        });
        self.processors.css(module, result.css.toString(), filename);
      },
      'css': function(module, code, filename) {
        var processor = new CSS();
        var result = processor.load(code, filename, self.css_counter++, self.pathFetcher.bind(self));
        self.css_cache.push(result.injectableSource);
        module._compile(`module.exports = ${JSON.stringify(result.exportTokens)}`, filename);
        delete require.cache[filename];
      },
      'babel': function(module, code, filename) {
        var result = BABEL.transform(code, {
          presets: ["es2015", "react"]
        });
        module._compile(result.code, filename);
      }
    };

    self.loaders = {
      'sass': function(module, filename) {
        var content = stripBOM(fs.readFileSync(filename, "utf8"));
        self.processors.sass(module, content, filename);
      },
      'css': function(module, filename) {
        var content = stripBOM(fs.readFileSync(filename, "utf8"));
        self.processors.css(module, content, filename);
      },
      'babel': function(module, filename) {
        var content = stripBOM(fs.readFileSync(filename, "utf8"));
        self.processors.babel(module, content, filename);
      }
    }

    self.extensions = {
      '.scss': self.loaders.sass,
      '.sass': self.loaders.sass,
      '.css': self.loaders.css,
      '.js': self.loaders.babel,
      '.es6': self.loaders.babel,
      '.jsx': self.loaders.babel
    };
  }

  getExports() {
    this.targetModule.exports.__extensions__ = {
      'css': this.css_cache.join('')
    };
    return this.targetModule.exports;
  }

  load(targetModule) {
      this.nodeRequire = targetModule.require;
      targetModule.require = this.requireProxy.bind(this);
      this.currentModule = targetModule;
      this.registerExtensions();
      this.injectExtentions();
      targetModule.load(targetModule.id);
      // This is only necessary if nothing has been required within the module
      this.reset();
  }

  reset() {
      Module.wrapper[0] = this.moduleWrapper0;
      Module.wrapper[1] = this.moduleWrapper1;
      this.restoreExtensions();
  }

  inject(prelude, appendix) {
      Module.wrapper[0] = this.moduleWrapper0 + prelude;
      Module.wrapper[1] = appendix + this.moduleWrapper1;
  }

  /**
   * Proxies the first require call in order to draw back all changes to the Module.wrapper.
   * Thus our changes don't influence other modules
   *
   * @param {!String} path
   */

   requireProxy(path) {
      this.reset();
      this.currentModule.require = this.nodeRequire;
      return this.nodeRequire.call(this.currentModule, path);
      // node's require only works when "this" points to the module
  }

  _require(module, path) {
    //console.log('require called in', module.filename, '--->', path)
    return Module._load(path, module);
  }

  registerExtensions() {
    var self = this;
    Object.keys(require.extensions).forEach(function(extension) {
      // Store the original so we can restore it later
      if (!self.originalExtensions[extension]) {
        self.originalExtensions[extension] = require.extensions[extension];
      }
      // Override the default handler for the requested file extension
      require.extensions[extension] = function(module, filename) {
        // Override the require method for this module
        module.require = self._require.bind(self, module);
        return self.originalExtensions[extension](module, filename);
      };
    });
  }

 injectExtentions() {
    var self = this;
    Object.keys(self.extensions).forEach(function(extension) {
      require.extensions[extension] = function(module, filename) {
        // Override the require method for this module, ignore node_modules
        if(/node_modules/.test(filename)) {
          return self.originalExtensions[extension](module, filename);
        } else {
          module.require = self._require.bind(self, module);
          return self.extensions[extension](module, filename);
        }
      };
    })
  }

 restoreExtensions() {
    var self = this;
    Object.keys(self.extensions).forEach(function(extension) {
      delete require.extensions[extension];
    });
    Object.keys(self.originalExtensions).forEach(function(extension) {
      require.extensions[extension] = self.originalExtensions[extension];
    });
  }
}

/**
 * @see https://github.com/joyent/node/blob/master/lib/module.js
 */
function stripBOM(content) {
    // Remove byte order marker. This catches EF BB BF (the UTF-8 BOM)
    // because the buffer-to-string conversion in `fs.readFileSync()`
    // translates it to FEFF, the UTF-16 BOM.
    if (content.charCodeAt(0) === 0xFEFF) {
        content = content.slice(1);
    }
    return content;
}

module.exports = Extension;
