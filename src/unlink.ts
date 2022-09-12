/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS104: Avoid inline assignments
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import path from "path"
import CSON from "season"
import Command from "./command"
import fs from "./fs"
import type { CliOptions, RunCallback } from "./apm-cli"
import { PathLike } from "fs-plus"
import mri from "mri"

export default class Unlink extends Command {
  parseOptions(argv: string[]) {
    return mri<{ help: boolean; dev: boolean; hard: boolean; all: boolean; _: string[] }>(argv, {
      alias: { h: "help", d: "dev", a: "all" },
      boolean: ["help", "dev", "hard", "all"],
    })
  }

  help() {
    return `Usage: apm unlink [<package_path>]

Delete the symlink in ~/.atom/packages for the package. The package in the
current working directory is unlinked if no path is given.

Run \`apm links\` to view all the currently linked packages.

Options:
  --hard      Unlink package from ~/.atom/packages and ~/.atom/dev/packages                [boolean]
  -h, --help  Print this usage message
  -d, --dev   Unlink package from ~/.atom/dev/packages                                     [boolean]
  -a, --all   Unlink all packages in ~/.atom/packages and ~/.atom/dev/packages             [boolean]
`
  }

  getDevPackagePath(packageName: string) {
    return path.join(this.atomDevPackagesDirectory, packageName)
  }

  getPackagePath(packageName: string) {
    return path.join(this.atomPackagesDirectory, packageName)
  }

  unlinkPath(pathToUnlink: PathLike) {
    try {
      process.stdout.write(`Unlinking ${pathToUnlink} `)
      fs.unlinkSync(pathToUnlink)
      return this.logSuccess()
    } catch (error) {
      this.logFailure()
      throw error
    }
  }

  unlinkAll(options: ReturnType<Unlink["parseOptions"]>, callback: (error?: string | Error) => any) {
    try {
      let child: string, packagePath: string
      for (child of fs.list(this.atomDevPackagesDirectory)) {
        packagePath = path.join(this.atomDevPackagesDirectory, child)
        if (fs.isSymbolicLinkSync(packagePath)) {
          this.unlinkPath(packagePath)
        }
      }
      if (!options.dev) {
        for (child of fs.list(this.atomPackagesDirectory)) {
          packagePath = path.join(this.atomPackagesDirectory, child)
          if (fs.isSymbolicLinkSync(packagePath)) {
            this.unlinkPath(packagePath)
          }
        }
      }
      return callback()
    } catch (error) {
      return callback(error as Error)
    }
  }

  unlinkPackage(options: ReturnType<Unlink["parseOptions"]>, callback: (error?: string | Error) => any) {
    const packagePath = options._[0]?.toString() || "."
    const linkPath = path.resolve(process.cwd(), packagePath)

    let packageName: string | undefined
    try {
      packageName = CSON.readFileSync(CSON.resolve(path.join(linkPath, "package"))).name
    } catch (error3) {
      /* ignore error */
    }
    if (!packageName) {
      packageName = path.basename(linkPath)
    }

    let error: Error | undefined
    if (options.hard) {
      try {
        this.unlinkPath(this.getDevPackagePath(packageName))
        this.unlinkPath(this.getPackagePath(packageName))
        return callback()
      } catch (error1) {
        error = error1 as Error
        return callback(error as Error)
      }
    } else {
      let targetPath: string
      if (options.dev) {
        targetPath = this.getDevPackagePath(packageName)
      } else {
        targetPath = this.getPackagePath(packageName)
      }
      try {
        this.unlinkPath(targetPath)
        return callback()
      } catch (error2) {
        error = error2 as Error
        return callback(error)
      }
    }
  }

  run(givenOptions: CliOptions, callback: RunCallback) {
    const options = this.parseOptions(givenOptions.commandArgs)

    if (options.all) {
      return this.unlinkAll(options, callback)
    } else {
      return this.unlinkPackage(options, callback)
    }
  }
}
