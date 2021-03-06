/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS104: Avoid inline assignments
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import child_process from "child_process"
import path from "path"
import * as _ from "@aminya/underscore-plus"
import semver from "semver"
import * as config from "./apm"
import * as git from "./git"
import { sync as resolveSync } from "resolve"

export type LogCommandResultsArgs = [code: number, stderr?: string, stdout?: string]

export type SpawnArgs =
  | {
      // options
      env?: NodeJS.ProcessEnv
      streaming?: boolean
      cwd?: string
    }
  // callback
  | ((code: number, stderr?: string, stdout?: string) => void)

export default class Command {
  protected atomNpmPath = resolveSync("npm/bin/npm-cli")
  protected atomDirectory = config.getAtomDirectory()
  protected atomNodeDirectory: string
  protected atomPackagesDirectory: string
  protected atomDevPackagesDirectory: string

  protected electronVersion: string
  installedAtomVersion: string
  protected resourcePath: string

  npm: typeof import("npm")
  constructor() {
    this.atomNodeDirectory = path.join(this.atomDirectory, ".node-gyp")
    this.atomPackagesDirectory = path.join(this.atomDirectory, "packages")
    this.atomDevPackagesDirectory = path.join(this.atomDirectory, "dev", "packages")

    this.logCommandResults = this.logCommandResults.bind(this)
    this.logCommandResultsIfFail = this.logCommandResultsIfFail.bind(this)
  }

  spawn(command: string, args: string[], ...remaining: SpawnArgs[]) {
    let options
    if (remaining.length >= 2) {
      options = remaining.shift()
    }
    const callback = remaining.shift()

    const spawned = child_process.spawn(command, args, options)

    const errorChunks = []
    const outputChunks = []

    spawned.stdout.on("data", function (chunk) {
      if (options?.streaming) {
        return process.stdout.write(chunk)
      } else {
        return outputChunks.push(chunk)
      }
    })

    spawned.stderr.on("data", function (chunk) {
      if (options?.streaming) {
        return process.stderr.write(chunk)
      } else {
        return errorChunks.push(chunk)
      }
    })

    const onChildExit = function (errorOrExitCode) {
      spawned.removeListener("error", onChildExit)
      spawned.removeListener("close", onChildExit)
      return callback?.(errorOrExitCode, Buffer.concat(errorChunks).toString(), Buffer.concat(outputChunks).toString())
    }

    spawned.on("error", onChildExit)
    spawned.on("close", onChildExit)

    return spawned
  }

  fork(script: string, args: string[], ...remaining: SpawnArgs[]) {
    args.unshift(script)
    return this.spawn(process.execPath, args, ...Array.from(remaining))
  }

  packageNamesFromArgv(argv) {
    return this.sanitizePackageNames(argv._)
  }

  sanitizePackageNames(packageNames: string[] = []) {
    packageNames = packageNames.map((packageName) => packageName.trim())
    return _.compact(_.uniq(packageNames))
  }

  logSuccess() {
    if (process.platform === "win32") {
      return process.stdout.write("done\n".green)
    } else {
      return process.stdout.write("\u2713\n".green)
    }
  }

  logFailure() {
    if (process.platform === "win32") {
      return process.stdout.write("failed\n".red)
    } else {
      return process.stdout.write("\u2717\n".red)
    }
  }

  logCommandResults(callback: (error?: string) => void, code: number, stderr = "", stdout = "") {
    if (code === 0) {
      this.logSuccess()
      return callback()
    } else {
      this.logFailure()
      return callback(`${stdout}\n${stderr}`.trim())
    }
  }

  logCommandResultsIfFail(callback: (error?: string) => void, code: number, stderr = "", stdout = "") {
    if (code === 0) {
      return callback()
    } else {
      this.logFailure()
      return callback(`${stdout}\n${stderr}`.trim())
    }
  }

  normalizeVersion(version: string) {
    if (typeof version === "string") {
      // Remove commit SHA suffix
      return version.replace(/-.*$/, "")
    } else {
      return version
    }
  }

  loadInstalledAtomMetadata(callback: () => child_process.ChildProcessWithoutNullStreams) {
    return this.getResourcePath((resourcePath) => {
      let electronVersion: string | undefined
      try {
        const resourcePathJson: { version: string; electronVersion: string } & Record<string, any> =
          require(path.join(resourcePath, "package.json")) ?? {}

        electronVersion = resourcePathJson.electronVersion

        const version = this.normalizeVersion(resourcePathJson.version)

        if (semver.valid(version)) {
          this.installedAtomVersion = version
        }
      } catch (error) {
        /* ignore error */
      }

      this.electronVersion = process.env.ATOM_ELECTRON_VERSION || electronVersion
      if (this.electronVersion == null) {
        throw new Error("Could not determine Electron version")
      }

      return callback()
    })
  }

  getResourcePath(callback: (resourcePath: string) => child_process.ChildProcessWithoutNullStreams) {
    if (this.resourcePath) {
      return process.nextTick(() => callback(this.resourcePath))
    } else {
      return config.getResourcePath((resourcePath) => {
        this.resourcePath = resourcePath
        return callback(this.resourcePath)
      })
    }
  }

  addBuildEnvVars(env: Record<string, string>) {
    if (config.isWin32()) {
      this.updateWindowsEnv(env)
    }
    this.addNodeBinToEnv(env)
    this.addProxyToEnv(env)
    env.npm_config_runtime = "electron"
    env.npm_config_target = this.electronVersion
    env.npm_config_disturl = config.getElectronUrl()
    env.npm_config_arch = config.getElectronArch()
    return (env.npm_config_target_arch = config.getElectronArch()) // for node-pre-gyp
  }

  getNpmBuildFlags() {
    return [
      `--target=${this.electronVersion}`,
      `--disturl=${config.getElectronUrl()}`,
      `--arch=${config.getElectronArch()}`,
    ]
  }

  updateWindowsEnv(env: Record<string, string>) {
    env.USERPROFILE = env.HOME

    return git.addGitToEnv(env)
  }

  addNodeBinToEnv(env: Record<string, string>) {
    const nodeBinFolder = path.resolve(__dirname, "..", "bin")
    const pathKey = config.isWin32() ? "Path" : "PATH"
    if (env[pathKey]) {
      return (env[pathKey] = `${nodeBinFolder}${path.delimiter}${env[pathKey]}`)
    } else {
      return (env[pathKey] = nodeBinFolder)
    }
  }

  addProxyToEnv(env: Record<string, string>) {
    let left
    const httpProxy = this.npm.config.get("proxy")
    if (httpProxy) {
      if (env.HTTP_PROXY == null) {
        env.HTTP_PROXY = httpProxy
      }
      if (env.http_proxy == null) {
        env.http_proxy = httpProxy
      }
    }

    const httpsProxy = this.npm.config.get("https-proxy")
    if (httpsProxy) {
      if (env.HTTPS_PROXY == null) {
        env.HTTPS_PROXY = httpsProxy
      }
      if (env.https_proxy == null) {
        env.https_proxy = httpsProxy
      }

      // node-gyp only checks HTTP_PROXY (as of node-gyp@4.0.0)
      if (env.HTTP_PROXY == null) {
        env.HTTP_PROXY = httpsProxy
      }
      if (env.http_proxy == null) {
        env.http_proxy = httpsProxy
      }
    }

    // node-gyp doesn't currently have an option for this so just set the
    // environment variable to bypass strict SSL
    // https://github.com/nodejs/node-gyp/issues/448
    const useStrictSsl = (left = this.npm.config.get("strict-ssl")) != null ? left : true
    if (!useStrictSsl) {
      return (env.NODE_TLS_REJECT_UNAUTHORIZED = 0)
    }
  }
}
