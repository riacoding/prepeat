import { defineFunction, secret } from '@aws-amplify/backend'

export const demoNotifyPhone = defineFunction({
  entry: './demoNotifyPhone.ts',
  environment: {
    TWILIO_ACCOUNT_SID: secret('TWILIO_ACCOUNT_SID'),
    TWILIO_AUTH_TOKEN: secret('TWILIO_AUTH_TOKEN'),
    TWILIO_FROM: secret('TWILIO_FROM'),
  },
  resourceGroupName: 'data',
})
