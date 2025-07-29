import fs from 'fs-extra'
import path from 'path'
import chalk from 'chalk'
import {fileURLToPath} from 'url'
import type {PackageJsonConfig, PackageJsonDependencies, ProjectAnswers,} from '../types'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Generates a complete Digital Twin project based on user answers.
 * Creates all necessary files including package.json, TypeScript config,
 * application code, configuration files, and optional features.
 *
 * @param answers - User configuration choices from prompts
 *
 * @example
 * ```typescript
 * await generateProject({
 *   projectName: 'my-app',
 *   projectPath: '/path/to/my-app',
 *   database: 'sqlite',
 *   storage: 'local',
 *   useRedis: true,
 *   includeDocker: false,
 *   includeExamples: true
 * })
 * ```
 */
export async function generateProject(answers: ProjectAnswers): Promise<void> {
    const {projectPath} = answers

    console.log(chalk.blue(`Creating project at: ${projectPath}`))

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

    // Generate dt.js CLI wrapper
    await generateDtCli(projectPath)
}

/**
 * Gets the latest version of digitaltwin-core from npm registry
 * @returns Promise resolving to the version string
 * @private
 */
async function getLatestDigitalTwinCoreVersion(): Promise<string> {
    try {
        const response = await fetch('https://registry.npmjs.org/digitaltwin-core/latest')
        const data = await response.json()
        return data.version
    } catch (error) {
        console.warn('Warning: Could not fetch digitaltwin-core version from npm, falling back to default')
        return '0.3.3' // fallback version
    }
}

/**
 * Gets the latest version of digitaltwin-cli from npm registry
 * @returns Promise resolving to the version string
 * @private
 */
async function getLatestDigitalTwinCliVersion(): Promise<string> {
    try {
        const response = await fetch('https://registry.npmjs.org/digitaltwin-cli/latest')
        const data = await response.json()
        return data.version
    } catch (error) {
        console.warn('Warning: Could not fetch digitaltwin-cli version from npm, falling back to default')
        return '0.1.0' // fallback version
    }
}

/**
 * Generates package.json with appropriate dependencies based on user choices.
 * Includes database-specific packages, Redis support, and storage adapters.
 *
 * @param projectPath - Target directory for the project
 * @param answers - User configuration choices
 * @private
 */
async function generatePackageJson(projectPath: string, answers: ProjectAnswers): Promise<void> {
    const {projectName, database, storage, useRedis} = answers

    const digitalTwinVersion = await getLatestDigitalTwinCoreVersion()
    const digitalTwinCliVersion = await getLatestDigitalTwinCliVersion()

    const dependencies: PackageJsonDependencies = {
        'digitaltwin-core': `^${digitalTwinVersion}`,
        'knex': '^3.0.0',
        'commander': '^12.0.0',
        'dotenv' : '^17.2.1'
    }


    const devDependencies: PackageJsonDependencies = {
        '@types/node': '^24.0.10',
        'typescript': '^5.0.0',
        'tsx': '^4.19.2',
        'digitaltwin-cli': `^${digitalTwinCliVersion}`
    }

    // Add database-specific dependencies
    if (database === 'postgresql') {
        dependencies.pg = '^8.11.0'
        devDependencies['@types/pg'] = '^8.10.0'
    } else {
        dependencies['better-sqlite3'] = '^12.2.0'
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
            dev: 'tsx watch src/index.ts',
            start: 'node dist/index.js',
        },
        bin: {},
        dependencies,
        devDependencies
    }

    await fs.writeJson(path.join(projectPath, 'package.json'), packageJson, {spaces: 2})
}

/**
 * Generates main application files including index.ts, and TypeScript config.
 * Creates the core structure for a Digital Twin application.
 *
 * @param projectPath - Target directory for the project
 * @param answers - User configuration choices
 * @private
 */
async function generateAppFiles(projectPath: string, answers: ProjectAnswers): Promise<void> {
    const srcDir = path.join(projectPath, 'src')
    await fs.ensureDir(srcDir)

    // Generate main index.ts
    const indexContent = generateIndexFile(answers)
    await fs.writeFile(path.join(srcDir, 'index.ts'), indexContent)

    // Generate TypeScript config
    const tsconfigContent = generateTsConfig()
    await fs.writeFile(path.join(projectPath, 'tsconfig.json'), tsconfigContent)
}

/**
 * Generates the main index.ts file with environment validation and engine setup.
 * Includes database configuration, storage setup, and example components if requested.
 *
 * @param answers - User configuration choices
 * @returns Generated TypeScript code as string
 * @private
 */
function generateIndexFile(answers: ProjectAnswers): string {
    const {projectName, database, storage, useRedis, includeExamples, localStoragePath} = answers

    const dotenvImport = `import 'dotenv/config'`

    const storageClass = storage === 'local' ? 'LocalStorageService' : 'OvhS3StorageService'
    const exampleImports = includeExamples
        ? "import { JSONPlaceholderCollector } from './components/index.js'"
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
    client: 'better-sqlite3',
    connection: {
      filename: env.DB_PATH || './data/${projectName}.db'
    },
    useNullAsDefault: true
  }`

    const exampleComponents = includeExamples
        ? `collectors: [new JSONPlaceholderCollector()],`
        : ''

    const storageDisplay = storage === 'local'
        ? `Local filesystem (\${env.STORAGE_PATH || '${localStoragePath || './uploads'}'})`
        : 'OVH Object Storage'

    const queueDisplay = useRedis ? 'Redis enabled' : 'In-memory mode'
    const dbDisplay = database === 'postgresql' ? 'PostgreSQL' : 'SQLite'

    return `${dotenvImport}
import { DigitalTwinEngine, KnexDatabaseAdapter, Env } from 'digitaltwin-core'
import { ${storageClass} } from 'digitaltwin-core'
${exampleImports}

async function main(): Promise<void> {
  console.log('Starting ${projectName} Digital Twin...')
  
  // Validate environment variables
  const env = Env.validate({
    PORT: Env.schema.number({ optional: true }),${dbConfigSection}${storageConfigSection}${redisConfigSection}
  })
  
  console.log('Environment variables validated')
  
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
    redis: {
      host: 'localhost',
      port: 6379
    },
    ${exampleComponents}
  })
  
  console.log('Digital Twin Engine configured')
  
  // Start the engine
  await engine.start()
  const port = engine.getPort() || env.PORT || 3000
  console.log(\`Digital Twin Engine started on port \${port}\`)
  console.log(\`Database: ${dbDisplay}\`)
  console.log(\`Storage: ${storageDisplay}\`)
  console.log(\`Queue: ${queueDisplay}\`)
  
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

/**
 * Generates TypeScript configuration file (tsconfig.json) with ES2022 target.
 * Configured for ESNext modules with strict type checking enabled.
 *
 * @returns JSON string for tsconfig.json
 * @private
 */
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
            forceConsistentCasingInFileNames: true,
            experimentalDecorators: true,
            useDefineForClassFields: false
        },
        include: ['src/**/*'],
        exclude: ['node_modules', 'dist']
    }

    return JSON.stringify(config, null, 2)
}

/**
 * Generates configuration files including .env and .gitignore.
 * Creates environment variable templates and Git ignore rules.
 *
 * @param projectPath - Target directory for the project
 * @param answers - User configuration choices
 * @private
 */
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

/**
 * Generates .env file with environment variables based on selected configuration.
 * Includes database settings, storage paths, Redis config, and development options.
 *
 * @param answers - User configuration choices
 * @returns Environment file content as string
 * @private
 */
function generateEnvFile(answers: ProjectAnswers): string {
    const {projectName, database, storage, useRedis, localStoragePath} = answers

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

/**
 * Generates example components including JSONPlaceholder collector.
 * Creates a complete working example that demonstrates data collection from external APIs.
 *
 * @param projectPath - Target directory for the project
 * @param answers - User configuration choices
 * @private
 */
async function generateExampleComponents(projectPath: string, answers: ProjectAnswers): Promise<void> {
    const componentsDir = path.join(projectPath, 'src', 'components')
    await fs.ensureDir(componentsDir)

    // JSONPlaceholder Data Collector
    const collectorContent = `import { Collector } from 'digitaltwin-core'

interface Post {
  id: number
  userId: number
  title: string
  body: string
}

interface User {
  id: number
  name: string
  username: string
  email: string
  phone: string
  website: string
  address: {
    street: string
    suite: string
    city: string
    zipcode: string
    geo: {
      lat: string
      lng: string
    }
  }
  company: {
    name: string
    catchPhrase: string
    bs: string
  }
}

interface CollectedData {
  timestamp: Date
  source: 'jsonplaceholder'
  posts: Post[]
  users: User[]
  metadata: {
    postsCount: number
    usersCount: number
    collectionDuration: number
  }
}

/**
 * JSONPlaceholder Data Collector - Fetches real data from JSONPlaceholder API
 * Demonstrates collecting data from external REST APIs
 */
export class JSONPlaceholderCollector extends Collector {
  private readonly baseUrl = 'https://jsonplaceholder.typicode.com'
  
  getConfiguration() {
    return {
      name: 'jsonplaceholder-collector',
      description: 'Collects posts and users data from JSONPlaceholder API',
      contentType: 'application/json',
      endpoint: 'api/jsonplaceholder',
      tags: ['api', 'external', 'demo']
    }
  }
  
  async collect(): Promise<Buffer> {
    const startTime = Date.now()
    
    try {
      console.log('Fetching data from JSONPlaceholder API...')
      
      // Fetch posts and users concurrently
      const [postsResponse, usersResponse] = await Promise.all([
        fetch(\`\${this.baseUrl}/posts?_limit=10\`),
        fetch(\`\${this.baseUrl}/users\`)
      ])
      
      if (!postsResponse.ok) {
        throw new Error(\`Posts API error: \${postsResponse.status}\`)
      }
      
      if (!usersResponse.ok) {
        throw new Error(\`Users API error: \${usersResponse.status}\`)
      }
      
      const posts: Post[] = await postsResponse.json()
      const users: User[] = await usersResponse.json()
      
      const collectionDuration = Date.now() - startTime
      
      const data: CollectedData = {
        timestamp: new Date(),
        source: 'jsonplaceholder',
        posts,
        users,
        metadata: {
          postsCount: posts.length,
          usersCount: users.length,
          collectionDuration
        }
      }
      
      console.log(\`Collected \${posts.length} posts and \${users.length} users from JSONPlaceholder (\${collectionDuration}ms)\`)
      return Buffer.from(JSON.stringify(data, null, 2))
      
    } catch (error) {
      console.error('Error collecting data from JSONPlaceholder:', error)
      
      // Return error information as data
      const errorData = {
        timestamp: new Date(),
        source: 'jsonplaceholder',
        error: true,
        message: error instanceof Error ? error.message : 'Unknown error',
        metadata: {
          collectionDuration: Date.now() - startTime
        }
      }
      
      return Buffer.from(JSON.stringify(errorData, null, 2))
    }
  }
  
  getSchedule(): string {
    return '*/15 * * * * *' // Every 15 seconds
  }
}
`

    // Index file for components
    const indexContent = `export { JSONPlaceholderCollector } from './jsonplaceholder_collector.js'
`

    await fs.writeFile(path.join(componentsDir, 'jsonplaceholder_collector.ts'), collectorContent)
    await fs.writeFile(path.join(componentsDir, 'index.ts'), indexContent)
}

/**
 * Generates Docker configuration files including Dockerfile and docker-compose.yml.
 * Sets up containerized environment with appropriate services based on user choices.
 *
 * @param projectPath - Target directory for the project
 * @param answers - User configuration choices
 * @private
 */
async function generateDockerFiles(projectPath: string, answers: ProjectAnswers): Promise<void> {
    const {database, useRedis, projectName} = answers

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

/**
 * Generates comprehensive README.md with project-specific setup instructions.
 * Includes features overview, configuration details, and getting started guide.
 *
 * @param projectPath - Target directory for the project
 * @param answers - User configuration choices
 * @private
 */
async function generateReadme(projectPath: string, answers: ProjectAnswers): Promise<void> {
    const {projectName, database, storage, useRedis, includeDocker, includeExamples, localStoragePath} = answers

    const dbLabel = database === 'postgresql' ? 'PostgreSQL with production-ready configuration' : 'SQLite for easy development'
    const storageLabel = storage === 'local'
        ? `Local file system storage (${localStoragePath || './uploads'})`
        : 'OVH Object Storage integration'
    const queueLabel = useRedis ? 'Redis-powered background jobs' : 'In-memory job processing'
    const exampleFeature = includeExamples ? '- **Example Components** - Random data collector and data processor included' : ''

    const dbConfig = database === 'postgresql' ? 'PostgreSQL' : 'SQLite'
    const storageConfig = storage === 'local'
        ? `Local File System (${localStoragePath || './uploads'})`
        : 'OVH Object Storage'
    const queueConfig = useRedis ? 'Redis (BullMQ)' : 'In-memory'
    const dockerConfig = includeDocker ? 'Included' : 'Not included'

    const readmeContent = `# ${projectName}

Digital Twin application built with [digitaltwin-core](https://github.com/CePseudoBE/digital-twin-core).

## Features

- **Environment Validation** - Automatic validation of required configuration  
- **Database Support** - ${dbLabel}  
- **Storage** - ${storageLabel}  
- **Queue Management** - ${queueLabel}  
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

/**
 * Generates dt.js CLI wrapper that calls digitaltwin-cli
 * 
 * @param projectPath - Target directory for the project
 * @private
 */
async function generateDtCli(projectPath: string): Promise<void> {
    const dtCliContent = `#!/usr/bin/env node

import { spawn } from 'child_process'

// Call digitaltwin-cli with all arguments
const args = process.argv.slice(2)
const child = spawn('npx', ['digitaltwin-cli', ...args], { 
  stdio: 'inherit',
  cwd: process.cwd()
})

child.on('exit', (code) => {
  process.exit(code || 0)
})
`

    await fs.writeFile(path.join(projectPath, 'dt.js'), dtCliContent)
}