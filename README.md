# tiny-brittle

Brittle compiled with zero dependencies

```
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

## Build from source

<details>
<summary>How to compile</summary>

First, you need the Bootdrive CLI

`npm i -g bootdrive-cli`

Then clone the repo, and go into the directory

```
git clone git@github.com:lukks/tiny-brittle.git
cd tiny-brittle
```

And bundle it within that working directory

`bootdrive export -d ./src -e index.js -e bin.js -o ./boot --force`

</details>

## License

MIT
