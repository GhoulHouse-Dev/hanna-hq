import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  funnelCreateSchema,
  funnelStepCreateSchema,
  slugifyFunnel,
} from './funnel-validation.js'

const clientWorkspaceId = '11111111-1111-4111-8111-111111111111'
const funnelId = '22222222-2222-4222-8222-222222222222'

describe('funnel validation', () => {
  it('normalizes Finnish funnel names into stable slugs', () => {
    expect(slugifyFunnel('Pyydä hinta-arvio')).toBe('pyyda-hinta-arvio')
  })

  it('accepts a general funnel without a service', () => {
    const parsed = funnelCreateSchema.parse({
      clientWorkspaceId,
      serviceId: null,
      name: 'Yhteydenottopyyntö',
      status: 'DRAFT',
    })
    expect(parsed.serviceId).toBeNull()
  })

  it('requires a machine-safe field_key for answer fields', () => {
    expect(() => funnelStepCreateSchema.parse({
      clientWorkspaceId,
      funnelId,
      type: 'TEXT',
      label: 'Nimi',
      required: true,
      position: 10,
      options: [],
    })).toThrow()

    expect(() => funnelStepCreateSchema.parse({
      clientWorkspaceId,
      funnelId,
      fieldKey: 'customer_name',
      type: 'TEXT',
      label: 'Nimi',
      required: true,
      position: 10,
      options: [],
    })).not.toThrow()
  })

  it('allows HEADING without field_key and keeps it non-required', () => {
    const parsed = funnelStepCreateSchema.parse({
      clientWorkspaceId,
      funnelId,
      type: 'HEADING',
      label: 'Kohteen tiedot',
      required: false,
      position: 10,
      options: [],
    })
    expect(parsed.fieldKey).toBeUndefined()
  })

  it('requires structured options for choice fields', () => {
    expect(() => funnelStepCreateSchema.parse({
      clientWorkspaceId,
      funnelId,
      fieldKey: 'property_type',
      type: 'SELECT',
      label: 'Kohteen tyyppi',
      required: true,
      position: 20,
      options: [],
    })).toThrow()

    const parsed = funnelStepCreateSchema.parse({
      clientWorkspaceId,
      funnelId,
      fieldKey: 'property_type',
      type: 'SELECT',
      label: 'Kohteen tyyppi',
      required: true,
      position: 20,
      options: [
        { value: 'detached_house', label: 'Omakotitalo' },
        { value: 'row_house', label: 'Rivitalo' },
      ],
    })
    expect(parsed.options).toHaveLength(2)
  })

  it('rejects free-form option JSON', () => {
    expect(() => funnelStepCreateSchema.parse({
      clientWorkspaceId,
      funnelId,
      fieldKey: 'timeline',
      type: 'RADIO',
      label: 'Aikataulu',
      required: false,
      position: 30,
      options: [{ value: 'soon', label: 'Pian', extra: 'not-allowed' }],
    })).toThrow()
  })
})

describe('funnel migration invariants', () => {
  const migration = readFileSync(
    new URL('../../supabase/migrations/20261017_funnels_v1.sql', import.meta.url),
    'utf8',
  )

  it('scopes funnel slug uniqueness to a client workspace', () => {
    expect(migration).toContain('unique (client_workspace_id, slug)')
  })

  it('binds an optional service to the same workspace and organization', () => {
    expect(migration).toContain('foreign key (service_id, client_workspace_id, organization_id)')
    expect(migration).toContain('references public.services (id, client_workspace_id, organization_id)')
  })

  it('binds steps to the same funnel workspace and organization', () => {
    expect(migration).toContain('foreign key (funnel_id, client_workspace_id, organization_id)')
    expect(migration).toContain('references public.funnels (id, client_workspace_id, organization_id)')
  })

  it('allows funnel step delete but not funnel delete through authenticated grants', () => {
    expect(migration).toContain('grant select, insert, update on table public.funnels to authenticated;')
    expect(migration).toContain('grant select, insert, update, delete on table public.funnel_steps to authenticated;')
    expect(migration).toContain('Operators can delete funnel steps')
  })

  it('keeps viewer write access out of funnel policies', () => {
    expect(migration).toContain("'OPERATOR'::public.organization_role")
    expect(migration).not.toContain("'VIEWER'::public.organization_role,\n        'OWNER'")
  })
})
