describe("Benchmark", () => {
  // This number doesn't match what timecope gives, but shows the trend
  it("Activation Benchmark", function () {
    jasmine.attachToDOM(atom.views.getView(atom.workspace))
    atom.packages.triggerDeferredActivationHooks()
    // Activate activation hook
    atom.packages.triggerActivationHook("core:loaded-shell-environment")

    // For benchmark, activate the deps manually before loading the actual package:
    const deps = []
    deps.forEach((p) => atom.packages.activatePackage(p))

    // Activate the package
    measure("Activation Time", async function activationBenchmark() {
      await atom.packages.activatePackage("papm")
    })

    expect(atom.packages.isPackageLoaded("papm")).toBeTruthy()
  })
})
