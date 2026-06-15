export function globToRegExp(glob) {
  let re = '^'
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]
    if (c === '*' && glob[i + 1] === '*') {
      i++
      if (glob[i + 1] === '/') { i++; re += '(?:.*/)?' }
      else re += '.*'
    } else if (c === '*') {
      re += '[^/]*'
    } else if ('.+?^${}()|[]\\'.includes(c)) {
      re += '\\' + c
    } else {
      re += c
    }
  }
  return new RegExp(re + '$')
}

export function matchAny(filePath, globs) {
  return globs.some((g) => globToRegExp(g).test(filePath))
}
