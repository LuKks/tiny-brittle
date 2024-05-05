const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const Bootdrive = require('bootdrive-cli')
const tmp = require('test-tmp')

main().catch(err => {
  console.error(err)
  process.exit(1)
})

async function main () {
  await testLib()
  await testBin()
}

async function testLib () {
  const out = await tmp()
  const target = path.join(__dirname, 'src')

  spawnSync('npm', ['install'], { cwd: target, stdio: 'inherit', shell: true })

  // It's not doing anything special, just moving all files due force option
  await Bootdrive.export(target, {
    entrypoint: ['index.js', 'bin.js'],
    out,
    force: true
  })

  const brittle = JSON.stringify(path.join(out, 'index.js'))

  await tester(brittle, 'pass',
    async function (t) {
      t.ok(true)
    },
    `
    TAP version 13

    # pass
        ok 1 - expected truthy value
    ok 1 - pass # time = 0.642151ms

    1..1
    # tests = 1/1 pass
    # asserts = 1/1 pass
    # time = 6.126202ms

    # ok
    `,
    { exitCode: 0 }
  )

  await tester(brittle, 'fail',
    async function (t) {
      t.ok(false)
    },
    `
    TAP version 13

    # fail
        not ok 1 - expected truthy value
          ---
          operator: ok
          stack: |
            _fn ([eval]:4:9)
            Test._run (./boot/node_modules/brittle/index.js:576:13)
            process.processTicksAndRejections (node:internal/process/task_queues:95:5)
          ...
    not ok 1 - fail # time = 3.74543ms

    1..1
    # tests = 0/1 pass
    # asserts = 0/1 pass
    # time = 9.068592ms

    # not ok
    `,
    { exitCode: 1 }
  )

  await tester(brittle, 'error',
    async function (t) {
      throw new Error('Oops')
    },
    `
    TAP version 13

    # error
    `,
    { exitCode: 1, stderr: 'Error: Oops' }
  )
}

async function testBin () {
  const out = await tmp()
  const target = path.join(__dirname, 'src')

  spawnSync('npm', ['install'], { cwd: target })

  // It's not doing anything special, just moving all files due force option
  await Bootdrive.export(target, {
    entrypoint: ['index.js', 'bin.js'],
    out,
    force: true
  })

  const brittle = path.join(out, 'bin.js')

  await fs.promises.chmod(brittle, 0o744)

  await cli(
    [brittle],
    `
    const test = require('${path.join(out, 'index.js')}')

    test('basic', function (t) {
      t.pass()
    })
    `,
    `
    TAP version 13

    # basic
        ok 1 - passed
    ok 1 - basic # time = 0.63492ms

    1..1
    # tests = 1/1 pass
    # asserts = 1/1 pass
    # time = 7.898583ms

    # ok
    `,
    { exitCode: 0, stderr: '' }
  )

  await cli(
    [brittle, '--coverage'],
    `
    const test = require('${path.join(out, 'index.js')}')

    test('basic', function (t) {
      t.pass()
    })
    `,
    `
    TAP version 13

    # basic
        ok 1 - passed
    ok 1 - basic # time = 0.889777ms

    1..1
    # tests = 1/1 pass
    # asserts = 1/1 pass
    # time = 9.950552ms

    # ok
    ----------|---------|----------|---------|---------|-------------------
    File      | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s 
    ----------|---------|----------|---------|---------|-------------------
    All files |     100 |      100 |     100 |     100 |                   
     bin.js   |     100 |      100 |     100 |     100 |                   
     index.js |     100 |      100 |     100 |     100 |                   
    ----------|---------|----------|---------|---------|-------------------
    `,
    { exitCode: 0, stderr: '' }
  )
}

async function tester (brittle, name, fn, expectedOut, expectedMore) {
  name = JSON.stringify(name)

  const script = `const test = require(${brittle})\n\nconst _fn = (${fn.toString()})\n\ntest(${name}, _fn)`
  const { status, error, stdout, stderr } = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', shell: true })

  validate({ status, error, stdout, stderr }, expectedOut, expectedMore)
}

async function cli (brittle, file, expectedOut, expectedMore) {
  const dir = await tmp()
  const filename = path.join(dir, 'test.js')

  await fs.promises.writeFile(filename, file)

  const cmd = brittle[0]
  const args = brittle.slice(1)
  const cwd = path.dirname(cmd)

  args.push(filename)

  const { status, error, stdout, stderr } = spawnSync(cmd, args, { cwd, encoding: 'utf8', shell: true })

  validate({ status, error, stdout, stderr }, expectedOut, expectedMore)
}

function validate ({ status, error, stdout, stderr }, expectedOut, expectedMore) {
  if (error) {
    throw error
  }

  let errors = false

  const tapout = standardizeTap(stdout)
  const tapexp = standardizeTap(expectedOut)

  if (tapout !== tapexp) {
    errors = true

    console.log('TAP output does not matches the expected output')
    console.error('[actual]')
    console.error(stdout)
    console.error('[expected]')
    console.error(expectedOut)
  }

  if (status !== expectedMore.exitCode) {
    errors = true

    console.error('exitCode', status, 'is not the expected', expectedMore.exitCode)
  }

  if (expectedMore.stderr && !stderr.includes(expectedMore.stderr)) {
    errors = true

    console.error('stderr did not include the expected')
    console.error('[actual]')
    console.error(stderr)
    console.error('[expected]')
    console.error(expectedMore.stderr)
  }

  if (!expectedMore.stderr && stderr) {
    errors = true

    console.error('stderr', stderr)
  }

  if (errors) {
    throw new Error('Something went wrong')
  }
}

function standardizeTap (stdout) {
  // Changes: Removes "$2:" from Test._run also
  return stdout
    .replace(/#.+(?:\n|$)/g, '\n') // strip comments
    .replace(/\n[^\n]*node:(?:internal|vm)[^\n]*/g, '\n') // strip internal node stacks
    .replace(/\n[^\n]*(\[eval\])[^\n]*/g, '\n') // strip internal node stacks
    .replace(/\n[^\n]*(Test\._run) \((.*):[\d]+:[\d]+\)[^\n]*\n/g, '\n$1 (13:37)\n') // static line numbers for "Test._run"
    .replace(/[/\\]/g, '/')
    .split('\n')
    .map(n => n.trim())
    .filter(n => n)
    .join('\n')
}
