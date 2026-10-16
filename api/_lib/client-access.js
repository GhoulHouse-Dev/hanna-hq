export const ORGANIZATION_ROLES = ['OWNER', 'ADMIN', 'OPERATOR', 'VIEWER']

export function canCreateClientWorkspace(role) {
  return role === 'OWNER' || role === 'ADMIN'
}

export function canEditClientWorkspace(role) {
  return role === 'OWNER' || role === 'ADMIN' || role === 'OPERATOR'
}

export function isOrganizationRole(role) {
  return ORGANIZATION_ROLES.includes(role)
}
