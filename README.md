# electroid
Node.js require-like plugin loader and compiler (es6, jsx, sass, css modules)

### install
```npm i electroid```

### usage
Electroid will import the module, automatically resolve all subsequent require calls and compile the code.
```
var electroid = require("electroid");
var myModule = electroid("./your_es6_module.js");
```
