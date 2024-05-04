const path = require('path')
const { spawn } = require('child_process')
const boot = require('boot-cli')
const tmp = require('test-tmp')

let brittle = null

main().catch(err => {
  console.error(err)
  process.exit(1)
})

async function main () {
  const out = await tmp()

  await boot.export(path.join(__dirname, 'src'), {
    entrypoint: 'bin.js',
    out
  })

  brittle = JSON.stringify(path.join(out, 'index.js'))

  await tester('pass',
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

  await tester('fail',
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

  await tester('error',
    async function (t) {
      throw new Error('Oops')
    },
    `
    TAP version 13

    # error
    `,
    { exitCode: 1, stderr: 'Error: Oops' }
  )

  await tester('programming error',
    'function (t) { programming error }',
    '',
    { exitCode: 1, stderr: 'SyntaxError: Unexpected identifier \'error\'' }
  )
}

async function tester (name, fn, expectedOut, expectedMore) {
  name = JSON.stringify(name)

  const script = `const test = require(${brittle})\n\nconst _fn = (${fn.toString()})\n\ntest(${name}, _fn)`
  const { exitCode, error, stdout, stderr } = await executeCode(script)

  if (error) {
    throw new Error(error)
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

  if (exitCode !== expectedMore.exitCode) {
    errors = true

    console.error('exitCode', exitCode, 'is not the expected', expectedMore.exitCode)
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
  return stdout
    .replace(/#.+(?:\n|$)/g, '\n') // strip comments
    .replace(/\n[^\n]*node:(?:internal|vm)[^\n]*/g, '\n') // strip internal node stacks
    .replace(/\n[^\n]*(\[eval\])[^\n]*/g, '\n') // strip internal node stacks
    .replace(/\n[^\n]*(Test\._run) \((.*):[\d]+:[\d]+\)[^\n]*\n/g, '\n$1 (13:37)\n') // static line numbers for "Test._run", and removed "$2:"
    .replace(/[/\\]/g, '/')
    .split('\n')
    .map(n => n.trim())
    .filter(n => n)
    .join('\n')
}

function executeCode (script) {
  return new Promise(resolve => {
    const args = ['-e', script]
    const child = spawn(process.execPath, args, { timeout: 30000 })

    child.stdout.setEncoding('utf-8')
    child.stderr.setEncoding('utf-8')

    let exitCode = null
    let stdout = ''
    let stderr = ''

    child.on('exit', onexit)
    child.on('close', onclose)
    child.on('error', onerror)

    child.stdout.on('data', onstdout)
    child.stderr.on('data', onstderr)

    function onexit (code) {
      exitCode = code
    }

    function onclose () {
      resolve({ exitCode, stdout, stderr })
    }

    function onerror (error) {
      resolve({ exitCode, error, stdout, stderr })
    }

    function onstdout (chunk) {
      stdout += chunk
    }

    function onstderr (chunk) {
      stderr += chunk
    }
  })
}
