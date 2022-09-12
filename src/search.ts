/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import * as _ from "@aminya/underscore-plus"
import Command from "./command"
import * as config from "./apm"
import * as request from "./request"
import { tree } from "./tree"
import { isDeprecatedPackage } from "./deprecated-packages"
import type { CliOptions, RunCallback } from "./apm-cli"
import { PackageData } from "./stars"
import mri from "mri"

export default class Search extends Command {
  parseOptions(argv: string[]) {
    return mri<{ help: boolean; json: boolean; packages: boolean; themes: boolean }>(argv, {
      alias: { h: "help" },
      boolean: ["help", "json", "packages", "themes"],
    })
  }

  help() {
    return `Usage: apm search <package_name>

Search for Atom packages/themes on the atom.io registry.

Options:
  --json          Output matching packages as JSON array                                   [boolean]
  -h, --help      Print this usage message
  -p, --packages  Search only non-theme packages                                           [boolean]
  -t, --themes    Search only themes                                                       [boolean]
`
  }

  searchPackages(
    query: string,
    opts: ReturnType<Search["parseOptions"]>,
    callback: (error?: string, packages?: PackageData[]) => any
  ) {
    const qs: { q: string; filter?: string } = { q: query }

    if (opts.packages) {
      qs.filter = "package"
    } else if (opts.themes) {
      qs.filter = "theme"
    }

    const requestSettings = {
      url: `${config.getAtomPackagesUrl()}/search`,
      qs,
      json: true,
    }

    return request.get(requestSettings, function (error, response, body = {}) {
      if (error != null) {
        return callback(error)
      } else if (response.statusCode === 200) {
        let packages = body.filter((pack) => pack.releases?.latest != null)
        packages = packages.map(({ readme, metadata, downloads, stargazers_count }) => ({
          ...metadata,
          readme,
          downloads,
          stargazers_count,
        }))
        packages = packages.filter(({ name, version }) => !isDeprecatedPackage(name, version))
        return callback(null, packages)
      } else {
        const message = request.getErrorMessage(response, body)
        return callback(`Searching packages failed: ${message}`)
      }
    })
  }

  run(givenOptions: CliOptions, callback: RunCallback) {
    const options = this.parseOptions(givenOptions.commandArgs)
    const query = options._[0]

    if (!query) {
      callback("Missing required search query")
      return
    }

    const searchOptions = {
      packages: options.packages,
      themes: options.themes,
    } as ReturnType<Search["parseOptions"]>

    return this.searchPackages(query, searchOptions, function (error, packages: PackageData[]) {
      if (error != null) {
        callback(error)
        return
      }

      if (options.json) {
        console.log(JSON.stringify(packages))
      } else {
        const heading = `Search Results For '${query}'`.cyan
        console.log(`${heading} (${packages.length})`)

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
    })
  }
}
