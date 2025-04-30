# tiny-brittle

Brittle compiled with zero dependencies

```sh
npm i tiny-brittle --save-dev
```

This achieves lightweight `node_modules` with no deps, and faster installs.

## Alias

To keep the same import e.g. `require('brittle')`

```sh
npm install brittle@npm:tiny-brittle --save-dev
```

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
const test = require('tiny-brittle')

test('basic', function (t) {
  t.pass()
})
```

## License

MIT
