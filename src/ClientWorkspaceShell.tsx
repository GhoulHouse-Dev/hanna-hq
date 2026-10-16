import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  BarChart3,
  BriefcaseBusiness,
  ClipboardCheck,
  Home,
  LogOut,
  PhoneCall,
  Settings,
  TimerReset,
} from 'lucide-react'
import { NavLink, Navigate, useNavigate } from 'react-router-dom'
import { supabase, supabaseConfigured } from './lib/supabase'

export default function ClientWorkspaceShell({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const navigate = useNavigate()

  useEffect(() => {
    if (!supabaseConfigured) {
      setSession(null)
      return
    }
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession))
    return () => data.subscription.unsubscribe()
  }, [])

  if (session === undefined) return <div className="cw-loading-screen">Ladataan asiakastyötilaa…</div>
  if (!session) return <Navigate to="/login" replace />

  const nav = [
    { to: '/today', label: 'Tänään', icon: Home },
    { to: '/follow-ups', label: 'Follow-upit', icon: PhoneCall },
    { to: '/clients', label: 'Asiakkaat', icon: BriefcaseBusiness },
    { to: '/admin', label: 'Hallinto', icon: ClipboardCheck },
    { to: '/shifts', label: 'Työvuorot', icon: TimerReset },
    { to: '/week', label: 'Viikko', icon: BarChart3 },
    { to: '/settings', label: 'Asetukset', icon: Settings },
  ]

  async function signOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <div className="cw-shell">
      <aside className="cw-sidebar">
        <div className="cw-brand"><span>GH</span><div><strong>Revenue OS</strong><small>GhoulHouse</small></div></div>
        <nav>
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => isActive ? 'active' : ''}>
              <Icon size={18} /><span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="cw-sidebar-foot">
          <small>{session.user.email}</small>
          <button onClick={signOut}><LogOut size={16} /> Kirjaudu ulos</button>
        </div>
      </aside>
      <main className="cw-main">{children}</main>
    </div>
  )
}
