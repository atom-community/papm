import Command, { LogCommandResultsArgs } from "./command"
import type { CliOptions, RunCallback } from "./apm-cli"
import mri from "mri"

export default class Clean extends Command {
  parseOptions(argv: string[]) {
    return mri<{ help: boolean }>(argv, {
      alias: { h: "help" },
      boolean: "help",
    })
  }

  help() {
    return `\
Usage: apm clean

Deletes all packages in the node_modules folder that are not referenced
as a dependency in the package.json file.

Options
-h, --help Print this usage message
`
  }

  run(_options: CliOptions, callback: RunCallback) {
    process.stdout.write("Removing extraneous modules ")
    return this.fork(this.atomNpmPath, ["prune"], (...args: LogCommandResultsArgs) => {
      return this.logCommandResults(callback, ...args)
    })
  }
}
