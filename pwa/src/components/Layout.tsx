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
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-surface-light">
        <div className="flex items-center justify-between px-4 h-14">
          <Link to="/dashboard" className="text-lg font-bold text-primary">Life OS</Link>
          <button onClick={() => setMenuOpen(!menuOpen)} className="text-text-muted hover:text-text p-2">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              {menuOpen ? <path d="M18 6L6 18M6 6l12 12" /> : <path d="M3 12h18M3 6h18M3 18h18" />}
            </svg>
          </button>
        </div>
      </header>

      {menuOpen && (
        <nav className="fixed inset-0 z-40 bg-background/98 pt-14">
          <div className="p-4 space-y-1">
            {navItems.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link key={item.href} to={item.href} onClick={() => setMenuOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${active ? "bg-primary/10 text-primary" : "text-text-muted hover:text-text hover:bg-surface"}`}>
                  <span className="text-lg">{item.icon}</span>{item.label}
                </Link>
              );
            })}
            <hr className="border-surface-light my-3" />
            <button onClick={logout} className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-danger hover:bg-danger/10 w-full transition-colors">
              <span className="text-lg">⏻</span>Desconectar
            </button>
          </div>
        </nav>
      )}

      <main className="flex-1 pb-20">{children}</main>

      <nav className="fixed bottom-0 inset-x-0 z-50 bg-background/95 backdrop-blur border-t border-surface-light">
        <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
          {navItems.slice(0, 5).map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link key={item.href} to={item.href}
                className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg text-[10px] font-medium transition-colors ${active ? "text-primary" : "text-text-muted"}`}>
                <span className="text-lg">{item.icon}</span>{item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
