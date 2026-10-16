import { useEffect, useState } from 'react'
import { ClipboardCheck } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import ClientWorkspaceDetailPage from './ClientWorkspaceDetailPage'
import ClientWorkspacesPage from './ClientWorkspacesPage'
import InternalLoginPage from './InternalLoginPage'
import PrepareHannaPage from './PrepareHannaPage'
import SettingsPageV2 from './SettingsPageV2'
import ShiftPlannerPage from './ShiftPlannerPage'
import TaskFirstRoot from './TaskFirstRoot'
import { supabase, supabaseConfigured } from './lib/supabase'
import './prepare-hanna.css'
import './workspace-root.css'

export default function WorkspaceRoot() {
  const location = useLocation()
  const [canPrepare, setCanPrepare] = useState(false)

  useEffect(() => {
    if (!supabaseConfigured) return
    let active = true

    async function resolveRole() {
      const { data: sessionData } = await supabase.auth.getSession()
      const userId = sessionData.session?.user.id
      if (!userId) {
        if (active) setCanPrepare(false)
        return
      }
      const { data } = await supabase.from('user_roles').select('role').eq('user_id', userId).maybeSingle()
      if (active) setCanPrepare(data?.role === 'jami')
    }

    void resolveRole()
    const { data: authListener } = supabase.auth.onAuthStateChange(() => void resolveRole())
    return () => {
      active = false
      authListener.subscription.unsubscribe()
    }
  }, [])

  if (location.pathname === '/login') return <InternalLoginPage />
  if (location.pathname === '/prepare-hanna') return <PrepareHannaPage />
  if (location.pathname === '/shifts') return <ShiftPlannerPage />
  if (location.pathname === '/settings') return <SettingsPageV2 />
  if (location.pathname === '/clients') return <ClientWorkspacesPage />
  if (location.pathname.startsWith('/clients/')) return <ClientWorkspaceDetailPage />

  return (
    <>
      <TaskFirstRoot />
      {canPrepare && location.pathname === '/today' ? (
        <Link to="/prepare-hanna" className="ph-launcher"><ClipboardCheck size={17} /> Valmistele Hannalle</Link>
      ) : null}
    </>
  )
}
