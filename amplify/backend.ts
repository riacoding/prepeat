import { defineBackend } from '@aws-amplify/backend'
import { auth } from './auth/resource'
import { data } from './data/resource'
import { storage } from './storage/resource'
import { config } from '@dotenvx/dotenvx'
import { UserPool } from 'aws-cdk-lib/aws-cognito'
import { counter } from './functions/Counter/resource'
import { webhook } from './functions/webhook/resource'
import { webhookProcessor } from './functions/webhookProcessor/resource'
import { twilioInbound } from './functions/twilioInbound/resource'
import { PolicyStatement } from 'aws-cdk-lib/aws-iam'
import { HttpIamAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers'
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations'
import { CorsHttpMethod, HttpApi, HttpMethod, PayloadFormatVersion } from 'aws-cdk-lib/aws-apigatewayv2'
import { CfnOutput, RemovalPolicy, Stack } from 'aws-cdk-lib'
import { SquareWebhookStack } from './custom/webhookqueue/resource'
import { squareAuth } from './functions/getSquareAuth/resource'
import { demoNotifyPhone } from './functions/DemoNotifyPhone/resource'
import { qr2PDF } from './functions/Qr2PDF/resource'
import branchName from 'current-git-branch'
import { AttributeType, BillingMode, Table } from 'aws-cdk-lib/aws-dynamodb'
import * as iam from 'aws-cdk-lib/aws-iam'

config({ path: '.env.local', override: false })

function resolveBranch(): string {
  const b = branchName() // string | false
  if (typeof b === 'string' && b) return b
  return process.env.AMPLIFY_BRANCH ?? process.env.AWS_BRANCH ?? 'local'
}

// Try git branch first (local/dev), then CI env vars (Amplify Console)
const BRANCH = resolveBranch()

// Map branch → env label (tweak to your names)
const ENV_NAME =
  BRANCH === 'main' || BRANCH === 'prod' ? 'prod' : process.env.ENVIRONMENT === 'sandbox' ? 'sandbox' : 'dev' // fallback: use branch as-is

const backend = defineBackend({
  auth,
  data,
  storage,
  counter,
  webhook,
  webhookProcessor,
  twilioInbound,
  squareAuth,
  demoNotifyPhone,
  qr2PDF,
})
const environment = process.env.ENVIRONMENT ?? 'dev'
const ordersTable = backend.data.resources.tables['Order']
const { cfnResources } = backend.data.resources
const demoNotifyPhoneLambda = backend.demoNotifyPhone

cfnResources.amplifyDynamoDbTables['DemoOrder'].timeToLiveAttribute = {
  attributeName: 'expiresAt',
  enabled: true,
}

const APP_BASE_URL =
  ENV_NAME === 'dev'
    ? 'https://dev.prepeat.io'
    : ENV_NAME === 'prod'
      ? 'https://main.dgs4gp483bprx.amplifyapp.com/'
      : 'http://localhost:3000'

// //Cache table
const cacheStack = backend.createStack(`CacheStack-${ENV_NAME}`)
const cacheTable = new Table(cacheStack, 'MenuCache', {
  tableName: `MenuCache-${ENV_NAME}`,
  partitionKey: { name: 'pk', type: AttributeType.STRING },
  billingMode: BillingMode.PAY_PER_REQUEST,
  timeToLiveAttribute: 'ttl', // auto-expire day buckets
  removalPolicy: RemovalPolicy.DESTROY, // dev only; switch to RETAIN in prod
})

// Compute role that Amplify Hosting’s SSR runtime will assume
const computeRole = new iam.Role(cacheStack, 'AmplifyComputeRole', {
  roleName: `amplify-compute-menu-cache-${ENV_NAME}`,
  assumedBy: new iam.ServicePrincipal('amplify.amazonaws.com'),
  description: 'Amplify Hosting SSR can access menu-cache DynamoDB',
})

// Minimal permissions (or use cacheTable.grantReadWriteData(computeRole))
computeRole.addToPolicy(
  new iam.PolicyStatement({
    actions: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:DeleteItem'],
    resources: [cacheTable.tableArn],
  })
)

computeRole.addToPolicy(
  new iam.PolicyStatement({
    actions: ['cloudwatch:PutMetricData'],
    resources: ['*'], // PutMetricData only supports '*'
  })
)

new CfnOutput(cacheStack, 'MenuCacheTableName', { value: cacheTable.tableName })
new CfnOutput(cacheStack, 'AmplifyComputeRoleArn', { value: computeRole.roleArn })

// standalone table just for quotas (pk=phoneHash, sk=YYYY-MM-DD)
const rateStack = backend.createStack('DemoNotifyRateLimit')
const quotaTable = new Table(rateStack, 'DemoNotifyQuota', {
  partitionKey: { name: 'pk', type: AttributeType.STRING },
  sortKey: { name: 'sk', type: AttributeType.STRING },
  billingMode: BillingMode.PAY_PER_REQUEST,
  timeToLiveAttribute: 'ttl', // auto-expire day buckets
  removalPolicy: RemovalPolicy.DESTROY, // dev only; switch to RETAIN in prod
})

// inject table name + grant R/W to the function
demoNotifyPhoneLambda.addEnvironment('QUOTA_TABLE_NAME', quotaTable.tableName)
demoNotifyPhoneLambda.addEnvironment('ENV', ENV_NAME)
quotaTable.grantReadWriteData(demoNotifyPhoneLambda.resources.lambda)

const squareWebhook = new SquareWebhookStack(backend.data.stack, 'SquareWebHookStack', {
  squareProcessorLambda: backend.webhookProcessor.resources.lambda,
  ordersTable: ordersTable,
  environment,
})

const apiStack = Stack.of(backend.webhook.resources.lambda.stack)

const httpApi = new HttpApi(apiStack, 'SquareWebhookApi', {
  apiName: `prepeat-webhook-api-${ENV_NAME}`,
  corsPreflight: {
    allowMethods: [CorsHttpMethod.POST, CorsHttpMethod.OPTIONS],
    allowOrigins: ['*'],
    allowHeaders: ['*'],
  },
  createDefaultStage: true,
})

const webhookIntegration = new HttpLambdaIntegration('SquareWebhookIntegration', backend.webhook.resources.lambda)
const qr2PDFIntegration = new HttpLambdaIntegration('Qr2PDFIntegration', backend.qr2PDF.resources.lambda)
const twilioIntegration = new HttpLambdaIntegration('TwilioIntegration', backend.twilioInbound.resources.lambda, {
  payloadFormatVersion: PayloadFormatVersion.VERSION_1_0,
})

const iamAuthorizer = new HttpIamAuthorizer()

httpApi.addRoutes({
  path: '/square-webhook',
  methods: [HttpMethod.POST, HttpMethod.OPTIONS],
  integration: webhookIntegration,
})

httpApi.addRoutes({
  path: '/twilio-inbound',
  methods: [HttpMethod.POST, HttpMethod.OPTIONS],
  integration: twilioIntegration,
})

httpApi.addRoutes({
  path: '/qr2pdf',
  methods: [HttpMethod.POST, HttpMethod.OPTIONS],
  integration: qr2PDFIntegration,
})

// Output API info
backend.addOutput({
  custom: {
    SquareWebhookAPI: {
      endpoint: httpApi.url,
      region: Stack.of(httpApi).region,
    },
    deployment: process.env.AWS_DEPLOYMENT_TYPE,
  },
})

const counterTable = backend.data.resources.tables['TicketCounter']
const userPool = backend.auth.resources.userPool as UserPool

backend.counter.addEnvironment('COUNTER_TABLE', counterTable.tableName)
backend.webhook.addEnvironment('WEBHOOK_URL', `${httpApi.url!}square-webhook`)
backend.webhook.addEnvironment('SQUARE_TOPIC_ARN', squareWebhook.squareTopic.topicArn)
backend.webhookProcessor.addEnvironment('SQS_QUEUE_URL', squareWebhook.squareQueue.queueUrl)
backend.webhookProcessor.addEnvironment('SQS_DLQ_URL', squareWebhook.squareDLQURL.queueUrl)
backend.webhookProcessor.addEnvironment('ORDERS_TABLE', ordersTable.tableName)
backend.webhookProcessor.addEnvironment('IDEMPOTENCY_TABLE', squareWebhook.idempotencyTable.tableName)
backend.squareAuth.addEnvironment('APP_BASE_URL', APP_BASE_URL)
backend.twilioInbound.addEnvironment('APP_BASE_URL', APP_BASE_URL)

squareWebhook.squareTopic.grantPublish(backend.webhook.resources.lambda)

backend.counter.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    actions: ['dynamodb:UpdateItem', 'dynamodb:GetItem'],
    resources: [counterTable.tableArn],
  })
)

backend.data.resources.cfnResources.cfnGraphqlApi.name = 'PizzaMenu'
