import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/firefly-api';
import { formatCurrency } from '@/lib/utils';

export default function JarsPage() {
  const [jars, setJars] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any | null>(null);
  const [txHistory, setTxHistory] = useState<any[]>([]);

  const fetchJars = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.piggyBanks.list();
      setJars(Array.isArray(res) ? res : res.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchJars(); }, [fetchJars]);

  if (selected) {
    const attrs = selected.attributes || selected;

    return (
      <div className="p-4 space-y-4 max-w-lg mx-auto">
        <button
          onClick={() => setSelected(null)}
          className="text-text-muted hover:text-text flex items-center gap-1 text-sm"
        >
          ← Volver a jarras
        </button>

        <div className="bg-surface rounded-xl p-4">
          <h2 className="text-lg font-bold">{attrs.name}</h2>
          {attrs.target_amount && parseFloat(attrs.target_amount) > 0 && (
            <div className="mt-3">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-text-muted">Progreso</span>
                <span className="font-medium">
                  {formatCurrency(parseFloat(attrs.current_amount || '0'), attrs.currency_code)}
                  {' / '}
                  {formatCurrency(parseFloat(attrs.target_amount), attrs.currency_code)}
                </span>
              </div>
              <div className="w-full bg-surface-light rounded-full h-2.5">
                <div
                  className="bg-primary rounded-full h-2.5 transition-all"
                  style={{
                    width: `${Math.min(
                      100,
                      (parseFloat(attrs.current_amount || '0') / parseFloat(attrs.target_amount)) * 100
                    )}%`,
                  }}
                />
              </div>
            </div>
          )}
          {attrs.start_date && (
            <p className="text-xs text-text-muted mt-2">
              Creada: {attrs.start_date}
            </p>
          )}
          {attrs.target_date && (
            <p className="text-xs text-text-muted">
              Meta: {attrs.target_date}
            </p>
          )}
        </div>

        <div className="bg-surface rounded-xl p-4">
          <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-3">
            Transacciones vinculadas
          </h3>
          <p className="text-text-muted text-sm text-center py-4">
            Historial de transacciones disponible próximamente
          </p>
        </div>
      </div>
    );
  }

  const totalJars = jars.reduce((sum: number, j: any) => {
    const attrs = j.attributes || j;
    return sum + parseFloat(attrs.current_amount || '0');
  }, 0);

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto">
      <h1 className="text-xl font-bold">Jarras / Fondos</h1>

      <div className="bg-surface rounded-xl p-4">
        <p className="text-text-muted text-xs uppercase tracking-wide">Total en jarras</p>
        <p className="text-2xl font-bold text-primary mt-1">
          {formatCurrency(totalJars)}
        </p>
      </div>

      <div className="space-y-2">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : jars.length === 0 ? (
          <div className="text-center py-8 text-text-muted">
            <p className="text-lg mb-1">⚱</p>
            <p className="text-sm">No hay jarras creadas</p>
            <p className="text-xs mt-1">Créalas desde Firefly III (Piggy Banks)</p>
          </div>
        ) : (
          jars.map((jar: any) => {
            const attrs = jar.attributes || jar;
            const current = parseFloat(attrs.current_amount || '0');
            const target = parseFloat(attrs.target_amount || '0');
            const currency = attrs.currency_code || 'USD';
            const progress = target > 0 ? Math.min(100, (current / target) * 100) : 0;

            return (
              <button
                key={jar.id}
                onClick={() => setSelected(jar)}
                className="w-full bg-surface rounded-xl p-4 text-left hover:bg-surface-light transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <p className="font-medium">{attrs.name}</p>
                  <span className="font-bold">{formatCurrency(current, currency)}</span>
                </div>
                {target > 0 && (
                  <>
                    <div className="w-full bg-surface-light rounded-full h-2">
                      <div
                        className="bg-warning rounded-full h-2 transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <p className="text-xs text-text-muted mt-1">
                      Meta: {formatCurrency(target, currency)}
                    </p>
                  </>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
