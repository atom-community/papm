/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import async from "async"
import * as config from "./apm"
import Command, { LogCommandResultsArgs, SpawnArgs } from "./command"
import fs from "./fs"
import type { CliOptions, RunCallback } from "./apm-cli"
import mri from "mri"

export default class Dedupe extends Command {
  parseOptions(argv: string[]) {
    return mri<{
      help: boolean
      silent: boolean
      quiet: boolean
      _: string[]

      // added later
      cwd: string
    }>(argv, {
      alias: { h: "help" },
      boolean: ["help", "silent", "quiet"],
    })
  }

  help() {
    return `Usage: apm dedupe [<package_name>...]

Reduce duplication in the node_modules folder in the current directory.

This command is experimental.

Options:
  -h, --help  Print this usage message
  --silent
  --quiet
`
  }

  dedupeModules(
    options: ReturnType<Dedupe["parseOptions"]>,
    packageNames: string[],
    callback: (error?: string) => void
  ) {
    process.stdout.write("Deduping modules ")

    return this.forkDedupeCommand(options, packageNames, (...args: LogCommandResultsArgs) => {
      return this.logCommandResults(callback, ...args)
    })
  }

  forkDedupeCommand(options: ReturnType<Dedupe["parseOptions"]>, packageNames: string[], callback: SpawnArgs) {
    const dedupeArgs = [
      "--globalconfig",
      config.getGlobalConfigPath(),
      "--userconfig",
      config.getUserConfigPath(),
      "dedupe",
    ]
    dedupeArgs.push(...Array.from(this.getNpmBuildFlags() || []))
    if (options.silent) {
      dedupeArgs.push("--silent")
    }
    if (options.quiet) {
      dedupeArgs.push("--quiet")
    }

    for (const packageName of packageNames) {
      dedupeArgs.push(packageName)
    }

    fs.makeTreeSync(this.atomDirectory)

    const env = { ...process.env, HOME: this.atomNodeDirectory, RUSTUP_HOME: config.getRustupHomeDirPath() }
    this.addBuildEnvVars(env)

    const dedupeOptions: Record<string, string | undefined> = { env }
    if (options.cwd) {
      dedupeOptions.cwd = options.cwd
    }

    return this.fork(this.atomNpmPath, dedupeArgs, dedupeOptions, callback)
  }

  createAtomDirectories() {
    fs.makeTreeSync(this.atomDirectory)
    return fs.makeTreeSync(this.atomNodeDirectory)
  }

  run(givenOptions: CliOptions, callback: RunCallback) {
    const options = this.parseOptions(givenOptions.commandArgs)
    const packageNames = this.packageNamesFromArgv(options)

    this.createAtomDirectories()

    const commands = []
    commands.push((callback) => this.loadInstalledAtomMetadata(callback))
    commands.push((callback) => this.dedupeModules(options, packageNames, callback))
    return async.waterfall(commands, callback)
  }
}
