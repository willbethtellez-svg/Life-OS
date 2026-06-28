import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";

export default function LoginPage() {
  const { login, signup } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignup, setIsSignup] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isSignup) {
        await signup(email, password);
        setError("Cuenta creada. Revisa tu email para confirmar (o revisa el spam).");
        setIsSignup(false);
      } else {
        await login(email, password);
        navigate("/dashboard", { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de autenticación");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-dvh flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary">Life OS</h1>
          <p className="text-text-muted mt-2">Control financiero y del hogar</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-surface border border-surface-light rounded-lg px-4 py-3 text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="tu@email.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-muted mb-1">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-surface border border-surface-light rounded-lg px-4 py-3 text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="••••••••"
              required
              minLength={6}
            />
          </div>

          {error && (
            <div className={`border rounded-lg px-4 py-3 text-sm ${
              error.includes("creada") ? "bg-secondary/10 border-secondary/30 text-secondary" : "bg-danger/10 border-danger/30 text-danger"
            }`}>{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary hover:bg-primary-dark disabled:opacity-50 text-white font-medium rounded-lg px-4 py-3 transition-colors"
          >
            {loading ? "Cargando..." : isSignup ? "Crear cuenta" : "Entrar"}
          </button>
        </form>

        <button
          onClick={() => { setIsSignup(!isSignup); setError(""); }}
          className="w-full text-center text-sm text-primary hover:underline mt-4"
        >
          {isSignup ? "¿Ya tienes cuenta? Inicia sesión" : "¿No tienes cuenta? Créala aquí"}
        </button>
      </div>
    </main>
  );
}
