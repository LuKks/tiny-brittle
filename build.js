const path = require('path')
const { spawnSync } = require('child_process')
const minimist = require('minimist')
const Localdrive = require('localdrive')
const format = require('mirror-format')

const argv = minimist(process.argv.slice(2))

const target = argv.target || path.join(__dirname, 'src')
const out = argv.out || path.join(__dirname, 'boot')
const dryRun = argv['dry-run'] || false
const verbose = argv.verbose || false

main().catch(err => {
  console.error(err)
  process.exit(1)
})

async function main () {
  spawnSync('npm', ['install'], { cwd: target })

  const src = new Localdrive(target)
  const dst = new Localdrive(out)

  const m = src.mirror(dst, { dryRun })

  if (verbose) {
    for await (const diff of m) {
      console.log(format.diff(diff))
    }
  } else {
    await m.done()
  }

  console.log(
    'Total files:', m.count.files, '(' + format.count(m.count) + ')',
    'Size change:', format.bytes(m)
  )
}
