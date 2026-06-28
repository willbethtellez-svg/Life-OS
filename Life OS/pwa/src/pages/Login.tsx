import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [token, setToken] = useState("");
  const [baseUrl, setBaseUrl] = useState("http://localhost:8080");
  const [error, setError] = useState("");
  const [testing, setTesting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setTesting(true);

    try {
      const res = await fetch(`${baseUrl}/api/v1/about`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error("No se pudo conectar. Verifica la URL y el token.");

      const data = await res.json();
      if (!data?.data) throw new Error("Respuesta inesperada del servidor");

      login(token, baseUrl);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de conexión");
    } finally {
      setTesting(false);
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
            <label className="block text-sm font-medium text-text-muted mb-1">URL de Firefly III</label>
            <input
              type="url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              className="w-full bg-surface border border-surface-light rounded-lg px-4 py-3 text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="http://localhost:8080"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-muted mb-1">Token de acceso personal</label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="w-full bg-surface border border-surface-light rounded-lg px-4 py-3 text-text placeholder:text-text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="eyJ... o tu token"
              required
            />
          </div>

          {error && (
            <div className="bg-danger/10 border border-danger/30 rounded-lg px-4 py-3 text-sm text-danger">{error}</div>
          )}

          <button
            type="submit"
            disabled={testing}
            className="w-full bg-primary hover:bg-primary-dark disabled:opacity-50 text-white font-medium rounded-lg px-4 py-3 transition-colors"
          >
            {testing ? "Verificando..." : "Conectar"}
          </button>
        </form>

        <p className="text-xs text-text-muted/60 text-center mt-6">
          Necesitas una instancia de Firefly III corriendo. El token se genera en Firefly III &gt; Opciones &gt; Perfil &gt; Tokens de acceso personal.
        </p>
      </div>
    </main>
  );
}
