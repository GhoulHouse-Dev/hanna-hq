import { FormEvent, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { Navigate, useNavigate } from 'react-router-dom'
import { supabase, supabaseConfigured } from './lib/supabase'

export default function InternalLoginPage() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
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

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setMessage('')
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      navigate('/clients')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Kirjautuminen epäonnistui')
    } finally {
      setBusy(false)
    }
  }

  if (session === undefined) return <div className="login-shell"><div className="state-card">Ladataan…</div></div>
  if (session) return <Navigate to="/clients" replace />

  if (!supabaseConfigured) {
    return <div className="login-shell"><div className="login-card"><div className="brand-mark large">GH</div><h1>Revenue OS</h1><p>Supabase-yhteys puuttuu.</p></div></div>
  }

  return (
    <div className="login-shell">
      <form className="login-card" onSubmit={submit}>
        <div className="brand-mark large">GH</div>
        <div><h1>Revenue OS</h1><p>GhoulHousen sisäinen työtila</p></div>
        <label>Sähköposti<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label>
        <label>Salasana<input type="password" required value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label>
        {message ? <div className="inline-message">{message}</div> : null}
        <button className="primary-button" disabled={busy}>{busy ? 'Kirjaudutaan…' : 'Kirjaudu sisään'}</button>
      </form>
    </div>
  )
}
