import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const vercelJson = JSON.parse(readFileSync(resolve(root, 'vercel.json'), 'utf8'))

if (vercelJson.framework !== 'vite') {
  throw new Error('Vercel must use the Vite framework for this static release.')
}

if (
  vercelJson.buildCommand !== 'npm run build' ||
  vercelJson.outputDirectory !== 'dist'
) {
  throw new Error('Vercel must build with npm run build and publish dist/.')
}

if (vercelJson.env || vercelJson.functions || vercelJson.builds) {
  throw new Error(
    'The static release must not require Vercel environment variables or functions.',
  )
}

const dependencyNames = [
  ...Object.keys(packageJson.dependencies ?? {}),
  ...Object.keys(packageJson.devDependencies ?? {}),
]
const backendDependencyPattern =
  /firebase|supabase|prisma|express|serverless|passport|next-auth/i
const backendDependencies = dependencyNames.filter((name) =>
  backendDependencyPattern.test(name),
)

if (backendDependencies.length > 0) {
  throw new Error(
    `Unexpected backend/account dependencies: ${backendDependencies.join(', ')}`,
  )
}

const backendDirectories = [
  'api',
  'server',
  'functions',
  'netlify/functions',
  'supabase/functions',
]
const existingBackendDirectories = backendDirectories.filter((directory) =>
  existsSync(resolve(root, directory)),
)

if (existingBackendDirectories.length > 0) {
  throw new Error(
    `Unexpected backend/serverless directories: ${existingBackendDirectories.join(', ')}`,
  )
}

function collectFiles(path) {
  if (!existsSync(path)) {
    return []
  }

  if (!statSync(path).isDirectory()) {
    return [path]
  }

  return readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
    collectFiles(resolve(path, entry.name)),
  )
}

const sourceFiles = ['src', 'scripts', 'vercel.json']
  .map((path) => resolve(root, path))
  .flatMap(collectFiles)
  .filter((path) => /\.(?:ts|tsx|mjs|json)$/.test(path))
  .map((path) => readFileSync(path, 'utf8'))
  .join('\n')

if (/process\.env\.(?!CI\b)/.test(sourceFiles)) {
  throw new Error('The application contains a non-CI environment-variable dependency.')
}

console.log(
  JSON.stringify(
    {
      framework: vercelJson.framework,
      buildCommand: vercelJson.buildCommand,
      outputDirectory: vercelJson.outputDirectory,
      requiredEnvironmentVariables: false,
      backendServices: false,
      accountFlow: false,
    },
    null,
    2,
  ),
)
