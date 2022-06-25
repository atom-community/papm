/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import * as _ from "@aminya/underscore-plus"
import Command from "./command"
import * as config from "./apm"
import * as request from "./request"
import { tree } from "./tree"
import type { CliOptions, RunCallback } from "./apm-cli"
import { PackageData } from "./stars"
import mri from "mri"

export default class Featured extends Command {
  parseOptions(argv: string[]) {
    return mri<{ help: boolean; print: boolean; themes: boolean; json: boolean; compatible: string }>(argv, {
      alias: { h: "help", p: "print", t: "themes", c: "compatible" },
      boolean: ["help", "print", "themes", "json"],
      string: ["compatible"],
    })
  }

  help() {
    return `\

Usage: apm featured
       apm featured --themes
       apm featured --compatible 0.49.0

List the Atom packages and themes that are currently featured in the
atom.io registry.

Options
-t, --themes Only list themes
-c, --compatible Only list packages/themes compatible with this Atom version
--json Output featured packages as JSON array
-h, --help Print this usage message
`
  }

  getFeaturedPackagesByType(atomVersion, packageType, callback) {
    if (typeof atomVersion === "function") {
      ;[callback, atomVersion] = Array.from([atomVersion, null])
    }

    const requestSettings = {
      url: `${config.getAtomApiUrl()}/${packageType}/featured`,
      json: true,
    }
    if (atomVersion) {
      requestSettings.qs = { engine: atomVersion }
    }

    return request.get(requestSettings, function (error, response, body = []) {
      if (error != null) {
        return callback(error)
      } else if (response.statusCode === 200) {
        let packages = body.filter((pack) => pack?.releases?.latest != null)
        packages = packages.map(({ readme, metadata, downloads, stargazers_count }) => ({
          ...metadata,
          readme,
          downloads,
          stargazers_count,
        }))
        packages = _.sortBy(packages, "name")
        return callback(null, packages)
      } else {
        const message = request.getErrorMessage(response, body)
        return callback(`Requesting packages failed: ${message}`)
      }
    })
  }

  getAllFeaturedPackages(atomVersion, callback) {
    return this.getFeaturedPackagesByType(atomVersion, "packages", (error, packages) => {
      if (error != null) {
        return callback(error)
      }

      return this.getFeaturedPackagesByType(atomVersion, "themes", function (error, themes) {
        if (error != null) {
          return callback(error)
        }
        return callback(null, packages.concat(themes))
      })
    })
  }

  run(givenOptions: CliOptions, callback: RunCallback) {
    const options = this.parseOptions(givenOptions.commandArgs)

    const listCallback = function (error, packages: PackageData[]) {
      if (error != null) {
        return callback(error)
      }

      if (options.json) {
        console.log(JSON.stringify(packages))
      } else {
        if (options.themes) {
          console.log(`${"Featured Atom Themes".cyan} (${packages.length})`)
        } else {
          console.log(`${"Featured Atom Packages".cyan} (${packages.length})`)
        }

        tree(packages, {}, function ({ name, description, downloads, stargazers_count }) {
          let label = name.yellow
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
          `Use \`apm install\` to install them or visit ${"http://atom.io/packages".underline} to read more about them.`
        )
        console.log()
      }

      return callback()
    }

    if (options.themes) {
      return this.getFeaturedPackagesByType(options.compatible, "themes", listCallback)
    } else {
      return this.getAllFeaturedPackages(options.compatible, listCallback)
    }
  }
}
