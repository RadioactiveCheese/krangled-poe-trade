import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const rendererRoot = fileURLToPath(new URL('../', import.meta.url))

export function discoverIntegrationTests (directory = resolve(rendererRoot, 'specs')) {
  return readdirSync(directory, { withFileTypes: true })
    .filter(file => file.isFile() && /[.-]integration(?:\.spec)?\.mjs$/u.test(file.name))
    .map(file => resolve(directory, file.name))
    .sort()
}

export function runIntegrationTests (files, { cwd = rendererRoot, stdio = 'inherit' } = {}) {
  if (!files.length) throw new Error('No integration tests found')
  const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files], { cwd, stdio })
  if (result.error) throw result.error
  return result.status ?? 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const files = discoverIntegrationTests()
  if (process.argv.includes('--list')) {
    console.log(JSON.stringify(files))
  } else {
    process.exitCode = runIntegrationTests(files)
  }
}
