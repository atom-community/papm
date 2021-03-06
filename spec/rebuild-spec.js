/*
 * decaffeinate suggestions:
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
const path = require("path")
const temp = require("temp")
const express = require("express")
const http = require("http")
import * as apm from "../lib/apm-cli"
import fs from "fs"

const atomElectronVersion = fs.readFileSync(`${path.dirname(__dirname)}/.npmrc`, "utf8").match(/target=(.*)\n/)[1]

describe("apm rebuild", function () {
  let [server, originalPathEnv] = Array.from([])

  beforeEach(function () {
    spyOnToken()
    spyOnConsole()

    const app = express()
    app.get(`/node/${atomElectronVersion}/node-${atomElectronVersion}.tar.gz`, (request, response) =>
      response.sendFile(path.join(__dirname, `fixtures`, `node-${atomElectronVersion}.tar.gz`))
    )
    app.get(`/node/${atomElectronVersion}/node-${atomElectronVersion}-headers.tar.gz`, (request, response) =>
      response.sendFile(path.join(__dirname, `fixtures`, `node-${atomElectronVersion}-headers.tar.gz`))
    )
    app.get(`/node/${atomElectronVersion}/node.lib`, (request, response) =>
      response.sendFile(path.join(__dirname, `fixtures`, `node.lib`))
    )
    app.get(`/node/${atomElectronVersion}/x64/node.lib`, (request, response) =>
      response.sendFile(path.join(__dirname, `fixtures`, `node_x64.lib`))
    )
    app.get(`/node/${atomElectronVersion}/SHASUMS256.txt`, (request, response) =>
      response.sendFile(path.join(__dirname, "fixtures", "SHASUMS256.txt"))
    )

    server = http.createServer(app)

    let live = false
    server.listen(3000, "127.0.0.1", function () {
      const atomHome = temp.mkdirSync("apm-home-dir-")
      process.env.ATOM_HOME = atomHome
      process.env.ATOM_ELECTRON_URL = "http://localhost:3000/node"
      process.env.ATOM_PACKAGES_URL = "http://localhost:3000/packages"
      process.env.ATOM_ELECTRON_VERSION = atomElectronVersion
      process.env.ATOM_RESOURCE_PATH = temp.mkdirSync("atom-resource-path-")

      originalPathEnv = process.env.PATH
      process.env.PATH = ""
      return (live = true)
    })
    waitsFor(() => live)
  })

  afterEach(function () {
    process.env.PATH = originalPathEnv

    let done = false
    server.close(() => (done = true))
    waitsFor(() => done)
  })

  it("rebuilds all modules when no module names are specified", function () {
    const packageToRebuild = path.join(__dirname, "fixtures/package-with-native-deps")

    process.chdir(packageToRebuild)
    const callback = jasmine.createSpy("callback")
    apm.run(["rebuild"], callback)

    waitsFor("waiting for rebuild to complete", 600000, () => callback.callCount === 1)

    runs(() => expect(callback.mostRecentCall.args[0]).toBeUndefined())
  })

  it("rebuilds the specified modules", function () {
    const packageToRebuild = path.join(__dirname, "fixtures/package-with-native-deps")

    process.chdir(packageToRebuild)
    const callback = jasmine.createSpy("callback")
    apm.run(["rebuild", "native-dep"], callback)

    waitsFor("waiting for rebuild to complete", 600000, () => callback.callCount === 1)

    runs(() => expect(callback.mostRecentCall.args[0]).toBeUndefined())
  })
})
