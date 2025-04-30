# tiny-brittle

Brittle compiled with zero dependencies

```sh
npm i tiny-brittle
```

This achieves lightweight `node_modules` with no deps, and faster installs.

## Usage

Use it as you normally would:

`package.json`

```js
"scripts": {
  "test": "brittle test.js"
}
```

`test.js`

```js
const test = require('brittle')

test('basic', function (t) {
  t.pass()
})
```

## License

MIT
