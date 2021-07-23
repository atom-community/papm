/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS104: Avoid inline assignments
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import semver from "semver"
let deprecatedPackages = null

export function isDeprecatedPackage(name, version) {
  if (deprecatedPackages == null) {
    let left
    deprecatedPackages = (left = require("../deprecated-packages")) != null ? left : {}
  }
  if (!deprecatedPackages.hasOwnProperty(name)) {
    return false
  }

  const deprecatedVersionRange = deprecatedPackages[name].version
  if (!deprecatedVersionRange) {
    return true
  }

  return (
    semver.valid(version) &&
    semver.validRange(deprecatedVersionRange) &&
    semver.satisfies(version, deprecatedVersionRange)
  )
}
