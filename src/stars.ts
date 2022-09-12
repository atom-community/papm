/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import * as _ from "@aminya/underscore-plus"
import Command from "./command"
import * as config from "./apm"
import Install from "./install"
import Login from "./login"
import * as request from "./request"
import { tree } from "./tree"
import type { CliOptions, RunCallback } from "./apm-cli"
import { Options } from "request"
import { PackageMetadata } from "./packages"
import mri from "mri"

export type PackageData = {
  name: string
  description: string
  readme: string
  metadata?: PackageMetadata
  downloads: number
  stargazers_count: number
  releases?: {
    latest?: string
  }
  versions: PackageMetadata[]
  theme?: boolean
}

export default class Stars extends Command {
  parseOptions(argv: string[]) {
    return mri<{ help: boolean; json: boolean; install: boolean; themes: boolean; compatible: boolean; user: string }>(
      argv,
      {
        alias: { h: "help", i: "install", t: "themes", u: "user" },
        boolean: ["help", "json", "install", "themes", "compatible"],
        string: ["user"],
      }
    )
  }

  help() {
    return `Usage: apm stars
       apm stars --install
       apm stars --user thedaniel
       apm stars --themes

List or install starred Atom packages and themes.

Options:
  --json         Output packages as a JSON array                                           [boolean]
  -h, --help     Print this usage message
  -i, --install  Install the starred packages                                              [boolean]
  -t, --themes   Only list themes                                                          [boolean]
  -u, --user     GitHub username to show starred packages for                               [string]
  --compatible                                                                             [boolean]
`
  }

  getStarredPackages(
    user: string,
    atomVersion: boolean,
    callback:
      | ((error: string, token?: string) => Promise<void>)
      | ((error: string | undefined, packages?: PackageData[]) => Promise<void>)
  ) {
    const requestSettings: Options = { json: true, url: undefined }
    if (atomVersion) {
      requestSettings.qs = { engine: atomVersion }
    }

    if (user) {
      requestSettings.url = `${config.getAtomApiUrl()}/users/${user}/stars`
      return this.requestStarredPackages(requestSettings, callback)
    } else {
      requestSettings.url = `${config.getAtomApiUrl()}/stars`
      return Login.getTokenOrLogin((error, token) => {
        if (error != null) {
          return callback(error)
        }

        requestSettings.headers = { authorization: token }
        return this.requestStarredPackages(requestSettings, callback)
      })
    }
  }

  requestStarredPackages(
    requestSettings: Options & { retries?: number },
    callback: (error: string, data?: any) => void
  ) {
    return request.get(requestSettings, function (error, response, body: PackageData[] = []) {
      if (error != null) {
        return callback(error)
      } else if (response.statusCode === 200) {
        let packages = body.filter((pack) => pack?.releases?.latest != null)
        packages = packages.map(({ readme, metadata, downloads, stargazers_count }) => ({
          ...metadata,
          readme,
          downloads,
          stargazers_count,
        })) as PackageData[]
        packages = _.sortBy(packages, "name")
        return callback(null, packages)
      } else {
        const message = request.getErrorMessage(response, body)
        return callback(`Requesting packages failed: ${message}`)
      }
    })
  }

  installPackages(packages: PackageData[], callback: (error?: string | Error) => any) {
    if (packages.length === 0) {
      return callback()
    }

    const commandArgs = packages.map(({ name }) => name)
    return new Install().run({ commandArgs }, callback)
  }

  logPackagesAsJson(packages, callback) {
    console.log(JSON.stringify(packages))
    return callback()
  }

  logPackagesAsText(user, packagesAreThemes, packages: PackageData[], callback) {
    let label
    const userLabel = user != null ? user : "you"
    if (packagesAreThemes) {
      label = `Themes starred by ${userLabel}`
    } else {
      label = `Packages starred by ${userLabel}`
    }
    console.log(`${label.cyan} (${packages.length})`)

    tree(packages, {}, function ({ name, description, downloads, stargazers_count }) {
      label = name.yellow
      if (process.platform === "darwin") {
        label = `\u2B50  ${label}`
      }
      if (description) {
        label += ` ${description.replace(/\s+/g, " ")}`
      }
      if (downloads >= 0 && stargazers_count >= 0) {
        label += ` (${_.pluralize(downloads, "download")}, ${_.pluralize(stargazers_count, "star")})`.grey
      }
      return label
    })

    console.log()
    console.log(
      `Use \`apm stars --install\` to install them all or visit ${
        "http://atom.io/packages".underline
      } to read more about them.`
    )
    console.log()
    return callback()
  }

  run(givenOptions: CliOptions, callback: RunCallback) {
    const options = this.parseOptions(givenOptions.commandArgs)

    const user = options.user?.toString().trim()

    return this.getStarredPackages(user, options.compatible, (error: string | undefined, packages: PackageData[]) => {
      if (error != null) {
        return callback(error)
      }

      if (options.themes) {
        packages = packages.filter(({ theme }) => theme)
      }

      if (options.install) {
        return this.installPackages(packages, callback)
      } else if (options.json) {
        return this.logPackagesAsJson(packages, callback)
      } else {
        return this.logPackagesAsText(user, options.themes, packages, callback)
      }
    })
  }
}
