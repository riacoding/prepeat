// app/lib/amplifyOutputs.ts
//import dev from '../amplify_outputs.dev.json'
import standard from '../amplify_outputs.json'
//import prod from '../amplify_outputs.prod.json'

console.log('BACKEND', process.env.NEXT_PUBLIC_BACKEND)

// export const outputs =
//   process.env.NEXT_PUBLIC_BACKEND === 'dev' ? dev : process.env.NEXT_PUBLIC_BACKEND === 'prod' ? prod : sandbox

export const outputs = standard
