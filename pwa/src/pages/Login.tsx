import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/Button";
import { Input, Field } from "@/components/ui/Input";

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
        setError("Cuenta creada. Revisa tu email para confirmar.");
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
      {/* Background decoration */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-sm relative">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/15 mb-4">
            <span className="text-2xl font-bold text-primary">L</span>
          </div>
          <h1 className="text-2xl font-bold text-text">Life OS</h1>
          <p className="text-text-muted mt-1 text-sm">Control financiero y del hogar</p>
        </div>

        {/* Card */}
        <div className="bg-surface border border-surface-light/60 rounded-2xl p-6">
          <h2 className="text-base font-semibold text-text mb-5">
            {isSignup ? "Crear cuenta" : "Iniciar sesión"}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="Email">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
                required
                autoComplete="email"
              />
            </Field>

            <Field label="Contraseña">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                autoComplete={isSignup ? "new-password" : "current-password"}
              />
            </Field>

            {error && (
              <div className={`border rounded-xl px-4 py-3 text-sm ${
                error.includes("creada")
                  ? "bg-primary/10 border-primary/20 text-primary"
                  : "bg-danger/10 border-danger/20 text-danger"
              }`}>
                {error}
              </div>
            )}

            <Button type="submit" loading={loading} size="lg" className="w-full mt-2">
              {isSignup ? "Crear cuenta" : "Entrar"}
            </Button>
          </form>
        </div>

        <button
          onClick={() => { setIsSignup(!isSignup); setError(""); }}
          className="w-full text-center text-sm text-text-muted hover:text-primary mt-4 transition-colors"
        >
          {isSignup ? "¿Ya tienes cuenta? Inicia sesión" : "¿No tienes cuenta? Créala aquí"}
        </button>
      </div>
    </main>
  );
}
