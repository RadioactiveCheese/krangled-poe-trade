// @ts-check

/** @param {NodeJS.Platform} platform */
export function electronDevArgs (platform = process.platform) {
  return platform === 'linux' ? ['--ozone-platform=x11', '.'] : ['.']
}
