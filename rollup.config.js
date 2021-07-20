import { createPlugins } from "rollup-plugin-atomic"

const plugins = createPlugins([
  "js",
  ["ts", { tsconfig: "./src/tsconfig.json" }, true],
  "json",
  // "visualizer"
])

const RollupConfig = [
  {
    input: "src/main.ts",
    output: [
      {
        dir: "dist",
        format: "cjs",
        sourcemap: process.env.NODE_ENV === "development" ? "inline" : true,
      },
    ],
    // loaded externally
    // these are built-in dependencies or
    // the ones that many other packages use and are probably cached by Node
    external: ["atom", "electron", "atom-package-deps"],
    plugins,
  },
]
export default RollupConfig
