// amplify/functions/webhookProcessor/metrics.ts
import { createMetricsLogger, Unit, type MetricsLogger } from 'aws-embedded-metrics'
import type { SQSRecord } from 'aws-lambda'

const NAMESPACE = 'Prepeat/SquareWebhook'
let coldStart = true

export type RecordMetrics = {
  logger: MetricsLogger
  timeIt<T>(metricName: string, fn: () => Promise<T> | T): Promise<T>
  count(metricName: string, n?: number): void
  prop(key: string, value: unknown): void
  markProcessed(): void
  markDuplicate(): void
  markNoHandler(): void
  markError(): void
  flush(): Promise<void>
}

export function resolveEnv(): string {
  return process.env.ENV_NAME || process.env.ENVIRONMENT || process.env.AWS_BRANCH || process.env.NODE_ENV || 'unknown'
}

export function startMetrics({
  env = resolveEnv(),
  eventType = 'unknown',
  extraDimensions,
  awsRequestId,
}: {
  env?: string
  eventType?: string
  extraDimensions?: Record<string, string>
  awsRequestId?: string
} = {}): RecordMetrics {
  const logger = createMetricsLogger()
  logger.setNamespace(NAMESPACE)
  logger.putDimensions({
    Env: env,
    EventType: eventType,
    ...(extraDimensions ?? {}),
  })

  // Baseline counters & context
  logger.putMetric('Received', 1, Unit.Count)
  logger.putMetric('ColdStart', coldStart ? 1 : 0, Unit.Count)
  coldStart = false

  if (awsRequestId) logger.setProperty('AwsRequestId', awsRequestId)
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) logger.setProperty('Function', process.env.AWS_LAMBDA_FUNCTION_NAME)

  const count = (name: string, n = 1) => logger.putMetric(name, n, Unit.Count)
  const prop = (k: string, v: unknown) => logger.setProperty(k, v)

  const timeIt = async <T>(name: string, fn: () => Promise<T> | T) => {
    const t0 = Date.now()
    try {
      return await fn()
    } finally {
      logger.putMetric(name, Date.now() - t0, Unit.Milliseconds)
    }
  }

  const markProcessed = () => count('Processed', 1)
  const markDuplicate = () => count('DuplicateSkipped', 1)
  const markNoHandler = () => count('NoHandler', 1)
  const markError = () => count('Errors', 1)

  const flush = () => logger.flush()

  return { logger, timeIt, count, prop, markProcessed, markDuplicate, markNoHandler, markError, flush }
}

/** Adds MessageAgeMs and a few helpful SQS properties (not dimensions). */
export function recordSqsDiagnostics(m: RecordMetrics, record: SQSRecord, snsTimestampIso?: string): void {
  const now = Date.now()

  // Prefer SQS SentTimestamp; fall back to SNS Timestamp if available
  let sentMs = Number(record.attributes?.SentTimestamp)
  if (!sentMs || Number.isNaN(sentMs)) {
    const ts = snsTimestampIso ? Date.parse(snsTimestampIso) : NaN
    if (!Number.isNaN(ts)) sentMs = ts
  }
  if (sentMs && !Number.isNaN(sentMs)) {
    m.logger.putMetric('MessageAgeMs', Math.max(0, now - sentMs), Unit.Milliseconds)
  }

  m.prop('SqsMessageId', record.messageId)
  if (record.attributes?.ApproximateReceiveCount)
    m.prop('SqsApproxReceiveCount', Number(record.attributes.ApproximateReceiveCount))
}

/** Optional helper to wrap Square SDK calls and aggregate time/call count. */
export function makeSquareTimer(m: RecordMetrics) {
  return async function <T>(label: string, fn: () => Promise<T> | T): Promise<T> {
    const t0 = Date.now()
    try {
      return await fn()
    } finally {
      const ms = Date.now() - t0
      m.count('SquareCalls', 1)
      m.logger.putMetric('SquareTimeMs', ms, Unit.Milliseconds)
      m.prop('SquareLastLabel', label)
    }
  }
}
