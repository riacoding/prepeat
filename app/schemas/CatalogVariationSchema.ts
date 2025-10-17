import { z } from 'zod'

export const CatalogVariationRecordZ = z.object({
  merchantId: z.string().min(1),
  catalogVariationId: z.string().min(1),
  parentItemId: z.string().min(1),
  squareItemId: z.string().optional().nullable(),
  variationName: z.string().optional().nullable(),
  itemName: z.string().optional().nullable(),
  itemDescription: z.string().optional().nullable(),
  sku: z.string().optional().nullable(),
  priceCents: z.number().int().optional().nullable(),
  currency: z.string().optional().nullable(),
  modifierListIds: z.array(z.string()).default([]),
  itemVersion: z.string().optional().nullable(),
  variationVersion: z.string().optional().nullable(),
  catalogData: z.unknown(),
  s3ItemKey: z.string().optional().nullable(),
})
