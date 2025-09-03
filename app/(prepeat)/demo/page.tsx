'use client'
import AllDayList from '@/components/AllDayList'
import { usePublicMerchant } from '@/components/MerchantPublicContext'
import OrderCard from '@/components/OrderCard'
import SortDropdown from '@/components/SortDropdown'
import { onDeleteCatalogItem } from '@/graphql/subscriptions'
import { useDemoOrders } from '@/hooks/useDemoOrders'
import { useMarkDemoPrepared } from '@/hooks/useMarkDemoPrepared'
import { useMarkPrepared } from '@/hooks/useMarkPrepared'
import { useOrders } from '@/hooks/useOrders'
import { isAuth } from '@/lib/ssr-actions'
import { SortOption } from '@/types'
import { useState } from 'react'

// app/demo/page.tsx
export default function DemoPage() {
  const demoLocationId = process.env.NEXT_PUBLIC_DEMO_LOCATION_ID!
  const merchant = usePublicMerchant()
  const [locationId, setLocationId] = useState(demoLocationId)
  const [sort, setSort] = useState<SortOption>('Oldest')
  const { orders = [], newOrderIds } = useDemoOrders(locationId, sort)
  const { mutate: markPrepared } = useMarkDemoPrepared()

  const isAllDay = sort === 'All Day'

  //console.log('DemoPage', locationId, merchant, orders, isAuth())
  return (
    <div className='min-h-screen flex flex-col items-center bg-white px-6 py-12'>
      <div className='max-w-md w-full text-center mb-12'>
        <h1 className='text-4xl font-bold mb-6 text-[#FF6A00]'>Try Prepeat</h1>
        <p className='text-lg mb-4 text-[#2E7D32]'>Get a live demo of our Text-to-Menu feature in seconds.</p>
        <div className='bg-[#FFF3E0] border border-[#FFB74D] rounded-xl p-6 mb-6'>
          <p className='text-lg font-medium text-[#FF6A00]'>
            📱 Text <span className='font-bold text-black'>'demo'</span> to:
          </p>
          <p className='text-2xl font-bold mt-2 text-black'>(408) 645-7425</p>
        </div>
        <p className='text-gray-600 mb-6'>
          You’ll receive a reply with a live menu link from a sample vendor.When you place an order it will pop on the
          KDS below.
        </p>
        <p className='text-sm text-gray-400'>Standard messaging rates may apply.</p>
        {/* <div>
          {orders &&
            orders.map((o) => {
              return <p key={o.id}>{o.id}</p>
            })}
        </div> */}
      </div>

      <div className='space-y-4 bg-orange-50 border border-[#FFB74D] rounded-sm p-3 md:min-w-[1355px] min-h-[450px]'>
        <h2 className='text-2xl font-semibold text-center text-[#2E7D32] mb-4'>Live Kitchen KDS View</h2>
        <SortDropdown sort={sort} setSort={setSort} />
        {orders && orders.length === 0 && <p className='text-center'>No Active Orders</p>}
        <div className='grid grid-cols-12 gap-4 '>
          {isAllDay ? (
            <div className='col-span-12 h-full'>
              <AllDayList orders={orders ?? []} />
            </div>
          ) : (
            // your existing grid of OrderCard(s)
            <div className='col-span-12 grid md:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-fr'>
              {(orders ?? []).map((o) => (
                <OrderCard key={o.id} order={o} newOrderIds={newOrderIds} handlePrepared={markPrepared} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Mock KDS Display 
      <div className='w-full max-w-4xl'>
        
        
          {[1, 2, 3].map((orderId) => (
            <div key={orderId} className='bg-[#F1F8E9] border border-[#AED581] rounded-lg p-4 shadow-md'>
              <p className='text-sm text-gray-500 mb-1'>Order #{100 + orderId}</p>
              <h3 className='text-lg font-bold text-black mb-2'>John Doe</h3>
              <ul className='text-sm text-gray-700 list-disc list-inside space-y-1'>
                <li>1x Margherita Pizza</li>
                <li>2x Garlic Knots</li>
                <li>1x Lemonade</li>
              </ul>
              <div className='mt-4'>
                <button className='text-white bg-[#FF6A00] hover:bg-orange-700 px-4 py-1 rounded text-sm'>
                  Mark Prepared
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
       */}
    </div>
  )
}
