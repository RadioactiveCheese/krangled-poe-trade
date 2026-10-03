import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import { discoverIntegrationTests, runIntegrationTests } from '../../scripts/run-integration-tests.mjs'

const directories: string[] = []
function temporaryDirectory () {
  const directory = mkdtempSync(join(tmpdir(), 'krangled integration tests '))
  directories.push(directory)
  return directory
}
afterEach(() => {
  for (const directory of directories.splice(0)) {
    const target = resolve(directory)
    if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('krangled integration tests ')) {
      throw new Error('Refusing to remove a path outside the test temporary directory')
    }
    rmSync(target, { recursive: true, force: true })
  }
})

it('discovers every supported integration filename without including fixtures or directories', () => {
  const directory = temporaryDirectory()
  const names = ['chart-integration.spec.mjs', 'eldritch-lines-integration.mjs', 'catalysts.integration.mjs', 'dust.integration.mjs']
  for (const name of [...names, 'chart-integration.spec.ts', 'fixture-integration.mjs.json']) writeFileSync(join(directory, name), '')
  mkdirSync(join(directory, 'directory-integration.mjs'))
  expect(discoverIntegrationTests(directory)).toEqual(names.map(name => join(directory, name)).sort())
})

it('finds repository tests from another working directory, including paths with spaces', () => {
  const script = fileURLToPath(new URL('../../scripts/run-integration-tests.mjs', import.meta.url))
  const result = spawnSync(process.execPath, [script, '--list'], { cwd: temporaryDirectory(), encoding: 'utf8' })
  expect(result.status, result.stderr).toBe(0)
  const files = JSON.parse(result.stdout) as string[]
  expect(files).toEqual(discoverIntegrationTests())
  expect(files.some(file => file.endsWith('mercenary-warrant-integration.spec.mjs'))).toBe(true)
})

it('propagates native test failures and refuses an empty integration suite', () => {
  const directory = temporaryDirectory()
  const passing = join(directory, 'passing.integration.mjs')
  const failing = join(directory, 'failing.integration.mjs')
  writeFileSync(passing, "import test from 'node:test'; test('passing regression', () => {})")
  writeFileSync(failing, "import test from 'node:test'; import assert from 'node:assert/strict'; test('failing regression', () => assert.fail('expected fixture failure'))")
  expect(runIntegrationTests([passing], { cwd: directory, stdio: 'ignore' })).toBe(0)
  expect(runIntegrationTests([failing], { cwd: directory, stdio: 'ignore' })).toBe(1)
  expect(() => runIntegrationTests([])).toThrow('No integration tests found')
})
