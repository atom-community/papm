// makes terser do more optimizations
module.exports = require("terser-config-atomic")

// NOTE: if the code depends on bad JavaScript practicies (e.g. using `{}.hasOwnProperty()`),
// the resulting code might have a difference behavior. So, ensure that the bundle is functional.
