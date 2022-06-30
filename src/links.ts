/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import path from "path"
import Command from "./command"
import fs from "./fs"
import { tree } from "./tree"
import type { CliOptions, RunCallback } from "./apm-cli"
import mri from "mri"

export default class Links extends Command {
  parseOptions(argv: string[]) {
    return mri<{
      help: boolean
    }>(argv, {
      alias: { h: "help" },
      boolean: ["help"],
    })
  }

  help() {
    return `Usage: apm links

List all of the symlinked atom packages in ~/.atom/packages and
~/.atom/dev/packages.

Options:
  -h, --help  Print this usage message
`
  }

  getDevPackagePath(packageName: string) {
    return path.join(this.atomDevPackagesDirectory, packageName)
  }

  getPackagePath(packageName: string) {
    return path.join(this.atomPackagesDirectory, packageName)
  }

  getSymlinks(directoryPath: string) {
    const symlinks: string[] = []
    for (const directory of fs.list(directoryPath)) {
      const symlinkPath = path.join(directoryPath, directory)
      if (fs.isSymbolicLinkSync(symlinkPath)) {
        symlinks.push(symlinkPath)
      }
    }
    return symlinks
  }

  logLinks(directoryPath: string) {
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

  run(_options: CliOptions, callback: RunCallback) {
    this.logLinks(this.atomDevPackagesDirectory)
    this.logLinks(this.atomPackagesDirectory)
    return callback()
  }
}
