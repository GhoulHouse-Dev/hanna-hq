import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import clientWorkspaces from './client-workspaces.js'
import services from './services.js'
import funnels from './funnels.js'
import funnelSteps from './funnel-steps.js'

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }))

const ids = {
  organizationA: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  organizationB: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  owner: '11111111-1111-4111-8111-111111111111',
  viewer: '22222222-2222-4222-8222-222222222222',
  operator: '33333333-3333-4333-8333-333333333333',
  nonMember: '44444444-4444-4444-8444-444444444444',
  workspaceA: '55555555-5555-4555-8555-555555555555',
  workspaceB: '66666666-6666-4666-8666-666666666666',
  workspaceOther: '77777777-7777-4777-8777-777777777777',
  serviceA: '88888888-8888-4888-8888-888888888888',
  serviceB: '99999999-9999-4999-8999-999999999999',
  serviceOther: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  funnelA: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
  funnelB: 'cccccccc-dddd-4eee-8fff-aaaaaaaaaaaa',
  funnelOther: 'dddddddd-eeee-4fff-8000-bbbbbbbbbbbb',
  stepA: 'eeeeeeee-ffff-4000-8000-cccccccccccc',
  stepB: 'ffffffff-aaaa-4111-8111-dddddddddddd',
}

const mockState = {
  user: null,
  tables: {},
  nextId: 1,
}

function makeFixture() {
  const timestamp = '2026-10-17T00:00:00.000Z'
  return {
    organizations: [
      { id: ids.organizationA, name: 'Organization A', slug: 'organization-a' },
      { id: ids.organizationB, name: 'Organization B', slug: 'organization-b' },
    ],
    organization_memberships: [
      { id: '10000000-0000-4000-8000-000000000001', user_id: ids.owner, organization_id: ids.organizationA, role: 'OWNER' },
      { id: '10000000-0000-4000-8000-000000000002', user_id: ids.viewer, organization_id: ids.organizationA, role: 'VIEWER' },
      { id: '10000000-0000-4000-8000-000000000003', user_id: ids.operator, organization_id: ids.organizationA, role: 'OPERATOR' },
    ],
    client_workspaces: [
      { id: ids.workspaceA, organization_id: ids.organizationA, company_name: 'Client A', slug: 'client-a', status: 'ACTIVE', currency: 'EUR', timezone: 'Europe/Helsinki', created_at: timestamp, updated_at: timestamp },
      { id: ids.workspaceB, organization_id: ids.organizationA, company_name: 'Client B', slug: 'client-b', status: 'ACTIVE', currency: 'EUR', timezone: 'Europe/Helsinki', created_at: timestamp, updated_at: timestamp },
      { id: ids.workspaceOther, organization_id: ids.organizationB, company_name: 'Other Organization Client', slug: 'other-client', status: 'ACTIVE', currency: 'EUR', timezone: 'Europe/Helsinki', created_at: timestamp, updated_at: timestamp },
    ],
    services: [
      { id: ids.serviceA, organization_id: ids.organizationA, client_workspace_id: ids.workspaceA, name: 'Service A', slug: 'service-a', description: null, short_description: null, status: 'ACTIVE', created_at: timestamp, updated_at: timestamp },
      { id: ids.serviceB, organization_id: ids.organizationA, client_workspace_id: ids.workspaceB, name: 'Service B', slug: 'service-b', description: null, short_description: null, status: 'ACTIVE', created_at: timestamp, updated_at: timestamp },
      { id: ids.serviceOther, organization_id: ids.organizationB, client_workspace_id: ids.workspaceOther, name: 'Other Service', slug: 'other-service', description: null, short_description: null, status: 'ACTIVE', created_at: timestamp, updated_at: timestamp },
    ],
    funnels: [
      { id: ids.funnelA, organization_id: ids.organizationA, client_workspace_id: ids.workspaceA, service_id: ids.serviceA, name: 'Funnel A', slug: 'funnel-a', description: null, status: 'DRAFT', created_at: timestamp, updated_at: timestamp },
      { id: ids.funnelB, organization_id: ids.organizationA, client_workspace_id: ids.workspaceB, service_id: ids.serviceB, name: 'Funnel B', slug: 'funnel-b', description: null, status: 'DRAFT', created_at: timestamp, updated_at: timestamp },
      { id: ids.funnelOther, organization_id: ids.organizationB, client_workspace_id: ids.workspaceOther, service_id: ids.serviceOther, name: 'Other Funnel', slug: 'other-funnel', description: null, status: 'DRAFT', created_at: timestamp, updated_at: timestamp },
    ],
    funnel_steps: [
      { id: ids.stepA, organization_id: ids.organizationA, client_workspace_id: ids.workspaceA, funnel_id: ids.funnelA, field_key: 'customer_name', type: 'TEXT', label: 'Name', description: null, placeholder: null, required: true, position: 10, options: [], created_at: timestamp, updated_at: timestamp },
      { id: ids.stepB, organization_id: ids.organizationA, client_workspace_id: ids.workspaceB, funnel_id: ids.funnelB, field_key: 'customer_email', type: 'EMAIL', label: 'Email', description: null, placeholder: null, required: true, position: 10, options: [], created_at: timestamp, updated_at: timestamp },
    ],
  }
}

class MemoryQuery {
  constructor(state, table) {
    this.state = state
    this.table = table
    this.action = 'select'
    this.filters = []
    this.orders = []
    this.payload = null
  }

  select() {
    return this
  }

  eq(column, value) {
    this.filters.push((row) => row[column] === value)
    return this
  }

  in(column, values) {
    this.filters.push((row) => values.includes(row[column]))
    return this
  }

  order(column, options = {}) {
    this.orders.push({ column, ascending: options.ascending !== false })
    return this
  }

  insert(payload) {
    this.action = 'insert'
    this.payload = payload
    return this
  }

  update(payload) {
    this.action = 'update'
    this.payload = payload
    return this
  }

  delete() {
    this.action = 'delete'
    return this
  }

  maybeSingle() {
    return this.execute(true)
  }

  single() {
    return this.execute(true)
  }

  visibleRows() {
    const rows = this.state.tables[this.table] || []
    const memberships = (this.state.tables.organization_memberships || [])
      .filter((row) => row.user_id === this.state.user?.id)
    const organizationIds = new Set(memberships.map((row) => row.organization_id))

    if (this.table === 'organization_memberships') {
      return rows.filter((row) => row.user_id === this.state.user?.id)
    }
    if (this.table === 'organizations') {
      return rows.filter((row) => organizationIds.has(row.id))
    }
    if (['client_workspaces', 'services', 'funnels', 'funnel_steps'].includes(this.table)) {
      return rows.filter((row) => organizationIds.has(row.organization_id))
    }
    return rows
  }

  async execute(single = false) {
    const tableRows = this.state.tables[this.table] || []
    let rows

    if (this.action === 'insert') {
      const payloads = Array.isArray(this.payload) ? this.payload : [this.payload]
      rows = payloads.map((payload) => {
        const sequence = String(this.state.nextId++).padStart(12, '0')
        return {
          id: payload.id || '00000000-0000-4000-8000-' + sequence,
          created_at: payload.created_at || '2026-10-17T00:00:00.000Z',
          updated_at: payload.updated_at || '2026-10-17T00:00:00.000Z',
          ...payload,
        }
      })
      tableRows.push(...rows)
      this.state.tables[this.table] = tableRows
    } else {
      rows = this.visibleRows().filter((row) => this.filters.every((filter) => filter(row)))

      if (this.action === 'update') {
        rows.forEach((row) => Object.assign(row, this.payload))
      } else if (this.action === 'delete') {
        const deletedRows = new Set(rows)
        this.state.tables[this.table] = tableRows.filter((row) => !deletedRows.has(row))
        rows = []
      }
    }

    for (const order of [...this.orders].reverse()) {
      rows.sort((left, right) => {
        const a = left[order.column]
        const b = right[order.column]
        const comparison = a === b ? 0 : a == null ? -1 : b == null ? 1 : a < b ? -1 : 1
        return order.ascending ? comparison : -comparison
      })
    }

    return { data: single ? (rows[0] || null) : rows, error: null }
  }

  then(resolve, reject) {
    return this.execute().then(resolve, reject)
  }
}

function configureSupabaseMock() {
  createClient.mockImplementation((_url, _key, options) => {
    const authorization = options?.global?.headers?.Authorization
    return {
      auth: {
        getUser: async () => {
          if (authorization === 'Bearer invalid' || !mockState.user) {
            return { data: { user: null }, error: new Error('Invalid token') }
          }
          return { data: { user: mockState.user }, error: null }
        },
      },
      from: (table) => new MemoryQuery(mockState, table),
    }
  })
}

function invoke(handler, { method = 'GET', authorization = 'Bearer test-token', query = {}, body = {} } = {}) {
  const response = {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[name] = value
      return this
    },
    status(code) {
      this.statusCode = code
      return this
    },
    json(payload) {
      this.body = payload
      return this
    },
  }
  const req = {
    method,
    headers: authorization ? { authorization } : {},
    query,
    body,
  }
  return Promise.resolve(handler(req, response)).then(() => response)
}

beforeEach(() => {
  mockState.user = { id: ids.owner }
  mockState.tables = makeFixture()
  mockState.nextId = 1
  process.env.VITE_SUPABASE_URL = 'https://example.supabase.co'
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key'
  configureSupabaseMock()
})

const routeCases = [
  ['client workspaces', clientWorkspaces],
  ['services', services],
  ['funnels', funnels],
  ['funnel steps', funnelSteps],
]

describe('API route integration', () => {
  it.each(routeCases)('%s rejects missing and invalid bearer tokens', async (_name, handler) => {
    const missing = await invoke(handler, { authorization: null })
    expect(missing.statusCode).toBe(401)
    expect(missing.headers['Cache-Control']).toBe('no-store')

    const invalid = await invoke(handler, { authorization: 'Bearer invalid' })
    expect(invalid.statusCode).toBe(401)
  })

  it('keeps VIEWER read-only across workspace, service, funnel and step mutations', async () => {
    mockState.user = { id: ids.viewer }

    const responses = await Promise.all([
      invoke(clientWorkspaces, {
        method: 'POST',
        body: { organizationId: ids.organizationA, companyName: 'Blocked Client' },
      }),
      invoke(clientWorkspaces, {
        method: 'PATCH',
        body: { id: ids.workspaceA, companyName: 'Blocked Rename' },
      }),
      invoke(services, {
        method: 'POST',
        body: { clientWorkspaceId: ids.workspaceA, name: 'Blocked Service' },
      }),
      invoke(services, {
        method: 'PATCH',
        body: { id: ids.serviceA, clientWorkspaceId: ids.workspaceA, name: 'Blocked Rename' },
      }),
      invoke(funnels, {
        method: 'POST',
        body: { clientWorkspaceId: ids.workspaceA, serviceId: null, name: 'Blocked Funnel' },
      }),
      invoke(funnels, {
        method: 'PATCH',
        body: { id: ids.funnelA, clientWorkspaceId: ids.workspaceA, name: 'Blocked Rename' },
      }),
      invoke(funnelSteps, {
        method: 'POST',
        body: { clientWorkspaceId: ids.workspaceA, funnelId: ids.funnelA, fieldKey: 'blocked', type: 'TEXT', label: 'Blocked', required: false, position: 20, options: [] },
      }),
      invoke(funnelSteps, {
        method: 'PATCH',
        body: { id: ids.stepA, clientWorkspaceId: ids.workspaceA, funnelId: ids.funnelA, position: 20 },
      }),
      invoke(funnelSteps, {
        method: 'DELETE',
        body: { id: ids.stepA, clientWorkspaceId: ids.workspaceA, funnelId: ids.funnelA },
      }),
    ])

    expect(responses.map((response) => response.statusCode)).toEqual(Array(9).fill(403))

    const readResponses = await Promise.all([
      invoke(clientWorkspaces),
      invoke(services, { query: { clientWorkspaceId: ids.workspaceA } }),
      invoke(funnels, { query: { clientWorkspaceId: ids.workspaceA } }),
      invoke(funnelSteps, { query: { clientWorkspaceId: ids.workspaceA, funnelId: ids.funnelA } }),
    ])
    expect(readResponses.map((response) => response.statusCode)).toEqual([200, 200, 200, 200])
  })

  it('does not expose another organization and rejects cross-workspace relations', async () => {
    const hiddenClient = await invoke(clientWorkspaces, {
      query: { id: ids.workspaceOther },
    })
    expect(hiddenClient.statusCode).toBe(404)

    const crossOrganizationCreate = await invoke(clientWorkspaces, {
      method: 'POST',
      body: { organizationId: ids.organizationB, companyName: 'Wrong Organization' },
    })
    expect(crossOrganizationCreate.statusCode).toBe(403)

    const crossWorkspaceServiceUpdate = await invoke(services, {
      method: 'PATCH',
      body: { id: ids.serviceB, clientWorkspaceId: ids.workspaceA, name: 'Wrong Workspace' },
    })
    expect(crossWorkspaceServiceUpdate.statusCode).toBe(404)

    const crossWorkspaceFunnelCreate = await invoke(funnels, {
      method: 'POST',
      body: { clientWorkspaceId: ids.workspaceA, serviceId: ids.serviceB, name: 'Wrong Service Link' },
    })
    expect(crossWorkspaceFunnelCreate.statusCode).toBe(400)

    const crossWorkspaceStepsRead = await invoke(funnelSteps, {
      query: { clientWorkspaceId: ids.workspaceA, funnelId: ids.funnelB },
    })
    expect(crossWorkspaceStepsRead.statusCode).toBe(404)
  })

  it('allows OPERATOR service/funnel/step writes, reordering and step deletion', async () => {
    mockState.user = { id: ids.operator }

    const createdService = await invoke(services, {
      method: 'POST',
      body: { clientWorkspaceId: ids.workspaceA, name: 'New Service' },
    })
    expect(createdService.statusCode).toBe(201)
    expect(createdService.body.service.slug).toBe('new-service')

    const createdFunnel = await invoke(funnels, {
      method: 'POST',
      body: { clientWorkspaceId: ids.workspaceA, serviceId: ids.serviceA, name: 'New Funnel' },
    })
    expect(createdFunnel.statusCode).toBe(201)
    expect(createdFunnel.body.funnel.question_count).toBe(0)

    const createdStep = await invoke(funnelSteps, {
      method: 'POST',
      body: { clientWorkspaceId: ids.workspaceA, funnelId: ids.funnelA, fieldKey: 'new_field', type: 'TEXT', label: 'New field', required: true, position: 20, options: [] },
    })
    expect(createdStep.statusCode).toBe(201)

    const reordered = await invoke(funnelSteps, {
      method: 'PATCH',
      body: { id: ids.stepA, clientWorkspaceId: ids.workspaceA, funnelId: ids.funnelA, position: 7 },
    })
    expect(reordered.statusCode).toBe(200)
    expect(reordered.body.step.position).toBe(7)

    const deleted = await invoke(funnelSteps, {
      method: 'DELETE',
      body: { id: ids.stepA, clientWorkspaceId: ids.workspaceA, funnelId: ids.funnelA },
    })
    expect(deleted.statusCode).toBe(200)
    expect(deleted.body.deleted).toBe(true)
    expect(mockState.tables.funnel_steps.some((step) => step.id === ids.stepA)).toBe(false)

    const funnelDelete = await invoke(funnels, { method: 'DELETE' })
    expect(funnelDelete.statusCode).toBe(405)
  })

  it('rejects malformed input and requests from users without organization membership', async () => {
    const invalidInput = await invoke(clientWorkspaces, {
      method: 'POST',
      body: { organizationId: 'not-a-uuid', companyName: 'Invalid Client' },
    })
    expect(invalidInput.statusCode).toBe(400)

    mockState.user = { id: ids.nonMember }
    const noMembership = await invoke(clientWorkspaces)
    expect(noMembership.statusCode).toBe(403)

    const hiddenService = await invoke(services, {
      query: { clientWorkspaceId: ids.workspaceA },
    })
    expect(hiddenService.statusCode).toBe(404)
  })
})
