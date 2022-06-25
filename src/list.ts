/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import path from "path"
import CSON from "season"
import Command from "./command"
import fs from "./fs"
import * as config from "./apm"
import { tree } from "./tree"
import { getRepository, PackageMetadata } from "./packages"
import type { CliOptions, RunCallback } from "./apm-cli"
import mri from "mri"

export default class List extends Command {
  private disabledPackages?: string[]
  constructor() {
    super()
    let configPath: string

    if ((configPath = CSON.resolve(path.join(config.getAtomDirectory(), "config")))) {
      try {
        this.disabledPackages = CSON.readFileSync(configPath)?.["*"]?.core?.disabledPackages
      } catch (error) {
        /* ignore error */
      }
    }
    if (this.disabledPackages == null) {
      this.disabledPackages = []
    }
  }

  parseOptions(argv: string[]) {
    return mri<{
      help: boolean
      bare: boolean
      enabled: boolean
      dev: boolean
      disabled: boolean
      installed: boolean
      json: boolean
      links: boolean
      themes: boolean
      packages: boolean
      versions: boolean
    }>(argv, {
      alias: {
        h: "help",
        b: "bare",
        e: "enabled",
        d: "dev",
        i: "installed",
        j: "json",
        l: "links",
        t: "themes",
        p: "packages",
        v: "versions",
      },
      boolean: [
        "help",
        "bare",
        "enabled",
        "dev",
        "disabled",
        "installed",
        "json",
        "links",
        "themes",
        "packages",
        "versions",
      ],
      default: { versions: true, links: true, dev: true },
    })
  }

  help() {
    return `Usage: apm list
       apm list --themes
       apm list --packages
       apm list --installed
       apm list --installed --enabled
       apm list --installed --bare > my-packages.txt
       apm list --json

List all the installed packages and also the packages bundled with Atom.

Options:
  --disabled       Print only disabled packages                                            [boolean]
  -b, --bare       Print packages one per line with no formatting                          [boolean]
  -e, --enabled    Print only enabled packages                                             [boolean]
  -d, --dev        Include dev packages                                    [boolean] [default: true]
  -h, --help       Print this usage message
  -i, --installed  Only list installed packages/themes                                     [boolean]
  -j, --json       Output all packages as a JSON object                                    [boolean]
  -l, --links      Include linked packages                                 [boolean] [default: true]
  -t, --themes     Only list themes                                                        [boolean]
  -p, --packages   Only list packages                                                      [boolean]
  -v, --versions   Include version of each package                         [boolean] [default: true]
`
  }

  isPackageDisabled(name: string) {
    return this.disabledPackages.includes(name)
  }

  logPackages(packages: PackageMetadata[], options: ReturnType<List["parseOptions"]>) {
    if (options.bare) {
      return (() => {
        const result = []
        for (const pack of packages) {
          let packageLine = pack.name
          if (pack.version != null && options.versions) {
            packageLine += `@${pack.version}`
          }
          result.push(console.log(packageLine))
        }
        return result
      })()
    } else {
      tree(packages, {}, (pack) => {
        let packageLine = pack.name
        if (pack.version != null && options.versions) {
          packageLine += `@${pack.version}`
        }
        if (pack.apmInstallSource?.type === "git") {
          const repo = getRepository(pack)
          let shaLine = `#${pack.apmInstallSource.sha.substr(0, 8)}`
          if (repo != null) {
            shaLine = repo + shaLine
          }
          packageLine += ` (${shaLine})`.grey
        }
        if (this.isPackageDisabled(pack.name) && !options.disabled) {
          packageLine += " (disabled)"
        }
        return packageLine
      })
      return console.log()
    }
  }

  checkExclusiveOptions(
    options: ReturnType<List["parseOptions"]>,
    positive_option: string,
    negative_option: string,
    value: string | boolean
  ) {
    if (options[positive_option]) {
      return value
    } else if (options[negative_option]) {
      return !value
    } else {
      return true
    }
  }

  isPackageVisible(options: ReturnType<List["parseOptions"]>, manifest: PackageMetadata) {
    return (
      this.checkExclusiveOptions(options, "themes", "packages", manifest.theme) &&
      this.checkExclusiveOptions(options, "disabled", "enabled", this.isPackageDisabled(manifest.name))
    )
  }

  listPackages(directoryPath: string, options: ReturnType<List["parseOptions"]>) {
    const packages = []
    for (const child of fs.list(directoryPath)) {
      let manifestPath: string
      if (!fs.isDirectorySync(path.join(directoryPath, child))) {
        continue
      }
      if (child.match(/^\./)) {
        continue
      }
      if (!options.links) {
        if (fs.isSymbolicLinkSync(path.join(directoryPath, child))) {
          continue
        }
      }

      let manifest: PackageMetadata | null = null
      if ((manifestPath = CSON.resolve(path.join(directoryPath, child, "package")))) {
        try {
          manifest = CSON.readFileSync(manifestPath)
        } catch (error) {
          /* ignore error */
        }
      }
      if (manifest == null) {
        manifest = {}
      }
      manifest.name = child

      if (!this.isPackageVisible(options, manifest)) {
        continue
      }
      packages.push(manifest)
    }

    return packages
  }

  listUserPackages(options: ReturnType<List["parseOptions"]>, callback) {
    const userPackages = this.listPackages(this.atomPackagesDirectory, options).filter((pack) => !pack.apmInstallSource)
    if (!options.bare && !options.json) {
      console.log(`Community Packages (${userPackages.length})`.cyan, `${this.atomPackagesDirectory}`)
    }
    return callback?.(null, userPackages)
  }

  listDevPackages(options: ReturnType<List["parseOptions"]>, callback) {
    if (!options.dev) {
      return callback?.(null, [])
    }

    const devPackages = this.listPackages(this.atomDevPackagesDirectory, options)
    if (devPackages.length > 0) {
      if (!options.bare && !options.json) {
        console.log(`Dev Packages (${devPackages.length})`.cyan, `${this.atomDevPackagesDirectory}`)
      }
    }
    return callback?.(null, devPackages)
  }

  listGitPackages(options: ReturnType<List["parseOptions"]>, callback) {
    const gitPackages = this.listPackages(this.atomPackagesDirectory, options).filter(
      (pack) => pack.apmInstallSource?.type === "git"
    )
    if (gitPackages.length > 0) {
      if (!options.bare && !options.json) {
        console.log(`Git Packages (${gitPackages.length})`.cyan, `${this.atomPackagesDirectory}`)
      }
    }
    return callback?.(null, gitPackages)
  }

  listBundledPackages(options: ReturnType<List["parseOptions"]>, callback) {
    return config.getResourcePath((resourcePath: string) => {
      let _atomPackages: Record<string, PackageMetadata>
      let metadata: PackageMetadata
      try {
        const metadataPath = path.join(resourcePath, "package.json")
        ;({ _atomPackages } = JSON.parse(fs.readFileSync(metadataPath)))
      } catch (error) {
        /* ignore error */
      }
      if (_atomPackages == null) {
        _atomPackages = {}
      }
      let packages = (() => {
        const result: PackageMetadata[] = []
        for (const packageName in _atomPackages) {
          ;({ metadata } = _atomPackages[packageName])
          result.push(metadata)
        }
        return result
      })()

      packages = packages.filter((metadata) => {
        return this.isPackageVisible(options, metadata)
      })

      if (!options.bare && !options.json) {
        if (options.themes) {
          console.log(`${"Built-in Atom Themes".cyan} (${packages.length})`)
        } else {
          console.log(`${"Built-in Atom Packages".cyan} (${packages.length})`)
        }
      }

      return callback?.(null, packages)
    })
  }

  listInstalledPackages(options: ReturnType<List["parseOptions"]>) {
    return this.listDevPackages(options, (error, packages) => {
      if (packages.length > 0) {
        this.logPackages(packages, options)
      }

      return this.listUserPackages(options, (error, packages) => {
        this.logPackages(packages, options)

        return this.listGitPackages(options, (error, packages) => {
          if (packages.length > 0) {
            return this.logPackages(packages, options)
          }
        })
      })
    })
  }

  listPackagesAsJson(options: ReturnType<List["parseOptions"]>, callback: (err?: string) => void = function () {}) {
    const output = {
      core: [],
      dev: [],
      git: [],
      user: [],
    }

    return this.listBundledPackages(options, (error, packages) => {
      if (error) {
        return callback(error)
      }
      output.core = packages
      return this.listDevPackages(options, (error, packages) => {
        if (error) {
          return callback(error)
        }
        output.dev = packages
        return this.listUserPackages(options, (error, packages) => {
          if (error) {
            return callback(error)
          }
          output.user = packages
          return this.listGitPackages(options, function (error, packages) {
            if (error) {
              return callback(error)
            }
            output.git = packages
            console.log(JSON.stringify(output))
            return callback()
          })
        })
      })
    })
  }

  run(givenOptions: CliOptions, callback: RunCallback) {
    const options = this.parseOptions(givenOptions.commandArgs)

    if (options.json) {
      return this.listPackagesAsJson(options, callback)
    } else if (options.installed) {
      this.listInstalledPackages(options)
      return callback()
    } else {
      return this.listBundledPackages(options, (error: string, packages: PackageMetadata[]) => {
        this.logPackages(packages, options)
        this.listInstalledPackages(options)
        return callback()
      })
    }
  }
}
