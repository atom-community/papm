const { execSync } = require("child_process")

const execSettings = { shell: true, stdio: "inherit" }
execSync(
  `curl https://github.com/atom-community/apm/raw/master/spec/fixtures/node-v10.20.1.tar.gz -o "./spec/fixtures/node-v10.20.1.tar.gz"`,
  execSettings
)
execSync(
  `curl https://github.com/atom-community/apm/raw/master/spec/fixtures/node.lib -o "./spec/fixtures/node.lib"`,
  execSettings
)
execSync(
  `curl https://github.com/atom-community/apm/raw/master/spec/fixtures/node_x64.lib -o "./spec/fixtures/node_x64.lib"`,
  execSettings
)
