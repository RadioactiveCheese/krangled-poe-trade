import assert from 'node:assert/strict'
import test from 'node:test'
import { electronDevArgs } from './electron-dev-args.mjs'

test('Linux development launches Electron on X11', () => {
  assert.deepEqual(electronDevArgs('linux'), ['--ozone-platform', 'x11', '.'])
})

test('Windows and macOS development arguments remain unchanged', () => {
  assert.deepEqual(electronDevArgs('win32'), ['.'])
  assert.deepEqual(electronDevArgs('darwin'), ['.'])
})

test('default platform uses the current host', () => {
  assert.deepEqual(electronDevArgs(), electronDevArgs(process.platform))
})
