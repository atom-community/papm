/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const child_process = require("child_process")
const path = require("path")
const temp = require("temp")
import * as apm from "../lib/apm-cli"

describe("apm test", function () {
  let [specPath] = Array.from([])

  beforeEach(function () {
    spyOnConsole()
    spyOnToken()

    const currentDir = temp.mkdirSync("apm-init-")
    spyOn(process, "cwd").andReturn(currentDir)
    return (specPath = path.join(currentDir, "spec"))
  })

  it("calls atom to test", function () {
    const atomSpawn = spyOn(child_process, "spawn").andReturn({
      stdout: {
        on() {},
      },
      stderr: {
        on() {},
      },
      on() {},
    })
    apm.run(["test"])

    waitsFor("waiting for test to complete", () => atomSpawn.callCount === 1)

    runs(function () {
      // On Windows, there's a suffix (atom.cmd), so we only check that atom is _included_ in the path
      expect(atomSpawn.mostRecentCall.args[0].indexOf("atom")).not.toBe(-1)
      expect(atomSpawn.mostRecentCall.args[1][0]).toEqual("--dev")
      expect(atomSpawn.mostRecentCall.args[1][1]).toEqual("--test")
      expect(atomSpawn.mostRecentCall.args[1][2]).toEqual(specPath)
      if (process.platform !== "win32") {
        expect(atomSpawn.mostRecentCall.args[2].streaming).toBeTruthy()
      }
    })
  })

  describe("returning", function () {
    let [callback] = Array.from([])

    const returnWithCode = function (type, code) {
      callback = jasmine.createSpy("callback")
      const atomReturnFn = function (e, fn) {
        if (e === type) {
          return fn(code)
        }
      }
      spyOn(child_process, "spawn").andReturn({
        stdout: {
          on() {},
        },
        stderr: {
          on() {},
        },
        on: atomReturnFn,
        removeListener() {},
      }) // no op
      apm.run(["test"], callback)
    }

    describe("successfully", function () {
      beforeEach(() => returnWithCode("close", 0))

      it("prints success", function () {
        expect(callback).toHaveBeenCalled()
        expect(callback.mostRecentCall.args[0]).toBeUndefined()
        expect(process.stdout.write.mostRecentCall.args[0]).toEqual("Tests passed\n".green)
      })
    })

    describe("with a failure", function () {
      beforeEach(() => returnWithCode("close", 1))

      it("prints failure", function () {
        expect(callback).toHaveBeenCalled()
        expect(callback.mostRecentCall.args[0]).toEqual("Tests failed")
      })
    })

    describe("with an error", function () {
      beforeEach(() => returnWithCode("error"))

      it("prints failure", function () {
        expect(callback).toHaveBeenCalled()
        expect(callback.mostRecentCall.args[0]).toEqual("Tests failed")
      })
    })
  })
})
