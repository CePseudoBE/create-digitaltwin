#!/usr/bin/env node

import { createDigitalTwinApp } from './cli.js'

createDigitalTwinApp().catch((error: Error) => {
  console.error('Failed to create Digital Twin app:', error.message)
  process.exit(1)
})