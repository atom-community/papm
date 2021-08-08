/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const path = require("path")
const fs = require("fs-plus")
const temp = require("temp")
const apm = require("../lib/apm-cli")

describe("apm develop", function () {
  let [repoPath, linkedRepoPath] = Array.from([])

  beforeEach(function () {
    spyOnConsole()
    spyOnToken()

    const atomHome = temp.mkdirSync("apm-home-dir-")
    process.env.ATOM_HOME = atomHome

    const atomReposHome = temp.mkdirSync("apm-repos-home-dir-")
    process.env.ATOM_REPOS_HOME = atomReposHome

    repoPath = path.join(atomReposHome, "fake-package")
    return (linkedRepoPath = path.join(atomHome, "dev", "packages", "fake-package"))
  })

  describe("when the package doesn't have a published repository url", () =>
    it("logs an error", function () {
      const Develop = require("../lib/develop")
      spyOn(Develop.prototype, "getRepositoryUrl").andCallFake((packageName, callback) => callback("Here is the error"))

      const callback = jasmine.createSpy("callback")
      apm.run(["develop", "fake-package"], callback)

      waitsFor("waiting for develop to complete", () => callback.callCount === 1)

      return runs(function () {
        expect(callback.mostRecentCall.args[0]).toBe("Here is the error")
        expect(fs.existsSync(repoPath)).toBeFalsy()
        return expect(fs.existsSync(linkedRepoPath)).toBeFalsy()
      })
    }))

  describe("when the repository hasn't been cloned", () =>
    it("clones the repository to ATOM_REPOS_HOME and links it to ATOM_HOME/dev/packages", function () {
      const Develop = require("../lib/develop")
      spyOn(Develop.prototype, "getRepositoryUrl").andCallFake(function (packageName, callback) {
        const repoUrl = path.join(__dirname, "fixtures", "repo.git")
        return callback(null, repoUrl)
      })
      spyOn(Develop.prototype, "installDependencies").andCallFake(function (packageDirectory, options, callback) {
        return this.linkPackage(packageDirectory, options, callback)
      })

      const callback = jasmine.createSpy("callback")
      apm.run(["develop", "fake-package"], callback)

      waitsFor("waiting for develop to complete", () => callback.callCount === 1)

      return runs(function () {
        expect(callback.mostRecentCall.args[0]).toBeFalsy()
        expect(fs.existsSync(repoPath)).toBeTruthy()
        expect(fs.existsSync(path.join(repoPath, "Syntaxes", "Makefile.plist"))).toBeTruthy()
        expect(fs.existsSync(linkedRepoPath)).toBeTruthy()
        return expect(fs.realpathSync(linkedRepoPath)).toBe(fs.realpathSync(repoPath))
      })
    }))

  return describe("when the repository has already been cloned", () =>
    it("links it to ATOM_HOME/dev/packages", function () {
      fs.makeTreeSync(repoPath)
      fs.writeFileSync(path.join(repoPath, "package.json"), "")
      const callback = jasmine.createSpy("callback")
      apm.run(["develop", "fake-package"], callback)

      waitsFor("waiting for develop to complete", () => callback.callCount === 1)

      return runs(function () {
        expect(callback.mostRecentCall.args[0]).toBeFalsy()
        expect(fs.existsSync(repoPath)).toBeTruthy()
        expect(fs.existsSync(linkedRepoPath)).toBeTruthy()
        return expect(fs.realpathSync(linkedRepoPath)).toBe(fs.realpathSync(repoPath))
      })
    }))
})
