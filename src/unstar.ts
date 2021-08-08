/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS104: Avoid inline assignments
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import async from "async"
import yargs from "yargs"
import * as config from "./apm"
import Command from "./command"
import Login from "./login"
import * as request from "./request"

export default class Unstar extends Command {
  parseOptions(argv) {
    const options = yargs(argv).wrap(Math.min(100, yargs.terminalWidth()))
    options.usage(`\

Usage: apm unstar <package_name>...

Unstar the given packages on https://atom.io

Run \`apm stars\` to see all your starred packages.\
`)
    return options.alias("h", "help").describe("help", "Print this usage message")
  }

  starPackage(packageName, token, callback) {
    if (process.platform === "darwin") {
      process.stdout.write("\uD83D\uDC5F \u2B50  ")
    }
    process.stdout.write(`Unstarring ${packageName} `)
    const requestSettings = {
      json: true,
      url: `${config.getAtomPackagesUrl()}/${packageName}/star`,
      headers: {
        authorization: token,
      },
    }
    return request.del(requestSettings, (error, response, body = {}) => {
      if (error != null) {
        this.logFailure()
        return callback(error)
      } else if (response.statusCode !== 204) {
        let left
        this.logFailure()
        const message = (left = body.message != null ? body.message : body.error) != null ? left : body
        return callback(`Unstarring package failed: ${message}`)
      } else {
        this.logSuccess()
        return callback()
      }
    })
  }

  run(options, callback) {
    options = this.parseOptions(options.commandArgs)
    const packageNames = this.packageNamesFromArgv(options.argv)

    if (packageNames.length === 0) {
      callback("Please specify a package name to unstar")
      return
    }

    return Login.getTokenOrLogin((error, token) => {
      if (error != null) {
        return callback(error)
      }

      const commands = packageNames.map((packageName) => {
        return (callback) => this.starPackage(packageName, token, callback)
      })
      return async.waterfall(commands, callback)
    })
  }
}
