import { useEffect, useState } from 'react'
import { AlertTriangle, ArrowLeft, Loader2, LogOut } from 'lucide-react'

export function AppShell ({
  tool,
  clause,
  icon,
  tabs,
  children,
  healthPath = '/health',
  sessionPath = '/auth/me',
  dashboardUrl = import.meta.env.VITE_DASHBOARD_URL || '/tools'
}) {
  const online = useHealth(healthPath)
  const session = useSession(sessionPath)

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <div className="app-topbar-inner">
          {dashboardUrl ? (
            <a className="back-link" href={dashboardUrl} title="Volver al dashboard">
              <ArrowLeft size={16} aria-hidden="true" />
              <span className="sr-only">Volver al dashboard</span>
            </a>
          ) : null}
          {icon ? <span className="tool-icon">{icon}</span> : null}
          <div className="tool-title">
            <h1>{tool}</h1>
            <p>ISO 9001:2015 · {clause}</p>
          </div>
          <HealthChip online={online} />
          <SessionChip session={session} />
        </div>
        {tabs ? <div className="tabs-bar">{tabs}</div> : null}
      </header>

      {online === false ? (
        <div className="service-alert">El servicio no responde. Las acciones fallaran hasta que vuelva.</div>
      ) : null}

      <main className="app-main">{children}</main>
    </div>
  )
}

function useHealth (path) {
  const [online, setOnline] = useState(null)

  useEffect(() => {
    let alive = true
    const ping = () => {
      fetch(path, { credentials: 'include' })
        .then(response => {
          if (alive) setOnline(response.ok)
        })
        .catch(() => {
          if (alive) setOnline(false)
        })
    }

    ping()
    const timer = window.setInterval(ping, 10000)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [path])

  return online
}

function useSession (path) {
  const [session, setSession] = useState(null)

  useEffect(() => {
    let alive = true
    fetch(path, { credentials: 'include' })
      .then(response => response.ok ? response.json() : { authenticated: false })
      .then(data => {
        if (alive) setSession(data)
      })
      .catch(() => {
        if (alive) setSession({ authenticated: false })
      })

    return () => {
      alive = false
    }
  }, [path])

  return session
}

function HealthChip ({ online }) {
  const label = online === null ? 'conectando' : online ? 'en linea' : 'sin respuesta'
  const tone = online === null ? 'neutral' : online ? 'ok' : 'danger'
  return <StatusChip status={label} tone={tone} />
}

function SessionChip ({ session }) {
  if (!session) return null
  if (!session.authenticated) {
    if (session.mode !== 'open') return null
    return <Badge tone="warn">SSO desactivado - desarrollo</Badge>
  }

  const user = session.user || {}
  return (
    <span className="session-chip">
      <span>{user.displayName || 'sesion'}</span>
      <Mono>{user.role || 'sin rol'}</Mono>
      <a href="/auth/logout" title="Cerrar sesion">
        <LogOut size={14} aria-hidden="true" />
        <span className="sr-only">Cerrar sesion</span>
      </a>
    </span>
  )
}

export function Tab ({ active, children, ...props }) {
  return (
    <a {...props} className={`tab-link ${active ? 'active' : ''}`}>
      {children}
    </a>
  )
}

export function PageHeader ({ eyebrow, title, description, actions }) {
  return (
    <header className="page-header">
      <div>
        {eyebrow ? <p>{eyebrow}</p> : null}
        <h2>{title}</h2>
        {description ? <span>{description}</span> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  )
}

export function Panel ({ title, subtitle, actions, children, className = '' }) {
  return (
    <section className={`panel ${className}`}>
      {title || actions ? (
        <header className="panel-header">
          <div>
            {title ? <h3>{title}</h3> : null}
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          {actions ? <div className="panel-actions">{actions}</div> : null}
        </header>
      ) : null}
      <div className="panel-body">{children}</div>
    </section>
  )
}

export function Metric ({ label, value, hint, tone = 'default' }) {
  return (
    <div className={`metric tone-${tone}`}>
      <p>{label}</p>
      <strong>{value}</strong>
      {hint ? <span>{hint}</span> : null}
    </div>
  )
}

export function StatusChip ({ status, tone = 'neutral' }) {
  return (
    <span className={`status-chip tone-${tone}`}>
      <i aria-hidden="true" />
      {status}
    </span>
  )
}

export function Badge ({ children, tone = 'neutral' }) {
  return <span className={`badge tone-${tone}`}>{children}</span>
}

export function Button ({ variant = 'ghost', loading = false, disabled, children, className = '', ...props }) {
  return (
    <button
      {...props}
      className={`button ${variant} ${className}`}
      disabled={disabled || loading}
    >
      {loading ? <Loader2 className="spin" size={14} aria-hidden="true" /> : null}
      {children}
    </button>
  )
}

export function Field ({ label, hint, error, required, children }) {
  return (
    <label className="field">
      <span>
        {label}
        {required ? <b aria-hidden="true"> *</b> : null}
      </span>
      {children}
      {error ? <small className="field-error">{error}</small> : hint ? <small>{hint}</small> : null}
    </label>
  )
}

export function Input ({ className = '', ...props }) {
  return <input {...props} className={`input ${className}`} />
}

export function Table ({ columns, rows, getRowKey, empty }) {
  if (!rows.length) return empty || <EmptyState title="Sin registros" />
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map(column => <th key={column.key}>{column.header}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={getRowKey(row, rowIndex)}>
              {columns.map(column => (
                <td className={column.className || ''} key={column.key}>{column.render(row, rowIndex)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Mono ({ children, className = '' }) {
  return <span className={`mono ${className}`}>{children}</span>
}

export function Loading ({ label = 'Cargando' }) {
  return (
    <div className="state-box">
      <Loader2 className="spin" size={16} aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}

export function ErrorState ({ title, detail }) {
  return (
    <div className="error-state">
      <AlertTriangle size={16} aria-hidden="true" />
      <div>
        <p>{title}</p>
        {detail ? <Mono>{detail}</Mono> : null}
      </div>
    </div>
  )
}

export function EmptyState ({ title, detail }) {
  return (
    <div className="empty-state">
      <p>{title}</p>
      {detail ? <span>{detail}</span> : null}
    </div>
  )
}

export function formatTime (value) {
  if (!value) return 'N/D'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'N/D'
  return new Intl.DateTimeFormat('es-MX', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(date)
}
