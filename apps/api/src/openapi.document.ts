const setupIntegrationModeSchema = {
  enum: ['api-key', 'provider-login'],
  type: 'string',
} as const;

const authenticatedSecurity = [
  {
    sessionCookie: [],
    csrfHeader: [],
  },
] as const;

const identityUserSummarySchema = {
  additionalProperties: false,
  properties: {
    adminTier: {
      nullable: true,
      type: 'integer',
    },
    authMethods: {
      items: {
        additionalProperties: true,
        type: 'object',
      },
      type: 'array',
    },
    email: { format: 'email', type: 'string' },
    emailVerified: { type: 'boolean' },
    id: { type: 'string' },
    name: { type: 'string' },
    recoverUntil: {
      format: 'date-time',
      nullable: true,
      type: 'string',
    },
    roles: {
      items: { type: 'string' },
      type: 'array',
    },
    state: {
      enum: ['active', 'deactivated', 'deleted'],
      type: 'string',
    },
  },
  required: [
    'adminTier',
    'authMethods',
    'email',
    'emailVerified',
    'id',
    'name',
    'recoverUntil',
    'roles',
    'state',
  ],
  type: 'object',
} as const;

const organizationSummarySchema = {
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    membershipRole: {
      enum: ['admin', 'member'],
      type: 'string',
    },
    name: { type: 'string' },
  },
  required: ['id', 'membershipRole', 'name'],
  type: 'object',
} as const;

const membershipSummarySchema = {
  additionalProperties: false,
  properties: {
    email: { format: 'email', type: 'string' },
    name: { type: 'string' },
    role: {
      enum: ['admin', 'member'],
      type: 'string',
    },
    userId: { type: 'string' },
  },
  required: ['email', 'name', 'role', 'userId'],
  type: 'object',
} as const;

const invitationSummarySchema = {
  additionalProperties: false,
  properties: {
    createdAt: {
      format: 'date-time',
      nullable: true,
      type: 'string',
    },
    expiresAt: {
      format: 'date-time',
      nullable: true,
      type: 'string',
    },
    id: { type: 'string' },
    invitedEmail: { format: 'email', type: 'string' },
    organizationId: {
      nullable: true,
      type: 'string',
    },
    organizationName: {
      nullable: true,
      type: 'string',
    },
    previewInviteCode: {
      nullable: true,
      type: 'string',
    },
    role: {
      enum: ['admin', 'member'],
      type: 'string',
    },
  },
  required: ['id', 'invitedEmail', 'role'],
  type: 'object',
} as const;

const groupSummarySchema = {
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    members: {
      items: {
        additionalProperties: false,
        properties: {
          email: { format: 'email', type: 'string' },
          name: { type: 'string' },
          userId: { type: 'string' },
        },
        required: ['email', 'name', 'userId'],
        type: 'object',
      },
      type: 'array',
    },
    name: { type: 'string' },
  },
  required: ['id', 'members', 'name'],
  type: 'object',
} as const;

const calendarSummarySchema = {
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    ownerUserId: {
      nullable: true,
      type: 'string',
    },
    type: {
      enum: ['organization', 'personal'],
      nullable: true,
      type: 'string',
    },
  },
  required: ['id', 'name', 'ownerUserId'],
  type: 'object',
} as const;

const importedContactSchema = {
  additionalProperties: false,
  properties: {
    displayName: { type: 'string' },
    email: {
      format: 'email',
      nullable: true,
      type: 'string',
    },
    id: { type: 'string' },
    phone: {
      nullable: true,
      type: 'string',
    },
    providerCode: { type: 'string' },
    providerContactId: { type: 'string' },
  },
  required: [
    'displayName',
    'email',
    'id',
    'phone',
    'providerCode',
    'providerContactId',
  ],
  type: 'object',
} as const;

const attachmentSummarySchema = {
  additionalProperties: false,
  properties: {
    fileName: { type: 'string' },
    fileSizeBytes: { type: 'integer' },
    id: { type: 'string' },
    mimeType: { type: 'string' },
    state: {
      enum: ['created', 'quarantined', 'ready', 'rejected'],
      type: 'string',
    },
    storageKey: { type: 'string' },
  },
  required: [
    'fileName',
    'fileSizeBytes',
    'id',
    'mimeType',
    'state',
    'storageKey',
  ],
  type: 'object',
} as const;

const taskSummarySchema = {
  additionalProperties: false,
  properties: {
    allocation: {
      additionalProperties: false,
      properties: {
        allocatedMinutes: { type: 'integer' },
        estimateMinutes: {
          nullable: true,
          type: 'integer',
        },
        overAllocated: { type: 'boolean' },
        remainingMinutes: {
          nullable: true,
          type: 'integer',
        },
      },
      required: [
        'allocatedMinutes',
        'estimateMinutes',
        'overAllocated',
        'remainingMinutes',
      ],
      type: 'object',
    },
    dueAt: {
      format: 'date-time',
      nullable: true,
      type: 'string',
    },
    estimatedDurationMinutes: {
      nullable: true,
      type: 'integer',
    },
    id: { type: 'string' },
    priority: {
      enum: ['low', 'medium', 'high', 'urgent'],
      type: 'string',
    },
    status: {
      enum: ['todo', 'in_progress', 'blocked', 'completed'],
      type: 'string',
    },
    subtaskSummary: {
      additionalProperties: false,
      properties: {
        completed: { type: 'integer' },
        total: { type: 'integer' },
      },
      required: ['completed', 'total'],
      type: 'object',
    },
    taskDependencyCount: { type: 'integer' },
    title: { type: 'string' },
    workRelated: { type: 'boolean' },
  },
  required: [
    'allocation',
    'dueAt',
    'estimatedDurationMinutes',
    'id',
    'priority',
    'status',
    'subtaskSummary',
    'taskDependencyCount',
    'title',
    'workRelated',
  ],
  type: 'object',
} as const;

const eventDetailSchema = {
  additionalProperties: false,
  properties: {
    allDay: { type: 'boolean' },
    allDayEndDate: {
      nullable: true,
      type: 'string',
    },
    allDayStartDate: {
      nullable: true,
      type: 'string',
    },
    allocation: taskSummarySchema.properties.allocation,
    attachments: {
      items: { $ref: '#/components/schemas/AttachmentSummary' },
      type: 'array',
    },
    calendars: {
      items: {
        additionalProperties: false,
        properties: {
          calendarId: { type: 'string' },
          calendarName: { type: 'string' },
        },
        required: ['calendarId', 'calendarName'],
        type: 'object',
      },
      type: 'array',
    },
    contacts: {
      items: { $ref: '#/components/schemas/ImportedContact' },
      type: 'array',
    },
    createdAt: {
      format: 'date-time',
      type: 'string',
    },
    durationMinutes: {
      nullable: true,
      type: 'integer',
    },
    endAt: {
      format: 'date-time',
      nullable: true,
      type: 'string',
    },
    id: { type: 'string' },
    lifecycleState: {
      enum: ['active', 'deleted'],
      type: 'string',
    },
    linkedTaskId: {
      nullable: true,
      type: 'string',
    },
    location: {
      nullable: true,
      type: 'string',
    },
    notes: {
      nullable: true,
      type: 'string',
    },
    provenance: {
      anyOf: [
        {
          additionalProperties: false,
          properties: {
            copiedAt: {
              format: 'date-time',
              type: 'string',
            },
            sourceContextType: {
              enum: ['organization', 'personal'],
              type: 'string',
            },
            sourceItemId: { type: 'string' },
            sourceOrganizationId: {
              nullable: true,
              type: 'string',
            },
          },
          required: [
            'copiedAt',
            'sourceContextType',
            'sourceItemId',
            'sourceOrganizationId',
          ],
          type: 'object',
        },
        { type: 'null' },
      ],
    },
    startAt: {
      format: 'date-time',
      nullable: true,
      type: 'string',
    },
    timezone: { type: 'string' },
    title: { type: 'string' },
    updatedAt: {
      format: 'date-time',
      type: 'string',
    },
    workRelated: { type: 'boolean' },
  },
  required: [
    'allDay',
    'allDayEndDate',
    'allDayStartDate',
    'allocation',
    'attachments',
    'calendars',
    'contacts',
    'createdAt',
    'durationMinutes',
    'endAt',
    'id',
    'lifecycleState',
    'linkedTaskId',
    'location',
    'notes',
    'provenance',
    'startAt',
    'timezone',
    'title',
    'updatedAt',
    'workRelated',
  ],
  type: 'object',
} as const;

const timePolicySummarySchema = {
  additionalProperties: false,
  properties: {
    id: { type: 'string' },
    isActive: { type: 'boolean' },
    policyType: {
      enum: [
        'working_hours',
        'availability',
        'unavailability',
        'holiday',
        'blackout',
        'rest',
        'max_hours',
      ],
      type: 'string',
    },
    rule: {
      additionalProperties: true,
      type: 'object',
    },
    scopeLevel: {
      enum: ['organization', 'group', 'user'],
      type: 'string',
    },
    sourceType: {
      enum: ['custom', 'official'],
      type: 'string',
    },
    targetGroupId: {
      nullable: true,
      type: 'string',
    },
    targetUserId: {
      nullable: true,
      type: 'string',
    },
    title: { type: 'string' },
    updatedAt: {
      format: 'date-time',
      type: 'string',
    },
  },
  required: [
    'id',
    'isActive',
    'policyType',
    'rule',
    'scopeLevel',
    'sourceType',
    'targetGroupId',
    'targetUserId',
    'title',
    'updatedAt',
  ],
  type: 'object',
} as const;

const advisoryResultSchema = {
  additionalProperties: false,
  properties: {
    actions: {
      items: {
        enum: ['proceed', 'alternative_slots', 'ask_ai', 'cancel'],
        type: 'string',
      },
      type: 'array',
    },
    alternativeSlots: {
      items: {
        additionalProperties: false,
        properties: {
          endAt: {
            format: 'date-time',
            type: 'string',
          },
          reason: { type: 'string' },
          startAt: {
            format: 'date-time',
            type: 'string',
          },
        },
        required: ['endAt', 'reason', 'startAt'],
        type: 'object',
      },
      type: 'array',
    },
    canProceed: { const: true, type: 'boolean' },
    concerns: {
      items: {
        additionalProperties: false,
        properties: {
          category: { type: 'string' },
          code: { type: 'string' },
          details: {
            additionalProperties: true,
            type: 'object',
          },
          level: { const: 'warning', type: 'string' },
          message: { type: 'string' },
        },
        required: ['category', 'code', 'details', 'level', 'message'],
        type: 'object',
      },
      type: 'array',
    },
    effectivePolicies: {
      additionalProperties: false,
      properties: {
        categories: {
          additionalProperties: {
            additionalProperties: false,
            properties: {
              resolvedFromScope: {
                enum: ['organization', 'group', 'user', null],
              },
              rules: {
                items: {
                  additionalProperties: true,
                  type: 'object',
                },
                type: 'array',
              },
            },
            required: ['resolvedFromScope', 'rules'],
            type: 'object',
          },
          type: 'object',
        },
      },
      required: ['categories'],
      type: 'object',
    },
  },
  required: [
    'actions',
    'alternativeSlots',
    'canProceed',
    'concerns',
    'effectivePolicies',
  ],
  type: 'object',
} as const;

export function buildOpenApiDocument() {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Smart Schedule API',
      version: 'v1',
      description:
        'Sprint 2 contract for bootstrap, identity, organization context, calendars, tasks, events, and time-policy advisory APIs.',
    },
    servers: [{ url: '/' }, { url: '/api' }],
    tags: [
      { name: 'health' },
      { name: 'setup' },
      { name: 'identity' },
      { name: 'admin-identity' },
      { name: 'organizations' },
      { name: 'calendar' },
      { name: 'time' },
    ],
    components: {
      securitySchemes: {
        sessionCookie: {
          in: 'cookie',
          name: 'smart_schedule_session',
          type: 'apiKey',
        },
        csrfHeader: {
          in: 'header',
          name: 'x-csrf-token',
          type: 'apiKey',
        },
      },
      schemas: {
        SecurityError: {
          additionalProperties: false,
          properties: {
            error: {
              additionalProperties: false,
              properties: {
                code: { type: 'string' },
                details: {
                  additionalProperties: true,
                  nullable: true,
                  type: 'object',
                },
                kind: { type: 'string' },
                message: { type: 'string' },
              },
              required: ['code', 'kind', 'message'],
              type: 'object',
            },
          },
          required: ['error'],
          type: 'object',
        },
        HealthResponse: {
          additionalProperties: false,
          properties: {
            info: {
              additionalProperties: false,
              properties: {
                app: {
                  additionalProperties: false,
                  properties: {
                    status: {
                      enum: ['up'],
                      type: 'string',
                    },
                  },
                  required: ['status'],
                  type: 'object',
                },
              },
              required: ['app'],
              type: 'object',
            },
            status: {
              enum: ['ok'],
              type: 'string',
            },
          },
          required: ['info', 'status'],
          type: 'object',
        },
        SetupIntegrationSelection: {
          additionalProperties: false,
          properties: {
            code: { type: 'string' },
            credentials: {
              additionalProperties: { type: 'string' },
              type: 'object',
            },
            enabled: { type: 'boolean' },
            mode: setupIntegrationModeSchema,
          },
          required: ['code', 'credentials', 'enabled', 'mode'],
          type: 'object',
        },
        SetupState: {
          additionalProperties: false,
          properties: {
            admin: {
              anyOf: [
                {
                  additionalProperties: false,
                  properties: {
                    createdAt: { format: 'date-time', type: 'string' },
                    email: { format: 'email', type: 'string' },
                    id: { type: 'string' },
                    name: { type: 'string' },
                    role: { const: 'system-admin', type: 'string' },
                  },
                  required: ['createdAt', 'email', 'id', 'name', 'role'],
                  type: 'object',
                },
                { type: 'null' },
              ],
            },
            completedAt: {
              format: 'date-time',
              nullable: true,
              type: 'string',
            },
            configuredIntegrations: {
              items: { $ref: '#/components/schemas/SetupIntegrationSelection' },
              type: 'array',
            },
            edition: {
              enum: ['commercial', 'community'],
              type: 'string',
            },
            isComplete: { type: 'boolean' },
            step: {
              enum: ['integrations', 'admin', 'review', 'complete'],
              type: 'string',
            },
          },
          required: [
            'admin',
            'completedAt',
            'configuredIntegrations',
            'edition',
            'isComplete',
            'step',
          ],
          type: 'object',
        },
        SetupIntegrationProvider: {
          additionalProperties: false,
          properties: {
            category: {
              enum: ['calendar', 'holiday-data', 'email', 'ai'],
              type: 'string',
            },
            code: { type: 'string' },
            credentialModes: {
              items: setupIntegrationModeSchema,
              type: 'array',
            },
            description: { type: 'string' },
            displayName: { type: 'string' },
          },
          required: ['category', 'code', 'credentialModes', 'description', 'displayName'],
          type: 'object',
        },
        AdminConfiguredIntegration: {
          additionalProperties: false,
          properties: {
            code: { type: 'string' },
            enabled: { type: 'boolean' },
            hasCredentials: { type: 'boolean' },
            mode: setupIntegrationModeSchema,
            updatedAt: {
              format: 'date-time',
              type: 'string',
            },
          },
          required: ['code', 'enabled', 'hasCredentials', 'mode', 'updatedAt'],
          type: 'object',
        },
        AdminGlobalIntegrationsResponse: {
          additionalProperties: false,
          properties: {
            configuredIntegrations: {
              items: { $ref: '#/components/schemas/AdminConfiguredIntegration' },
              type: 'array',
            },
            edition: {
              enum: ['commercial', 'community'],
              type: 'string',
            },
            providers: {
              items: { $ref: '#/components/schemas/SetupIntegrationProvider' },
              type: 'array',
            },
          },
          required: ['configuredIntegrations', 'edition', 'providers'],
          type: 'object',
        },
        MailOutboxEntry: {
          additionalProperties: false,
          properties: {
            attempts: { type: 'integer' },
            createdAt: {
              format: 'date-time',
              type: 'string',
            },
            deliveredAt: {
              format: 'date-time',
              nullable: true,
              type: 'string',
            },
            expiresAt: {
              format: 'date-time',
              type: 'string',
            },
            failedAt: {
              format: 'date-time',
              nullable: true,
              type: 'string',
            },
            failureReason: {
              nullable: true,
              type: 'string',
            },
            id: { type: 'string' },
            kind: { type: 'string' },
            lastAttemptAt: {
              format: 'date-time',
              nullable: true,
              type: 'string',
            },
            recipientEmail: {
              format: 'email',
              type: 'string',
            },
            status: {
              enum: ['queued', 'retrying', 'failed', 'delivered'],
              type: 'string',
            },
            subject: { type: 'string' },
            transport: { type: 'string' },
          },
          required: [
            'attempts',
            'createdAt',
            'deliveredAt',
            'expiresAt',
            'failedAt',
            'failureReason',
            'id',
            'kind',
            'lastAttemptAt',
            'recipientEmail',
            'status',
            'subject',
            'transport',
          ],
          type: 'object',
        },
        MailOutboxResponse: {
          additionalProperties: false,
          properties: {
            messages: {
              items: { $ref: '#/components/schemas/MailOutboxEntry' },
              type: 'array',
            },
          },
          required: ['messages'],
          type: 'object',
        },
        AuthSessionSnapshot: {
          additionalProperties: false,
          properties: {
            activeContext: {
              additionalProperties: false,
              properties: {
                id: {
                  nullable: true,
                  type: 'string',
                },
                tenantId: {
                  nullable: true,
                  type: 'string',
                },
                type: {
                  enum: ['organization', 'personal', 'public', 'system'],
                  type: 'string',
                },
              },
              required: ['id', 'tenantId', 'type'],
              type: 'object',
            },
            availableContexts: {
              items: {
                additionalProperties: false,
                properties: {
                  context: {
                    additionalProperties: false,
                    properties: {
                      id: { nullable: true, type: 'string' },
                      tenantId: { nullable: true, type: 'string' },
                      type: {
                        enum: ['organization', 'personal', 'public', 'system'],
                        type: 'string',
                      },
                    },
                    required: ['id', 'tenantId', 'type'],
                    type: 'object',
                  },
                  key: { type: 'string' },
                  label: { type: 'string' },
                  membershipRole: {
                    enum: ['admin', 'member', null],
                  },
                },
                required: ['context', 'key', 'label', 'membershipRole'],
                type: 'object',
              },
              type: 'array',
            },
            authenticated: { type: 'boolean' },
            configuredSocialProviders: {
              items: {
                additionalProperties: false,
                properties: {
                  code: {
                    enum: ['github', 'google', 'microsoft'],
                    type: 'string',
                  },
                  displayName: { type: 'string' },
                },
                required: ['code', 'displayName'],
                type: 'object',
              },
              type: 'array',
            },
            csrfToken: {
              nullable: true,
              type: 'string',
            },
            requireEmailVerification: { type: 'boolean' },
            user: {
              anyOf: [
                { $ref: '#/components/schemas/IdentityUserSummary' },
                { type: 'null' },
              ],
            },
          },
          required: [
            'activeContext',
            'availableContexts',
            'authenticated',
            'configuredSocialProviders',
            'csrfToken',
            'requireEmailVerification',
            'user',
          ],
          type: 'object',
        },
        IdentityUserSummary: identityUserSummarySchema,
        AuthConfiguration: {
          additionalProperties: false,
          properties: {
            minAdminTierForAccountDeactivation: { minimum: 0, type: 'integer' },
            requireEmailVerification: { type: 'boolean' },
            supportedSocialProviders: {
              items: {
                additionalProperties: false,
                properties: {
                  code: {
                    enum: ['github', 'google', 'microsoft'],
                    type: 'string',
                  },
                  displayName: { type: 'string' },
                },
                required: ['code', 'displayName'],
                type: 'object',
              },
              type: 'array',
            },
          },
          required: [
            'minAdminTierForAccountDeactivation',
            'requireEmailVerification',
            'supportedSocialProviders',
          ],
          type: 'object',
        },
        OrganizationSummary: organizationSummarySchema,
        MembershipSummary: membershipSummarySchema,
        InvitationSummary: invitationSummarySchema,
        GroupSummary: groupSummarySchema,
        CalendarSummary: calendarSummarySchema,
        ImportedContact: importedContactSchema,
        AttachmentSummary: attachmentSummarySchema,
        TaskSummary: taskSummarySchema,
        EventDetail: eventDetailSchema,
        TimePolicySummary: timePolicySummarySchema,
        AdvisoryResult: advisoryResultSchema,
      },
    },
    paths: {
      '/health': {
        get: {
          operationId: 'getHealth',
          tags: ['health'],
          responses: {
            '200': {
              description: 'Liveness probe result.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/HealthResponse' },
                },
              },
            },
          },
        },
      },
      '/health/readiness': {
        get: {
          operationId: 'getReadiness',
          tags: ['health'],
          responses: {
            '200': {
              description: 'Readiness probe result.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/HealthResponse' },
                },
              },
            },
          },
        },
      },
      '/setup/state': {
        get: {
          operationId: 'getSetupState',
          tags: ['setup'],
          responses: {
            '200': {
              description: 'Current first-run setup state.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/SetupState' },
                },
              },
            },
          },
        },
      },
      '/setup/integrations': {
        get: {
          operationId: 'getSetupIntegrations',
          tags: ['setup'],
          responses: {
            '200': {
              description:
                'Available bootstrap integrations for the active edition.',
            },
            '403': {
              description: 'Bootstrap is already locked.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/SecurityError' },
                },
              },
            },
          },
        },
      },
      '/setup/complete': {
        post: {
          operationId: 'completeSetup',
          tags: ['setup'],
          responses: {
            '201': {
              description:
                'Bootstrap completed and the initial admin was created.',
            },
            '400': {
              description: 'Validation failure.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/SecurityError' },
                },
              },
            },
            '409': {
              description: 'Bootstrap was already completed.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/SecurityError' },
                },
              },
            },
          },
        },
      },
      '/platform/bootstrap-status': {
        get: {
          operationId: 'getBootstrapStatus',
          tags: ['setup'],
          responses: {
            '200': {
              description:
                'Public bootstrap completion summary used by the frontend shell.',
              content: {
                'application/json': {
                  schema: {
                    additionalProperties: false,
                    properties: {
                      edition: {
                        enum: ['commercial', 'community'],
                        type: 'string',
                      },
                      isComplete: { type: 'boolean' },
                    },
                    required: ['edition', 'isComplete'],
                    type: 'object',
                  },
                },
              },
            },
          },
        },
      },
      '/admin/global-integrations': {
        get: {
          operationId: 'getAdminGlobalIntegrations',
          tags: ['setup'],
          security: authenticatedSecurity,
          responses: {
            '200': {
              description: 'Configured global integrations and available providers for system admins.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/AdminGlobalIntegrationsResponse' },
                },
              },
            },
            '403': {
              description: 'Only system administrators in system context may access this route.',
            },
          },
        },
        patch: {
          operationId: 'updateAdminGlobalIntegrations',
          tags: ['setup'],
          security: authenticatedSecurity,
          responses: {
            '200': {
              description: 'Global integration settings updated.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/AdminGlobalIntegrationsResponse' },
                },
              },
            },
            '400': {
              description: 'Validation failure.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/SecurityError' },
                },
              },
            },
            '403': {
              description: 'Only system administrators in system context may access this route.',
            },
          },
        },
      },
      '/admin/mail-outbox': {
        get: {
          operationId: 'getAdminMailOutbox',
          tags: ['setup'],
          security: authenticatedSecurity,
          responses: {
            '200': {
              description: 'Queued and delivered mail summary for system administrators.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/MailOutboxResponse' },
                },
              },
            },
            '403': {
              description: 'Only system administrators in system context may access this route.',
            },
          },
        },
      },
      '/auth/providers': {
        get: {
          operationId: 'getAuthProviders',
          tags: ['identity'],
          responses: {
            '200': {
              description:
                'Authentication configuration visible to the client.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/AuthConfiguration' },
                },
              },
            },
          },
        },
      },
      '/auth/session': {
        get: {
          operationId: 'getAuthSession',
          tags: ['identity'],
          responses: {
            '200': {
              description: 'Current client session snapshot.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/AuthSessionSnapshot' },
                },
              },
            },
          },
        },
      },
      '/auth/context': {
        post: {
          operationId: 'switchAuthContext',
          tags: ['identity'],
          security: [{ sessionCookie: [], csrfHeader: [] }],
          responses: {
            '201': {
              description:
                'Session context switched between personal, organization, and system administration.',
            },
            '401': {
              description:
                'The current actor is not allowed to enter the requested context.',
            },
          },
        },
      },
      '/auth/sign-up': {
        post: {
          operationId: 'signUp',
          tags: ['identity'],
          responses: {
            '201': {
              description: 'Email/password account registered.',
            },
          },
        },
      },
      '/auth/sign-in/password': {
        post: {
          operationId: 'signInWithPassword',
          tags: ['identity'],
          responses: {
            '201': {
              description:
                'Password sign-in succeeded and a session cookie was issued.',
            },
            '401': {
              description: 'Credentials or account state rejected sign-in.',
            },
          },
        },
      },
      '/auth/sign-in/social': {
        post: {
          operationId: 'signInWithSocial',
          tags: ['identity'],
          responses: {
            '201': {
              description:
                'Social sign-in succeeded and a session cookie was issued.',
            },
          },
        },
      },
      '/auth/verify-email/request': {
        post: {
          operationId: 'requestEmailVerification',
          tags: ['identity'],
          responses: {
            '201': {
              description: 'Verification mail request accepted.',
            },
          },
        },
      },
      '/auth/verify-email/confirm': {
        post: {
          operationId: 'confirmEmailVerification',
          tags: ['identity'],
          responses: {
            '201': {
              description: 'Email verification token accepted.',
            },
          },
        },
      },
      '/auth/password-reset/request': {
        post: {
          operationId: 'requestPasswordReset',
          tags: ['identity'],
          responses: {
            '201': {
              description: 'Password reset mail request accepted.',
            },
          },
        },
      },
      '/auth/password-reset/confirm': {
        post: {
          operationId: 'confirmPasswordReset',
          tags: ['identity'],
          responses: {
            '201': {
              description: 'Password reset token accepted.',
            },
          },
        },
      },
      '/auth/providers/link': {
        post: {
          operationId: 'linkProvider',
          tags: ['identity'],
          security: [{ sessionCookie: [], csrfHeader: [] }],
          responses: {
            '201': {
              description: 'Social provider linked to the current account.',
            },
          },
        },
      },
      '/auth/providers/{provider}/unlink': {
        post: {
          operationId: 'unlinkProvider',
          tags: ['identity'],
          security: [{ sessionCookie: [], csrfHeader: [] }],
          parameters: [
            {
              in: 'path',
              name: 'provider',
              required: true,
              schema: {
                enum: ['github', 'google', 'microsoft'],
                type: 'string',
              },
            },
          ],
          responses: {
            '201': {
              description: 'Social provider unlinked from the current account.',
            },
          },
        },
      },
      '/auth/account/delete': {
        post: {
          operationId: 'deleteAccount',
          tags: ['identity'],
          security: [{ sessionCookie: [], csrfHeader: [] }],
          responses: {
            '201': {
              description:
                'Current account marked deleted and recovery window started.',
            },
          },
        },
      },
      '/auth/account/recovery/request': {
        post: {
          operationId: 'requestAccountRecovery',
          tags: ['identity'],
          responses: {
            '201': {
              description: 'Account recovery mail request accepted.',
            },
          },
        },
      },
      '/auth/account/recover': {
        post: {
          operationId: 'recoverAccount',
          tags: ['identity'],
          responses: {
            '201': {
              description:
                'Deleted account recovered and session cookie issued.',
            },
          },
        },
      },
      '/auth/logout': {
        post: {
          operationId: 'logout',
          tags: ['identity'],
          security: [{ sessionCookie: [], csrfHeader: [] }],
          responses: {
            '201': {
              description: 'Current session revoked.',
            },
          },
        },
      },
      '/admin/auth/config': {
        get: {
          operationId: 'getAdminAuthConfig',
          tags: ['admin-identity'],
          security: [{ sessionCookie: [], csrfHeader: [] }],
          responses: {
            '200': {
              description: 'Admin-visible auth configuration.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/AuthConfiguration' },
                },
              },
            },
          },
        },
        patch: {
          operationId: 'updateAdminAuthConfig',
          tags: ['admin-identity'],
          security: [{ sessionCookie: [], csrfHeader: [] }],
          responses: {
            '200': {
              description: 'Admin auth configuration updated.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/AuthConfiguration' },
                },
              },
            },
          },
        },
      },
      '/admin/users': {
        get: {
          operationId: 'listUsers',
          tags: ['admin-identity'],
          security: [{ sessionCookie: [], csrfHeader: [] }],
          responses: {
            '200': {
              description: 'List of users visible to the current system admin.',
            },
          },
        },
      },
      '/admin/users/{userId}/deactivate': {
        post: {
          operationId: 'deactivateUser',
          tags: ['admin-identity'],
          security: [{ sessionCookie: [], csrfHeader: [] }],
          parameters: [
            {
              in: 'path',
              name: 'userId',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '201': {
              description: 'Target account deactivated.',
            },
          },
        },
      },
      '/admin/users/{userId}/reactivate': {
        post: {
          operationId: 'reactivateUser',
          tags: ['admin-identity'],
          security: [{ sessionCookie: [], csrfHeader: [] }],
          parameters: [
            {
              in: 'path',
              name: 'userId',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '201': {
              description: 'Target account reactivated.',
            },
          },
        },
      },
      '/org/organizations': {
        post: {
          operationId: 'createOrganization',
          tags: ['organizations'],
          security: authenticatedSecurity,
          responses: {
            '201': {
              description: 'Organization created from personal context.',
              content: {
                'application/json': {
                  schema: {
                    additionalProperties: false,
                    properties: {
                      organization: {
                        $ref: '#/components/schemas/OrganizationSummary',
                      },
                    },
                    required: ['organization'],
                    type: 'object',
                  },
                },
              },
            },
          },
        },
      },
      '/org/organizations/mine': {
        get: {
          operationId: 'listOwnOrganizations',
          tags: ['organizations'],
          security: authenticatedSecurity,
          responses: {
            '200': {
              description: 'Organizations available to the current actor.',
              content: {
                'application/json': {
                  schema: {
                    additionalProperties: false,
                    properties: {
                      organizations: {
                        items: {
                          $ref: '#/components/schemas/OrganizationSummary',
                        },
                        type: 'array',
                      },
                    },
                    required: ['organizations'],
                    type: 'object',
                  },
                },
              },
            },
          },
        },
      },
      '/org/organizations/{organizationId}/memberships': {
        get: {
          operationId: 'listMemberships',
          tags: ['organizations'],
          security: authenticatedSecurity,
          parameters: [
            {
              in: 'path',
              name: 'organizationId',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description:
                'Organization membership roster visible to authorized administrators.',
              content: {
                'application/json': {
                  schema: {
                    additionalProperties: false,
                    properties: {
                      memberships: {
                        items: {
                          $ref: '#/components/schemas/MembershipSummary',
                        },
                        type: 'array',
                      },
                    },
                    required: ['memberships'],
                    type: 'object',
                  },
                },
              },
            },
          },
        },
      },
      '/org/organizations/{organizationId}/invitations': {
        get: {
          operationId: 'listOrganizationInvitations',
          tags: ['organizations'],
          security: authenticatedSecurity,
          parameters: [
            {
              in: 'path',
              name: 'organizationId',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Pending invitations for an organization.',
              content: {
                'application/json': {
                  schema: {
                    additionalProperties: false,
                    properties: {
                      invitations: {
                        items: {
                          $ref: '#/components/schemas/InvitationSummary',
                        },
                        type: 'array',
                      },
                    },
                    required: ['invitations'],
                    type: 'object',
                  },
                },
              },
            },
          },
        },
        post: {
          operationId: 'createOrganizationInvitation',
          tags: ['organizations'],
          security: authenticatedSecurity,
          parameters: [
            {
              in: 'path',
              name: 'organizationId',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '201': {
              description: 'Invitation issued for an organization member.',
              content: {
                'application/json': {
                  schema: {
                    additionalProperties: false,
                    properties: {
                      invitation: {
                        $ref: '#/components/schemas/InvitationSummary',
                      },
                    },
                    required: ['invitation'],
                    type: 'object',
                  },
                },
              },
            },
          },
        },
      },
      '/org/invitations/mine': {
        get: {
          operationId: 'listMyInvitations',
          tags: ['organizations'],
          security: authenticatedSecurity,
          responses: {
            '200': {
              description:
                'Pending invitations for the currently authenticated actor.',
              content: {
                'application/json': {
                  schema: {
                    additionalProperties: false,
                    properties: {
                      invitations: {
                        items: {
                          $ref: '#/components/schemas/InvitationSummary',
                        },
                        type: 'array',
                      },
                    },
                    required: ['invitations'],
                    type: 'object',
                  },
                },
              },
            },
          },
        },
      },
      '/org/invitations/accept': {
        post: {
          operationId: 'acceptInvitation',
          tags: ['organizations'],
          security: authenticatedSecurity,
          responses: {
            '201': {
              description: 'Invitation accepted by the current actor.',
            },
          },
        },
      },
      '/org/organizations/{organizationId}/groups': {
        get: {
          operationId: 'listGroups',
          tags: ['organizations'],
          security: authenticatedSecurity,
          parameters: [
            {
              in: 'path',
              name: 'organizationId',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Organization groups and their current members.',
              content: {
                'application/json': {
                  schema: {
                    additionalProperties: false,
                    properties: {
                      groups: {
                        items: {
                          $ref: '#/components/schemas/GroupSummary',
                        },
                        type: 'array',
                      },
                    },
                    required: ['groups'],
                    type: 'object',
                  },
                },
              },
            },
          },
        },
        post: {
          operationId: 'createGroup',
          tags: ['organizations'],
          security: authenticatedSecurity,
          parameters: [
            {
              in: 'path',
              name: 'organizationId',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '201': {
              description: 'Organization group created.',
              content: {
                'application/json': {
                  schema: {
                    additionalProperties: false,
                    properties: {
                      group: {
                        additionalProperties: false,
                        properties: {
                          id: { type: 'string' },
                          name: { type: 'string' },
                        },
                        required: ['id', 'name'],
                        type: 'object',
                      },
                    },
                    required: ['group'],
                    type: 'object',
                  },
                },
              },
            },
          },
        },
      },
      '/org/organizations/{organizationId}/groups/{groupId}/members': {
        post: {
          operationId: 'addGroupMember',
          tags: ['organizations'],
          security: authenticatedSecurity,
          parameters: [
            {
              in: 'path',
              name: 'organizationId',
              required: true,
              schema: { type: 'string' },
            },
            {
              in: 'path',
              name: 'groupId',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '201': {
              description: 'User added to an organization group.',
            },
          },
        },
      },
      '/org/organizations/{organizationId}/groups/{groupId}/members/{userId}': {
        delete: {
          operationId: 'removeGroupMember',
          tags: ['organizations'],
          security: authenticatedSecurity,
          parameters: [
            {
              in: 'path',
              name: 'organizationId',
              required: true,
              schema: { type: 'string' },
            },
            {
              in: 'path',
              name: 'groupId',
              required: true,
              schema: { type: 'string' },
            },
            {
              in: 'path',
              name: 'userId',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'User removed from an organization group.',
            },
          },
        },
      },
      '/org/organizations/{organizationId}/calendars': {
        get: {
          operationId: 'listOrganizationCalendars',
          tags: ['organizations'],
          security: authenticatedSecurity,
          parameters: [
            {
              in: 'path',
              name: 'organizationId',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description:
                'Organization calendars visible in the active scope.',
              content: {
                'application/json': {
                  schema: {
                    additionalProperties: false,
                    properties: {
                      calendars: {
                        items: {
                          $ref: '#/components/schemas/CalendarSummary',
                        },
                        type: 'array',
                      },
                    },
                    required: ['calendars'],
                    type: 'object',
                  },
                },
              },
            },
          },
        },
        post: {
          operationId: 'createOrganizationCalendar',
          tags: ['organizations'],
          security: authenticatedSecurity,
          parameters: [
            {
              in: 'path',
              name: 'organizationId',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '201': {
              description: 'Organization calendar created.',
              content: {
                'application/json': {
                  schema: {
                    additionalProperties: false,
                    properties: {
                      calendar: {
                        $ref: '#/components/schemas/CalendarSummary',
                      },
                    },
                    required: ['calendar'],
                    type: 'object',
                  },
                },
              },
            },
          },
        },
      },
      '/org/organizations/{organizationId}/calendars/{calendarId}/visibility': {
        post: {
          operationId: 'grantCalendarVisibility',
          tags: ['organizations'],
          security: authenticatedSecurity,
          parameters: [
            {
              in: 'path',
              name: 'organizationId',
              required: true,
              schema: { type: 'string' },
            },
            {
              in: 'path',
              name: 'calendarId',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '201': {
              description:
                'Visibility grant recorded for an organization calendar.',
            },
          },
        },
      },
      '/org/organizations/{organizationId}/calendars/{calendarId}/visibility/{userId}':
        {
          delete: {
            operationId: 'revokeCalendarVisibility',
            tags: ['organizations'],
            security: authenticatedSecurity,
            parameters: [
              {
                in: 'path',
                name: 'organizationId',
                required: true,
                schema: { type: 'string' },
              },
              {
                in: 'path',
                name: 'calendarId',
                required: true,
                schema: { type: 'string' },
              },
              {
                in: 'path',
                name: 'userId',
                required: true,
                schema: { type: 'string' },
              },
            ],
            responses: {
              '200': {
                description:
                  'Visibility grant revoked for an organization calendar.',
              },
            },
          },
        },
      '/cal/calendars': {
        get: {
          operationId: 'listCalendars',
          tags: ['calendar'],
          security: authenticatedSecurity,
          responses: {
            '200': {
              description:
                'Calendars visible in the active personal or organization context.',
              content: {
                'application/json': {
                  schema: {
                    additionalProperties: false,
                    properties: {
                      calendars: {
                        items: {
                          $ref: '#/components/schemas/CalendarSummary',
                        },
                        type: 'array',
                      },
                    },
                    required: ['calendars'],
                    type: 'object',
                  },
                },
              },
            },
          },
        },
        post: {
          operationId: 'createPersonalCalendar',
          tags: ['calendar'],
          security: authenticatedSecurity,
          responses: {
            '201': {
              description: 'Personal calendar created.',
              content: {
                'application/json': {
                  schema: {
                    additionalProperties: false,
                    properties: {
                      calendar: {
                        $ref: '#/components/schemas/CalendarSummary',
                      },
                    },
                    required: ['calendar'],
                    type: 'object',
                  },
                },
              },
            },
          },
        },
      },
      '/cal/contacts/imported': {
        get: {
          operationId: 'listImportedContacts',
          tags: ['calendar'],
          security: authenticatedSecurity,
          responses: {
            '200': {
              description: 'Imported contacts available in the active context.',
              content: {
                'application/json': {
                  schema: {
                    additionalProperties: false,
                    properties: {
                      contacts: {
                        items: {
                          $ref: '#/components/schemas/ImportedContact',
                        },
                        type: 'array',
                      },
                    },
                    required: ['contacts'],
                    type: 'object',
                  },
                },
              },
            },
          },
        },
        post: {
          operationId: 'createImportedContact',
          tags: ['calendar'],
          security: authenticatedSecurity,
          responses: {
            '201': {
              description: 'Imported contact recorded in the active context.',
              content: {
                'application/json': {
                  schema: {
                    additionalProperties: false,
                    properties: {
                      contact: {
                        $ref: '#/components/schemas/ImportedContact',
                      },
                    },
                    required: ['contact'],
                    type: 'object',
                  },
                },
              },
            },
          },
        },
      },
      '/cal/calendar-view': {
        get: {
          operationId: 'listCalendarView',
          tags: ['calendar'],
          security: authenticatedSecurity,
          responses: {
            '200': {
              description:
                'Aggregate calendar view for the selected same-context calendars.',
            },
          },
        },
      },
      '/cal/tasks': {
        get: {
          operationId: 'listTasks',
          tags: ['calendar'],
          security: authenticatedSecurity,
          responses: {
            '200': {
              description: 'Task overview for the active context.',
              content: {
                'application/json': {
                  schema: {
                    additionalProperties: false,
                    properties: {
                      tasks: {
                        items: {
                          $ref: '#/components/schemas/TaskSummary',
                        },
                        type: 'array',
                      },
                    },
                    required: ['tasks'],
                    type: 'object',
                  },
                },
              },
            },
          },
        },
        post: {
          operationId: 'createTask',
          tags: ['calendar'],
          security: authenticatedSecurity,
          responses: {
            '201': {
              description: 'Task created in the active context.',
            },
          },
        },
      },
      '/cal/tasks/{taskId}': {
        get: {
          operationId: 'getTaskById',
          tags: ['calendar'],
          security: authenticatedSecurity,
          parameters: [
            {
              in: 'path',
              name: 'taskId',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Detailed task record for the active context.',
            },
          },
        },
        patch: {
          operationId: 'updateTask',
          tags: ['calendar'],
          security: authenticatedSecurity,
          parameters: [
            {
              in: 'path',
              name: 'taskId',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Task updated in the active context.',
            },
          },
        },
        delete: {
          operationId: 'deleteTask',
          tags: ['calendar'],
          security: authenticatedSecurity,
          parameters: [
            {
              in: 'path',
              name: 'taskId',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Task deleted in the active context.',
            },
          },
        },
      },
      '/cal/events': {
        post: {
          operationId: 'createEvent',
          tags: ['calendar'],
          security: authenticatedSecurity,
          responses: {
            '201': {
              description: 'Event created in the active context.',
            },
          },
        },
      },
      '/cal/events/{eventId}': {
        get: {
          operationId: 'getEventById',
          tags: ['calendar'],
          security: authenticatedSecurity,
          parameters: [
            {
              in: 'path',
              name: 'eventId',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Detailed event record for the active context.',
              content: {
                'application/json': {
                  schema: {
                    additionalProperties: false,
                    properties: {
                      event: { $ref: '#/components/schemas/EventDetail' },
                    },
                    required: ['event'],
                    type: 'object',
                  },
                },
              },
            },
          },
        },
        patch: {
          operationId: 'updateEvent',
          tags: ['calendar'],
          security: authenticatedSecurity,
          parameters: [
            {
              in: 'path',
              name: 'eventId',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Event updated in the active context.',
            },
          },
        },
        delete: {
          operationId: 'deleteEvent',
          tags: ['calendar'],
          security: authenticatedSecurity,
          parameters: [
            {
              in: 'path',
              name: 'eventId',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Event deleted in the active context.',
            },
          },
        },
      },
      '/cal/events/{eventId}/attachments': {
        post: {
          operationId: 'addEventAttachment',
          tags: ['calendar'],
          security: authenticatedSecurity,
          parameters: [
            {
              in: 'path',
              name: 'eventId',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '201': {
              description: 'Attachment metadata recorded for an event.',
              content: {
                'application/json': {
                  schema: {
                    additionalProperties: false,
                    properties: {
                      attachment: {
                        $ref: '#/components/schemas/AttachmentSummary',
                      },
                    },
                    required: ['attachment'],
                    type: 'object',
                  },
                },
              },
            },
          },
        },
      },
      '/cal/tasks/{taskId}/attachments': {
        post: {
          operationId: 'addTaskAttachment',
          tags: ['calendar'],
          security: authenticatedSecurity,
          parameters: [
            {
              in: 'path',
              name: 'taskId',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '201': {
              description: 'Attachment metadata recorded for a task.',
              content: {
                'application/json': {
                  schema: {
                    additionalProperties: false,
                    properties: {
                      attachment: {
                        $ref: '#/components/schemas/AttachmentSummary',
                      },
                    },
                    required: ['attachment'],
                    type: 'object',
                  },
                },
              },
            },
          },
        },
      },
      '/cal/items/{itemType}/{itemId}/copy-to-personal': {
        post: {
          operationId: 'copyItemToPersonal',
          tags: ['calendar'],
          security: authenticatedSecurity,
          parameters: [
            {
              in: 'path',
              name: 'itemType',
              required: true,
              schema: {
                enum: ['event', 'task'],
                type: 'string',
              },
            },
            {
              in: 'path',
              name: 'itemId',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '201': {
              description: 'Organization item copied into personal context.',
            },
          },
        },
      },
      '/time/policies': {
        get: {
          operationId: 'listPolicies',
          tags: ['time'],
          security: authenticatedSecurity,
          responses: {
            '200': {
              description: 'Time policies visible in the active context.',
              content: {
                'application/json': {
                  schema: {
                    additionalProperties: false,
                    properties: {
                      policies: {
                        items: {
                          $ref: '#/components/schemas/TimePolicySummary',
                        },
                        type: 'array',
                      },
                    },
                    required: ['policies'],
                    type: 'object',
                  },
                },
              },
            },
          },
        },
        post: {
          operationId: 'createPolicy',
          tags: ['time'],
          security: authenticatedSecurity,
          responses: {
            '201': {
              description: 'Time policy created in the active context.',
              content: {
                'application/json': {
                  schema: {
                    additionalProperties: false,
                    properties: {
                      policy: {
                        $ref: '#/components/schemas/TimePolicySummary',
                      },
                    },
                    required: ['policy'],
                    type: 'object',
                  },
                },
              },
            },
          },
        },
      },
      '/time/policies/{policyId}': {
        patch: {
          operationId: 'updatePolicy',
          tags: ['time'],
          security: authenticatedSecurity,
          parameters: [
            {
              in: 'path',
              name: 'policyId',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Time policy updated.',
              content: {
                'application/json': {
                  schema: {
                    additionalProperties: false,
                    properties: {
                      policy: {
                        $ref: '#/components/schemas/TimePolicySummary',
                      },
                    },
                    required: ['policy'],
                    type: 'object',
                  },
                },
              },
            },
          },
        },
        delete: {
          operationId: 'deletePolicy',
          tags: ['time'],
          security: authenticatedSecurity,
          parameters: [
            {
              in: 'path',
              name: 'policyId',
              required: true,
              schema: { type: 'string' },
            },
          ],
          responses: {
            '200': {
              description: 'Time policy deleted.',
            },
          },
        },
      },
      '/time/policies/preview': {
        get: {
          operationId: 'previewPolicies',
          tags: ['time'],
          security: authenticatedSecurity,
          responses: {
            '200': {
              description: 'Effective time policy preview for a target user.',
            },
          },
        },
      },
      '/time/advisory/evaluate': {
        post: {
          operationId: 'evaluateAdvisory',
          tags: ['time'],
          security: authenticatedSecurity,
          responses: {
            '201': {
              description:
                'Advisory result for a candidate event or task in the active context.',
              content: {
                'application/json': {
                  schema: {
                    additionalProperties: false,
                    properties: {
                      advisory: {
                        $ref: '#/components/schemas/AdvisoryResult',
                      },
                    },
                    required: ['advisory'],
                    type: 'object',
                  },
                },
              },
            },
          },
        },
      },
      '/time/holidays/import': {
        post: {
          operationId: 'importOfficialHolidays',
          tags: ['time'],
          security: authenticatedSecurity,
          responses: {
            '201': {
              description:
                'Official holidays imported into the active personal or organization context.',
            },
          },
        },
      },
    },
  } as const;
}
