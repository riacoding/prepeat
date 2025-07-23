import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { generateClient } from 'aws-amplify/data'
import type { Schema } from '@/amplify/data/resource'
import type { SortOption, SquareOrder } from '@/types'
import { useSafeAuthenticator } from './useSafeAuthenticator'

const client = generateClient<Schema>()

type Order = Schema['Order']['type'] & { rawData: SquareOrder }

function normalizeOrders(items: Schema['Order']['type'][], sort: SortOption): Order[] {
  const sorted = items
    .map((item) => ({
      ...item,
      rawData: typeof item.rawData === 'string' ? JSON.parse(item.rawData) : item.rawData,
    }))
    .filter((o) => o.fulfillmentStatus === 'PROPOSED')
    .sort((a, b) => {
      const aDate = new Date(a.rawData?.createdAt ?? 0).getTime()
      const bDate = new Date(b.rawData?.createdAt ?? 0).getTime()
      return sort === 'Oldest' ? aDate - bDate : bDate - aDate
    })

  return sorted
}

export function useDemoOrders(merchantId: string, locationId: string, sort: SortOption) {
  //console.log('merchant and location', merchantId, locationId)
  const { authStatus } = useSafeAuthenticator()
  const isAuth = authStatus === 'authenticated' ? true : false
  const queryClient = useQueryClient()
  const queryKey = ['demo-orders', merchantId, locationId]
  const [orders, setOrders] = useState<Order[] | null>(null)
  const [newOrderIds, setNewOrderIds] = useState<Set<string>>(new Set())
  const prevIds = useRef<Set<string>>(new Set())
  const [mode, setMode] = useState<'userPool' | 'identityPool'>('identityPool')

  useEffect(() => {
    setMode(isAuth ? 'userPool' : 'identityPool')
  }, [isAuth])

  console.log('authMode', mode)

  // Realtime updates
  useEffect(() => {
    const sub = client.models.DemoOrder.observeQuery({
      authMode: mode,
      filter: {
        locationId: { eq: locationId },
      },
    }).subscribe({
      next: ({ items, isSynced }) => {
        console.log('observeQuery next triggered', { items, isSynced }, locationId)
        const normalized = normalizeOrders(items, sort)
        //console.log('normalized orders', normalized)
        setOrders(normalized)
        const currentIds = new Set(normalized.map((o) => o.id))
        const newIds = new Set<string>()

        for (const id of currentIds) {
          if (!prevIds.current.has(id)) newIds.add(id)
        }

        if (newIds.size > 0) {
          setNewOrderIds(newIds)
          setTimeout(() => setNewOrderIds(new Set()), 4000)
        }

        prevIds.current = currentIds
        queryClient.setQueryData(queryKey, normalized)
      },
      error: (err) => {
        console.error('observeQuery error:', err)
      },
    })

    return () => sub.unsubscribe()
  }, [merchantId, locationId, mode, sort])

  return { orders, newOrderIds }
}
