import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import { toZonedTime, format } from 'date-fns-tz'

const client = new DynamoDBClient({})

export const handler = async (event: { arguments: { locationId: string; timeZone: string } }) => {
  const { locationId, timeZone } = event.arguments

  const zonedNow = toZonedTime(new Date(), timeZone)
  const today = format(zonedNow, 'yyyyMMdd') // e.g., "20240517"

  const counterKey = `order-${locationId}-${today}`
  console.log('updating counter:', counterKey)
  const tableName = process.env.COUNTER_TABLE

  const command = new UpdateItemCommand({
    TableName: tableName,
    Key: { id: { S: counterKey } },
    UpdateExpression: 'ADD #v :inc SET expiresAt = if_not_exists(expiresAt, :ttl)',
    ExpressionAttributeNames: { '#v': 'value' },
    ExpressionAttributeValues: {
      ':inc': { N: '1' },
      ':ttl': { N: (Math.floor(Date.now() / 1000) + 86400).toString() },
    },
    ReturnValues: 'UPDATED_NEW',
  })

  const result = await client.send(command)
  const value = unmarshall(result.Attributes!)?.value

  return {
    ticketNumber: `${locationId}-${today}-${value.toString().padStart(3, '0')}`,
  }
}
