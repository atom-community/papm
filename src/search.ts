/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import * as _ from "@aminya/underscore-plus"
import yargs from "yargs"
import Command from "./command"
import * as config from "./apm"
import * as request from "./request"
import { tree } from "./tree"
import { isDeprecatedPackage } from "./deprecated-packages"

export default class Search extends Command {
  parseOptions(argv) {
    const options = yargs(argv).wrap(Math.min(100, yargs.terminalWidth()))
    options.usage(`\

Usage: apm search <package_name>

Search for Atom packages/themes on the atom.io registry.\
`)
    options.alias("h", "help").describe("help", "Print this usage message")
    options.boolean("json").describe("json", "Output matching packages as JSON array")
    options.boolean("packages").describe("packages", "Search only non-theme packages").alias("p", "packages")
    return options.boolean("themes").describe("themes", "Search only themes").alias("t", "themes")
  }

  searchPackages(query, opts, callback) {
    const qs = { q: query }

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

  run(options, callback) {
    options = this.parseOptions(options.commandArgs)
    const [query] = Array.from(options.argv._)

    if (!query) {
      callback("Missing required search query")
      return
    }

    const searchOptions = {
      packages: options.argv.packages,
      themes: options.argv.themes,
    }

    return this.searchPackages(query, searchOptions, function (error, packages) {
      if (error != null) {
        callback(error)
        return
      }

      if (options.argv.json) {
        console.log(JSON.stringify(packages))
      } else {
        const heading = `Search Results For '${query}'`.cyan
        console.log(`${heading} (${packages.length})`)

        tree(packages, function ({ name, description, downloads, stargazers_count }) {
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
