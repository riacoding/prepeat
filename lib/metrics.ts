import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch'

const cw = new CloudWatchClient({})

const NAMESPACE = 'Prepeat/MenuCache'
const ENV = process.env['ENVIRONMENT'] ?? process.env['NODE_ENV'] ?? 'unknown'
const TABLE = process.env['MENU_CACHE_TABLE'] ?? 'unknown'

export async function putMetric(
  metricName: 'Hit' | 'Miss' | 'WriteSuccess' | 'WriteError' | 'DurationMs',
  value: number
) {
  try {
    await cw.send(
      new PutMetricDataCommand({
        Namespace: NAMESPACE,
        MetricData: [
          {
            MetricName: metricName,
            Value: value,
            Unit: metricName === 'DurationMs' ? 'Milliseconds' : 'Count',
            Dimensions: [
              { Name: 'Env', Value: ENV },
              { Name: 'Table', Value: TABLE },
            ],
          },
        ],
      })
    )
  } catch (e) {
    // don't ever fail the request because metrics failed
    console.error('[metrics] PutMetricData failed', metricName, e as Error)
  }
}
