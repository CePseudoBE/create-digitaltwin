export type DatabaseType = 'sqlite' | 'postgresql'
export type StorageType = 'local' | 'ovh'

export interface ProjectAnswers {
  projectName: string
  projectPath: string
  database: DatabaseType
  storage: StorageType
  localStoragePath?: string
  useRedis: boolean
  includeDocker: boolean
  includeExamples: boolean
}

export interface PackageJsonDependencies {
  [key: string]: string
}

export interface PackageJsonConfig {
  name: string
  version: string
  description: string
  main: string
  type: string
  scripts: Record<string, string>
  bin: Record<string, string>
  dependencies: PackageJsonDependencies
  devDependencies: PackageJsonDependencies
}

export interface DatabaseConfig {
  postgresql: {
    client: 'pg'
    connection: {
      host: string
      port: number
      user: string
      password: string
      database: string
    }
  }
  sqlite: {
    client: 'sqlite3'
    connection: {
      filename: string
    }
    useNullAsDefault: boolean
  }
}

export interface StorageConfig {
  local: string
  ovh: {
    accessKey: string
    secretKey: string
    endpoint: string
    region: string
    bucket: string
  }
}

export interface TemplateData {
  projectName: string
  database: DatabaseType
  storage: StorageType
  localStoragePath?: string
  useRedis: boolean
  includeExamples: boolean
}