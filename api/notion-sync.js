import { createClient } from '@supabase/supabase-js'

const NOTION_VERSION = '2022-06-28'
const DATABASES = {
  companies: process.env.NOTION_COMPANIES_DATABASE_ID || '9ea1374044e54aea8922e078f1fbc653',
  contacts: process.env.NOTION_CONTACTS_DATABASE_ID || '08d11c7265b746cf93f29149c0576637',
  opportunities: process.env.NOTION_OPPORTUNITIES_DATABASE_ID || 'b065a9bc40154c79ace0f18bd224424c',
  projects: process.env.NOTION_PROJECTS_DATABASE_ID || 'f605d529c54d4b38a7f1dee970ca7df0',
}

function serverSupabase(authorization) {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Supabase-palvelinasetukset puuttuvat')
  return createClient(url, key, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function normalizeId(value) {
  return (value || '').replaceAll('-', '').toLowerCase()
}

function richText(property) {
  const parts = property?.title || property?.rich_text || []
  return parts.map((item) => item?.plain_text || item?.text?.content || '').join('').trim()
}

function title(property) {
  return richText(property)
}

function select(property) {
  return property?.select?.name || null
}

function date(property) {
  return property?.date?.start || null
}

function relation(property) {
  return (property?.relation || []).map((item) => item.id).filter(Boolean)
}

function number(property) {
  return typeof property?.number === 'number' ? property.number : null
}

function url(property) {
  return property?.url || null
}

function email(property) {
  return property?.email || null
}

function phone(property) {
  return property?.phone_number || null
}

function checkbox(property) {
  return Boolean(property?.checkbox)
}

function chunk(items, size = 100) {
  const result = []
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size))
  return result
}

async function notionQueryDatabase(databaseId, token) {
  const rows = []
  let cursor
  do {
    const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
    })
    const payload = await response.json()
    if (!response.ok) throw new Error(payload?.message || `Notion API ${response.status}`)
    rows.push(...(payload.results || []))
    cursor = payload.has_more ? payload.next_cursor : null
  } while (cursor)
  return rows
}

async function upsertChunks(supabase, table, rows, onConflict = 'notion_page_id') {
  for (const part of chunk(rows)) {
    if (!part.length) continue
    const { error } = await supabase.from(table).upsert(part, { onConflict })
    if (error) throw error
  }
}

async function requireJami(supabase) {
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) throw new Error('Kirjautuminen vaaditaan')
  const { data: roleData, error: roleError } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userData.user.id)
    .maybeSingle()
  if (roleError) throw roleError
  if (roleData?.role !== 'jami') throw new Error('Vain Jami voi käynnistää CRM-synkronoinnin')
  return userData.user
}

async function latestRun(supabase) {
  const { data, error } = await supabase
    .from('crm_sync_runs')
    .select('*')
    .eq('provider', 'notion')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data || null
}

async function syncNotion(supabase, token, userId) {
  const { data: run, error: runError } = await supabase
    .from('crm_sync_runs')
    .insert({ provider: 'notion', status: 'running', triggered_by: userId })
    .select('id')
    .single()
  if (runError) throw runError

  try {
    const companyPages = await notionQueryDatabase(DATABASES.companies, token)
    const contactPages = await notionQueryDatabase(DATABASES.contacts, token)
    const opportunityPages = await notionQueryDatabase(DATABASES.opportunities, token)
    const projectPages = await notionQueryDatabase(DATABASES.projects, token)
    const syncedAt = new Date().toISOString()

    const companyNames = new Map()
    const companyRows = companyPages.map((page) => {
      const props = page.properties || {}
      const companyName = title(props.Company) || 'Nimetön yritys'
      companyNames.set(normalizeId(page.id), companyName)
      return {
        notion_page_id: page.id,
        notion_url: page.url,
        company_name: companyName,
        business_id: richText(props['Business ID']) || null,
        city: richText(props.City) || null,
        email: email(props.Email),
        industry: richText(props.Industry) || null,
        lead_source: select(props['Lead Source']),
        notes: richText(props.Notes) || null,
        phone: phone(props.Phone),
        status: select(props.Status),
        company_type: select(props.Type),
        website: url(props.Website),
        notion_synced_at: syncedAt,
      }
    })
    await upsertChunks(supabase, 'companies', companyRows)

    const contactRows = contactPages.map((page) => {
      const props = page.properties || {}
      return {
        notion_page_id: page.id,
        notion_url: page.url,
        notion_company_page_id: relation(props.Company)[0] || null,
        contact_name: title(props.Contact) || 'Nimetön kontakti',
        email: email(props.Email),
        phone: phone(props.Phone),
        role_text: richText(props.Role) || null,
        linkedin_url: url(props.LinkedIn),
        decision_maker: checkbox(props['Decision Maker']),
        status: select(props.Status),
        notes: richText(props.Notes) || null,
        notion_synced_at: syncedAt,
      }
    })
    await upsertChunks(supabase, 'contacts', contactRows)

    const { data: existingOpportunities, error: existingOpportunityError } = await supabase
      .from('opportunities')
      .select('notion_page_id,ready_for_hanna')
      .not('notion_page_id', 'is', null)
    if (existingOpportunityError) throw existingOpportunityError
    const opportunityState = new Map((existingOpportunities || []).map((row) => [normalizeId(row.notion_page_id), row]))

    const opportunityRows = opportunityPages.map((page) => {
      const props = page.properties || {}
      const companyPageId = relation(props.Company)[0] || null
      const existing = opportunityState.get(normalizeId(page.id))
      const lockedForExecution = Boolean(existing?.ready_for_hanna)
      const base = {
        notion_page_id: page.id,
        notion_url: page.url,
        notion_company_page_id: companyPageId,
        company_name: companyNames.get(normalizeId(companyPageId)) || title(props.Opportunity) || 'Nimetön opportunity',
        service: select(props.Service),
        offer_url: url(props['Offer URL']),
        demo_url: url(props['Demo URL']),
        research_summary: richText(props['Research Summary']) || null,
        notion_synced_at: syncedAt,
      }
      if (!lockedForExecution) {
        Object.assign(base, {
          stage: select(props.Stage) || 'Lead',
          priority: select(props['Sales Priority']),
          last_contacted_at: date(props['Last Contacted']),
          next_action: richText(props['Next Action']) || null,
          next_action_at: date(props['Next Action Date'])?.slice(0, 10) || null,
          value_eur: number(props['Value €']),
        })
        if (!existing) base.details_url = page.url
      }
      return base
    })
    await upsertChunks(supabase, 'opportunities', opportunityRows)

    const { data: existingProjects, error: existingProjectError } = await supabase
      .from('projects')
      .select('notion_page_id,ready_for_hanna')
      .not('notion_page_id', 'is', null)
    if (existingProjectError) throw existingProjectError
    const projectState = new Map((existingProjects || []).map((row) => [normalizeId(row.notion_page_id), row]))

    const projectRows = projectPages.map((page) => {
      const props = page.properties || {}
      const companyPageId = relation(props.Company)[0] || null
      const existing = projectState.get(normalizeId(page.id))
      const lockedForExecution = Boolean(existing?.ready_for_hanna)
      const base = {
        notion_page_id: page.id,
        notion_url: page.url,
        notion_company_page_id: companyPageId,
        notion_opportunity_page_id: relation(props.Opportunity)[0] || null,
        company_name: companyNames.get(normalizeId(companyPageId)) || title(props.Project) || 'Nimetön projekti',
        notion_synced_at: syncedAt,
      }
      if (!lockedForExecution) {
        Object.assign(base, {
          status: select(props.Status) || 'Onboarding',
          health: select(props.Health),
          due_date: date(props['Due Date'])?.slice(0, 10) || null,
          material_status: select(props['Client Material Status']),
          start_date: date(props['Start Date'])?.slice(0, 10) || null,
          project_value_eur: number(props['Project Value €']),
          notes: richText(props.Notes) || null,
        })
        if (!existing) base.details_url = page.url
      }
      return base
    })
    await upsertChunks(supabase, 'projects', projectRows)

    const counts = {
      companies_seen: companyRows.length,
      contacts_seen: contactRows.length,
      opportunities_seen: opportunityRows.length,
      projects_seen: projectRows.length,
    }
    const { error: finishError } = await supabase
      .from('crm_sync_runs')
      .update({ status: 'success', finished_at: syncedAt, ...counts, error_message: null })
      .eq('id', run.id)
    if (finishError) throw finishError
    return { id: run.id, status: 'success', finished_at: syncedAt, ...counts }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await supabase
      .from('crm_sync_runs')
      .update({ status: 'error', finished_at: new Date().toISOString(), error_message: message.slice(0, 1000) })
      .eq('id', run.id)
    throw error
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const authorization = req.headers.authorization || ''
  if (!authorization.startsWith('Bearer ')) return res.status(401).json({ error: 'Kirjautuminen vaaditaan' })

  try {
    const supabase = serverSupabase(authorization)
    const user = await requireJami(supabase)
    const configured = Boolean(process.env.NOTION_TOKEN)

    if (req.method === 'GET') {
      return res.status(200).json({ configured, latest: await latestRun(supabase) })
    }

    if (!configured) {
      return res.status(503).json({
        error: 'Notion-yhteys ei ole vielä valtuutettu tuotantoon.',
        code: 'NOTION_NOT_CONFIGURED',
      })
    }

    const result = await syncNotion(supabase, process.env.NOTION_TOKEN, user.id)
    return res.status(200).json({ configured: true, result })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const status = message.includes('Vain Jami') ? 403 : message.includes('Kirjautuminen') ? 401 : 500
    return res.status(status).json({ error: message })
  }
}
