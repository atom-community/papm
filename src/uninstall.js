/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import path from "path"
import async from "async"
import CSON from "season"
import yargs from "yargs"

import * as auth from "./auth"
import Command from "./command"
import * as config from "./apm"
import fs from "./fs"
import * as request from "./request"

export default class Uninstall extends Command {
  parseOptions(argv) {
    const options = yargs(argv).wrap(Math.min(100, yargs.terminalWidth()))
    options.usage(`\

Usage: apm uninstall <package_name>...

Delete the installed package(s) from the ~/.atom/packages directory.\
`)
    options.alias("h", "help").describe("help", "Print this usage message")
    options.alias("d", "dev").boolean("dev").describe("dev", "Uninstall from ~/.atom/dev/packages")
    return options.boolean("hard").describe("hard", "Uninstall from ~/.atom/packages and ~/.atom/dev/packages")
  }

  getPackageVersion(packageDirectory) {
    try {
      return CSON.readFileSync(path.join(packageDirectory, "package.json"))?.version
    } catch (error) {
      return null
    }
  }

  registerUninstall({ packageName, packageVersion }, callback) {
    if (!packageVersion) {
      return callback()
    }

    return auth.getToken(function (error, token) {
      if (!token) {
        return callback()
      }

      const requestOptions = {
        url: `${config.getAtomPackagesUrl()}/${packageName}/versions/${packageVersion}/events/uninstall`,
        json: true,
        headers: {
          authorization: token,
        },
      }

      return request.post(requestOptions, () => callback())
    })
  }

  run(options, callback) {
    options = this.parseOptions(options.commandArgs)
    const packageNames = this.packageNamesFromArgv(options.argv)

    if (packageNames.length === 0) {
      callback("Please specify a package name to uninstall")
      return
    }

    const packagesDirectory = path.join(config.getAtomDirectory(), "packages")
    const devPackagesDirectory = path.join(config.getAtomDirectory(), "dev", "packages")

    const uninstallsToRegister = []
    let uninstallError = null

    for (let packageName of packageNames) {
      if (packageName === ".") {
        packageName = path.basename(process.cwd())
      }
      process.stdout.write(`Uninstalling ${packageName} `)
      try {
        let packageDirectory
        if (!options.argv.dev) {
          packageDirectory = path.join(packagesDirectory, packageName)
          const packageManifestPath = path.join(packageDirectory, "package.json")
          if (fs.existsSync(packageManifestPath)) {
            const packageVersion = this.getPackageVersion(packageDirectory)
            fs.removeSync(packageDirectory)
            if (packageVersion) {
              uninstallsToRegister.push({ packageName, packageVersion })
            }
          } else if (!options.argv.hard) {
            throw new Error(`No package.json found at ${packageManifestPath}`)
          }
        }

        if (options.argv.hard || options.argv.dev) {
          packageDirectory = path.join(devPackagesDirectory, packageName)
          if (fs.existsSync(packageDirectory)) {
            fs.removeSync(packageDirectory)
          } else if (!options.argv.hard) {
            throw new Error("Does not exist")
          }
        }

        this.logSuccess()
      } catch (error) {
        this.logFailure()
        uninstallError = new Error(`Failed to delete ${packageName}: ${error.message}`)
        break
      }
    }

    return async.eachSeries(uninstallsToRegister, this.registerUninstall.bind(this), () => callback(uninstallError))
  }
}
