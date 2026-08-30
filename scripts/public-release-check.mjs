import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname } from 'node:path'

const tracked = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean)

const allowedPublicDocs = new Set([
  'docs/ARCHITECTURE.md',
  'docs/PRIVACY.md',
  'docs/FIXTURES.md',
  'docs/KNOWN_LIMITATIONS.md',
  'docs/TESTING.md',
  'docs/DECISION_RECORD.md',
])

const allowedExact = new Set([
  '.gitignore',
  'ASSET_LICENSE.md',
  'CHANGELOG.md',
  'CODE_OF_CONDUCT.md',
  'CONTRIBUTING.md',
  'EXPERIENCE_ACCEPTANCE.md',
  'LICENSE',
  'PRODUCT_BRIEF.md',
  'README.md',
  'SECURITY.md',
  'SUPPORT.md',
  'eslint.config.js',
  'index.html',
  'package-lock.json',
  'package.json',
  'playwright.config.ts',
  'playwright.production.config.ts',
  'tsconfig.app.json',
  'tsconfig.json',
  'tsconfig.node.json',
  'vite.config.ts',
  'vitest.config.ts',
  ...allowedPublicDocs,
  'docs/assets/flow-lens-first-run-desktop.png',
  'docs/assets/flow-lens-evidence-workbench-desktop.png',
  'docs/assets/flow-lens-mobile-review.png',
  'artifacts/fixtures/synthetic-local-valid.webm',
  'public/fixtures/flow-lens-synthetic-v1.provenance.json',
])

const allowedPrefixes = ['.github/', 'e2e/', 'scripts/', 'src/']

const forbiddenExact = new Set([
  'AGENTS.md',
  'ASSUMPTIONS.md',
  'DECISIONS.md',
  'RISKS.md',
  'STATUS.md',
])

const forbiddenPrefixes = [
  '.agents/',
  '.codex/',
  'coverage/',
  'dist/',
  'node_modules/',
  'playwright-report/',
  'test-results/',
  'docs/councils/',
  'docs/implementation/',
  'docs/manifests/',
  'docs/research/',
  'docs/spikes/',
  'artifacts/audits/',
  'artifacts/screenshots/',
]

const binaryExtensions = new Set([
  '.gif',
  '.ico',
  '.jpeg',
  '.jpg',
  '.mp3',
  '.mp4',
  '.pdf',
  '.png',
  '.webm',
  '.woff',
  '.woff2',
  '.zip',
])

const bannedTextPatterns = [
  [/\/Users\/[^/\s]+\//, 'macOS absolute user path'],
  [/\/home\/[^/\s]+\//, 'Linux absolute user path'],
  [/[A-Za-z]:\\Users\\[^\\\s]+\\/, 'Windows absolute user path'],
  [/\.(?:codex|agents)\/skills\//, 'internal skill installation path'],
  [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, 'private key'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'AWS access key'],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}\b/, 'GitHub token'],
  [/\bsk-[A-Za-z0-9_-]{20,}\b/, 'API key-like token'],
]

const findings = []

for (const file of tracked) {
  if (
    !allowedExact.has(file) &&
    !allowedPrefixes.some((prefix) => file.startsWith(prefix))
  ) {
    findings.push(`${file}: not in exact public allowlist`)
  }
  if (forbiddenExact.has(file)) findings.push(`${file}: internal root ledger`)
  if (forbiddenPrefixes.some((prefix) => file.startsWith(prefix))) {
    findings.push(`${file}: forbidden internal/volatile path`)
  }
  if (file.startsWith('docs/') && !file.startsWith('docs/assets/') && !allowedPublicDocs.has(file)) {
    findings.push(`${file}: not in public docs allowlist`)
  }
  if (/\.env(?:\.|$)/.test(file) || /\.(?:key|pem|p12|pfx|map|sha256)$/.test(file)) {
    findings.push(`${file}: credential/source-map/manifest path`)
  }
  if (/audit.*\.json$/i.test(file) || /(?:performance|license-inventory).*\.json$/i.test(file)) {
    findings.push(`${file}: volatile audit artifact`)
  }

  const size = statSync(file).size
  if (size > 5 * 1024 * 1024) findings.push(`${file}: exceeds 5 MiB (${size} bytes)`)

  if (binaryExtensions.has(extname(file).toLowerCase())) continue
  const content = readFileSync(file, 'utf8')
  for (const [pattern, label] of bannedTextPatterns) {
    if (pattern.test(content)) findings.push(`${file}: ${label}`)
  }
}

const requiredFiles = [
  'LICENSE',
  'ASSET_LICENSE.md',
  'README.md',
  'PRODUCT_BRIEF.md',
  'EXPERIENCE_ACCEPTANCE.md',
  'docs/assets/flow-lens-first-run-desktop.png',
  'docs/assets/flow-lens-evidence-workbench-desktop.png',
  'docs/assets/flow-lens-mobile-review.png',
]
for (const file of requiredFiles) {
  if (!tracked.includes(file) || !existsSync(file)) findings.push(`${file}: required public file missing`)
}

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
if (packageJson.license !== 'MIT') findings.push('package.json: license must be MIT')
if (packageJson.repository?.url !== 'https://github.com/Jeffreyliu0131/flow-lens.git') {
  findings.push('package.json: repository URL mismatch')
}

const provenance = JSON.parse(
  readFileSync('public/fixtures/flow-lens-synthetic-v1.provenance.json', 'utf8'),
)
if (provenance.redistribution !== 'MIT') {
  findings.push('synthetic provenance: redistribution must be MIT')
}

if (findings.length > 0) {
  console.error('PUBLIC_RELEASE_CHECK_FAILED')
  findings.forEach((finding) => console.error(`- ${finding}`))
  process.exit(1)
}

console.log(`PUBLIC_RELEASE_CHECK_PASS tracked=${tracked.length}`)
