'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { HydratedCatalog, MenuItem, SafeMenuItem, SquareCatalogObject, SquareItem, type Menu } from '@/types'
import {
  createMenuItem,
  deleteMenuItem,
  deleteMenuItemsForMenu,
  fetchMenuById,
  getAllSquareCatalogItems,
  getCatalogItems,
  saveMenu,
  saveMenuItemsForMenu,
} from '@/lib/ssr-actions'
import { ParamValue } from 'next/dist/server/request/params'
import Link from 'next/link'
import { Pencil } from 'lucide-react'
import { useMerchant } from '@/components/MerchantContext'
import { bumpCacheVersion } from '@/lib/menuCache'

type FormValues = {
  name: string
  locationId: string
  squareLocationId: string
  logo?: string
  theme?: string // JSON string
  isActive: boolean
  isOffline: boolean
}

interface EditPageParams {
  id: ParamValue
}

export default function EditPage({ id }: EditPageParams) {
  const merchant = useMerchant()
  const [squareItems, setSquareItems] = useState<HydratedCatalog[] | null>()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [menuItemsMap, setMenuItemsMap] = useState<Record<string, SafeMenuItem>>({})

  const router = useRouter()
  const isNew = id === 'new'

  useEffect(() => {
    async function fetchItems() {
      const items = await getCatalogItems(merchant.id)
      console.log('items', items, merchant.id)
      setSquareItems(items)
    }
    fetchItems()
  }, [])

  const menuId = typeof id === 'string' ? id : null
  if (!isNew && !menuId) {
    throw new Error('Invalid menu ID from route')
  }

  const { register, handleSubmit, setValue, reset, watch } = useForm<FormValues>()
  const [loading, setLoading] = useState(true)

  const toggle = async (catalogItemId: string) => {
    if (!menuId) {
      console.error('Missing menuId when trying to create MenuItem')
      return
    }
    if (selected.has(catalogItemId)) {
      // Deselect → delete the MenuItem
      const menuItem = menuItemsMap[catalogItemId]
      if (menuItem?.id) {
        await deleteMenuItem(menuItem.id)
        setMenuItemsMap((prev) => {
          const copy = { ...prev }
          delete copy[catalogItemId]
          return copy
        })
      }
      setSelected((prev) => {
        const copy = new Set(prev)
        copy.delete(catalogItemId)
        return copy
      })
    } else {
      // Select → create MenuItem
      const newMenuItem = await createMenuItem({ menuId, catalogItemId, merchantId: merchant.id })
      setMenuItemsMap((prev) => ({ ...prev, [catalogItemId]: newMenuItem }))
      setSelected((prev) => new Set(prev).add(catalogItemId))
    }
  }

  function isSquareItem(obj: SquareCatalogObject): obj is SquareItem {
    return obj.type === 'ITEM' && 'item_data' in obj
  }

  useEffect(() => {
    const load = async () => {
      if (!isNew && typeof id === 'string') {
        const menu: any | null = await fetchMenuById(id)
        if (menu) {
          if (menu.menuItems) {
            const map = Object.fromEntries(menu.menuItems.map((mi: MenuItem) => [mi.catalogItemId, mi]))
            setMenuItemsMap(map)
          }
          reset({
            name: menu.name,
            locationId: menu.locationId,
            logo: menu.logo || '',
            theme: JSON.stringify(menu.theme || {}, null, 2),
            isActive: menu.isActive ?? false,
          })
          setSelected(new Set(menu.menuItems.map((item: MenuItem) => item.catalogItemId) ?? []))
        }
      }
      setLoading(false)
    }
    load()
  }, [id, isNew, reset])

  const onSubmit = async (data: FormValues) => {
    let parsedTheme: object | null = null
    try {
      const temp = data.theme?.trim()
      if (temp) {
        const parsed = JSON.parse(temp)
        if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
          parsedTheme = parsed
        }
      }
    } catch (err) {
      console.warn('Invalid theme JSON:', err)
      // Optional: show toast or error
    }

    const savedMenu = await saveMenu({
      id: isNew ? undefined : (id as string),
      name: data.name,
      merchantId: merchant.id,
      locationId: data.locationId,
      squareLocationId: merchant.locationIds[0]!,
      logo: data.logo || '',
      theme: parsedTheme,
      isActive: data.isActive,
      isOffline: data.isOffline,
    })

    if (!savedMenu.id) {
      throw new Error('Failed to save menu')
    }

    // 2. Save MenuItems based on selected catalog item ids
    await saveMenuItemsForMenu(savedMenu.id, Array.from(selected), merchant.id)
    await bumpCacheVersion()
    router.push('/admin')
  }

  if (loading) return <div className='p-4'>Loading...</div>

  return (
    <div className='w-full md:max-w-2xl mx-auto p-4 space-y-6'>
      <h1 className='text-xl font-bold'>{isNew ? 'Add Menu' : 'Edit Menu'}</h1>
      <form onSubmit={handleSubmit(onSubmit)} className='space-y-4'>
        <div>
          <Label htmlFor='name'>Menu Name</Label>
          <Input id='name' {...register('name')} />
        </div>
        <div>
          <Label htmlFor='locationId'>Menu Code</Label>
          <Input id='locationId' {...register('locationId')} />
        </div>
        <div>
          <Label htmlFor='logo'>Logo URL</Label>
          <Input id='logo' {...register('logo')} />
        </div>

        <div>
          <h2 className='font-semibold mb-2'>Select Square Menu Items</h2>
          <div className='grid grid-cols-1 md:grid-cols-2 gap-2 max-h-96 overflow-y-auto border p-2 rounded'>
            {squareItems &&
              squareItems
                .map((obj) => obj.item)
                .filter(isSquareItem)
                .map((item) => {
                  const isSelected = selected.has(item.id)
                  const menuItem = menuItemsMap[item.id]
                  return (
                    <label key={item.id} className='flex items-center space-x-2'>
                      <input type='checkbox' checked={isSelected} onChange={() => toggle(item.id)} />
                      {isSelected && menuItem?.id && (
                        <Link href={`/admin/edit/menuItem/${menuItem.id}`}>
                          <Pencil className='w-4 h-4 text-muted-foreground hover:text-blue-600' />
                        </Link>
                      )}
                      <span>{item.item_data.name}</span>
                    </label>
                  )
                })}
          </div>
        </div>

        <div className='flex items-center space-x-4'>
          <Label htmlFor='isActive'>Active</Label>
          <Switch
            className='data-[state=checked]:bg-green-600 bg-gray-300'
            id='isActive'
            checked={watch('isActive')}
            onCheckedChange={(value) => setValue('isActive', value)}
          />
        </div>
        <div className='flex items-center space-x-4'>
          <Label htmlFor='isActive'>In The Weeds</Label>
          <Switch
            className='data-[state=checked]:bg-green-600 bg-gray-300'
            id='isOffline'
            checked={watch('isOffline')}
            onCheckedChange={(value) => setValue('isOffline', value)}
          />
        </div>

        <div>
          <Label htmlFor='theme'>Theme JSON</Label>
          <Textarea id='theme' {...register('theme')} rows={6} />
        </div>

        <div>
          <img src='https://go.prepeat.io/qr/uX7jQZ.svg' alt='QR' width={256} height={256} />
          <a
            href='https://go.prepeat.io/qr/uX7jQZ.svg' // or your PDF endpoint when ready
            download
            className='text-sm underline'
          >
            Download QR (SVG)
          </a>
        </div>

        <div className='flex gap-2'>
          <Button type='submit'>{isNew ? 'Create' : 'Update'}</Button>
          <Button type='button' variant='outline' onClick={() => router.push('/admin')}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  )
}
