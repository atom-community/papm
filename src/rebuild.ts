/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import * as config from "./apm"
import Command from "./command"
import fs from "./fs"
import type { CliOptions, RunCallback } from "./apm-cli"
import mri from "mri"

export default class Rebuild extends Command {
  parseOptions(argv: string[]) {
    return mri<{
      help: boolean
      _: string[]
    }>(argv, {
      alias: { h: "help" },
      boolean: ["help"],
    })
  }

  help() {
    return `Usage: apm rebuild [<name> [<name> ...]]

Rebuild the given modules currently installed in the node_modules folder
in the current working directory.

All the modules will be rebuilt if no module names are specified.

Options:
  -h, --help  Print this usage message
`
  }

  forkNpmRebuild(options: ReturnType<Rebuild["parseOptions"]>, callback) {
    process.stdout.write("Rebuilding modules ")

    const rebuildArgs = [
      "--globalconfig",
      config.getGlobalConfigPath(),
      "--userconfig",
      config.getUserConfigPath(),
      "rebuild",
    ]
    rebuildArgs.push(...this.getNpmBuildFlags())
    rebuildArgs.push(...options._)

    fs.makeTreeSync(this.atomDirectory)

    const env = { ...process.env, HOME: this.atomNodeDirectory, RUSTUP_HOME: config.getRustupHomeDirPath() }
    this.addBuildEnvVars(env)

    return this.fork(this.atomNpmPath, rebuildArgs, { env }, callback)
  }

  run(givenOptions: CliOptions, callback: RunCallback) {
    const options = this.parseOptions(givenOptions.commandArgs)

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
