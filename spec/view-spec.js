/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const path = require("path")
const express = require("express")
const http = require("http")
import * as apm from "../lib/apm-cli"
import findFreePort from "find-port-free-sync"

describe("apm view", function () {
  let server = null

  beforeEach(function () {
    spyOnConsole()
    spyOnToken()

    const app = express()
    app.get("/wrap-guide", (request, response) =>
      response.sendFile(path.join(__dirname, "fixtures", "wrap-guide.json"))
    )
    server = http.createServer(app)

    let live = false
    const port = findFreePort()
    server.listen(port, "127.0.0.1", function () {
      process.env.ATOM_PACKAGES_URL = `http://localhost:${port}`
      return (live = true)
    })
    waitsFor(() => live)
  })

  afterEach(function () {
    let done = false
    server.close(() => (done = true))
    waitsFor(() => done)
  })

  it("displays information about the package", function () {
    const callback = jasmine.createSpy("callback")
    apm.run(["view", "wrap-guide"], callback)

    waitsFor("waiting for view to complete", () => callback.callCount > 0)

    runs(function () {
      expect(console.log).toHaveBeenCalled()
      expect(console.log.argsForCall[0][0]).toContain("wrap-guide")
      expect(console.log.argsForCall[1][0]).toContain("0.14.0")
      expect(console.log.argsForCall[2][0]).toContain("https://github.com/atom/wrap-guide")
      expect(console.log.argsForCall[3][0]).toContain("new version")
    })
  })

  it("logs an error if the package name is missing or empty", function () {
    const callback = jasmine.createSpy("callback")
    apm.run(["view"], callback)

    waitsFor("waiting for view to complete", () => callback.callCount > 0)

    runs(function () {
      expect(console.error).toHaveBeenCalled()
      expect(console.error.argsForCall[0][0].length).toBeGreaterThan(0)
    })
  })

  describe("when a compatible Atom version is specified", () =>
    it("displays the latest compatible version of the package", function () {
      const callback = jasmine.createSpy("callback")
      apm.run(["view", "wrap-guide", "--compatible", "1.5.0"], callback)

      waitsFor("waiting for view to complete", 600000, () => callback.callCount === 1)

      runs(function () {
        expect(console.log.argsForCall[0][0]).toContain("wrap-guide")
        expect(console.log.argsForCall[1][0]).toContain("0.3.0")
        expect(console.log.argsForCall[2][0]).toContain("https://github.com/atom2/wrap-guide")
        expect(console.log.argsForCall[3][0]).toContain("old version")
      })
    }))
})
