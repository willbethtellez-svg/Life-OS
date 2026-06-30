import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth, AuthProvider } from '@/lib/auth-context';
import { useAppStore } from '@/lib/store';
import Layout from '@/components/Layout';
import { Spinner } from '@/components/ui/Spinner';

import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import Transactions from '@/pages/Transactions';
import Accounts from '@/pages/Accounts';
import Jars from '@/pages/Jars';
import Categories from '@/pages/Categories';
import Rates from '@/pages/Rates';
import Loans from '@/pages/Loans';
import Reconciliation from '@/pages/Reconciliation';

function AppRoutes() {
  const { isAuthenticated, loading } = useAuth();
  const { initialized, init } = useAppStore();

  useEffect(() => {
    if (isAuthenticated && !initialized) init();
  }, [isAuthenticated, initialized, init]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Layout>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/accounts" element={<Accounts />} />
        <Route path="/jars" element={<Jars />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/rates" element={<Rates />} />
        <Route path="/loans" element={<Loans />} />
        <Route path="/reconciliation" element={<Reconciliation />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
