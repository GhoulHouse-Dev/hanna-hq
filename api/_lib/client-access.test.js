import { describe, expect, it } from 'vitest'
import { canCreateClientWorkspace, canEditClientWorkspace, isOrganizationRole } from './client-access.js'

describe('client workspace permissions', () => {
  it('allows only owner and admin to create client workspaces', () => {
    expect(canCreateClientWorkspace('OWNER')).toBe(true)
    expect(canCreateClientWorkspace('ADMIN')).toBe(true)
    expect(canCreateClientWorkspace('OPERATOR')).toBe(false)
    expect(canCreateClientWorkspace('VIEWER')).toBe(false)
  })

  it('allows operators to edit but keeps viewers read-only', () => {
    expect(canEditClientWorkspace('OWNER')).toBe(true)
    expect(canEditClientWorkspace('ADMIN')).toBe(true)
    expect(canEditClientWorkspace('OPERATOR')).toBe(true)
    expect(canEditClientWorkspace('VIEWER')).toBe(false)
  })

  it('rejects unknown organization roles', () => {
    expect(isOrganizationRole('OWNER')).toBe(true)
    expect(isOrganizationRole('jami')).toBe(false)
    expect(isOrganizationRole('')).toBe(false)
  })
})
