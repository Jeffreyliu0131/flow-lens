import { readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'

const root = process.cwd()
const sourceRoot = join(root, 'src')
const bannedRuntimePatterns = [
  [/\bfetch\s*\(/, 'fetch'],
  [/\bXMLHttpRequest\b/, 'XMLHttpRequest'],
  [/\bWebSocket\b/, 'WebSocket'],
  [/\bEventSource\b/, 'EventSource'],
  [/\bsendBeacon\b/, 'sendBeacon'],
  [/\blocalStorage\b/, 'localStorage'],
  [/\bindexedDB\b/, 'indexedDB'],
  [/https?:\/\/(?!127\.0\.0\.1|localhost)/, 'external URL'],
  [/(api[_-]?key|secret[_-]?key|authorization:\s*bearer)/i, 'secret/API-key pattern'],
]

function walk(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry)
    return statSync(path).isDirectory() ? walk(path) : [path]
  })
}

const findings = []
for (const file of walk(sourceRoot)) {
  if (!['.ts', '.tsx', '.css'].includes(extname(file))) continue
  const content = readFileSync(file, 'utf8')
  for (const [pattern, label] of bannedRuntimePatterns) {
    if (pattern.test(content)) findings.push(`${relative(root, file)}: ${label}`)
  }
}

const indexHtml = readFileSync(join(root, 'index.html'), 'utf8')
if (!indexHtml.includes('connect-src __FLOW_LENS_CONNECT_SRC__')) {
  findings.push('index.html: environment-specific CSP placeholder is missing')
}
try {
  const builtHtml = readFileSync(join(root, 'dist/index.html'), 'utf8')
  if (!builtHtml.includes("connect-src 'none'")) {
    findings.push("dist/index.html: production connect-src is not 'none'")
  }
  if (/connect-src[^;]*(localhost|127\.0\.0\.1|wss?:)/.test(builtHtml)) {
    findings.push('dist/index.html: production CSP contains a localhost or WebSocket exception')
  }
} catch {
  findings.push('dist/index.html: production build is missing; run npm run build first')
}

if (findings.length > 0) {
  console.error('NO_EGRESS_CHECK_FAILED')
  findings.forEach((finding) => console.error(`- ${finding}`))
  process.exit(1)
}

console.log('NO_EGRESS_CHECK_PASS')
console.log('No fetch/XHR/WebSocket/EventSource/beacon, external URL, content persistence or secret pattern in src/.')
