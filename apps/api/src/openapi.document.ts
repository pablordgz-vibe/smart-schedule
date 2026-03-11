const setupIntegrationModeSchema = {
  enum: ['api-key', 'provider-login'],
  type: 'string',
} as const;

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

export function buildOpenApiDocument() {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Smart Schedule API',
      version: 'v1',
      description:
        'Sprint 1 platform contract for bootstrap, identity, session, and system-admin lifecycle APIs.',
    },
    servers: [{ url: '/' }, { url: '/api' }],
    tags: [
      { name: 'health' },
      { name: 'setup' },
      { name: 'identity' },
      { name: 'admin-identity' },
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
                'Session context switched between personal and system administration.',
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
    },
  } as const;
}
