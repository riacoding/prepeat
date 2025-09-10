// amplify/functions/<name>/resource.ts
import { defineFunction } from '@aws-amplify/backend'

export const deviceGetJobs = defineFunction({
  name: 'deviceGetJobs',
  entry: './handler.ts', // create this next to resource.ts
  runtime: 20, // Node.js 20
  resourceGroupName: 'data',
})
