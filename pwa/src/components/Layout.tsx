import { useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";

// SVG icon paths (24x24 outline)
const Icons = {
  dashboard: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
  transactions: "M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4",
  accounts: "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z",
  jars: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10",
  reconciliation: "M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3",
  categories: "M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z",
  loans: "M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z",
  rates: "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6",
  home: "M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10",
  vehicle: "M8 17H5a2 2 0 01-2-2v-4m0 0V7a2 2 0 012-2h8.5L17 9m-17 2h12m0 0l4-4m-4 4v6m0 0h4a2 2 0 002-2v-4m0 0L17 9m0 6h.01M6 17h.01",
  baby: "M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z",
  logout: "M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1",
  menu: "M4 6h16M4 12h16M4 18h16",
  close: "M6 18L18 6M6 6l12 12",
  chevronRight: "M9 5l7 7-7 7",
};

function NavIcon({ path, className = "" }: { path: string; className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d={path} />
    </svg>
  );
}

const navGroups = [
  {
    label: "FINANZAS",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
      { href: "/transactions", label: "Transacciones", icon: "transactions" },
      { href: "/accounts", label: "Cuentas", icon: "accounts" },
      { href: "/jars", label: "Jarras", icon: "jars" },
      { href: "/reconciliation", label: "Conciliación", icon: "reconciliation" },
    ],
  },
  {
    label: "CONTROL",
    items: [
      { href: "/categories", label: "Categorías", icon: "categories" },
      { href: "/loans", label: "Préstamos", icon: "loans" },
      { href: "/rates", label: "Tasas", icon: "rates" },
    ],
  },
  {
    label: "HOGAR",
    items: [
      { href: "/home", label: "Hogar", icon: "home" },
      { href: "/vehicle", label: "Vehículo", icon: "vehicle" },
      { href: "/baby", label: "Bebé", icon: "baby" },
    ],
  },
];

// Flat list for bottom nav (first 5 items)
const bottomNavItems = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/transactions", label: "Transacciones", icon: "transactions" },
  { href: "/accounts", label: "Cuentas", icon: "accounts" },
  { href: "/jars", label: "Jarras", icon: "jars" },
  { href: "/rates", label: "Tasas", icon: "rates" },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const { logout, user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <div className="min-h-dvh bg-background flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-40 w-[--sidebar-width]
        bg-surface border-r border-surface-light/60
        transform transition-transform duration-250 ease-out
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        lg:translate-x-0
        flex flex-col
      `}>
        {/* Logo */}
        <div className="h-16 flex items-center px-5 border-b border-surface-light/60 shrink-0">
          <Link to="/dashboard" className="flex items-center gap-3" onClick={() => setSidebarOpen(false)}>
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
              <span className="text-primary font-bold text-sm">L</span>
            </div>
            <div>
              <p className="text-sm font-bold text-text tracking-tight">Life OS</p>
              <p className="text-[10px] text-text-muted leading-none">Financial Control</p>
            </div>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
          {navGroups.map((group) => (
            <div key={group.label}>
              <p className="px-3 mb-1.5 text-[10px] font-semibold text-text-muted/60 tracking-widest uppercase">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      to={item.href}
                      onClick={() => setSidebarOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                        active
                          ? "bg-primary/15 text-primary"
                          : "text-text-muted hover:text-text hover:bg-surface-elevated"
                      }`}
                    >
                      <NavIcon
                        path={Icons[item.icon as keyof typeof Icons]}
                        className={active ? "text-primary" : ""}
                      />
                      <span>{item.label}</span>
                      {active && (
                        <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User + Logout */}
        <div className="p-3 border-t border-surface-light/60 shrink-0 space-y-1">
          {user?.email && (
            <div className="px-3 py-2">
              <p className="text-[11px] text-text-muted truncate">{user.email}</p>
            </div>
          )}
          <button
            onClick={logout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-text-muted hover:text-danger hover:bg-danger/10 w-full transition-colors"
          >
            <NavIcon path={Icons.logout} />
            <span>Desconectar</span>
          </button>
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="sticky top-0 z-20 bg-background/90 backdrop-blur border-b border-surface-light/60 lg:hidden shrink-0">
          <div className="flex items-center justify-between px-4 h-14">
            <Link to="/dashboard" className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-primary/20 flex items-center justify-center">
                <span className="text-primary font-bold text-xs">L</span>
              </div>
              <span className="font-bold text-sm text-text">Life OS</span>
            </Link>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="text-text-muted hover:text-text p-2 rounded-lg hover:bg-surface-elevated transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                {sidebarOpen ? <path d={Icons.close} /> : <path d={Icons.menu} />}
              </svg>
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 pb-20 lg:pb-0">{children}</main>

        {/* Bottom nav - mobile */}
        <nav className="fixed bottom-0 inset-x-0 z-20 bg-background/95 backdrop-blur border-t border-surface-light/60 lg:hidden">
          <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-1 safe-area-inset-bottom">
            {bottomNavItems.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-xl text-[10px] font-medium transition-colors min-w-0 ${
                    active ? "text-primary" : "text-text-muted"
                  }`}
                >
                  <NavIcon
                    path={Icons[item.icon as keyof typeof Icons]}
                    className={`${active ? "text-primary" : ""}`}
                  />
                  <span className="truncate max-w-[48px] text-center leading-none">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
