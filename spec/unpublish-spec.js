/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS201: Simplify complex destructure assignments
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const express = require("express")
const http = require("http")
const temp = require("temp")
import * as apm from "../lib/apm-cli"
import Unpublish from "../lib/unpublish"

describe("apm unpublish", function () {
  let [server, unpublishPackageCallback, unpublishVersionCallback] = Array.from([])

  beforeEach(function () {
    spyOnConsole()
    spyOnToken()

    unpublishPackageCallback = jasmine.createSpy("unpublishPackageCallback")
    unpublishVersionCallback = jasmine.createSpy("unpublishVersionCallback")

    const app = express()

    app.delete("/packages/test-package", function (request, response) {
      unpublishPackageCallback()
      return response.status(204).send(204)
    })

    app.delete("/packages/test-package/versions/1.0.0", function (request, response) {
      unpublishVersionCallback()
      return response.status(204).send(204)
    })

    server = http.createServer(app)

    let live = false
    server.listen(3000, "127.0.0.1", function () {
      process.env.ATOM_HOME = temp.mkdirSync("apm-home-dir-")
      process.env.ATOM_API_URL = "http://localhost:3000"
      return (live = true)
    })
    waitsFor(() => live)
  })

  afterEach(function () {
    let done = false
    server.close(() => (done = true))
    waitsFor(() => done)
  })

  describe("when no version is specified", function () {
    it("unpublishes the package", function () {
      const callback = jasmine.createSpy("callback")
      apm.run(["unpublish", "--force", "test-package"], callback)

      waitsFor("waiting for unpublish command to complete", () => callback.callCount > 0)

      runs(function () {
        expect(callback.argsForCall[0][0]).toBeUndefined()
        expect(unpublishPackageCallback.callCount).toBe(1)
        expect(unpublishVersionCallback.callCount).toBe(0)
      })
    })

    describe("when --force is not specified", function () {
      it("prompts to unpublish ALL versions", function () {
        const callback = jasmine.createSpy("callback")
        spyOn(Unpublish.prototype, "prompt")
        apm.run(["unpublish", "test-package"], callback)

        waitsFor("waiting for prompt to be called", () =>
          Unpublish.prototype.prompt.argsForCall[0][0].match(/unpublish ALL VERSIONS of 'test-package'.*irreversible/)
        )
      })

      describe("when the user accepts the default answer", () =>
        it("does not unpublish the package", function () {
          const callback = jasmine.createSpy("callback")
          spyOn(Unpublish.prototype, "prompt").andCallFake(function (...args1) {
            const adjustedLength = Math.max(args1.length, 1),
              cb = args1[adjustedLength - 1]
            return cb("")
          })
          spyOn(Unpublish.prototype, "unpublishPackage")
          apm.run(["unpublish", "test-package"], callback)

          waitsFor("waiting for unpublish command to complete", () => callback.callCount > 0)

          runs(function () {
            expect(Unpublish.prototype.unpublishPackage).not.toHaveBeenCalled()
            expect(callback.argsForCall[0][0]).toMatch(/Cancelled/)
          })
        }))
    })

    describe("when the package does not exist", () =>
      it("calls back with an error", function () {
        const callback = jasmine.createSpy("callback")
        apm.run(["unpublish", "--force", "not-a-package"], callback)

        waitsFor("waiting for unpublish command to complete", () => callback.callCount > 0)

        runs(function () {
          expect(callback.argsForCall[0][0]).not.toBeUndefined()
          expect(unpublishPackageCallback.callCount).toBe(0)
          expect(unpublishVersionCallback.callCount).toBe(0)
        })
      }))
  })

  describe("when a version is specified", function () {
    it("unpublishes the version", function () {
      const callback = jasmine.createSpy("callback")
      apm.run(["unpublish", "--force", "test-package@1.0.0"], callback)

      waitsFor("waiting for unpublish command to complete", () => callback.callCount > 0)

      runs(function () {
        expect(callback.argsForCall[0][0]).toBeUndefined()
        expect(unpublishPackageCallback.callCount).toBe(0)
        expect(unpublishVersionCallback.callCount).toBe(1)
      })
    })

    describe("when --force is not specified", function () {
      it("prompts to unpublish that version", function () {
        const callback = jasmine.createSpy("callback")
        spyOn(Unpublish.prototype, "prompt")
        apm.run(["unpublish", "test-package@1.0.0"], callback)

        waitsFor("waiting for prompt to be called", () =>
          Unpublish.prototype.prompt.argsForCall[0][0].match(/unpublish 'test-package@1.0.0'/)
        )
      })

      describe("when the user accepts the default answer", () =>
        it("does not unpublish the package", function () {
          const callback = jasmine.createSpy("callback")
          spyOn(Unpublish.prototype, "prompt").andCallFake(function (...args1) {
            const adjustedLength = Math.max(args1.length, 1),
              cb = args1[adjustedLength - 1]
            return cb("")
          })
          spyOn(Unpublish.prototype, "unpublishPackage")
          apm.run(["unpublish", "test-package"], callback)

          waitsFor("waiting for unpublish command to complete", () => callback.callCount > 0)

          runs(function () {
            expect(Unpublish.prototype.unpublishPackage).not.toHaveBeenCalled()
            expect(callback.argsForCall[0][0]).toMatch(/Cancelled/)
          })
        }))
    })

    describe("when the version does not exist", () =>
      it("calls back with an error", function () {
        const callback = jasmine.createSpy("callback")
        apm.run(["unpublish", "--force", "test-package@2.0.0"], callback)

        waitsFor("waiting for unpublish command to complete", () => callback.callCount > 0)

        runs(function () {
          expect(callback.argsForCall[0][0]).not.toBeUndefined()
          expect(unpublishPackageCallback.callCount).toBe(0)
          expect(unpublishVersionCallback.callCount).toBe(0)
        })
      }))
  })
})
