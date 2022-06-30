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
import List from "./list"
import type { CliOptions, RunCallback } from "./apm-cli"
import mri from "mri"

export default class Disable extends Command {
  parseOptions(argv: string[]) {
    return mri<{ help: boolean; _: string[] }>(argv, {
      alias: { h: "help" },
      boolean: "help",
    })
  }

  help() {
    return `\

Usage: apm disable [<package_name>]...

Disables the named package(s).

Options
-h, --help Print this usage message
`
  }

  getInstalledPackages(callback) {
    const options = {
      argv: {
        theme: false,
        bare: true,
      },
    }

    const lister = new List()
    return lister.listBundledPackages(options, (error, core_packages) =>
      lister.listDevPackages(options, (error, dev_packages) =>
        lister.listUserPackages(options, (error, user_packages) =>
          callback(null, core_packages.concat(dev_packages, user_packages))
        )
      )
    )
  }

  run(givenOptions: CliOptions, callback: RunCallback) {
    let settings
    const options = this.parseOptions(givenOptions.commandArgs)
    let packageNames = this.packageNamesFromArgv(options)

    const configFilePath = CSON.resolve(path.join(config.getAtomDirectory(), "config"))
    if (!configFilePath) {
      callback("Could not find config.cson. Run Atom first?")
      return
    }

    try {
      settings = CSON.readFileSync(configFilePath)
    } catch (error) {
      callback(`Failed to load \`${configFilePath}\`: ${error.message}`)
      return
    }

    return this.getInstalledPackages((error, installedPackages) => {
      let left
      if (error) {
        return callback(error)
      }

      const installedPackageNames = installedPackages.map((pkg) => pkg.name)

      // uninstalledPackages = (name for name in packageNames when !installedPackageNames[name])
      const uninstalledPackageNames = _.difference(packageNames, installedPackageNames)
      if (uninstalledPackageNames.length > 0) {
        console.log(`Not Installed:\n  ${uninstalledPackageNames.join("\n  ")}`)
      }

      // only installed packages can be disabled
      packageNames = _.difference(packageNames, uninstalledPackageNames)

      if (packageNames.length === 0) {
        callback("Please specify a package to disable")
        return
      }

      const keyPath = "*.core.disabledPackages"
      const disabledPackages = (left = _.valueForKeyPath(settings, keyPath)) != null ? left : []
      const result = _.union(disabledPackages, packageNames)
      _.setValueForKeyPath(settings, keyPath, result)

      try {
        CSON.writeFileSync(configFilePath, settings)
      } catch (error2) {
        error = error2
        callback(`Failed to save \`${configFilePath}\`: ${error.message}`)
        return
      }

      console.log(`Disabled:\n  ${packageNames.join("\n  ")}`)
      this.logSuccess()
      return callback()
    })
  }
}
