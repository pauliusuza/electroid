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

### extracting css
your_es6_module.js:
```
import styles from './styles.scss';
console.log(styles); // object with css module mapping
```

index.js
```
var electroid = require("electroid");
var myModule = electroid("./your_es6_module.js");
console.log(myModule.__extensions__.css); //compiled css, ready to inject into HTML
```
