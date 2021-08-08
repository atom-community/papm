/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import path from "path"
import yargs from "yargs"
import * as config from "./apm"
import Command from "./command"
import fs from "./fs"

export default class Rebuild extends Command {
  constructor() {
    super()
    this.atomDirectory = config.getAtomDirectory()
    this.atomNodeDirectory = path.join(this.atomDirectory, ".node-gyp")
    this.atomNpmPath = require.resolve("npm/bin/npm-cli")
  }

  parseOptions(argv) {
    const options = yargs(argv).wrap(Math.min(100, yargs.terminalWidth()))
    options.usage(`\

Usage: apm rebuild [<name> [<name> ...]]

Rebuild the given modules currently installed in the node_modules folder
in the current working directory.

All the modules will be rebuilt if no module names are specified.\
`)
    return options.alias("h", "help").describe("help", "Print this usage message")
  }

  forkNpmRebuild(options, callback) {
    process.stdout.write("Rebuilding modules ")

    const rebuildArgs = [
      "--globalconfig",
      config.getGlobalConfigPath(),
      "--userconfig",
      config.getUserConfigPath(),
      "rebuild",
    ]
    rebuildArgs.push(...Array.from(this.getNpmBuildFlags() || []))
    rebuildArgs.push(...Array.from(options.argv._ || []))

    fs.makeTreeSync(this.atomDirectory)

    const env = { ...process.env, HOME: this.atomNodeDirectory, RUSTUP_HOME: config.getRustupHomeDirPath() }
    this.addBuildEnvVars(env)

    return this.fork(this.atomNpmPath, rebuildArgs, { env }, callback)
  }

  run(options, callback) {
    options = this.parseOptions(options.commandArgs)

    return config.loadNpm((error, npm) => {
      this.npm = npm
      return this.loadInstalledAtomMetadata(() => {
        return this.forkNpmRebuild(options, (code, stderr = "") => {
          if (code === 0) {
            this.logSuccess()
            return callback()
          } else {
            this.logFailure()
            return callback(stderr)
          }
        })
      })
    })
  }
}
