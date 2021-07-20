import { CompositeDisposable } from "atom"

// Events subscribed to in atom's system can be easily cleaned up with a CompositeDisposable
const subscriptions = new CompositeDisposable()

/** Called by Atom when activating an extension */
export function activate() {
  package_deps()
    .then(() => {
      // do package stuff here
    })
    .catch((e) => {
      throw e
    })
}

/** Install Atom package dependencies if not already loaded */
async function package_deps() {
  // Add entries from package-deps here manually
  // (to prevent loading atom-package-deps and package.json when the deps are already loaded)
  const deps: string[] = []
  if (deps.some((p) => !atom.packages.isPackageLoaded(p))) {
    // install if not installed
    await (await import("atom-package-deps")).install("atom-ide-template-js", false)
    // enable if disabled
    deps
      .filter((p) => !atom.packages.isPackageLoaded(p))
      .forEach((p) => {
        atom.notifications.addInfo(`Enabling package ${p} that is needed for "atom-ide-template-js"`)
        atom.packages.enablePackage(p)
      })
  }
}

/** Called by Atom when deactivating an extension */
export function deactivate() {
  subscriptions.dispose()
}

/**
 * Called by IDE extensions to retrieve the service for registration
 *
 * @returns The current instance
 */
export function provideYourService() {
  // your service
}

export const config = {
  doSomething: {
    title: "title",
    description: "config description",
    type: "boolean", // 'number', 'string'
    default: true,
  },
}
