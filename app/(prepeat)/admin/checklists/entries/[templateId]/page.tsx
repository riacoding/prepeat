'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { generateClient } from 'aws-amplify/data'
import type { Schema } from '@/amplify/data/resource'
import { format } from 'date-fns'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { formatDateOnly } from '@/lib/utils'

const client = generateClient<Schema>()

export default function ChecklistEntriesPage() {
  const { templateId } = useParams<{ templateId: string }>()
  const [entries, setEntries] = useState<Schema['ChecklistEntry']['type'][]>([])
  const [template, setTemplate] = useState<Schema['ChecklistTemplate']['type'] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadEntries() {
      if (!templateId) return

      const [{ data: template }, { data: allEntries }] = await Promise.all([
        client.models.ChecklistTemplate.get({ id: templateId }),
        client.models.ChecklistEntry.list({
          filter: { templateId: { eq: templateId } },
        }),
      ])

      setTemplate(template)
      setEntries(allEntries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()))
      setLoading(false)
    }

    loadEntries()
  }, [templateId])

  if (loading) return <p className='p-4'>Loading entries…</p>
  if (!template) return <p className='p-4 text-red-500'>Checklist not found</p>

  return (
    <div className='p-6 max-w-3xl mx-auto'>
      <div className='flex items-center justify-start py-4 '>
        <Link href={`/admin/checklists`} className='mr-4'>
          <ChevronLeft className='h-6 w-6' />
        </Link>
        <h1 className='text-2xl font-bold'>Entries for: {template.title || 'Checklist'}</h1>
      </div>

      {entries.length === 0 ? (
        <p className='text-gray-600'>No entries yet.</p>
      ) : (
        <ul className='space-y-3'>
          {entries.map((entry) => (
            <li key={entry.id} className='border p-4 rounded-lg bg-white shadow-sm flex justify-between items-center'>
              <Link
                href={`/admin/checklists/entries/${template.id}/show/${entry.id}`}
                className='w-full block border p-4 rounded-lg bg-white shadow-sm hover:bg-gray-50 transition'
              >
                <div>
                  <p className='font-medium text-lg'>{formatDateOnly(entry.date)}</p>
                  <p className='text-sm text-gray-500'>
                    Submitted by: {entry.checkedByName || 'Unknown'} · {entry.checkedItemIds?.length ?? 0} items checked
                  </p>
                </div>
                {/* Optional link to details page */}
                {/* <Link href={`/admin/checklist/entries/view/${entry.id}`} className="text-blue-600 text-sm">View</Link> */}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
