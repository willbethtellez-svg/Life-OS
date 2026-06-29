import { useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: "◉" },
  { href: "/transactions", label: "Transacciones", icon: "↔" },
  { href: "/accounts", label: "Cuentas", icon: "♢" },
  { href: "/jars", label: "Jarras", icon: "⚱" },
  { href: "/reconciliation", label: "Conciliación", icon: "≋" },
  { href: "/categories", label: "Categorías", icon: "⊞" },
  { href: "/loans", label: "Préstamos", icon: "⊡" },
  { href: "/rates", label: "Tasas", icon: "⟳" },
  { href: "/home", label: "Hogar", icon: "⌂" },
  { href: "/vehicle", label: "Vehículo", icon: "◈" },
  { href: "/baby", label: "Bebé", icon: "✦" },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <div className="min-h-dvh bg-background flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar - desktop always visible, mobile toggle */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-40 w-[--sidebar-width] 
        bg-surface border-r border-surface-light 
        transform transition-transform duration-200
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0
        flex flex-col
      `}>
        {/* Logo */}
        <div className="h-14 flex items-center px-5 border-b border-surface-light">
          <Link to="/dashboard" className="text-lg font-bold text-primary tracking-tight">Life OS</Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {navItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link key={item.href} to={item.href} onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-text-muted hover:text-text hover:bg-surface-light"
                }`}
              >
                <span className="text-lg w-5 text-center">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="p-2 border-t border-surface-light">
          <button onClick={logout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-danger hover:bg-danger/10 w-full transition-colors"
          >
            <span className="text-lg w-5 text-center">⏻</span>
            <span>Desconectar</span>
          </button>
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-surface-light lg:hidden">
          <div className="flex items-center justify-between px-4 h-14">
            <Link to="/dashboard" className="text-lg font-bold text-primary">Life OS</Link>
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-text-muted hover:text-text p-2">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {sidebarOpen ? <path d="M18 6L6 18M6 6l12 12" /> : <path d="M3 12h18M3 6h18M3 18h18" />}
              </svg>
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1">{children}</main>

        {/* Bottom nav - mobile */}
        <nav className="fixed bottom-0 inset-x-0 z-20 bg-background/95 backdrop-blur border-t border-surface-light lg:hidden">
          <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
            {navItems.slice(0, 5).map((item) => {
              const active = isActive(item.href);
              return (
                <Link key={item.href} to={item.href}
                  className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg text-[10px] font-medium transition-colors ${active ? "text-primary" : "text-text-muted"}`}
                >
                  <span className="text-lg">{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
