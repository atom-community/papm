/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import child_process from "child_process"
import fs from "./fs"
import path from "path"
import npm from "npm"
import semver from "semver"
let asarPath = null

export default {
  getHomeDirectory() {
    if (process.platform === "win32") {
      return process.env.USERPROFILE
    } else {
      return process.env.HOME
    }
  },

  getAtomDirectory() {
    return process.env.ATOM_HOME != null ? process.env.ATOM_HOME : path.join(this.getHomeDirectory(), ".atom")
  },

  getRustupHomeDirPath() {
    if (process.env.RUSTUP_HOME) {
      return process.env.RUSTUP_HOME
    } else {
      return path.join(this.getHomeDirectory(), ".multirust")
    }
  },

  getCacheDirectory() {
    return path.join(this.getAtomDirectory(), ".apm")
  },

  getResourcePath(callback) {
    if (process.env.ATOM_RESOURCE_PATH) {
      return process.nextTick(() => callback(process.env.ATOM_RESOURCE_PATH))
    }

    if (asarPath) {
      // already calculated
      return process.nextTick(() => callback(asarPath))
    }

    let apmFolder = path.resolve(__dirname, "..")
    let appFolder = path.dirname(apmFolder)
    if (path.basename(apmFolder) === "apm" && path.basename(appFolder) === "app") {
      asarPath = `${appFolder}.asar`
      if (fs.existsSync(asarPath)) {
        return process.nextTick(() => callback(asarPath))
      }
    }

    apmFolder = path.resolve(__dirname, "..", "..", "..")
    appFolder = path.dirname(apmFolder)
    if (path.basename(apmFolder) === "apm" && path.basename(appFolder) === "app") {
      asarPath = `${appFolder}.asar`
      if (fs.existsSync(asarPath)) {
        return process.nextTick(() => callback(asarPath))
      }
    }

    switch (process.platform) {
      case "darwin":
        return child_process.exec(
          "mdfind \"kMDItemCFBundleIdentifier == 'com.github.atom'\"",
          function (error, stdout = "", stderr) {
            let appLocation
            if (!error) {
              ;[appLocation] = Array.from(stdout.split("\n"))
            }
            if (!appLocation) {
              appLocation = "/Applications/Atom.app"
            }
            asarPath = `${appLocation}/Contents/Resources/app.asar`
            return process.nextTick(() => callback(asarPath))
          }
        )
      case "linux":
        asarPath = "/usr/local/share/atom/resources/app.asar"
        if (!fs.existsSync(asarPath)) {
          asarPath = "/usr/share/atom/resources/app.asar"
        }
        return process.nextTick(() => callback(asarPath))
      case "win32":
        var glob = require("glob")
        var pattern = `/Users/${process.env.USERNAME}/AppData/Local/atom/app-+([0-9]).+([0-9]).+([0-9])/resources/app.asar`
        var asarPaths = glob.sync(pattern, null) // [] | a sorted array of locations with the newest version being last
        asarPath = asarPaths[asarPaths.length - 1]
        return process.nextTick(() => callback(asarPath))
      default:
        return process.nextTick(() => callback(""))
    }
  },

  getReposDirectory() {
    return process.env.ATOM_REPOS_HOME != null
      ? process.env.ATOM_REPOS_HOME
      : path.join(this.getHomeDirectory(), "github")
  },

  getElectronUrl() {
    return process.env.ATOM_ELECTRON_URL != null ? process.env.ATOM_ELECTRON_URL : "https://atom.io/download/electron"
  },

  getAtomPackagesUrl() {
    return process.env.ATOM_PACKAGES_URL != null ? process.env.ATOM_PACKAGES_URL : `${this.getAtomApiUrl()}/packages`
  },

  getAtomApiUrl() {
    return process.env.ATOM_API_URL != null ? process.env.ATOM_API_URL : "https://atom.io/api"
  },

  getElectronArch() {
    switch (process.platform) {
      case "darwin":
        return "x64"
      default:
        return process.env.ATOM_ARCH != null ? process.env.ATOM_ARCH : process.arch
    }
  },

  getUserConfigPath() {
    return path.resolve(this.getAtomDirectory(), ".apmrc")
  },

  getGlobalConfigPath() {
    return path.resolve(this.getAtomDirectory(), ".apm", ".apmrc")
  },

  isWin32() {
    return process.platform === "win32"
  },

  x86ProgramFilesDirectory() {
    return process.env["ProgramFiles(x86)"] || process.env["ProgramFiles"]
  },

  getInstalledVisualStudioFlag() {
    if (!this.isWin32()) {
      return null
    }

    // Use the explictly-configured version when set
    if (process.env.GYP_MSVS_VERSION) {
      return process.env.GYP_MSVS_VERSION
    }

    if (this.visualStudioIsInstalled("2019")) {
      return "2019"
    }
    if (this.visualStudioIsInstalled("2017")) {
      return "2017"
    }
    if (this.visualStudioIsInstalled("14.0")) {
      return "2015"
    }
  },

  visualStudioIsInstalled(version) {
    if (version < 2017) {
      return fs.existsSync(
        path.join(this.x86ProgramFilesDirectory(), `Microsoft Visual Studio ${version}`, "Common7", "IDE")
      )
    } else {
      return (
        fs.existsSync(
          path.join(
            this.x86ProgramFilesDirectory(),
            "Microsoft Visual Studio",
            `${version}`,
            "BuildTools",
            "Common7",
            "IDE"
          )
        ) ||
        fs.existsSync(
          path.join(
            this.x86ProgramFilesDirectory(),
            "Microsoft Visual Studio",
            `${version}`,
            "Community",
            "Common7",
            "IDE"
          )
        ) ||
        fs.existsSync(
          path.join(
            this.x86ProgramFilesDirectory(),
            "Microsoft Visual Studio",
            `${version}`,
            "Enterprise",
            "Common7",
            "IDE"
          )
        ) ||
        fs.existsSync(
          path.join(
            this.x86ProgramFilesDirectory(),
            "Microsoft Visual Studio",
            `${version}`,
            "Professional",
            "Common7",
            "IDE"
          )
        ) ||
        fs.existsSync(
          path.join(
            this.x86ProgramFilesDirectory(),
            "Microsoft Visual Studio",
            `${version}`,
            "WDExpress",
            "Common7",
            "IDE"
          )
        )
      )
    }
  },

  loadNpm(callback) {
    const npmOptions = {
      userconfig: this.getUserConfigPath(),
      globalconfig: this.getGlobalConfigPath(),
    }
    return npm.load(npmOptions, () => callback(null, npm))
  },

  getSetting(key, callback) {
    return this.loadNpm(() => callback(npm.config.get(key)))
  },

  setupApmRcFile() {
    try {
      return fs.writeFileSync(
        this.getGlobalConfigPath(),
        `\
; This file is auto-generated and should not be edited since any
; modifications will be lost the next time any apm command is run.
;
; You should instead edit your .apmrc config located in ~/.atom/.apmrc
cache = ${this.getCacheDirectory()}
; Hide progress-bar to prevent npm from altering apm console output.
progress = false\
`
      )
    } catch (error) {}
  },
}
