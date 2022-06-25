/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS104: Avoid inline assignments
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import * as _ from "@aminya/underscore-plus"
import path from "path"
import CSON from "season"
import * as config from "./apm"
import Command from "./command"
import type { CliOptions, RunCallback } from "./apm-cli"
import mri from "mri"

export default class Enable extends Command {
  parseOptions(argv: string[]) {
    return mri<{ help: boolean; _: string[] }>(argv, {
      alias: { h: "help" },
      boolean: "help",
    })
  }

  help() {
    return `\

Usage: apm enable [<package_name>]...

Enables the named package(s).

Options
-p, --print Print the URL instead of opening it
`
  }

  run(givenOptions: CliOptions, callback: RunCallback) {
    let error: Error, left, settings
    const options = this.parseOptions(givenOptions.commandArgs)
    let packageNames = this.packageNamesFromArgv(options)

    const configFilePath = CSON.resolve(path.join(config.getAtomDirectory(), "config"))
    if (!configFilePath) {
      callback("Could not find config.cson. Run Atom first?")
      return
    }

    try {
      settings = CSON.readFileSync(configFilePath)
    } catch (error1) {
      error = error1 as Error
      callback(`Failed to load \`${configFilePath}\`: ${error.message}`)
      return
    }

    const keyPath = "*.core.disabledPackages"
    const disabledPackages = (left = _.valueForKeyPath(settings, keyPath)) != null ? left : []

    const errorPackages = _.difference(packageNames, disabledPackages)
    if (errorPackages.length > 0) {
      console.log(`Not Disabled:\n  ${errorPackages.join("\n  ")}`)
    }

    // can't enable a package that isn't disabled
    packageNames = _.difference(packageNames, errorPackages)

    if (packageNames.length === 0) {
      callback("Please specify a package to enable")
      return
    }

    const result = _.difference(disabledPackages, packageNames)
    _.setValueForKeyPath(settings, keyPath, result)

    try {
      CSON.writeFileSync(configFilePath, settings)
    } catch (error2) {
      error = error2 as Error
      callback(`Failed to save \`${configFilePath}\`: ${error.message}`)
      return
    }

    console.log(`Enabled:\n  ${packageNames.join("\n  ")}`)
    this.logSuccess()
    return callback()
  }
}
