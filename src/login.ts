/*
 * decaffeinate suggestions:
 * DS002: Fix invalid constructor
 * DS102: Remove unnecessary code created because of implicit returns
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */
import Q from "q"
import read from "read"
import open from "open"

import * as auth from "./auth"
import Command from "./command"
import type { CliOptions } from "./apm-cli"
import mri from "mri"

type State = {
  token: string
}

export default class Login extends Command {
  constructor() {
    super()
    this.welcomeMessage = this.welcomeMessage.bind(this)
    this.getToken = this.getToken.bind(this)
    this.saveToken = this.saveToken.bind(this)
  }

  static getTokenOrLogin(callback: (error: string | null, token?: string) => Promise<void>) {
    return auth.getToken(function (error: string | null, token: string) {
      if (error != null) {
        return new Login().run({ commandArgs: [] }, callback)
      } else {
        return callback(null, token)
      }
    })
  }

  parseOptions(argv: string[]) {
    return mri<{
      help: boolean
      token: string
    }>(argv, {
      alias: { h: "help" },
      boolean: ["help"],
      string: ["token"],
    })
  }

  help() {
    return `Usage: apm login

Enter your Atom.io API token and save it to the keychain. This token will
be used to identify you when publishing packages to atom.io.

Options:
  --token     atom.io API token                                                             [string]
  -h, --help  Print this usage message
`
  }

  run(givenOptions: CliOptions, callback: (err: string | null, token?: string) => any) {
    const options = this.parseOptions(givenOptions.commandArgs)
    return Q({ token: options.token } as State)
      .then(this.welcomeMessage)
      .then(this.openURL)
      .then(this.getToken)
      .then(this.saveToken)
      .then((token: string) => callback(null, token))
      .catch(callback)
  }

  prompt(options: { prompt: string; edit?: boolean }) {
    const readPromise = Q.denodeify(read)
    return readPromise(options)
  }

  welcomeMessage(state: State) {
    if (state.token) {
      return Q(state)
    }

    const welcome = `\
Welcome to Atom!

Before you can publish packages, you'll need an API token.

Visit your account page on Atom.io ${"https://atom.io/account".underline},
copy the token and paste it below when prompted.
\
`
    console.log(welcome)

    return this.prompt({ prompt: "Press [Enter] to open your account page on Atom.io." })
  }

  openURL(state: State) {
    if (state.token) {
      return Q(state)
    }

    return open("https://atom.io/account")
  }

  getToken(state: State) {
    if (state.token) {
      return Q(state)
    }

    return this.prompt({ prompt: "Token>", edit: true }).spread(function (token) {
      state.token = token
      return Q(state)
    })
  }

  saveToken({ token }: State) {
    if (!token) {
      throw new Error("Token is required")
    }

    process.stdout.write("Saving token to Keychain ")
    auth.saveToken(token)
    this.logSuccess()
    return Q(token)
  }
}
