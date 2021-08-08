/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import path from "path"
import yargs from "yargs"
import Command from "./command"
import * as config from "./apm"
import fs from "./fs"
import { tree } from "./tree"

export default class Links extends Command {
  constructor() {
    super()
    this.devPackagesPath = path.join(config.getAtomDirectory(), "dev", "packages")
    this.packagesPath = path.join(config.getAtomDirectory(), "packages")
  }

  parseOptions(argv) {
    const options = yargs(argv).wrap(Math.min(100, yargs.terminalWidth()))
    options.usage(`\

Usage: apm links

List all of the symlinked atom packages in ~/.atom/packages and
~/.atom/dev/packages.\
`)
    return options.alias("h", "help").describe("help", "Print this usage message")
  }

  getDevPackagePath(packageName) {
    return path.join(this.devPackagesPath, packageName)
  }

  getPackagePath(packageName) {
    return path.join(this.packagesPath, packageName)
  }

  getSymlinks(directoryPath) {
    const symlinks = []
    for (const directory of fs.list(directoryPath)) {
      const symlinkPath = path.join(directoryPath, directory)
      if (fs.isSymbolicLinkSync(symlinkPath)) {
        symlinks.push(symlinkPath)
      }
    }
    return symlinks
  }

  logLinks(directoryPath) {
    const links = this.getSymlinks(directoryPath)
    console.log(`${directoryPath.cyan} (${links.length})`)
    return tree(links, { emptyMessage: "(no links)" }, function (link) {
      let realpath
      try {
        realpath = fs.realpathSync(link)
      } catch (error) {
        realpath = "???".red
      }
      return `${path.basename(link).yellow} -> ${realpath}`
    })
  }

  run(options, callback) {
    this.logLinks(this.devPackagesPath)
    this.logLinks(this.packagesPath)
    return callback()
  }
}
