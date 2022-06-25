/*
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import open from "open"
import View from "./view"
import type { CliOptions, RunCallback } from "./apm-cli"
import mri from "mri"

export default class Docs extends View {
  parseOptions(argv: string[]) {
    return mri<{ help: boolean; print: boolean; _: string[] }>(argv, {
      alias: { h: "help", p: "print" },
      boolean: ["help", "print"],
    })
  }

  help() {
    return `\

Usage: apm docs [options] <package_name>

Open a package's homepage in the default browser.

Options
-p, --print Print the URL instead of opening it
`
  }

  openRepositoryUrl(repositoryUrl) {
    return open(repositoryUrl)
  }

  run(givenOptions: CliOptions, callback: RunCallback) {
    const options = this.parseOptions(givenOptions.commandArgs)
    const packageNames = this.packageNamesFromArgv(options)

    if (packageNames.length !== 1) {
      return callback("One package name should be specified")
    }
    const packageName = packageNames[0]

    return this.getPackage(packageName, givenOptions, (error, pack) => {
      let repository
      if (error != null) {
        return callback(error)
      }

      if ((repository = this.getRepository(pack))) {
        if (options.print) {
          console.log(repository)
        } else {
          this.openRepositoryUrl(repository)
        }
        return callback()
      } else {
        return callback(`Package \"${packageName}\" does not contain a repository URL`)
      }
    })
  }
}
