/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS104: Avoid inline assignments
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import fs from "fs"
import path from "path"
import async from "async"
import * as config from "./apm"
import Command, { LogCommandResultsArgs } from "./command"
import Install from "./install"
import * as git from "./git"
import Link from "./link"
import * as request from "./request"
import { PackageMetadata, unkownPackage } from "./packages"
import type { CliOptions, RunCallback } from "./apm-cli"
import mri from "mri"

export default class Develop extends Command {
  parseOptions(argv: string[]) {
    return mri<{ help: boolean; json: boolean; _: string[] }>(argv, {
      alias: { h: "help" },
      boolean: ["help", "json"],
    })
  }

  help() {
    return `Usage: apm develop <package_name> [<directory>]

Clone the given package's Git repository to the directory specified,
install its dependencies, and link it for development to
~/.atom/dev/packages/<package_name>.

If no directory is specified then the repository is cloned to
~/github/<package_name>. The default folder to clone packages into can
be overridden using the ATOM_REPOS_HOME environment variable.

Once this command completes you can open a dev window from atom using
cmd-shift-o to run the package out of the newly cloned repository.

Options:
  -h, --help  Print this usage message
  --json      Logging
`
  }

  getRepositoryUrl(packageName: string, callback) {
    const requestSettings = {
      url: `${config.getAtomPackagesUrl()}/${packageName}`,
      json: true,
    }
    return request.get(requestSettings, function (error, response, body: PackageMetadata = unkownPackage) {
      if (error != null) {
        return callback(`Request for package information failed: ${error.message}`)
      } else if (response.statusCode === 200) {
        const repositoryUrl = body.repository?.url
        if (repositoryUrl) {
          return callback(null, repositoryUrl)
        } else {
          return callback(`No repository URL found for package: ${packageName}`)
        }
      } else {
        const message = request.getErrorMessage(response, body)
        return callback(`Request for package information failed: ${message}`)
      }
    })
  }

  cloneRepository(
    repoUrl: string,
    packageDirectory: string,
    options: ReturnType<Develop["parseOptions"]>,
    callback: (err?: string) => any = function () {}
  ) {
    return config.getSetting("git", (command) => {
      if (command == null) {
        command = "git"
      }
      const args = ["clone", "--recursive", repoUrl, packageDirectory]
      if (!options.json) {
        process.stdout.write(`Cloning ${repoUrl} `)
      }
      git.addGitToEnv(process.env)
      return this.spawn(command, args, (...logargs: LogCommandResultsArgs) => {
        if (options.json) {
          return this.logCommandResultsIfFail(callback, ...logargs)
        } else {
          return this.logCommandResults(callback, ...logargs)
        }
      })
    })
  }

  installDependencies(packageDirectory: string, options: CliOptions, callback = function () {}) {
    process.chdir(packageDirectory)
    const installOptions = { ...options } as CliOptions

    return new Install().run(installOptions, callback)
  }

  linkPackage(packageDirectory: string, options, callback = function () {}) {
    const linkOptions = { ...options }
    linkOptions.commandArgs = [packageDirectory, "--dev"]
    return new Link().run(linkOptions, callback)
  }

  run(givenOptions: CliOptions, callback: RunCallback) {
    const options = this.parseOptions(givenOptions.commandArgs)
    const packageNames = this.packageNamesFromArgv(options)
    if (packageNames.length === 0) {
      return callback("One package name should be specified")
    }
    const packageName = packageNames[0]
    const packageDirectory = path.resolve(
      packageNames[1] ? packageNames[1] : path.join(config.getReposDirectory(), packageName)
    )

    if (fs.existsSync(packageDirectory)) {
      return this.linkPackage(packageDirectory, givenOptions, callback)
    } else {
      return this.getRepositoryUrl(packageName, (error, repoUrl: string) => {
        if (error != null) {
          return callback(error)
        } else {
          const tasks = []
          tasks.push((cb) => this.cloneRepository(repoUrl, packageDirectory, options, cb))

          tasks.push((cb) => this.installDependencies(packageDirectory, givenOptions, cb))

          tasks.push((cb) => this.linkPackage(packageDirectory, givenOptions, cb))

          return async.waterfall(tasks, callback)
        }
      })
    }
  }
}
