/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import path from "path"
import Command from "./command"
import fs from "./fs"
import type { CliOptions, RunCallback } from "./apm-cli"
import mri from "mri"

const supportedSyntaxes = ["coffeescript", "javascript"]

export default class Init extends Command {
  parseOptions(argv: string[]) {
    return mri<{
      help: boolean
      package: string
      syntax: string
      theme: string
      convert: string
      template: string
      language: string
    }>(argv, {
      alias: { h: "help", p: "package", s: "syntax", t: "theme", l: "language", c: "convert" },
      boolean: ["help"],
      string: ["package", "syntax", "theme", "language", "convert", "template"],
    })
  }

  help() {
    return `Usage:
  apm init -p <package-name>
  apm init -p <package-name> --syntax <javascript-or-coffeescript>
  apm init -p <package-name> -c ~/Downloads/r.tmbundle
  apm init -p <package-name> -c https://github.com/textmate/r.tmbundle
  apm init -p <package-name> --template /path/to/your/package/template

  apm init -t <theme-name>
  apm init -t <theme-name> -c ~/Downloads/Dawn.tmTheme
  apm init -t <theme-name> -c https://raw.github.com/chriskempson/tomorrow-theme/master/textmate/Tomorrow-Night-Eighties.tmTheme
  apm init -t <theme-name> --template /path/to/your/theme/template

  apm init -l <language-name>

Generates code scaffolding for either a theme or package depending
on the option selected.

Options:
  --template      Path to the package or theme template                                     [string]
  -p, --package   Generates a basic package                                                 [string]
  -s, --syntax    Sets package syntax to CoffeeScript or JavaScript                         [string]
  -t, --theme     Generates a basic theme                                                   [string]
  -l, --language  Generates a basic language package                                        [string]
  -c, --convert   Path or URL to TextMate bundle/theme to convert                           [string]
  -h, --help      Print this usage message
`
  }

  run(givenOptions: CliOptions, callback: RunCallback) {
    let templatePath
    const options = this.parseOptions(givenOptions.commandArgs)
    if (options.package?.length > 0) {
      if (options.convert) {
        return this.convertPackage(options.convert, options.package, callback)
      } else {
        const packagePath = path.resolve(options.package)
        const syntax = options.syntax || supportedSyntaxes[0]
        if (!supportedSyntaxes.includes(syntax)) {
          return callback(`You must specify one of ${supportedSyntaxes.join(", ")} after the --syntax argument`)
        }
        templatePath = this.getTemplatePath(options.template, `package-${syntax}`)
        this.generateFromTemplate(packagePath, templatePath)
        return callback()
      }
    } else if (options.theme?.length > 0) {
      if (options.convert) {
        return this.convertTheme(options.convert, options.theme, callback)
      } else {
        const themePath = path.resolve(options.theme)
        templatePath = this.getTemplatePath(options.template, "theme")
        this.generateFromTemplate(themePath, templatePath)
        return callback()
      }
    } else if (options.language?.length > 0) {
      let languagePath = path.resolve(options.language)
      const languageName = path.basename(languagePath).replace(/^language-/, "")
      languagePath = path.join(path.dirname(languagePath), `language-${languageName}`)
      templatePath = this.getTemplatePath(options.template, "language")
      this.generateFromTemplate(languagePath, templatePath, languageName)
      return callback()
    } else if (options.package != null) {
      return callback("You must specify a path after the --package argument")
    } else if (options.theme != null) {
      return callback("You must specify a path after the --theme argument")
    } else {
      return callback("You must specify either --package, --theme or --language to `apm init`")
    }
  }

  convertPackage(sourcePath: string, destinationPath: string, callback) {
    if (!destinationPath) {
      callback("Specify directory to create package in using --package")
      return
    }

    const PackageConverter = require("./package-converter").default
    const converter = new PackageConverter(sourcePath, destinationPath)
    return converter.convert((error) => {
      if (error != null) {
        return callback(error)
      } else {
        destinationPath = path.resolve(destinationPath)
        const templatePath = path.resolve(__dirname, "..", "templates", "bundle")
        this.generateFromTemplate(destinationPath, templatePath)
        return callback()
      }
    })
  }

  convertTheme(sourcePath: string, destinationPath: string, callback: { (error?: string | Error): any }) {
    if (!destinationPath) {
      callback("Specify directory to create theme in using --theme")
      return
    }

    const ThemeConverter = require("./theme-converter").default
    const converter = new ThemeConverter(sourcePath, destinationPath)
    return converter.convert((error) => {
      if (error != null) {
        return callback(error)
      } else {
        destinationPath = path.resolve(destinationPath)
        const templatePath = path.resolve(__dirname, "..", "templates", "theme")
        this.generateFromTemplate(destinationPath, templatePath)
        fs.removeSync(path.join(destinationPath, "styles", "colors.less"))
        fs.removeSync(path.join(destinationPath, "LICENSE.md"))
        return callback()
      }
    })
  }

  generateFromTemplate(packagePath: string, templatePath: string, packageName?: string) {
    if (packageName == null) {
      packageName = path.basename(packagePath)
    }
    const packageAuthor = process.env.GITHUB_USER || "atom"

    fs.makeTreeSync(packagePath)

    return (() => {
      const result = []
      for (const childPath of fs.listRecursive(templatePath)) {
        const templateChildPath = path.resolve(templatePath, childPath)
        let relativePath = templateChildPath.replace(templatePath, "")
        relativePath = relativePath.replace(/^\//, "")
        relativePath = relativePath.replace(/\.template$/, "")
        relativePath = this.replacePackageNamePlaceholders(relativePath, packageName)

        const sourcePath = path.join(packagePath, relativePath)
        if (fs.existsSync(sourcePath)) {
          continue
        }
        if (fs.isDirectorySync(templateChildPath)) {
          result.push(fs.makeTreeSync(sourcePath))
        } else if (fs.isFileSync(templateChildPath)) {
          fs.makeTreeSync(path.dirname(sourcePath))
          let contents = fs.readFileSync(templateChildPath).toString()
          contents = this.replacePackageNamePlaceholders(contents, packageName)
          contents = this.replacePackageAuthorPlaceholders(contents, packageAuthor)
          contents = this.replaceCurrentYearPlaceholders(contents)
          result.push(fs.writeFileSync(sourcePath, contents))
        } else {
          result.push(undefined)
        }
      }
      return result
    })()
  }

  replacePackageAuthorPlaceholders(string: string, packageAuthor: string) {
    return string.replace(/__package-author__/g, packageAuthor)
  }

  replacePackageNamePlaceholders(string: string, packageName: string) {
    const placeholderRegex = /__(?:(package-name)|([Pp]ackageName)|(package_name))__/g
    return (string = string.replace(placeholderRegex, (match, dash, camel, underscore) => {
      if (dash) {
        return this.dasherize(packageName)
      } else if (camel) {
        if (/[a-z]/.test(camel[0])) {
          packageName = packageName[0].toLowerCase() + packageName.slice(1)
        } else if (/[A-Z]/.test(camel[0])) {
          packageName = packageName[0].toUpperCase() + packageName.slice(1)
        }
        return this.camelize(packageName)
      } else if (underscore) {
        return this.underscore(packageName)
      }
    }))
  }

  replaceCurrentYearPlaceholders(string: string): string {
    return string.replace("__current_year__", String(new Date().getFullYear()))
  }

  getTemplatePath(template: string | undefined, templateType: string) {
    if (template != null) {
      return path.resolve(template)
    } else {
      return path.resolve(__dirname, "..", "templates", templateType)
    }
  }

  dasherize(string: string) {
    string = string[0].toLowerCase() + string.slice(1)
    return string.replace(/([A-Z])|(_)/g, function (m, letter) {
      if (letter) {
        return `-${letter.toLowerCase()}`
      } else {
        return "-"
      }
    })
  }

  camelize(string: string) {
    return string.replace(/[_-]+(\w)/g, (m) => m[1].toUpperCase())
  }

  underscore(string: string) {
    string = string[0].toLowerCase() + string.slice(1)
    return string.replace(/([A-Z])|(-)/g, function (m, letter) {
      if (letter) {
        return `_${letter.toLowerCase()}`
      } else {
        return "_"
      }
    })
  }
}
