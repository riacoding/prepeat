'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { generateClient } from 'aws-amplify/data'
import type { Schema } from '@/amplify/data/resource'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { formatInTimeZone } from 'date-fns-tz'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

const client = generateClient<Schema>()

export default function ChecklistEntryShowPage() {
  const { templateId, entryId } = useParams<{ templateId: string; entryId: string }>()

  const [entry, setEntry] = useState<Schema['ChecklistEntry']['type'] | null>(null)
  const [template, setTemplate] = useState<Schema['ChecklistTemplate']['type'] | null>(null)
  const [items, setItems] = useState<Schema['TemplateItem']['type'][]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadData() {
      if (!templateId || !entryId) return

      const [entryRes, templateRes, itemsRes] = await Promise.all([
        client.models.ChecklistEntry.get({ id: entryId }),
        client.models.ChecklistTemplate.get({ id: templateId }),
        client.models.TemplateItem.list({ filter: { templateId: { eq: templateId } } }),
      ])

      setEntry(entryRes.data ?? null)
      setTemplate(templateRes.data ?? null)
      setItems(itemsRes.data ?? [])
      setLoading(false)
    }

    loadData()
  }, [templateId, entryId])

  if (loading) return <p className='p-4'>Loading entry…</p>
  if (!entry || !template) return <p className='p-4 text-red-500'>Entry not found</p>

  const isChecked = (itemId: string) => entry.checkedItemIds?.includes(itemId)
  const formatted = formatInTimeZone(entry.createdAt, 'America/Los_Angeles', 'MMMM d, yyyy h:mm a zzz')
  return (
    <div className='flex flex-col max-w-2xl mx-auto'>
      <div className='flex items-center justify-start py-6'>
        <Link href={`/admin/checklists`} className='mr-4'>
          <ChevronLeft className='h-6 w-6' />
        </Link>
        <h1 className='text-2xl font-bold'>{template.title}</h1>
      </div>

      <p className='text-sm text-gray-500 mb-2'>Submitted on {formatted}</p>
      <p className='text-sm text-gray-500 mb-6'>by {entry.checkedByName || 'Unknown'}</p>

      <ul className='space-y-4'>
        {items.map((item) => (
          <li key={item.id} className='flex items-center gap-2'>
            {isChecked(item.id) ? <Checkbox checked={isChecked(item.id)} disabled /> : '❌'}

            <Label>{item.label}</Label>
          </li>
        ))}
      </ul>
    </div>
  )
}
