import { useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';

interface NavItem {
  path: string;
  label: string;
  icon: ReactNode;
}

const Icon = ({ d }: { d: string | string[] }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    {(Array.isArray(d) ? d : [d]).map((path, i) => <path key={i} d={path} />)}
  </svg>
);

const navItems: NavItem[] = [
  { path: '/dashboard',     label: 'Dashboard',      icon: <Icon d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /> },
  { path: '/transactions',  label: 'Transacciones',  icon: <Icon d={['M8 6h13M8 12h13M8 18h13','M3 6h.01M3 12h.01M3 18h.01']} /> },
  { path: '/accounts',      label: 'Cuentas',        icon: <Icon d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /> },
  { path: '/jars',          label: 'Jarras',         icon: <Icon d={['M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10']} /> },
  { path: '/categories',    label: 'Categorías',     icon: <Icon d={['M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z']} /> },
  { path: '/rates',         label: 'Tasas',          icon: <Icon d={['M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z']} /> },
  { path: '/loans',         label: 'Préstamos',      icon: <Icon d={['M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z']} /> },
  { path: '/reconciliation',label: 'Conciliación',   icon: <Icon d={['M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z']} /> },
];

// Bottom nav: first 4 items + "Más"
const bottomPrimary = navItems.slice(0, 4);
const bottomOverflow = navItems.slice(4);

export default function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="flex min-h-screen bg-background">
      {/* ── Desktop Sidebar ──────────────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-[260px] bg-surface border-r border-surface-light/40 shrink-0 h-screen sticky top-0">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-surface-light/40">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
            <span className="font-bold text-text text-base tracking-tight">Life OS</span>
          </div>
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          <p className="text-[10px] font-semibold text-text-muted uppercase tracking-widest px-3 mb-2 mt-1">Finanzas</p>
          {navItems.slice(0, 4).map(item => (
            <SidebarLink key={item.path} item={item} active={isActive(item.path)} />
          ))}
          <p className="text-[10px] font-semibold text-text-muted uppercase tracking-widest px-3 mb-2 mt-4">Control</p>
          {navItems.slice(4).map(item => (
            <SidebarLink key={item.path} item={item} active={isActive(item.path)} />
          ))}
        </nav>

        {/* User */}
        <div className="px-4 py-4 border-t border-surface-light/40">
          <p className="text-xs text-text-muted truncate mb-2">{user?.email}</p>
          <button onClick={logout} className="text-xs text-text-muted hover:text-danger transition-colors flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* ── Mobile sidebar overlay ─────────────────────────── */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <aside className="relative w-72 bg-surface border-r border-surface-light/40 flex flex-col h-full z-10">
            <div className="flex items-center justify-between px-5 py-4 border-b border-surface-light/40">
              <span className="font-bold text-text">Life OS</span>
              <button onClick={() => setSidebarOpen(false)} className="text-text-muted hover:text-text p-1">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
              {navItems.map(item => (
                <SidebarLink key={item.path} item={item} active={isActive(item.path)} onClick={() => setSidebarOpen(false)} />
              ))}
            </nav>
            <div className="px-4 py-4 border-t border-surface-light/40">
              <p className="text-xs text-text-muted truncate mb-2">{user?.email}</p>
              <button onClick={logout} className="text-xs text-danger flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" /></svg>
                Cerrar sesión
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* ── Main content ──────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-screen overflow-hidden">
        {/* Mobile header */}
        <header className="lg:hidden sticky top-0 z-30 bg-surface/90 backdrop-blur border-b border-surface-light/40 flex items-center justify-between px-4 h-14">
          <button onClick={() => setSidebarOpen(true)} className="text-text-muted hover:text-text p-1 -ml-1">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12h18M3 6h18M3 18h18" />
            </svg>
          </button>
          <span className="font-bold text-sm text-text">
            {navItems.find(n => isActive(n.path))?.label ?? 'Life OS'}
          </span>
          <div className="w-8" /> {/* spacer */}
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto pb-20 lg:pb-0">
          {children}
        </main>

        {/* ── Mobile bottom nav ─────────────────────────────── */}
        <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-surface/95 backdrop-blur border-t border-surface-light/40"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="flex items-stretch h-16">
            {bottomPrimary.map(item => (
              <Link key={item.path} to={item.path}
                className={`flex-1 flex flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors ${
                  isActive(item.path) ? 'text-primary' : 'text-text-muted'
                }`}>
                {item.icon}
                <span className="truncate max-w-[56px] text-center leading-tight">{item.label.split(' ')[0]}</span>
              </Link>
            ))}

            {/* Más button */}
            <button onClick={() => setMoreOpen(true)}
              className={`flex-1 flex flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors ${
                bottomOverflow.some(i => isActive(i.path)) ? 'text-primary' : 'text-text-muted'
              }`}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                <circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" />
              </svg>
              <span>Más</span>
            </button>
          </div>
        </nav>

        {/* "Más" drawer */}
        {moreOpen && (
          <div className="lg:hidden fixed inset-0 z-40 flex items-end">
            <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={() => setMoreOpen(false)} />
            <div className="relative w-full bg-surface rounded-t-2xl border-t border-surface-light/40 pb-safe z-10">
              <div className="w-10 h-1 bg-surface-light rounded-full mx-auto mt-3 mb-4" />
              <div className="grid grid-cols-2 gap-1 px-3 pb-6">
                {bottomOverflow.map(item => (
                  <Link key={item.path} to={item.path}
                    onClick={() => setMoreOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3.5 rounded-xl transition-colors ${
                      isActive(item.path)
                        ? 'bg-primary/10 text-primary'
                        : 'bg-surface-elevated text-text hover:bg-surface-light'
                    }`}>
                    {item.icon}
                    <span className="text-sm font-medium">{item.label}</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SidebarLink({ item, active, onClick }: { item: NavItem; active: boolean; onClick?: () => void }) {
  return (
    <Link to={item.path} onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
        active
          ? 'bg-primary/15 text-primary'
          : 'text-text-muted hover:text-text hover:bg-surface-elevated'
      }`}>
      <span className={active ? 'text-primary' : ''}>{item.icon}</span>
      {item.label}
      {active && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />}
    </Link>
  );
}
