import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const appSource = readFileSync(resolve(process.cwd(), 'src', 'App.tsx'), 'utf8')
const nyc311Source = readFileSync(
  resolve(process.cwd(), 'src', 'reporting', 'nyc311.ts'),
  'utf8',
)
const sourceAndDocs = [
  appSource,
  nyc311Source,
  readFileSync(resolve(process.cwd(), 'README.md'), 'utf8'),
  readFileSync(resolve(process.cwd(), 'requirements.md'), 'utf8'),
].join('\n')

const datasetUrl =
  'https://data.cityofnewyork.us/dataset/DSNY-Litter-Basket-Inventory/8znf-7b2c'
const complaintFormUrl =
  'https://portal.311.nyc.gov/servicerequest-create/What?caid=794e51a3-3f16-ec11-b6e5-0022481cc62d&kasid=10a2780b-6161-ef11-bfe2-7c1e5217eb2d'

if (!appSource.includes(datasetUrl)) {
  throw new Error('The app is missing the official DSNY Open Data attribution URL.')
}

if (!nyc311Source.includes(complaintFormUrl)) {
  throw new Error('The app is missing the exact official NYC 311 complaint form URL.')
}

if (/https?:\/\/[^\s)]+\/article(?:\/|\b)/i.test(sourceAndDocs)) {
  throw new Error(
    'A legacy NYC 311 article URL remains in the app or release documentation.',
  )
}

console.log(
  JSON.stringify(
    {
      datasetUrl,
      complaintFormUrl,
      legacy311ArticleUrlFound: false,
    },
    null,
    2,
  ),
)
