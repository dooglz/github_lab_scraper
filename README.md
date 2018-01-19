```bash
npm install
npm install -g browserify js-beautify
js-beautify -r -q ./node.js && browserify ./node.js > ./js/main.js
```