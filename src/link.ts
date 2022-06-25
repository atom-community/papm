/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS104: Avoid inline assignments
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import path from "path"
import CSON from "season"
import Command from "./command"
import * as config from "./apm"
import fs from "./fs"
import type { CliOptions, RunCallback } from "./apm-cli"
import mri from "mri"

export default class Link extends Command {
  parseOptions(argv: string[]) {
    return mri<{
      help: boolean
      dev: boolean
      name: string
      _: string[]
    }>(argv, {
      alias: { h: "help", d: "dev" },
      boolean: ["help", "dev"],
      string: ["name"],
    })
  }

  help() {
    return `Usage: apm link [<package_path>] [--name <package_name>]

Create a symlink for the package in ~/.atom/packages. The package in the
current working directory is linked if no path is given.

Run \`apm links\` to view all the currently linked packages.

Options:
  --name      package name                                                                 [string]
  -h, --help  Print this usage message
  -d, --dev   Link to ~/.atom/dev/packages                                                 [boolean]
`
  }

  run(givenOptions: CliOptions, callback: RunCallback) {
    let left: string, targetPath: string
    const options = this.parseOptions(givenOptions.commandArgs)

    const packagePath = (left = options._[0]?.toString()) != null ? left : "."
    const linkPath = path.resolve(process.cwd(), packagePath)

    let packageName = options.name
    try {
      if (!packageName) {
        packageName = CSON.readFileSync(CSON.resolve(path.join(linkPath, "package"))).name
      }
    } catch (error1) {
      /* ignore error */
    }
    if (!packageName) {
      packageName = path.basename(linkPath)
    }

    if (options.dev) {
      targetPath = path.join(config.getAtomDirectory(), "dev", "packages", packageName)
    } else {
      targetPath = path.join(config.getAtomDirectory(), "packages", packageName)
    }

    if (!fs.existsSync(linkPath)) {
      callback(`Package directory does not exist: ${linkPath}`)
      return
    }

    try {
      if (fs.isSymbolicLinkSync(targetPath)) {
        fs.unlinkSync(targetPath)
      }
      fs.makeTreeSync(path.dirname(targetPath))
      fs.symlinkSync(linkPath, targetPath, "junction")
      console.log(`${targetPath} -> ${linkPath}`)
      return callback()
    } catch (error) {
      return callback(`Linking ${targetPath} to ${linkPath} failed: ${error.message}`)
    }
  }
}
