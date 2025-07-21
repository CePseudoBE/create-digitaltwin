import fs from 'fs-extra'
import path from 'path'
import chalk from 'chalk'
import { fileURLToPath } from 'url'
import type { 
  ProjectAnswers, 
  PackageJsonConfig, 
  PackageJsonDependencies, 
  TemplateData 
} from '../types/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export async function generateProject(answers: ProjectAnswers): Promise<void> {
  const { projectPath } = answers
  
  console.log(chalk.blue(`📁 Creating project at: ${projectPath}`))
  
  // Create project directory
  await fs.ensureDir(projectPath)
  
  // Generate package.json
  await generatePackageJson(projectPath, answers)
  
  // Generate main app files
  await generateAppFiles(projectPath, answers)
  
  // Generate configuration files
  await generateConfigFiles(projectPath, answers)
  
  // Generate example components if requested
  if (answers.includeExamples) {
    await generateExampleComponents(projectPath, answers)
  }
  
  // Generate Docker files if requested
  if (answers.includeDocker) {
    await generateDockerFiles(projectPath, answers)
  }
  
  // Generate README
  await generateReadme(projectPath, answers)
}

async function generatePackageJson(projectPath: string, answers: ProjectAnswers): Promise<void> {
  const { projectName, database, storage, useRedis } = answers
  
  const dependencies: PackageJsonDependencies = {
    'digitaltwin-core': '^0.1.0',
    'knex': '^3.0.0',
    'commander': '^12.0.0'
  }
  
  const devDependencies: PackageJsonDependencies = {
    '@types/node': '^24.0.10',
    'typescript': '^5.0.0',
    'ts-node-dev' : '^2.0.0'
  }
  
  // Add database-specific dependencies
  if (database === 'postgresql') {
    dependencies.pg = '^8.11.0'
    devDependencies['@types/pg'] = '^8.10.0'
  } else {
    dependencies['sqlite3'] = '^5.1.7'
  }
  
  // Add Redis if requested
  if (useRedis) {
    dependencies.ioredis = '^5.6.1'
  }
  
  // Add AWS SDK if using OVH storage
  if (storage === 'ovh') {
    dependencies['@aws-sdk/client-s3'] = '^3.842.0'
  }
  
  const packageJson: PackageJsonConfig = {
    name: projectName,
    version: '1.0.0',
    description: 'Digital Twin application built with digitaltwin-core',
    main: 'dist/index.js',
    type: 'module',
    scripts: {
      build: 'tsc',
      dev: 'ts-node-dev src/index.ts',
      start: 'node dist/index.js',
      'dt:test': 'ts-node --esm src/dt-cli.ts test',
      'dt:dev': 'ts-node --esm src/dt-cli.ts dev'
    },
    bin: {
      dt: './dist/dt-cli.js'
    },
    dependencies,
    devDependencies
  }
  
  await fs.writeJson(path.join(projectPath, 'package.json'), packageJson, { spaces: 2 })
}

async function generateAppFiles(projectPath: string, answers: ProjectAnswers): Promise<void> {
  const srcDir = path.join(projectPath, 'src')
  await fs.ensureDir(srcDir)
  
  // Generate main index.ts
  const indexContent = generateIndexFile(answers)
  await fs.writeFile(path.join(srcDir, 'index.ts'), indexContent)
  
  // Generate dt-cli.ts for commands
  const cliContent = generateCliFile(answers)
  await fs.writeFile(path.join(srcDir, 'dt-cli.ts'), cliContent)
  
  // Generate TypeScript config
  const tsconfigContent = generateTsConfig()
  await fs.writeFile(path.join(projectPath, 'tsconfig.json'), tsconfigContent)
}

function generateIndexFile(answers: ProjectAnswers): string {
  const { projectName, database, storage, useRedis, includeExamples, localStoragePath } = answers
  
  const storageClass = storage === 'local' ? 'LocalStorageService' : 'OvhS3StorageService'
  const exampleImports = includeExamples 
    ? "import { RandomDataCollector, DataProcessor } from './components/index.js'" 
    : ''
  
  const dbConfigSection = database === 'postgresql' 
    ? `
    // PostgreSQL configuration
    DB_HOST: Env.schema.string(),
    DB_PORT: Env.schema.number({ optional: true }),
    DB_USER: Env.schema.string(),
    DB_PASSWORD: Env.schema.string(),
    DB_NAME: Env.schema.string(),`
    : `
    // SQLite configuration
    DB_PATH: Env.schema.string({ optional: true }),`

  const storageConfigSection = storage === 'local'
    ? `
    // Local storage configuration
    STORAGE_PATH: Env.schema.string({ optional: true }),`
    : `
    // OVH Object Storage configuration
    OVH_ACCESS_KEY: Env.schema.string(),
    OVH_SECRET_KEY: Env.schema.string(),
    OVH_ENDPOINT: Env.schema.string({ format: 'url' }),
    OVH_REGION: Env.schema.string({ optional: true }),
    OVH_BUCKET: Env.schema.string(),`

  const redisConfigSection = useRedis ? `
    // Redis configuration  
    REDIS_HOST: Env.schema.string({ optional: true }),
    REDIS_PORT: Env.schema.number({ optional: true }),` : ''

  const storageInit = storage === 'local'
    ? `env.STORAGE_PATH || '${localStoragePath || './uploads'}'`
    : `{
    accessKey: env.OVH_ACCESS_KEY,
    secretKey: env.OVH_SECRET_KEY,
    endpoint: env.OVH_ENDPOINT,
    region: env.OVH_REGION || 'gra',
    bucket: env.OVH_BUCKET
  }`

  const dbConfig = database === 'postgresql'
    ? `{
    client: 'pg',
    connection: {
      host: env.DB_HOST,
      port: env.DB_PORT || 5432,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      database: env.DB_NAME
    }
  }`
    : `{
    client: 'sqlite3',
    connection: {
      filename: env.DB_PATH || './data/${projectName}.db'
    },
    useNullAsDefault: true
  }`

  const exampleComponents = includeExamples
    ? `collectors: [new RandomDataCollector()],
    handlers: [new DataProcessor()],`
    : ''

  const storageDisplay = storage === 'local' 
    ? `Local filesystem (\${env.STORAGE_PATH || '${localStoragePath || './uploads'}'})` 
    : 'OVH Object Storage'

  const queueDisplay = useRedis ? 'Redis enabled' : 'In-memory mode'
  const dbDisplay = database === 'postgresql' ? 'PostgreSQL' : 'SQLite'

  return `import { DigitalTwinEngine, KnexDatabaseAdapter, Env } from 'digitaltwin-core'
import { ${storageClass} } from 'digitaltwin-core'
${exampleImports}

async function main(): Promise<void> {
  console.log('🔷 Starting ${projectName} Digital Twin...')
  
  // Validate environment variables
  const env = Env.validate({
    PORT: Env.schema.number({ optional: true }),${dbConfigSection}${storageConfigSection}${redisConfigSection}
  })
  
  console.log('✅ Environment variables validated')
  
  // Initialize storage service first
  const storage = new ${storageClass}(${storageInit})
  
  // Database configuration
  const dbConfig = ${dbConfig}
  
  // Initialize database adapter
  const database = new KnexDatabaseAdapter(dbConfig, storage)
  
  // Create Digital Twin Engine
  const engine = new DigitalTwinEngine({
    database,
    storage,
    ${exampleComponents}
  })
  
  console.log('🔧 Digital Twin Engine configured')
  
  // Start the engine
  await engine.start()
  const port = engine.getPort() || env.PORT || 3000
  console.log(\`🚀 Digital Twin Engine started on port \${port}\`)
  console.log(\`📊 Database: ${dbDisplay}\`)
  console.log(\`💾 Storage: ${storageDisplay}\`)
  console.log(\`🔄 Queue: ${queueDisplay}\`)
  
  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\\n🛑 Shutting down gracefully...')
    await engine.stop()
    process.exit(0)
  })
}

main().catch((error: Error) => {
  console.error('❌ Failed to start Digital Twin Engine:', error.message)
  process.exit(1)
})
`
}

function generateCliFile(answers: ProjectAnswers): string {
  const { projectName, database, storage, useRedis, localStoragePath } = answers
  
  const storageClass = storage === 'local' ? 'LocalStorageService' : 'OvhS3StorageService'
  const dbInterface = database === 'postgresql' ? 'PostgreSQLConfig' : 'SQLiteConfig'
  
  const storageInit = storage === 'local'
    ? `process.env.STORAGE_PATH || '${localStoragePath || './uploads'}'`
    : `{
    accessKey: process.env.OVH_ACCESS_KEY || '',
    secretKey: process.env.OVH_SECRET_KEY || '',
    endpoint: process.env.OVH_ENDPOINT || '',
    region: process.env.OVH_REGION || 'gra',
    bucket: process.env.OVH_BUCKET || '${projectName}-storage'
  }`

  const dbConfig = database === 'postgresql'
    ? `{
    client: 'pg',
    connection: {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'password',
      database: process.env.DB_NAME || '${projectName}'
    }
  }`
    : `{
    client: 'sqlite3',
    connection: {
      filename: process.env.DB_PATH || './data/${projectName}.db'
    },
    useNullAsDefault: true
  }`

  return `#!/usr/bin/env node

import { DigitalTwinEngine, KnexDatabaseAdapter } from 'digitaltwin-core'
import { ${storageClass} } from 'digitaltwin-core'
import { program } from 'commander'
import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load environment variables
const envPath = path.join(__dirname, '../.env')
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8')
  envContent.split('\\n').forEach(line => {
    const [key, value] = line.split('=')
    if (key && value) {
      process.env[key.trim()] = value.trim()
    }
  })
}

async function createEngine(): Promise<DigitalTwinEngine> {
  // Initialize storage service first
  const storage = new ${storageClass}(${storageInit})
  
  // Database configuration
  const dbConfig = ${dbConfig}
  
  // Initialize database adapter
  const database = new KnexDatabaseAdapter(dbConfig, storage)
  
  // Create Digital Twin Engine
  const engine = new DigitalTwinEngine({
    database,
    storage
  })
  
  return engine
}

program
  .version('1.0.0')
  .description('Digital Twin CLI commands')

program
  .command('test')
  .description('Run dry-run validation')
  .action(async () => {
    console.log('🧪 Running dry-run validation...')
    
    try {
      const engine = await createEngine()
      
      // Run validation
      const result = await engine.validateConfiguration()
      
      if (result.valid) {
        console.log('✅ Dry-run validation completed successfully')
        console.log(\`📊 Components: \${result.summary.valid}/\${result.summary.total} valid\`)
      } else {
        console.log('❌ Validation failed')
        result.components.forEach(comp => {
          if (!comp.valid) {
            console.log(\`  • \${comp.name} (\${comp.type}): \${comp.errors.join(', ')}\`)
          }
        })
        process.exit(1)
      }
    } catch (error: any) {
      console.error('❌ Validation failed:', error.message)
      process.exit(1)
    }
  })

program
  .command('dev')
  .description('Start development server')
  .action(async () => {
    console.log('🔥 Starting development server...')
    
    try {
      const engine = await createEngine()
      
      // Start the engine
      await engine.start()
      const port = engine.getPort()
      console.log(\`🚀 Digital Twin Engine started on port \${port || '3000'}\`)
      
      // Handle graceful shutdown
      process.on('SIGINT', async () => {
        console.log('\\n🛑 Shutting down gracefully...')
        await engine.stop()
        process.exit(0)
      })
      
    } catch (error: any) {
      console.error('❌ Failed to start server:', error.message)
      process.exit(1)
    }
  })

program.parse()
`
}

function generateTsConfig(): string {
  const config = {
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'node',
      allowSyntheticDefaultImports: true,
      esModuleInterop: true,
      allowJs: true,
      outDir: './dist',
      rootDir: './src',
      strict: true,
      declaration: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true
    },
    include: ['src/**/*'],
    exclude: ['node_modules', 'dist']
  }
  
  return JSON.stringify(config, null, 2)
}

async function generateConfigFiles(projectPath: string, answers: ProjectAnswers): Promise<void> {
  // Generate .env file
  const envContent = generateEnvFile(answers)
  await fs.writeFile(path.join(projectPath, '.env'), envContent)
  
  // Generate .gitignore
  const gitignoreContent = `node_modules/
dist/
.env
*.log
uploads/
data/
.DS_Store
`
  await fs.writeFile(path.join(projectPath, '.gitignore'), gitignoreContent)
}

function generateEnvFile(answers: ProjectAnswers): string {
  const { projectName, database, storage, useRedis, localStoragePath } = answers
  
  let envContent = `# ${projectName} Digital Twin Configuration
# This file contains environment variables for your Digital Twin application
# Copy this to .env and update the values as needed

# Application Configuration
PORT=3000

# Database Configuration
`
  
  if (database === 'postgresql') {
    envContent += `# PostgreSQL Database (Required for production)
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=password
DB_NAME=${projectName}
`
  } else {
    envContent += `# SQLite Database (Good for development)
DB_PATH=./data/${projectName}.db
`
  }
  
  envContent += `
# Storage Configuration
`
  
  if (storage === 'local') {
    envContent += `# Local File Storage
STORAGE_PATH=${localStoragePath || './uploads'}
`
  } else {
    envContent += `# OVH Object Storage (S3-compatible)
OVH_ACCESS_KEY=your_ovh_access_key_here
OVH_SECRET_KEY=your_ovh_secret_key_here
OVH_ENDPOINT=https://s3.gra.io.cloud.ovh.net
OVH_REGION=gra
OVH_BUCKET=${projectName}-storage
`
  }
  
  if (useRedis) {
    envContent += `
# Redis Configuration (Queue Management)
REDIS_HOST=localhost
REDIS_PORT=6379
`
  }
  
  envContent += `
# Development Configuration
NODE_ENV=development

# Logging
LOG_LEVEL=info
`
  
  return envContent
}

async function generateExampleComponents(projectPath: string, answers: ProjectAnswers): Promise<void> {
  const componentsDir = path.join(projectPath, 'src', 'components')
  await fs.ensureDir(componentsDir)
  
  // Random Data Collector
  const collectorContent = `import { Collector } from 'digitaltwin-core'

interface SensorData {
  timestamp: Date
  sensorId: string
  sensorType: string
  location: string
  value: number
  unit: string
  quality: 'good' | 'warning'
  metadata: {
    deviceId: string
    batteryLevel: number
    signalStrength: number
  }
}

/**
 * Random Data Collector - Generates realistic IoT sensor data
 * Simulates temperature, humidity, and pressure sensors
 */
export class RandomDataCollector extends Collector {
  private sensorTypes: string[] = ['temperature', 'humidity', 'pressure', 'vibration', 'light']
  private locations: string[] = ['room-a', 'room-b', 'warehouse', 'server-room', 'outdoor']
  
  getName(): string {
    return 'random-data-collector'
  }
  
  getDescription(): string {
    return 'Collects random IoT sensor data for testing and development'
  }
  
  async collect(): Promise<Buffer> {
    const dataPoints: SensorData[] = []
    const numSensors = Math.floor(Math.random() * 5) + 3 // 3-7 sensors
    
    for (let i = 0; i < numSensors; i++) {
      const sensorType = this.sensorTypes[Math.floor(Math.random() * this.sensorTypes.length)]
      const location = this.locations[Math.floor(Math.random() * this.locations.length)]
      
      let value: number, unit: string
      switch (sensorType) {
        case 'temperature':
          value = Math.round((Math.random() * 40 + 15) * 10) / 10 // 15-55°C
          unit = 'celsius'
          break
        case 'humidity':
          value = Math.round(Math.random() * 80 + 20) // 20-100%
          unit = 'percent'
          break
        case 'pressure':
          value = Math.round((Math.random() * 200 + 950) * 10) / 10 // 950-1150 hPa
          unit = 'hPa'
          break
        case 'vibration':
          value = Math.round(Math.random() * 10 * 100) / 100 // 0-10 m/s²
          unit = 'm/s²'
          break
        case 'light':
          value = Math.round(Math.random() * 1000) // 0-1000 lux
          unit = 'lux'
          break
        default:
          value = Math.random() * 100
          unit = 'generic'
      }
      
      dataPoints.push({
        timestamp: new Date(),
        sensorId: \`\${sensorType}-\${location}-\${String(i + 1).padStart(2, '0')}\`,
        sensorType,
        location,
        value,
        unit,
        quality: Math.random() > 0.9 ? 'warning' : 'good', // 10% chance of warning
        metadata: {
          deviceId: \`device-\${Math.floor(Math.random() * 100)}\`,
          batteryLevel: Math.round(Math.random() * 100),
          signalStrength: Math.round(Math.random() * 100)
        }
      })
    }
    
    console.log(\`📊 Collected \${dataPoints.length} data points from random sensors\`)
    return Buffer.from(JSON.stringify(dataPoints, null, 2))
  }
  
  getSchedule(): string {
    return '*/15 * * * * *' // Every 15 seconds
  }
}
`
  
  // Data Processor Handler
  const handlerContent = `import { Handler } from 'digitaltwin-core'

interface SensorData {
  sensorId: string
  sensorType: string
  value: number
  quality: 'good' | 'warning'
  metadata?: {
    batteryLevel?: number
    signalStrength?: number
  }
}

interface ProcessedData extends SensorData {
  processedAt: Date
  processed: boolean
  analysis: {
    trend: string
    category: string
    reliability: string
    [key: string]: any
  }
  alerts: string[]
}

/**
 * Data Processor - Processes and enriches collected sensor data
 * Adds analysis, alerts, and data quality checks
 */
export class DataProcessor extends Handler {
  getName(): string {
    return 'data-processor'
  }
  
  getDescription(): string {
    return 'Processes sensor data with analysis and alerting'
  }
  
  async handle(data: SensorData): Promise<ProcessedData> {
    console.log(\`🔄 Processing data from sensor: \${data.sensorId}\`)
    
    // Add processing metadata
    const processedData: ProcessedData = {
      ...data,
      processedAt: new Date(),
      processed: true,
      analysis: this.analyzeData(data),
      alerts: this.checkAlerts(data)
    }
    
    // Log alerts if any
    if (processedData.alerts.length > 0) {
      console.log(\`⚠️  Alerts for \${data.sensorId}:\`, processedData.alerts)
    }
    
    return processedData
  }
  
  private analyzeData(data: SensorData): any {
    const analysis: any = {
      trend: this.calculateTrend(data.value),
      category: this.categorizeValue(data.sensorType, data.value),
      reliability: (data.metadata?.batteryLevel ?? 0) > 20 ? 'high' : 'low'
    }
    
    // Add sensor-specific analysis
    switch (data.sensorType) {
      case 'temperature':
        analysis.heatIndex = data.value > 30 ? 'high' : data.value < 10 ? 'low' : 'normal'
        break
      case 'humidity':
        analysis.comfortLevel = data.value > 60 ? 'humid' : data.value < 30 ? 'dry' : 'comfortable'
        break
      case 'pressure':
        analysis.weatherTrend = data.value > 1020 ? 'rising' : data.value < 980 ? 'falling' : 'stable'
        break
    }
    
    return analysis
  }
  
  private checkAlerts(data: SensorData): string[] {
    const alerts: string[] = []
    
    // Quality-based alerts
    if (data.quality === 'warning') {
      alerts.push('Data quality warning detected')
    }
    
    // Battery alerts
    if ((data.metadata?.batteryLevel ?? 0) < 20) {
      alerts.push('Low battery level')
    }
    
    // Sensor-specific alerts
    switch (data.sensorType) {
      case 'temperature':
        if (data.value > 50) alerts.push('High temperature alert')
        if (data.value < 0) alerts.push('Freezing temperature alert')
        break
      case 'humidity':
        if (data.value > 80) alerts.push('High humidity alert')
        break
      case 'pressure':
        if (data.value < 960) alerts.push('Low pressure system detected')
        break
      case 'vibration':
        if (data.value > 8) alerts.push('High vibration detected')
        break
    }
    
    return alerts
  }
  
  private calculateTrend(value: number): string {
    // Simplified trend calculation (in real scenario, you'd compare with historical data)
    const randomTrend = Math.random()
    if (randomTrend > 0.6) return 'increasing'
    if (randomTrend < 0.4) return 'decreasing'
    return 'stable'
  }
  
  private categorizeValue(sensorType: string, value: number): string {
    switch (sensorType) {
      case 'temperature':
        if (value > 30) return 'hot'
        if (value < 15) return 'cold'
        return 'normal'
      case 'humidity':
        if (value > 70) return 'high'
        if (value < 30) return 'low'
        return 'normal'
      default:
        return 'normal'
    }
  }
}
`
  
  // Index file for components
  const indexContent = `export { RandomDataCollector } from './random-data-collector.js'
export { DataProcessor } from './data-processor.js'
`
  
  await fs.writeFile(path.join(componentsDir, 'random-data-collector.ts'), collectorContent)
  await fs.writeFile(path.join(componentsDir, 'data-processor.ts'), handlerContent)
  await fs.writeFile(path.join(componentsDir, 'index.ts'), indexContent)
}

async function generateDockerFiles(projectPath: string, answers: ProjectAnswers): Promise<void> {
  const { database, useRedis, projectName } = answers
  
  // Dockerfile
  const dockerfileContent = `FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY dist/ ./dist/
COPY .env ./

EXPOSE 3000

CMD ["npm", "start"]
`
  
  // docker-compose.yml
  let dockerComposeContent = `version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    depends_on:${database === 'postgresql' ? `
      - postgres` : ''}${useRedis ? `
      - redis` : ''}
    volumes:
      - ./data:/app/data
      - ./uploads:/app/uploads
`

  if (database === 'postgresql') {
    dockerComposeContent += `
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: ${projectName}
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
`
  }
  
  if (useRedis) {
    dockerComposeContent += `
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
`
  }
  
  if (database === 'postgresql') {
    dockerComposeContent += `
volumes:
  postgres_data:
`
  }
  
  await fs.writeFile(path.join(projectPath, 'Dockerfile'), dockerfileContent)
  await fs.writeFile(path.join(projectPath, 'docker-compose.yml'), dockerComposeContent)
}

async function generateReadme(projectPath: string, answers: ProjectAnswers): Promise<void> {
  const { projectName, database, storage, useRedis, includeDocker, includeExamples, localStoragePath } = answers
  
  const dbLabel = database === 'postgresql' ? 'PostgreSQL with production-ready configuration' : 'SQLite for easy development'
  const storageLabel = storage === 'local' 
    ? `Local file system storage (${localStoragePath || './uploads'})` 
    : 'OVH Object Storage integration'
  const queueLabel = useRedis ? 'Redis-powered background jobs' : 'In-memory job processing'
  const exampleFeature = includeExamples ? '✅ **Example Components** - Random data collector and data processor included' : ''
  
  const dbConfig = database === 'postgresql' ? 'PostgreSQL' : 'SQLite'
  const storageConfig = storage === 'local' 
    ? `Local File System (${localStoragePath || './uploads'})` 
    : 'OVH Object Storage'
  const queueConfig = useRedis ? 'Redis (BullMQ)' : 'In-memory'
  const dockerConfig = includeDocker ? 'Included' : 'Not included'
  
  const readmeContent = `# ${projectName}

Digital Twin application built with [digitaltwin-core](https://github.com/CePseudoBE/digital-twin-core).

## Features

✅ **Environment Validation** - Automatic validation of required configuration  
✅ **Database Support** - ${dbLabel}  
✅ **Storage** - ${storageLabel}  
✅ **Queue Management** - ${queueLabel}  
${exampleFeature}

## Configuration

- **Database**: ${dbConfig}
- **Storage**: ${storageConfig}
- **Queue**: ${queueConfig}
- **Docker**: ${dockerConfig}

## Getting Started

1. **Install dependencies:**
   \`\`\`bash
   npm install
   \`\`\`

2. **Configure environment:**
   \`\`\`bash
   cp .env .env.local
   # Edit .env.local with your actual configuration
   \`\`\`

${database === 'postgresql' ? `3. **Set up PostgreSQL:**
   \`\`\`bash
   # Make sure PostgreSQL is running and create database
   createdb ${projectName}
   \`\`\`
` : ''}${useRedis ? `${database === 'postgresql' ? '4' : '3'}. **Set up Redis:**
   \`\`\`bash
   # Make sure Redis is running
   redis-server
   \`\`\`
` : ''}

${database === 'postgresql' || useRedis ? `${(database === 'postgresql' && useRedis) ? '5' : '4'}. **Start development server:**` : '3. **Start development server:**'}
   \`\`\`bash
   npm run dev
   \`\`\`

## Available Scripts

- \`npm run dev\` - Start development server with hot reload
- \`npm run build\` - Build TypeScript to JavaScript
- \`npm start\` - Start production server
- \`node dt test\` - Run dry-run validation (no database changes)
- \`node dt dev\` - Start server via CLI

## Learn More

- [digitaltwin-core Documentation](https://github.com/CePseudoBE/digital-twin-core)
- [Digital Twin Concepts](https://en.wikipedia.org/wiki/Digital_twin)
- [Environment Configuration Best Practices](https://12factor.net/config)
`
  
  await fs.writeFile(path.join(projectPath, 'README.md'), readmeContent)
}