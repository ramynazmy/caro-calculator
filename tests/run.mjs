/**
 * Runs the three check scripts and reports a single pass/fail.
 *
 * No test framework on purpose: each file is a plain script that prints
 * PASS/FAIL lines and ends with ALL PASS. That keeps the dependency list at
 * zero and makes the output readable when something breaks at 1am after a
 * dinner. `npm run verify` compiles them with the TypeScript already installed
 * for the build, then runs each one.
 */
import { execFileSync } from 'node:child_process'
import { readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// tsc emits CommonJS, but this package is `"type": "module"`, so Node would
// read the .js output as ESM and fail on `exports`. A package.json inside the
// output directory scopes it back to CommonJS.
writeFileSync('.verify/package.json', '{ "type": "commonjs" }\n')

const OUT = '.verify/tests'
const files = readdirSync(OUT).filter((f) => f.endsWith('.test.js'))

let failed = 0
for (const file of files) {
  process.stdout.write(`\n=== ${file.replace('.test.js', '')}\n`)
  try {
    const output = execFileSync(process.execPath, [join(OUT, file)], { encoding: 'utf8' })
    process.stdout.write(output)
    if (!output.includes('ALL PASS')) failed++
  } catch (error) {
    process.stdout.write(String(error.stdout ?? error.message))
    failed++
  }
}

console.log(
  failed === 0
    ? `\n✓ all ${files.length} suites passed`
    : `\n✗ ${failed} of ${files.length} suites failed`,
)
process.exit(failed ? 1 : 0)
