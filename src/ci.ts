/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import fs from "./fs"
import yargs from "yargs"
import async from "async"
import * as config from "./apm"
import Command, { LogCommandResultsArgs, SpawnArgs } from "./command"
import type { CliOptions, RunCallback } from "./apm-cli"

export default class Ci extends Command {
  parseOptions(argv: string[]) {
    const options = yargs(argv).wrap(Math.min(100, yargs.terminalWidth()))
    options.usage(`\
Usage: apm ci

Install a package with a clean slate.

If you have an up-to-date package-lock.json file created by apm install,
apm ci will install its locked contents exactly. It is substantially
faster than apm install and produces consistently reproduceable builds,
but cannot be used to install new packages or dependencies.\
`)

    options.alias("h", "help").describe("help", "Print this usage message")
    return options.boolean("verbose").default("verbose", false).describe("verbose", "Show verbose debug information")
  }

  installModules(options: CliOptions, callback: (error?: string) => void) {
    process.stdout.write("Installing locked modules")
    if (options.argv.verbose) {
      process.stdout.write("\n")
    } else {
      process.stdout.write(" ")
    }

    const installArgs = [
      "ci",
      "--globalconfig",
      config.getGlobalConfigPath(),
      "--userconfig",
      config.getUserConfigPath(),
      ...Array.from(this.getNpmBuildFlags()),
    ]
    if (options.argv.verbose) {
      installArgs.push("--verbose")
    }

    fs.makeTreeSync(this.atomDirectory)

    const env = { ...process.env, HOME: this.atomNodeDirectory, RUSTUP_HOME: config.getRustupHomeDirPath() }
    this.addBuildEnvVars(env)

    const installOptions: SpawnArgs = { env, streaming: options.argv.verbose }

    return this.fork(this.atomNpmPath, installArgs, installOptions, (...args: LogCommandResultsArgs) => {
      return this.logCommandResults(callback, ...args)
    })
  }

  run(options: CliOptions, callback: RunCallback) {
    const opts = this.parseOptions(options.commandArgs)

    const commands = []
    commands.push((callback) => {
      return config.loadNpm((error, npm) => {
        this.npm = npm
        return callback(error)
      })
    })
    commands.push((cb) => this.loadInstalledAtomMetadata(cb))
    commands.push((cb) => this.installModules(opts, cb))

    const iteratee = (item, next) => item(next)
    return async.mapSeries(commands, iteratee, function (err) {
      if (err) {
        return callback(err)
      }
      return callback(null)
    })
  }
}
