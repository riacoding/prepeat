'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Menu } from '@/types'
import { Eye, Trash, Loader2 } from 'lucide-react'
import { syncMenuItems } from '@/lib/ssr-actions'
import { MenuSelection } from './page'
import { useToast } from '@/hooks/use-toast'

type AdminPageProps = {
  menus: MenuSelection[]
}

export default function AdminPage({ menus }: AdminPageProps) {
  const [syncing, setSyncing] = useState(false)
  const { toast } = useToast()

  async function handleSync() {
    setSyncing(true)
    try {
      await syncMenuItems()
      toast({
        title: 'Menu sync complete',
        description: 'Your Square items have been synced successfully.',
      })
    } catch (err: any) {
      toast({
        title: 'Sync failed',
        description: err.message || 'Something went wrong.',
        variant: 'destructive',
      })
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className='w-full md:max-w-2xl mx-auto p-4 space-y-6'>
      <div className='flex flex-col items-center gap-5'>
        <h1 className='text-2xl font-bold'>Menus</h1>

        <Button
          onClick={handleSync}
          className='bg-purple-600 hover:bg-purple-700 active:bg-purple-800 focus:ring-2 focus:ring-purple-400 focus:ring-offset-2 text-white'
          disabled={syncing}
        >
          {syncing ? (
            <div className='flex items-center gap-2'>
              <Loader2 className='animate-spin w-4 h-4' />
              Syncing...
            </div>
          ) : (
            'Sync Square'
          )}
        </Button>

        <Link href='/admin/edit/new'>
          <Button className='bg-green-600'>Add Menu</Button>
        </Link>
      </div>

      <ul className='space-y-2'>
        {menus.map((menu) => (
          <li key={menu.id} className='border rounded p-4 flex justify-between items-center'>
            <div className='p-4'>
              <div className='font-medium'>{menu.name}</div>
              <div className='text-sm text-muted-foreground'>
                {menu.locationId} <span className='text-green-500'>{menu.isActive === true ? 'active' : null}</span>
              </div>
            </div>
            <div className='flex gap-2'>
              <Link href={`/admin/edit/${menu.id}`}>
                <Button variant='outline'>
                  <Eye className='w-5 h-5' />
                </Button>
              </Link>
              <Button variant='destructive'>
                <Trash className='w-5 h-5' />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
