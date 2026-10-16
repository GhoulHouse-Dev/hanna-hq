import { describe, expect, it } from 'vitest'
import {
  canCreateClientWorkspace,
  canEditClientWorkspace,
  canManageFunnel,
  canManageService,
  isOrganizationRole,
} from './client-access.js'

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

  it('allows owner, admin and operator to manage services', () => {
    expect(canManageService('OWNER')).toBe(true)
    expect(canManageService('ADMIN')).toBe(true)
    expect(canManageService('OPERATOR')).toBe(true)
    expect(canManageService('VIEWER')).toBe(false)
  })

  it('allows owner, admin and operator to manage funnels', () => {
    expect(canManageFunnel('OWNER')).toBe(true)
    expect(canManageFunnel('ADMIN')).toBe(true)
    expect(canManageFunnel('OPERATOR')).toBe(true)
    expect(canManageFunnel('VIEWER')).toBe(false)
  })

  it('rejects unknown organization roles', () => {
    expect(isOrganizationRole('OWNER')).toBe(true)
    expect(isOrganizationRole('jami')).toBe(false)
    expect(isOrganizationRole('')).toBe(false)
  })
})
