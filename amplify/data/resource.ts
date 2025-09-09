import { type ClientSchema, a, defineData } from '@aws-amplify/backend'
import { counter } from '../functions/Counter/resource'
import { squareAuth } from '../functions/getSquareAuth/resource'
import { webhookProcessor } from '../functions/webhookProcessor/resource'
import { postConfirmation } from '../auth/postConfirmation/resource'
import { twilioInbound } from '../functions/twilioInbound/resource'
import { demoNotifyPhone } from '../functions/DemoNotifyPhone/resource'

const CodeStatus = a.enum(['NEW', 'RESERVED', 'USED', 'EXPIRED'])
const DeviceStatus = a.enum(['ACTIVE', 'SUSPENDED', 'DECOMMISSIONED'])
const JobStatus = a.enum(['QUEUED', 'INFLIGHT', 'ACKED', 'FAILED'])

const schema = a
  .schema({
    Consent: a.customType({
      method: a.string().required(), // "webform"
      timestamp: a.datetime().required(), // ISO string
      policyVersion: a.string(), // e.g. "v1.0"
      text: a.string(), // short consent copy shown
    }),
    UTM: a.customType({
      source: a.string(), // utm_source
      medium: a.string(), // utm_medium
      campaign: a.string(), // utm_campaign
      term: a.string(),
      content: a.string(),
    }),
    Source: a.customType({
      placement: a.string().required(), // "homepage_hero" | "footer" | "modal"
      url: a.string(), // canonical page URL
      utm: a.ref('UTM'),
    }),
    ExportInfo: a.customType({
      status: a.enum(['pending', 'exported', 'failed']),
      lastExportAt: a.datetime(),
      provider: a.string(), // "mailchimp"
      emailHash: a.string(), // md5(lowercased email) for Mailchimp
    }),
    TicketResponse: a.customType({
      ticketNumber: a.string(),
    }),
    SquareAuthResponse: a.customType({
      url: a.string(),
      auth: a.string(),
    }),
    ProductSubscription: a.customType({
      level: a.enum(['free', 'basic', 'premium']),
      startDate: a.date(),
    }),
    EnrollmentCode: a
      .model({
        codeHash: a.string().required(), // sha256(normalizedCode + PEPPER)
        vendorId: a.string().required(),
        status: CodeStatus,
        expiresAt: a.integer(),
        maxUses: a.integer().default(1),
        usedCount: a.integer().default(0),
        reservedAt: a.datetime(),
        usedAt: a.datetime(),
        createdBy: a.string(),
      })
      // Use codeHash as the model ID to make lookup simple/atomic.
      .identifier(['codeHash'])
      .secondaryIndexes((index) => [index('vendorId')])
      .authorization((allow) => [allow.group('admins').to(['create', 'read', 'update', 'delete'])]),
    Device: a
      .model({
        id: a.id(), // deviceId (ulid)
        vendorId: a.string().required(),
        name: a.string(),
        status: DeviceStatus,
        lastSeenAt: a.datetime(),
        lastPrintAt: a.datetime(),
        version: a.string().default('v0'),
        pubKeyAlg: a.string().default('ed25519'),
        pubKey: a.string(), // base64/JWK public only
        apiKeyHash: a.string(), // sha256(apiKey + PEPPER)
      })
      .secondaryIndexes((index) => [index('vendorId')])
      .authorization((allow) => [allow.group('admins').to(['create', 'read', 'update', 'delete'])]),
    DeviceJob: a
      .model({
        id: a.id(), // ULID jobId
        deviceId: a.string().required(),
        createdAt: a.datetime().required(),
        expiresAt: a.integer(),
        status: JobStatus,
        payload: a.json().required(), // { type:'ZPL', content:'...' }
        error: a.string(),
        // For the simple “no-lease v1”, we’ll just flip INFLIGHT and requeue on timeout.
        inflightAt: a.datetime(), // when handed to device
        // Optional helpers
        dedupeKey: a.string(), // e.g., order-123
        vendorId: a.string(), // denormalized for dashboards
      })
      .secondaryIndexes((index) => [
        index('vendorId').sortKeys(['status', 'createdAt']),
        index('deviceId').sortKeys(['createdAt']),
      ])
      .authorization((allow) => [allow.group('admins').to(['create', 'read', 'update', 'delete'])]),
    Subscriber: a
      .model({
        // Use lowercased email as the PRIMARY KEY (id). Pass it explicitly on create.
        id: a.string().required(), // set to emailLower on write
        email: a.string().required(), // store original or lowercased (recommend lowercased)
        status: a.enum(['subscribed', 'unsubscribed', 'cleaned', 'pending']),
        optInType: a.enum(['single', 'double']),
        consent: a.ref('Consent'),
        source: a.ref('Source'),
        tags: a.string().array(), // e.g., ["homepage-hero"]
        userAgent: a.string(),
        export: a.ref('ExportInfo'),
        createdAt: a.datetime().required(),
        updatedAt: a.datetime().required(),
      })

      .authorization((allow) => [
        allow.guest().to(['create']),
        allow.authenticated().to(['create']),
        allow.group('Admin').to(['read', 'update', 'delete']),
      ]),
    User: a
      .model({
        sub: a.string().required(), // Cognito sub
        email: a.string().required(),
        merchantId: a.id().required(),
        owner: a.string().required(),
        firstname: a.string(),
        lastname: a.string(),
      })
      .secondaryIndexes((index) => [index('sub')])
      .authorization((allow) => [allow.owner(), allow.groups(['admin', 'vendor'])]),

    Merchant: a
      .model({
        id: a.id().required(),
        handle: a.id().required(),
        squareMerchantId: a.string().required(),
        accessToken: a.string().required(),
        refreshToken: a.string(),
        tokenExpiresAt: a.datetime(),
        tokenrefreshedAt: a.datetime(),
        businessName: a.string().required(),
        locationIds: a.string().array().required(),
        s3ItemKey: a.string(),
        isLinked: a.boolean().default(false),
        subscription: a.ref('ProductSubscription'),
        displayImages: a.boolean().default(true),
        taxRate: a.float(),
        isTaxable: a.boolean().default(true),
        timeZone: a.string().default('America/Los Angeles'),
      })
      .secondaryIndexes((index) => [index('squareMerchantId'), index('handle')])
      .authorization((allow) => [
        allow.owner(),
        allow.guest().to(['read']),
        allow.authenticated().to(['create', 'read']),
        allow.groups(['admin']),
      ]),
    DemoOrder: a
      .model({
        merchantId: a.id().required(),
        referenceId: a.string(),
        orderId: a.string(),
        locationId: a.string().required(),
        status: a.string(), // "OPEN", "COMPLETED", etc.
        totalMoney: a.integer(),
        fulfillmentStatus: a.string(),
        rawData: a.json(),
        expiresAt: a.timestamp(),
      })
      .secondaryIndexes((index) => [index('referenceId'), index('merchantId')])
      .authorization((allow) => [allow.guest(), allow.groups(['admin', 'vendor']).to(['read', 'create', 'update'])]),
    Order: a
      .model({
        merchantId: a.id().required(),
        referenceId: a.string(),
        orderId: a.string(),
        locationId: a.string().required(),
        status: a.string(), // "OPEN", "COMPLETED", etc.
        totalMoney: a.integer(),
        fulfillmentStatus: a.string(),
        rawData: a.json(),
      })
      .secondaryIndexes((index) => [index('referenceId'), index('merchantId')])
      .authorization((allow) => [
        allow.guest().to(['read']),
        allow.authenticated().to(['read']),
        allow.groups(['admin', 'vendor']),
      ]),
    TicketCounter: a
      .model({
        id: a.id().required(),
        counter: a.integer().default(0),
        expiresAt: a.integer(), // TTL field
      })
      .authorization((allow) => [allow.guest().to(['read']), allow.authenticated().to(['read'])]),

    // 🆕 Standalone CatalogItem to sync Square catalog
    CatalogItem: a
      .model({
        squareItemId: a.string().required(), // Square object ID
        catalogVariationId: a.string(),
        s3ItemKey: a.string(),
        merchantId: a.id().required(),
        catalogData: a.json().required(), // Full Square catalog JSON
      })
      .identifier(['merchantId', 'squareItemId'])
      .secondaryIndexes((index) => [index('squareItemId'), index('merchantId')])
      .authorization((allow) => [allow.groups(['vendor', 'admin']), allow.guest().to(['read'])]),

    Phone: a
      .model({
        id: a.id().required(),
        phone: a.string().required(),
        isDemoOrder: a.boolean().default(false).required(),
        referenceId: a.string().required(),
        optIn: a.boolean().required(),
        clientUpdated: a.boolean().default(false).required(),
        expiresAt: a.integer(), // TTL field
      })
      .secondaryIndexes((index) => [index('referenceId'), index('phone')])
      .authorization((allow) => [allow.groups(['admin']), allow.guest(), allow.authenticated()]),
    Menu: a
      .model({
        id: a.id().required(),
        merchantId: a.id().required(),
        name: a.string().required(),
        squareLocationId: a.string(),
        locationId: a.string().required(),
        logo: a.string(),
        isActive: a.boolean().default(false),
        isOffline: a.boolean().default(false),
        theme: a.json(),
        useImages: a.boolean().default(true),
        menuItems: a.hasMany('MenuItem', 'menuId'), // 🆕 one-to-many
      })
      .secondaryIndexes((index) => [index('locationId'), index('merchantId')])
      .authorization((allow) => [allow.owner(), allow.groups(['admin', 'vendor']), allow.guest().to(['read'])]),
    MenuItem: a
      .model({
        id: a.id().required(),
        merchantId: a.id().required(),
        menuId: a.id().required(), // link to Menu
        catalogItemId: a.id().required(), // link to CatalogItem
        s3ImageKey: a.string(), // optional custom image
        customName: a.string(), // optional name override
        isFeatured: a.boolean().default(false),
        sortOrder: a.integer(),
        menu: a.belongsTo('Menu', 'menuId'),
        toppings: a.hasMany('ItemTopping', 'menuItemId'),
      })
      .authorization((allow) => [allow.owner(), allow.groups(['admin', 'vendor']), allow.guest().to(['read'])]),

    Topping: a
      .model({
        id: a.id().required(),
        name: a.string().required(),
        price: a.float().required(),
        itemToppings: a.hasMany('ItemTopping', 'toppingId'),
      })
      .authorization((allow) => [allow.owner(), allow.groups(['admin']), allow.guest().to(['read'])]),
    ChecklistTemplate: a
      .model({
        merchantId: a.id(),
        title: a.string(),
        items: a.hasMany('TemplateItem', 'templateId'), // 👈 add this
      })
      .authorization((allow) => [allow.owner(), allow.groups(['admin'])]),
    TemplateItem: a
      .model({
        templateId: a.id().required(),
        template: a.belongsTo('ChecklistTemplate', 'templateId'),
        label: a.string().required(),
        sortOrder: a.integer(),
        isRequired: a.boolean().default(false),
      })
      .authorization((allow) => [allow.owner(), allow.groups(['admin'])]),
    ChecklistEntry: a
      .model({
        merchantId: a.id(),
        templateId: a.id(),
        date: a.date().required(), // "2025-07-08"
        checkedItemIds: a.string().array(), // or raw strings, up to you
        checkedByUserId: a.id(),
        checkedByName: a.string(),
        createdAt: a.datetime().required(),
      })
      .secondaryIndexes((index) => [index('merchantId'), index('date')])
      .authorization((allow) => [allow.groups(['vendor', 'admin']), allow.owner()]),
    ItemTopping: a
      .model({
        id: a.id().required(),
        isDefault: a.boolean().default(false),
        isLocked: a.boolean().default(false),
        menuItemId: a.id().required(),
        toppingId: a.id().required(),
        menuItem: a.belongsTo('MenuItem', 'menuItemId'),
        topping: a.belongsTo('Topping', 'toppingId'),
      })
      .authorization((allow) => [allow.owner(), allow.groups(['admin']), allow.guest().to(['read'])]),
    getSquareAuthUrl: a
      .query()
      .arguments({ merchantId: a.string().required() })
      .returns(a.ref('SquareAuthResponse'))
      .authorization((allow) => [allow.guest(), allow.authenticated()])
      .handler(a.handler.function(squareAuth)),
    getTicket: a
      .query()
      .arguments({
        locationId: a.string().required(),
        timeZone: a.string().required(),
      })
      .returns(a.ref('TicketResponse'))
      .authorization((allow) => [allow.guest(), allow.authenticated()])
      .handler(a.handler.function(counter)),
    demoNotifyPhone: a
      .mutation()
      .arguments({ phone: a.string().required(), referenceId: a.string().required() })
      .authorization((allow) => [allow.guest(), allow.authenticated()])
      .handler(a.handler.function(demoNotifyPhone).async()),
  })

  .authorization((allow) => [
    allow.resource(counter),
    allow.resource(webhookProcessor),
    allow.resource(twilioInbound),
    allow.resource(postConfirmation),
    allow.resource(demoNotifyPhone),
  ])

export type Schema = ClientSchema<typeof schema>

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
  },
})
