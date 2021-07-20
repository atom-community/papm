describe("tests", () => {
  beforeEach(async () => {
    jasmine.attachToDOM(atom.views.getView(atom.workspace))

    /*    Activation     */
    // Trigger deferred activation
    atom.packages.triggerDeferredActivationHooks()
    // Activate activation hook
    atom.packages.triggerActivationHook("core:loaded-shell-environment")

    // Activate the package
    await atom.packages.activatePackage("papm")
  })

  it("Activation", function () {
    expect(atom.packages.isPackageLoaded("papm")).toBeTruthy()
  })
})
