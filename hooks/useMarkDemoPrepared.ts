import { useMutation, useQueryClient } from '@tanstack/react-query'
import { updateSquareOrder } from '@/lib/ssr-actions'
import type { Order } from '@/types'
import { useSafeAuthenticator } from './useSafeAuthenticator'

export function useMarkDemoPrepared() {
  const merchantId = 'b22babf1-5572-475c-a224-507ec27f7484'
  const queryClient = useQueryClient()
  const { authStatus } = useSafeAuthenticator()
  const isAuth = authStatus === 'authenticated' ? true : false
  const authMode = isAuth ? 'userPool' : 'identityPool'

  return useMutation({
    mutationFn: async (order: Order) => {
      await updateSquareOrder(order.id, order.locationId!, { state: 'PREPARED' }, merchantId)
    },
    onMutate: async (order) => {
      const key = ['demo-orders', merchantId, order.locationId]
      const previous = queryClient.getQueryData<Order[]>(key)
      queryClient.setQueryData<Order[]>(key, (old = []) => old.filter((o) => o.id !== order.id))
      return { previous, key }
    },
    onError: (_, __, ctx) => {
      if (ctx?.previous && ctx?.key) {
        queryClient.setQueryData(ctx.key, ctx.previous)
      }
    },
    onSettled: (_, __, ____, ctx) => {
      if (ctx?.key) {
        queryClient.invalidateQueries({ queryKey: ctx.key })
      }
    },
  })
}
