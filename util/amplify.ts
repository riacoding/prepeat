import { type Schema } from '@/amplify/data/resource'
import { generateServerClientUsingCookies } from '@aws-amplify/adapter-nextjs/data'
import { createServerRunner } from '@aws-amplify/adapter-nextjs'
import { outputs } from '../lib/amplifyOutputs'
import { getCurrentUser } from 'aws-amplify/auth/server'
import { cookies } from 'next/headers'
import { generateClient } from 'aws-amplify/data'

const client = generateClient<Schema>()

export const cookieBasedClient = generateServerClientUsingCookies<Schema>({
  config: outputs,
  cookies,
})

export const { runWithAmplifyServerContext } = createServerRunner({
  config: outputs,
})

// This page always dynamically renders per request
export const dynamic = 'force-dynamic'

export const getCurrentUserServer = async () => {
  try {
    const currentUser = await runWithAmplifyServerContext({
      nextServerContext: { cookies },
      operation: (contextSpec) => getCurrentUser(contextSpec),
    })

    return { user: currentUser }
  } catch (error) {
    //console.log(error)
    return { user: null }
  }
}

type SelectionSetArray = readonly (string | number | symbol)[]

export async function listWithSelection<ModelType extends object, FieldKeys extends keyof ModelType>(
  model: {
    list: (params: { selectionSet: FieldKeys[] }) => Promise<{ data: any; errors: any }>
  },
  selectionSet: FieldKeys[]
): Promise<Pick<ModelType, FieldKeys>[]> {
  const { data, errors } = await model.list({
    selectionSet,
  })

  if (errors) {
    throw new Error('Failed to fetch list')
  }

  return data as Pick<ModelType, FieldKeys>[]
}

export function getFields<T>() {
  return [] as unknown as (keyof T)[]
}
