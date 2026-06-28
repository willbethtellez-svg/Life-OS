import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import Layout from "@/components/Layout";
import LoginPage from "@/pages/Login";
import DashboardPage from "@/pages/Dashboard";
import TransactionsPage from "@/pages/Transactions";
import AccountsPage from "@/pages/Accounts";
import JarsPage from "@/pages/Jars";
import ReconciliationPage from "@/pages/Reconciliation";
import CategoriesPage from "@/pages/Categories";
import LoansPage from "@/pages/Loans";
import RatesPage from "@/pages/Rates";
import HomePage from "@/pages/Home";
import VehiclePage from "@/pages/Vehicle";
import BabyPage from "@/pages/Baby";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <Layout>
                <Routes>
                  <Route path="/dashboard" element={<DashboardPage />} />
                  <Route path="/transactions" element={<TransactionsPage />} />
                  <Route path="/accounts" element={<AccountsPage />} />
                  <Route path="/jars" element={<JarsPage />} />
                  <Route path="/reconciliation" element={<ReconciliationPage />} />
                  <Route path="/categories" element={<CategoriesPage />} />
                  <Route path="/loans" element={<LoansPage />} />
                  <Route path="/rates" element={<RatesPage />} />
                  <Route path="/home" element={<HomePage />} />
                  <Route path="/vehicle" element={<VehiclePage />} />
                  <Route path="/baby" element={<BabyPage />} />
                  <Route path="*" element={<Navigate to="/dashboard" replace />} />
                </Routes>
              </Layout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </AuthProvider>
  );
}
