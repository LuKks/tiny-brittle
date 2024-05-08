const fs = require('fs')
const path = require('path')
const { spawn, spawnSync } = require('child_process')
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
  const target = path.join(__dirname, 'src')
  const out = await tmp()

  spawnSync(process.execPath, [path.join(__dirname, 'build.js'), '--target=' + target, '--out=' + out], { stdio: 'inherit' })

  const brittle = path.join(out, 'index.js')

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
      t.fail()
    },
    `
    TAP version 13

    # fail
        not ok 1 - failed
          ---
          operator: fail
          stack: |
            [eval]:5:9
            Test._run (/tmp/tmp-test-d873e72ba7656/node_modules/brittle/index.js:576:13)
            process.processTicksAndRejections (node:internal/process/task_queues:95:5)
          ...
    not ok 1 - fail # time = 3.813937ms

    1..1
    # tests = 0/1 pass
    # asserts = 0/1 pass
    # time = 9.139066ms

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
  const target = path.join(__dirname, 'src')
  const out = await tmp()

  spawnSync(process.execPath, [path.join(__dirname, 'build.js'), '--target=' + target, '--out=' + out], { stdio: 'inherit' })

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
  const { exitCode: status, error, stdout, stderr } = await executeCode(`
    const test = require('./${path.basename(brittle)}')

    test('${name}', (${fn.toString()}))
  `, { cwd: path.dirname(brittle) })

  validate({ status, error, stdout, stderr }, expectedOut, expectedMore)

  console.log('OK LIB', name)
}

async function cli (brittle, file, expectedOut, expectedMore) {
  const cmd = brittle[0]
  const args = brittle.slice(1)
  const cwd = path.dirname(cmd)

  const filename = path.join(cwd, 'test-' + Math.random().toString().slice(2) + '.js')

  await fs.promises.writeFile(filename, file)

  args.push('./' + path.basename(filename))

  const { status, error, stdout, stderr } = spawnSync(cmd, args, { cwd, encoding: 'utf8' })

  validate({ status, error, stdout, stderr }, expectedOut, expectedMore)

  console.log('OK CLI')
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
    .map(line => line.includes('tmp-test-') ? null : line)
    .filter(n => n)
    .join('\n')
}

function executeCode (script, opts = {}) {
  return new Promise((resolve, reject) => {
    const {
      cwd = null
    } = opts

    const args = ['-e', script]
    const options = { timeout: 30000, cwd }
    const child = spawn(process.execPath, args, options)

    let exitCode
    let stdout = ''
    let stderr = ''

    child.on('exit', function (code) {
      exitCode = code
    })

    child.on('close', function () {
      resolve({ exitCode, stdout, stderr })
    })

    child.on('error', function (error) {
      resolve({ exitCode, error, stdout, stderr })
    })

    child.stdout.setEncoding('utf-8')
    child.stderr.setEncoding('utf-8')

    child.stdout.on('data', function (chunk) {
      stdout += chunk
    })

    child.stderr.on('data', function (chunk) {
      stderr += chunk
    })
  })
}
