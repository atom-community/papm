/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import path from "path"
import async from "async"
import yargs from "yargs"
import * as config from "./apm"
import Command from "./command"
import fs from "./fs"

export default class Dedupe extends Command {
  constructor() {
    super()
    this.atomDirectory = config.getAtomDirectory()
    this.atomPackagesDirectory = path.join(this.atomDirectory, "packages")
    this.atomNodeDirectory = path.join(this.atomDirectory, ".node-gyp")
    this.atomNpmPath = require.resolve("npm/bin/npm-cli")
  }

  parseOptions(argv) {
    const options = yargs(argv).wrap(Math.min(100, yargs.terminalWidth()))
    options.usage(`\

Usage: apm dedupe [<package_name>...]

Reduce duplication in the node_modules folder in the current directory.

This command is experimental.\
`)
    return options.alias("h", "help").describe("help", "Print this usage message")
  }

  dedupeModules(options, callback) {
    process.stdout.write("Deduping modules ")

    return this.forkDedupeCommand(options, (...args) => {
      return this.logCommandResults(callback, ...Array.from(args))
    })
  }

  forkDedupeCommand(options, callback) {
    const dedupeArgs = [
      "--globalconfig",
      config.getGlobalConfigPath(),
      "--userconfig",
      config.getUserConfigPath(),
      "dedupe",
    ]
    dedupeArgs.push(...Array.from(this.getNpmBuildFlags() || []))
    if (options.argv.silent) {
      dedupeArgs.push("--silent")
    }
    if (options.argv.quiet) {
      dedupeArgs.push("--quiet")
    }

    for (const packageName of options.argv._) {
      dedupeArgs.push(packageName)
    }

    fs.makeTreeSync(this.atomDirectory)

    const env = { ...process.env, HOME: this.atomNodeDirectory, RUSTUP_HOME: config.getRustupHomeDirPath() }
    this.addBuildEnvVars(env)

    const dedupeOptions = { env }
    if (options.cwd) {
      dedupeOptions.cwd = options.cwd
    }

    return this.fork(this.atomNpmPath, dedupeArgs, dedupeOptions, callback)
  }

  createAtomDirectories() {
    fs.makeTreeSync(this.atomDirectory)
    return fs.makeTreeSync(this.atomNodeDirectory)
  }

  run(options, callback) {
    const { cwd } = options
    options = this.parseOptions(options.commandArgs)
    options.cwd = cwd

    this.createAtomDirectories()

    const commands = []
    commands.push((callback) => this.loadInstalledAtomMetadata(callback))
    commands.push((callback) => this.dedupeModules(options, callback))
    return async.waterfall(commands, callback)
  }
}
