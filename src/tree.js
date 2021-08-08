/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * DS205: Consider reworking code to avoid use of IIFEs
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */

export function tree(items, options = {}, callback) {
  if (typeof options === "function") {
    callback = options
    options = {}
  }
  if (callback == null) {
    callback = (item) => item
  }

  if (items.length === 0) {
    const emptyMessage = options.emptyMessage != null ? options.emptyMessage : "(empty)"
    return console.log(`\u2514\u2500\u2500 ${emptyMessage}`)
  } else {
    return (() => {
      const result = []
      for (let index = 0; index < items.length; index++) {
        let itemLine
        const item = items[index]
        if (index === items.length - 1) {
          itemLine = "\u2514\u2500\u2500 "
        } else {
          itemLine = "\u251C\u2500\u2500 "
        }
        result.push(console.log(`${itemLine}${callback(item)}`))
      }
      return result
    })()
  }
}
