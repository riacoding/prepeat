'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { generateClient } from 'aws-amplify/data'
import type { Schema } from '@/amplify/data/resource'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { useSafeAuthenticator } from '@/hooks/useSafeAuthenticator'

const client = generateClient<Schema>()

export default function DailyChecklistPage() {
  const router = useRouter()
  const { user } = useSafeAuthenticator()

  const [template, setTemplate] = useState<Schema['ChecklistTemplate']['type'] | null>(null)
  const [items, setItems] = useState<Schema['TemplateItem']['type'][]>([])
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadChecklist() {
      const { data: templates } = await client.models.ChecklistTemplate.list()

      const firstTemplate = templates[0]
      if (!firstTemplate) {
        setLoading(false)
        return
      }

      setTemplate(firstTemplate)

      const { data: templateItems } = await client.models.TemplateItem.list({
        filter: { templateId: { eq: firstTemplate.id } },
      })

      setItems(templateItems)
      setChecked(Object.fromEntries(templateItems.map((item) => [item.id, false])))
      setLoading(false)
    }

    loadChecklist()
  }, [])

  const handleToggle = (itemId: string) => {
    setChecked((prev) => ({ ...prev, [itemId]: !prev[itemId] }))
  }

  const handleSubmit = async () => {
    if (!template || !user) return

    const checkedIds = Object.entries(checked)
      .filter(([_, isChecked]) => isChecked)
      .map(([id]) => id)

    const now = new Date()
    const isoDate = now.toISOString().split('T')[0] // YYYY-MM-DD

    await client.models.ChecklistEntry.create({
      merchantId: template.merchantId,
      templateId: template.id,
      date: isoDate,
      checkedItemIds: checkedIds,
      checkedByUserId: user.userId,
      checkedByName: user.username || 'Unknown',
      createdAt: now.toISOString(),
    })

    router.push('/admin/checklists') // or a success page
  }

  if (loading) return <p className='p-4'>Loading checklist…</p>
  if (!template) return <p className='p-4 text-gray-500'>No checklist available</p>

  return (
    <div className='p-6 max-w-xl mx-auto'>
      <h1 className='text-2xl font-bold mb-4'>{template.title || 'Daily Checklist'}</h1>
      <ul className='space-y-4'>
        {items.map((item) => (
          <li key={item.id} className='flex items-center gap-2'>
            <Checkbox
              id={`item-${item.id}`}
              checked={checked[item.id] || false}
              onCheckedChange={() => handleToggle(item.id)}
            />
            <Label htmlFor={`item-${item.id}`}>{item.label}</Label>
          </li>
        ))}
      </ul>

      <Button
        className='mt-6 bg-green-600 text-white hover:bg-green-700'
        onClick={handleSubmit}
        disabled={items.length === 0}
      >
        Submit Checklist
      </Button>
    </div>
  )
}
