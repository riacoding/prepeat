import { defineFunction } from '@aws-amplify/backend'

export const qr2PDF = defineFunction({
  entry: './qr2PDFHandler.ts',
  resourceGroupName: 'data',
})
