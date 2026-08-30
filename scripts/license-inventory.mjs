import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const root = process.cwd()
const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'))
const direct = new Set([
  ...Object.keys(packageJson.dependencies ?? {}),
  ...Object.keys(packageJson.devDependencies ?? {}),
])

const inventory = Object.entries(lock.packages ?? {})
  .filter(([path]) => path.startsWith('node_modules/'))
  .map(([path, entry]) => {
    const manifestPath = join(root, path, 'package.json')
    let manifest = {}
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    } catch {
      manifest = {}
    }
    return {
      name: manifest.name ?? path.replace(/^node_modules\//, ''),
      version: manifest.version ?? entry.version ?? 'unknown',
      license: manifest.license ?? entry.license ?? 'UNKNOWN',
      direct: direct.has(manifest.name),
      path,
    }
  })
  .sort((left, right) => left.name.localeCompare(right.name) || left.version.localeCompare(right.version))

const output = join(root, 'artifacts/license-inventory.json')
mkdirSync(dirname(output), { recursive: true })
writeFileSync(output, `${JSON.stringify({ generatedAt: new Date().toISOString(), legalOpinion: false, packages: inventory }, null, 2)}\n`)

const unknown = inventory.filter((item) => item.license === 'UNKNOWN')
console.log(`LICENSE_INVENTORY_PASS packages=${inventory.length} unknown=${unknown.length}`)
if (unknown.length > 0) console.log(`Unknown license metadata: ${unknown.map((item) => item.name).join(', ')}`)
