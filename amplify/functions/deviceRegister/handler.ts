import type { APIGatewayProxyHandlerV2 } from 'aws-lambda'

export const handler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const body = event.body ? JSON.parse(event.body) : {}

    console.log('📥 Incoming register payload:', body)

    const { oneTimeCode } = body

    console.log('OTC:', oneTimeCode)

    // For now, ignore the actual values and just return a fixed API key
    const response = {
      apiKey: 'API_123456',
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(response),
    }
  } catch (err) {
    console.error('❌ Error in register handler:', err)
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal Server Error' }),
    }
  }
}
