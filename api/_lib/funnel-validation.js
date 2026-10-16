import { z } from 'zod'

export const FUNNEL_STATUSES = ['DRAFT', 'ACTIVE', 'PAUSED']
export const FUNNEL_STEP_TYPES = [
  'TEXT',
  'TEXTAREA',
  'EMAIL',
  'PHONE',
  'NUMBER',
  'SELECT',
  'RADIO',
  'MULTISELECT',
  'BOOLEAN',
  'POSTAL_CODE',
  'DATE',
  'HEADING',
  'INFO',
]

export const CHOICE_STEP_TYPES = new Set(['SELECT', 'RADIO', 'MULTISELECT'])
export const STATIC_STEP_TYPES = new Set(['HEADING', 'INFO'])

const uuid = z.string().uuid()
const slug = z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120)
const fieldKey = z.string().trim().regex(/^[a-z][a-z0-9_]{0,79}$/)
const optionValue = z.string().trim().min(1).max(120).regex(/^[a-z0-9]+(?:[_-][a-z0-9]+)*$/)

export const funnelOptionSchema = z.object({
  value: optionValue,
  label: z.string().trim().min(1).max(160),
}).strict()

const optionsSchema = z.array(funnelOptionSchema).max(50)
const nullableText = (max) => z.union([z.string().trim().max(max), z.literal(''), z.null()]).optional()

export const funnelCreateSchema = z.object({
  clientWorkspaceId: uuid,
  serviceId: z.union([uuid, z.null()]).optional(),
  name: z.string().trim().min(2).max(160),
  slug: slug.optional(),
  description: nullableText(5000),
  status: z.enum(FUNNEL_STATUSES).default('DRAFT'),
}).strict()

export const funnelUpdateSchema = funnelCreateSchema
  .omit({ clientWorkspaceId: true })
  .partial()
  .extend({
    id: uuid,
    clientWorkspaceId: uuid,
  })
  .strict()

function validateStepShape(data, ctx) {
  const isStatic = STATIC_STEP_TYPES.has(data.type)
  const isChoice = CHOICE_STEP_TYPES.has(data.type)

  if (isStatic) {
    if (data.fieldKey != null && String(data.fieldKey).trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fieldKey'], message: 'HEADING/INFO ei käytä field_keytä.' })
    }
    if (data.required) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['required'], message: 'HEADING/INFO ei voi olla pakollinen.' })
    }
  } else {
    const parsed = fieldKey.safeParse(data.fieldKey)
    if (!parsed.success) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['fieldKey'], message: 'field_key on pakollinen ja sen pitää olla koneellisesti turvallinen.' })
    }
  }

  const options = data.options || []
  if (isChoice && options.length < 1) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['options'], message: 'Valintakenttä tarvitsee vähintään yhden vaihtoehdon.' })
  }
  if (!isChoice && options.length > 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['options'], message: 'Vaihtoehdot ovat sallittuja vain SELECT-, RADIO- ja MULTISELECT-kentille.' })
  }
}

const stepBaseSchema = z.object({
  clientWorkspaceId: uuid,
  funnelId: uuid,
  fieldKey: z.union([fieldKey, z.literal(''), z.null()]).optional(),
  type: z.enum(FUNNEL_STEP_TYPES),
  label: z.string().trim().min(1).max(240),
  description: nullableText(1000),
  placeholder: nullableText(240),
  required: z.boolean().default(false),
  position: z.number().int().min(0).max(100000),
  options: optionsSchema.default([]),
}).strict()

export const funnelStepCreateSchema = stepBaseSchema.superRefine(validateStepShape)

export const funnelStepUpdateSchema = stepBaseSchema
  .partial()
  .extend({
    id: uuid,
    clientWorkspaceId: uuid,
    funnelId: uuid,
  })
  .strict()

export const funnelStepDeleteSchema = z.object({
  id: uuid,
  clientWorkspaceId: uuid,
  funnelId: uuid,
}).strict()

export function validateUpdatedStep(current, patch) {
  return funnelStepCreateSchema.parse({
    clientWorkspaceId: patch.clientWorkspaceId,
    funnelId: patch.funnelId,
    fieldKey: patch.fieldKey !== undefined ? patch.fieldKey : current.field_key,
    type: patch.type !== undefined ? patch.type : current.type,
    label: patch.label !== undefined ? patch.label : current.label,
    description: patch.description !== undefined ? patch.description : current.description,
    placeholder: patch.placeholder !== undefined ? patch.placeholder : current.placeholder,
    required: patch.required !== undefined ? patch.required : current.required,
    position: patch.position !== undefined ? patch.position : current.position,
    options: patch.options !== undefined ? patch.options : current.options,
  })
}

export function slugifyFunnel(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
}

export function nullable(value) {
  if (value == null) return null
  const trimmed = String(value).trim()
  return trimmed ? trimmed : null
}
