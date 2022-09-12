/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS104: Avoid inline assignments
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import path from "path"
import * as _ from "@aminya/underscore-plus"
import async from "async"
import CSON from "season"
import * as config from "./apm"
import Command from "./command"
import fs from "./fs"
import Login from "./login"
import * as Packages from "./packages"
import * as request from "./request"
import type { CliOptions, RunCallback } from "./apm-cli"
import mri from "mri"

type StarOptions = {
  ignoreUnpublishedPackages: boolean
  token: string
}

export default class Star extends Command {
  parseOptions(argv: string[]) {
    return mri<{ help: boolean; installed: boolean; _: string[] }>(argv, {
      alias: { h: "help" },
      boolean: ["help", "installed"],
    })
  }

  help() {
    return `Usage: apm star <package_name>...

Star the given packages on https://atom.io

Run \`apm stars\` to see all your starred packages.

Options:
  --installed  Star all packages in ~/.atom/packages                                       [boolean]
  -h, --help   Print this usage message
`
  }

  starPackage(packageName: string, starOptions: StarOptions | {} = {}, callback: (err?: string) => void) {
    const ignoreUnpublishedPackages =
      "ignoreUnpublishedPackages" in starOptions ? starOptions.ignoreUnpublishedPackages : undefined
    const token = "token" in starOptions ? starOptions.token : undefined

    if (process.platform === "darwin") {
      process.stdout.write("\u2B50  ")
    }
    process.stdout.write(`Starring ${packageName} `)
    const requestSettings = {
      json: true,
      url: `${config.getAtomPackagesUrl()}/${packageName}/star`,
      headers: {
        authorization: token,
      },
    }
    return request.post(requestSettings, (error, response, body = {}) => {
      if (error != null) {
        this.logFailure()
        return callback(error)
      } else if (response.statusCode === 404 && ignoreUnpublishedPackages) {
        process.stdout.write("skipped (not published)\n".yellow)
        return callback()
      } else if (response.statusCode !== 200) {
        this.logFailure()
        const message = request.getErrorMessage(response, body)
        return callback(`Starring package failed: ${message}`)
      } else {
        this.logSuccess()
        return callback()
      }
    })
  }

  getInstalledPackageNames(): string[] {
    const installedPackages: string[] = []
    const userPackagesDirectory = path.join(config.getAtomDirectory(), "packages")
    for (const child of fs.list(userPackagesDirectory)) {
      let manifestPath: string
      if (!fs.isDirectorySync(path.join(userPackagesDirectory, child))) {
        continue
      }

      if ((manifestPath = CSON.resolve(path.join(userPackagesDirectory, child, "package")))) {
        try {
          const metadata: Packages.PackageMetadata | {} = CSON.readFileSync(manifestPath) || {}
          if ("name" in metadata && Packages.getRepository(metadata)) {
            installedPackages.push(metadata.name)
          }
        } catch (error) {
          /* ignore error */
        }
      }
    }

    return _.uniq(installedPackages)
  }

  run(givenOptions: CliOptions, callback: RunCallback) {
    const options = this.parseOptions(givenOptions.commandArgs)

    let packageNames: string[]
    if (options.installed) {
      packageNames = this.getInstalledPackageNames()
      if (packageNames.length === 0) {
        callback()
        return
      }
    } else {
      packageNames = this.packageNamesFromArgv(options)
      if (packageNames.length === 0) {
        callback("Please specify a package name to star")
        return
      }
    }

    return Login.getTokenOrLogin((error, token) => {
      if (error != null) {
        return callback(error)
      }

      const starOptions = {
        ignoreUnpublishedPackages: options.installed,
        token,
      }

      const commands = packageNames.map((packageName) => {
        return (callback) => this.starPackage(packageName, starOptions, callback)
      })
      return async.waterfall(commands, callback)
    })
  }
}
