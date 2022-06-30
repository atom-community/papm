/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import path from "path"
import async from "async"
import CSON from "season"
import * as auth from "./auth"
import Command from "./command"
import * as config from "./apm"
import fs from "./fs"
import * as request from "./request"
import type { CliOptions, RunCallback } from "./apm-cli"
import mri from "mri"

type UninstallOptions = {
  packageName: string
  packageVersion: string
}

export default class Uninstall extends Command {
  parseOptions(argv: string[]) {
    return mri<{ help: boolean; dev: boolean; hard: boolean; _: string[] }>(argv, {
      alias: { h: "help", d: "dev" },
      boolean: ["help", "dev", "hard"],
    })
  }

  help() {
    return `Usage: apm uninstall <package_name>...

Delete the installed package(s) from the ~/.atom/packages directory.

Options:
  --hard      Uninstall from ~/.atom/packages and ~/.atom/dev/packages                     [boolean]
  -d, --dev   Uninstall from ~/.atom/dev/packages                                          [boolean]
  -h, --help  Print this usage message
`
  }

  getPackageVersion(packageDirectory: string): string | null {
    try {
      return CSON.readFileSync(path.join(packageDirectory, "package.json"))?.version
    } catch (error) {
      return null
    }
  }

  registerUninstall({ packageName, packageVersion }: UninstallOptions, callback: () => void) {
    if (!packageVersion) {
      return callback()
    }

    return auth.getToken(function (_error, token: string) {
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

  run(givenOptions: CliOptions, callback: RunCallback) {
    const options = this.parseOptions(givenOptions.commandArgs)
    const packageNames = this.packageNamesFromArgv(options)

    if (packageNames.length === 0) {
      callback("Please specify a package name to uninstall")
      return
    }

    const uninstallsToRegister: UninstallOptions[] = []
    let uninstallError: Error | null = null

    for (let packageName of packageNames) {
      if (packageName === ".") {
        packageName = path.basename(process.cwd())
      }
      process.stdout.write(`Uninstalling ${packageName} `)
      try {
        let packageDirectory: string
        if (!options.dev) {
          packageDirectory = path.join(this.atomPackagesDirectory, packageName)
          const packageManifestPath = path.join(packageDirectory, "package.json")
          if (fs.existsSync(packageManifestPath)) {
            const packageVersion = this.getPackageVersion(packageDirectory)
            fs.removeSync(packageDirectory)
            if (packageVersion) {
              uninstallsToRegister.push({ packageName, packageVersion })
            }
          } else if (!options.hard) {
            throw new Error(`No package.json found at ${packageManifestPath}`)
          }
        }

        if (options.hard || options.dev) {
          packageDirectory = path.join(this.atomDevPackagesDirectory, packageName)
          if (fs.existsSync(packageDirectory)) {
            fs.removeSync(packageDirectory)
          } else if (!options.hard) {
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
