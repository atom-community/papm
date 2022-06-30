/*
 * DS102: Remove unnecessary code created because of implicit returns
 * DS104: Avoid inline assignments
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import assert from "assert"
import path from "path"
import * as _ from "@aminya/underscore-plus"
import async from "async"
import CSON from "season"
import Git from "git-utils"
import semver from "semver"
import temp from "temp"
import hostedGitInfo from "hosted-git-info"
import * as config from "./apm"
import Command from "./command"
import fs from "./fs"
import RebuildModuleCache from "./rebuild-module-cache"
import * as request from "./request"
import { isDeprecatedPackage } from "./deprecated-packages"
import type { CliOptions, RunCallback } from "./apm-cli"
import type { SpawnArgs } from "./command"
import { ChildProcessWithoutNullStreams } from "child_process"
import mri from "mri"
import { PackageMetadata } from "./packages"
import { PackageData } from "./stars"

export default class Install extends Command {
  private repoLocalPackagePathRegex = /^file:(?!\/\/)(.*)/
  verbose: boolean

  parseOptions(argv: string[]) {
    return mri<{
      help: boolean
      silent: boolean
      quiet: boolean
      check: boolean
      verbose: boolean
      production: boolean
      json: boolean
      package: string
      compatible: string
      "packages-file": string

      // manually added later
      installGlobally: boolean
      cwd: string
    }>(argv, {
      alias: { h: "help", c: "compatible", s: "silent", q: "quiet" },
      boolean: ["help", "silent", "quiet", "check", "verbose", "production", "json"],
      string: ["package", "compatible", "packages-file"],
    })
  }

  help() {
    return `Usage: apm install [<package_name>...]
       apm install <package_name>@<package_version>
       apm install <git_remote>
       apm install <github_username>/<github_project>
       apm install --packages-file my-packages.txt
       apm i (with any of the previous argument usage)

Install the given Atom package to ~/.atom/packages/<package_name>.

If no package name is given then all the dependencies in the package.json
file are installed to the node_modules folder in the current working
directory.

A packages file can be specified that is a newline separated list of
package names to install with optional versions using the
\`package-name@version\` syntax.

Options:
  --check           Check that native build tools are installed                            [boolean]
  --verbose         Show verbose debug information                        [boolean] [default: false]
  --packages-file   A text file containing the packages to install                          [string]
  --production      Do not install dev dependencies                                        [boolean]
  -c, --compatible  Only install packages/themes compatible with this Atom version          [string]
  -h, --help        Print this usage message
  -s, --silent      Set the npm log level to silent                                        [boolean]
  -q, --quiet       Set the npm log level to warn                                          [boolean]
  --json            Logging                                                                [boolean]
`
  }

  installModule(
    options: ReturnType<Install["parseOptions"]>,
    pack: { name: string },
    moduleURI: string,
    callback: (err: string | Error, pack?: { name: string; installPath: string }) => void
  ) {
    let installDirectory, nodeModulesDirectory
    const installGlobally = options.installGlobally != null ? options.installGlobally : true

    const installArgs = [
      "--globalconfig",
      config.getGlobalConfigPath(),
      "--userconfig",
      config.getUserConfigPath(),
      "install",
    ]
    installArgs.push(moduleURI)
    installArgs.push(...Array.from(this.getNpmBuildFlags() || []))
    if (installGlobally) {
      installArgs.push("--global-style")
    }
    if (options.silent) {
      installArgs.push("--silent")
    }
    if (options.quiet) {
      installArgs.push("--quiet")
    }
    if (options.production) {
      installArgs.push("--production")
    }
    if (options.verbose) {
      installArgs.push("--verbose")
    }

    fs.makeTreeSync(this.atomDirectory)

    const env = { ...process.env, HOME: this.atomNodeDirectory, RUSTUP_HOME: config.getRustupHomeDirPath() }
    this.addBuildEnvVars(env)

    const installOptions: SpawnArgs = { env }
    if (this.verbose) {
      installOptions.streaming = true
    }

    if (installGlobally) {
      installDirectory = temp.mkdirSync("apm-install-dir-")
      nodeModulesDirectory = path.join(installDirectory, "node_modules")
      fs.makeTreeSync(nodeModulesDirectory)
      installOptions.cwd = installDirectory
    }

    return this.fork(this.atomNpmPath, installArgs, installOptions, (code, stderr = "", stdout = "") => {
      if (code === 0) {
        let child: string | undefined
        let destination: string | undefined
        if (installGlobally) {
          const commands = []
          const children = fs
            .readdirSync(nodeModulesDirectory)
            .filter((dir) => ![".bin", ".package-lock.json"].includes(dir))
          assert.equal(
            children.length,
            1,
            `Expected there to only be one child in node_modules, but multiple were found:\n${children.join("\n")}`
          )
          child = children[0]
          const source = path.join(nodeModulesDirectory, child)
          destination = path.join(this.atomPackagesDirectory, child)
          commands.push((next) => fs.cp(source, destination, next))
          commands.push((next) => this.buildModuleCache(pack.name, next))
          commands.push((next) => this.warmCompileCache(pack.name, next))

          return async.waterfall(commands, (error) => {
            if (error != null) {
              this.logFailure()
            } else {
              if (!options.json) {
                this.logSuccess()
              }
            }
            return callback(error, { name: child, installPath: destination })
          })
        } else {
          return callback(null, { name: child, installPath: destination })
        }
      } else {
        if (installGlobally) {
          fs.removeSync(installDirectory)
          this.logFailure()
        }

        let error = `${stdout}\n${stderr}`
        if (error.includes("code ENOGIT")) {
          error = this.getGitErrorMessage(pack)
        }
        return callback(error)
      }
    })
  }

  getGitErrorMessage(pack: { name: string }) {
    let message = `\
Failed to install ${pack.name} because Git was not found.

The ${pack.name} package has module dependencies that cannot be installed without Git.

You need to install Git and add it to your path environment variable in order to install this package.
\
`

    switch (process.platform) {
      case "win32":
        message += `\

You can install Git by downloading, installing, and launching GitHub for Windows: https://windows.github.com
\
`
        break
      case "linux":
        message += `\

You can install Git from your OS package manager.
\
`
        break
    }

    message += `\

Run apm -v after installing Git to see what version has been detected.\
`

    return message
  }

  installModules = (options: ReturnType<Install["parseOptions"]>, callback) => {
    if (!options.json) {
      process.stdout.write("Installing modules ")
    }

    return this.forkInstallCommand(options, (...args) => {
      if (options.json) {
        return this.logCommandResultsIfFail(callback, ...args)
      } else {
        return this.logCommandResults(callback, ...args)
      }
    })
  }

  forkInstallCommand(
    options: ReturnType<Install["parseOptions"]>,
    callback: (code: number, stderr?: string, stdout?: string) => void
  ) {
    const installArgs = [
      "--globalconfig",
      config.getGlobalConfigPath(),
      "--userconfig",
      config.getUserConfigPath(),
      "install",
    ]
    installArgs.push(...Array.from(this.getNpmBuildFlags() || []))
    if (options.silent) {
      installArgs.push("--silent")
    }
    if (options.quiet) {
      installArgs.push("--quiet")
    }
    if (options.production) {
      installArgs.push("--production")
    }

    fs.makeTreeSync(this.atomDirectory)

    const env = { ...process.env, HOME: this.atomNodeDirectory, RUSTUP_HOME: config.getRustupHomeDirPath() }
    this.addBuildEnvVars(env)

    const installOptions: SpawnArgs = { env }
    if (options.cwd) {
      installOptions.cwd = options.cwd
    }
    if (this.verbose) {
      installOptions.streaming = true
    }

    return this.fork(this.atomNpmPath, installArgs, installOptions, callback)
  }

  // Request package information from the atom.io API for a given package name.
  //
  // packageName - The string name of the package to request.
  // callback - The function to invoke when the request completes with an error
  //            as the first argument and an object as the second.
  requestPackage(packageName: string, callback: (error: string, pack?: any) => any) {
    const requestSettings = {
      url: `${config.getAtomPackagesUrl()}/${packageName}`,
      json: true,
      retries: 4,
    }
    return request.get(requestSettings, function (error, response, body = {}) {
      let message
      if (error != null) {
        message = `Request for package information failed: ${error.message}`
        if (error.code) {
          message += ` (${error.code})`
        }
        return callback(message)
      } else if (response.statusCode !== 200) {
        message = request.getErrorMessage(response, body)
        return callback(`Request for package information failed: ${message}`)
      } else {
        if (body.releases.latest) {
          return callback(null, body)
        } else {
          return callback(`No releases available for ${packageName}`)
        }
      }
    })
  }

  // Is the package at the specified version already installed?
  //
  //  * packageName: The string name of the package.
  //  * packageVersion: The string version of the package.
  isPackageInstalled(packageName: string, packageVersion: string) {
    try {
      let left: { version: string }
      const { version } =
        (left = CSON.readFileSync(CSON.resolve(path.join("node_modules", packageName, "package")))) != null ? left : {}
      return packageVersion === version
    } catch (error) {
      return false
    }
  }

  // Install the package with the given name and optional version
  //
  // metadata - The package metadata object with at least a name key. A version
  //            key is also supported. The version defaults to the latest if
  //            unspecified.
  // options - The installation options object.
  // callback - The function to invoke when installation completes with an
  //            error as the first argument.
  installRegisteredPackage(metadata: PackageMetadata, options: ReturnType<Install["parseOptions"]>, callback) {
    const packageName = metadata.name
    let packageVersion = metadata.version

    const installGlobally = options.installGlobally != null ? options.installGlobally : true
    if (!installGlobally) {
      if (packageVersion && this.isPackageInstalled(packageName, packageVersion)) {
        callback(null, {})
        return
      }
    }

    let label = packageName
    if (packageVersion) {
      label += `@${packageVersion}`
    }
    if (!options.json) {
      process.stdout.write(`Installing ${label} `)
      if (installGlobally) {
        process.stdout.write(`to ${this.atomPackagesDirectory} `)
      }
    }

    return this.requestPackage(packageName, (error, pack) => {
      if (error != null) {
        this.logFailure()
        return callback(error)
      } else {
        if (packageVersion == null) {
          packageVersion = this.getLatestCompatibleVersion(pack)
        }
        if (!packageVersion) {
          this.logFailure()
          callback(`No available version compatible with the installed Atom version: ${this.installedAtomVersion}`)
          return
        }

        const { tarball } = pack.versions[packageVersion]?.dist != null ? pack.versions[packageVersion]?.dist : {}
        if (!tarball) {
          this.logFailure()
          callback(`Package version: ${packageVersion} not found`)
          return
        }

        const commands = []
        commands.push((next) => this.installModule(options, pack, tarball, next))
        if (installGlobally && packageName.localeCompare(pack.name, "en", { sensitivity: "accent" }) !== 0) {
          commands.push((newPack, next) => {
            // package was renamed; delete old package folder
            fs.removeSync(path.join(this.atomPackagesDirectory, packageName))
            return next(null, newPack)
          })
        }
        commands.push(function ({ installPath }, next) {
          if (installPath != null) {
            metadata = JSON.parse(fs.readFileSync(path.join(installPath, "package.json"), "utf8"))
            const json = { installPath, metadata }
            return next(null, json)
          } else {
            return next(null, {})
          }
        }) // installed locally, no install path data

        return async.waterfall(commands, (error, json) => {
          if (!installGlobally) {
            if (error != null) {
              this.logFailure()
            } else {
              if (!options.json) {
                this.logSuccess()
              }
            }
          }
          return callback(error, json)
        })
      }
    })
  }

  // Install the package with the given name and local path
  //
  // packageName - The name of the package
  // packagePath - The local path of the package in the form "file:./packages/package-name"
  // options     - The installation options object.
  // callback    - The function to invoke when installation completes with an
  //               error as the first argument.
  installLocalPackage(
    packageName: string,
    packagePath: string,
    options: ReturnType<Install["parseOptions"]>,
    callback: (err: Error, json: string) => void
  ) {
    if (!options.json) {
      process.stdout.write(`Installing ${packageName} from ${packagePath.slice("file:".length)} `)
      const commands = []
      commands.push((next) => {
        return this.installModule(options, { name: packageName }, packagePath, next)
      })
      commands.push(function ({ installPath }: { installPath: string }, next) {
        if (installPath != null) {
          const metadata = JSON.parse(fs.readFileSync(path.join(installPath, "package.json"), "utf8"))
          const json = { installPath, metadata }
          return next(null, json)
        } else {
          return next(null, {})
        }
      }) // installed locally, no install path data

      return async.waterfall(commands, (error, json: string) => {
        if (error != null) {
          this.logFailure()
        } else {
          if (!options.json) {
            this.logSuccess()
          }
        }
        return callback(error, json)
      })
    }
  }

  // Install all the package dependencies found in the package.json file.
  //
  // options - The installation options
  // callback - The callback function to invoke when done with an error as the
  //            first argument.
  installPackageDependencies(options: ReturnType<Install["parseOptions"]>, callback) {
    options = { ...options, installGlobally: false }
    const commands = []
    const object = this.getPackageDependencies()
    for (const name in object) {
      const version = object[name]
      ;((name, version) => {
        return commands.push((next) => {
          if (this.repoLocalPackagePathRegex.test(version)) {
            return this.installLocalPackage(name, version, options, next)
          } else {
            return this.installRegisteredPackage({ name, version }, options, next)
          }
        })
      })(name, version)
    }

    return async.series(commands, callback)
  }

  installDependencies(options: ReturnType<Install["parseOptions"]>, callback) {
    options.installGlobally = false
    const commands = []
    commands.push((callback) => this.installModules(options, callback))
    commands.push((callback) => this.installPackageDependencies(options, callback))

    return async.waterfall(commands, callback)
  }

  // Get all package dependency names and versions from the package.json file.
  getPackageDependencies() {
    try {
      let left
      const metadata = fs.readFileSync("package.json", "utf8")
      const { packageDependencies, dependencies } = (left = JSON.parse(metadata)) != null ? left : {}

      if (!packageDependencies) {
        return {}
      }
      if (!dependencies) {
        return packageDependencies
      }

      // This code filters out any `packageDependencies` that have an equivalent
      // normalized repo-local package path entry in the `dependencies` section of
      // `package.json`.  Versioned `packageDependencies` are always returned.
      const filteredPackages = {}
      for (const packageName in packageDependencies) {
        const packageSpec = packageDependencies[packageName]
        const dependencyPath = this.getRepoLocalPackagePath(dependencies[packageName])
        const packageDependencyPath = this.getRepoLocalPackagePath(packageSpec)
        if (!packageDependencyPath || dependencyPath !== packageDependencyPath) {
          filteredPackages[packageName] = packageSpec
        }
      }

      return filteredPackages
    } catch (error) {
      return {}
    }
  }

  getRepoLocalPackagePath(packageSpec: string) {
    if (!packageSpec) {
      return undefined
    }
    const repoLocalPackageMatch = packageSpec.match(this.repoLocalPackagePathRegex)
    if (repoLocalPackageMatch) {
      return path.normalize(repoLocalPackageMatch[1])
    } else {
      return undefined
    }
  }

  createAtomDirectories() {
    fs.makeTreeSync(this.atomDirectory)
    fs.makeTreeSync(this.atomPackagesDirectory)
    return fs.makeTreeSync(this.atomNodeDirectory)
  }

  // Compile a sample native module to see if a useable native build toolchain
  // is instlalled and successfully detected. This will include both Python
  // and a compiler.
  checkNativeBuildTools(callback) {
    process.stdout.write("Checking for native build tools ")

    const buildArgs = [
      "--globalconfig",
      config.getGlobalConfigPath(),
      "--userconfig",
      config.getUserConfigPath(),
      "rebuild",
    ]
    buildArgs.push(path.resolve(__dirname, "..", "native-module"))
    buildArgs.push(...Array.from(this.getNpmBuildFlags() || []))

    fs.makeTreeSync(this.atomDirectory)

    const env = { ...process.env, HOME: this.atomNodeDirectory, RUSTUP_HOME: config.getRustupHomeDirPath() }
    this.addBuildEnvVars(env)

    const buildOptions = { env }
    if (this.verbose) {
      buildOptions.streaming = true
    }

    fs.removeSync(path.resolve(__dirname, "..", "native-module", "build"))

    return this.fork(this.atomNpmPath, buildArgs, buildOptions, (...args) => {
      return this.logCommandResults(callback, ...args)
    })
  }

  packageNamesFromPath(filePath: string) {
    filePath = path.resolve(filePath)

    if (!fs.isFileSync(filePath)) {
      throw new Error(`File '${filePath}' does not exist`)
    }

    const packages = fs.readFileSync(filePath, "utf8")
    return this.sanitizePackageNames(packages.split(/\s/))
  }

  buildModuleCache(packageName: string, callback) {
    const packageDirectory = path.join(this.atomPackagesDirectory, packageName)
    const rebuildCacheCommand = new RebuildModuleCache()
    return rebuildCacheCommand.rebuild(packageDirectory, () =>
      // Ignore cache errors and just finish the install
      callback()
    )
  }

  warmCompileCache(packageName: string, callback) {
    const packageDirectory = path.join(this.atomPackagesDirectory, packageName)

    return this.getResourcePath((resourcePath) => {
      try {
        const CompileCache = require(path.join(resourcePath, "src", "compile-cache"))

        const onDirectory = (directoryPath) => path.basename(directoryPath) !== "node_modules"

        const onFile = (filePath) => {
          try {
            return CompileCache.addPathToCache(filePath, this.atomDirectory)
          } catch (error) {
            /* ignore error */
          }
        }

        fs.traverseTreeSync(packageDirectory, onFile, onDirectory)
      } catch (error) {
        /* ignore error */
      }
      return callback(null)
    })
  }

  isBundledPackage(packageName: string, callback) {
    return this.getResourcePath(function (resourcePath) {
      let atomMetadata
      try {
        atomMetadata = JSON.parse(fs.readFileSync(path.join(resourcePath, "package.json")))
      } catch (error) {
        return callback(false)
      }

      return callback(atomMetadata?.packageDependencies?.hasOwnProperty(packageName))
    })
  }

  getLatestCompatibleVersion(pack: PackageData) {
    if (!this.installedAtomVersion) {
      if (isDeprecatedPackage(pack.name, pack.releases.latest)) {
        return null
      } else {
        return pack.releases.latest
      }
    }

    let latestVersion = null
    const object = pack.versions != null ? pack.versions : {}
    for (const version in object) {
      const metadata = object[version]
      if (!semver.valid(version)) {
        continue
      }
      if (!metadata) {
        continue
      }
      if (isDeprecatedPackage(pack.name, version)) {
        continue
      }

      const engine = metadata.engines?.atom != null ? metadata.engines?.atom : "*"
      if (!semver.validRange(engine)) {
        continue
      }
      if (!semver.satisfies(this.installedAtomVersion, engine)) {
        continue
      }

      if (latestVersion == null) {
        latestVersion = version
      }
      if (semver.gt(version, latestVersion)) {
        latestVersion = version
      }
    }

    return latestVersion
  }

  getHostedGitInfo(name: string) {
    return hostedGitInfo.fromUrl(name)
  }

  installGitPackage(
    packageUrl: string,
    options: ReturnType<Install["parseOptions"]>,
    callback: async.AsyncResultCallback<{}, Error>
  ) {
    const tasks = []

    const cloneDir = temp.mkdirSync("atom-git-package-clone-")

    tasks.push((data, next) => {
      const urls = this.getNormalizedGitUrls(packageUrl)
      return this.cloneFirstValidGitUrl(urls, cloneDir, options, (err) => next(err, data))
    })

    tasks.push((data, next) => {
      return this.installGitPackageDependencies(cloneDir, options, (err) => next(err, data))
    })

    tasks.push((data, next) => {
      return this.getRepositoryHeadSha(cloneDir, function (err, sha) {
        data.sha = sha
        return next(err, data)
      })
    })

    tasks.push(function (data, next) {
      const metadataFilePath = CSON.resolve(path.join(cloneDir, "package"))
      return CSON.readFile(metadataFilePath, function (err, metadata) {
        data.metadataFilePath = metadataFilePath
        data.metadata = metadata
        return next(err, data)
      })
    })

    tasks.push(function (data, next) {
      data.metadata.apmInstallSource = {
        type: "git",
        source: packageUrl,
        sha: data.sha,
      }
      return CSON.writeFile(data.metadataFilePath, data.metadata, (err) => next(err, data))
    })

    tasks.push((data, next) => {
      const { name } = data.metadata
      const targetDir = path.join(this.atomPackagesDirectory, name)
      if (!options.json) {
        process.stdout.write(`Moving ${name} to ${targetDir} `)
      }
      return fs.cp(cloneDir, targetDir, (err) => {
        if (err) {
          return next(err)
        } else {
          if (!options.json) {
            this.logSuccess()
          }
          const json = { installPath: targetDir, metadata: data.metadata }
          return next(null, json)
        }
      })
    })

    const iteratee = (currentData, task, next) => task(currentData, next)
    return async.reduce(tasks, {}, iteratee, callback)
  }

  getNormalizedGitUrls(packageUrl: string) {
    const packageInfo = this.getHostedGitInfo(packageUrl)

    if (packageUrl.indexOf("file://") === 0) {
      return [packageUrl]
    } else if (packageInfo.default === "sshurl") {
      return [packageInfo.toString()]
    } else if (packageInfo.default === "https") {
      return [packageInfo.https().replace(/^git\+https:/, "https:")]
    } else if (packageInfo.default === "shortcut") {
      return [packageInfo.https().replace(/^git\+https:/, "https:"), packageInfo.sshurl()]
    }
  }

  cloneFirstValidGitUrl(
    urls: string[],
    cloneDir: string,
    options: ReturnType<Install["parseOptions"]>,
    callback: (err?: Error) => any
  ) {
    return async.detectSeries(
      urls,
      (url, next) => {
        return this.cloneNormalizedUrl(url, cloneDir, options, (error) => next(null, !error))
      },
      function (err, result) {
        if (err || !result) {
          const invalidUrls = `Couldn't clone ${urls.join(" or ")}`
          const invalidUrlsError = new Error(invalidUrls)
          return callback(invalidUrlsError)
        } else {
          return callback()
        }
      }
    )
  }

  cloneNormalizedUrl(
    url: string,
    cloneDir: string,
    options: ReturnType<Install["parseOptions"]>,
    callback: (err?: string) => any
  ) {
    // Require here to avoid circular dependency
    const Develop = require("./develop").default as typeof import("./develop").default
    const develop = new Develop()

    return develop.cloneRepository(url, cloneDir, options, (err) => callback(err))
  }

  installGitPackageDependencies(directory, options: ReturnType<Install["parseOptions"]>, callback) {
    options.cwd = directory
    return this.installDependencies(options, callback)
  }

  getRepositoryHeadSha(repoDir, callback: (err?: Error, data?: any) => any) {
    try {
      const repo = Git.open(repoDir)
      const sha = repo.getReferenceTarget("HEAD")
      return callback(null, sha)
    } catch (err) {
      return callback(err as Error)
    }
  }

  run(givenOptions: CliOptions, callback: RunCallback) {
    let packageNames: string[]
    const options = this.parseOptions(givenOptions.commandArgs)
    const packagesFilePath: string | undefined = options["packages-file"]

    this.createAtomDirectories()

    if (options.check) {
      config.loadNpm((error, npm) => {
        this.npm = npm
        return this.loadInstalledAtomMetadata(() => {
          return this.checkNativeBuildTools(callback)
        })
      })
      return
    }

    this.verbose = options.verbose
    if (this.verbose) {
      request.debug(true)
      process.env.NODE_DEBUG = "request"
    }

    const installPackage = (name, nextInstallStep) => {
      const gitPackageInfo = this.getHostedGitInfo(name)

      if (gitPackageInfo || name.indexOf("file://") === 0) {
        return this.installGitPackage(name, options, nextInstallStep)
      } else if (name === ".") {
        return this.installDependencies(options, nextInstallStep)
      } else {
        // is registered package
        let version
        const atIndex = name.indexOf("@")
        if (atIndex > 0) {
          version = name.substring(atIndex + 1)
          name = name.substring(0, atIndex)
        }

        return this.isBundledPackage(name, (isBundledPackage) => {
          if (isBundledPackage) {
            console.error(
              `\
The ${name} package is bundled with Atom and should not be explicitly installed.
You can run \`apm uninstall ${name}\` to uninstall it and then the version bundled
with Atom will be used.\
`.yellow
            )
          }
          return this.installRegisteredPackage({ name, version }, options, nextInstallStep)
        })
      }
    }

    if (packagesFilePath) {
      try {
        packageNames = this.packageNamesFromPath(packagesFilePath)
      } catch (error1) {
        const error = error1
        return callback(error as Error)
      }
    } else {
      packageNames = this.packageNamesFromArgv(options)
      if (packageNames.length === 0) {
        packageNames.push(".")
      }
    }

    const commands = []
    commands.push((cb) => {
      return config.loadNpm((error, npm) => {
        this.npm = npm
        return cb(error)
      })
    })
    commands.push((cb: () => ChildProcessWithoutNullStreams) => this.loadInstalledAtomMetadata(() => cb()))
    packageNames.forEach((packageName) => commands.push((cb) => installPackage(packageName, cb)))
    const iteratee = (item, next) => item(next)
    return async.mapSeries(commands, iteratee, function (err, installedPackagesInfo) {
      if (err) {
        return callback(err)
      }
      installedPackagesInfo = _.compact(installedPackagesInfo)
      installedPackagesInfo = installedPackagesInfo.filter((item, idx) => packageNames[idx] !== ".")
      if (options.json) {
        console.log(JSON.stringify(installedPackagesInfo, null, "  "))
      }
      return callback(null)
    })
  }
}
