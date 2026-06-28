import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Amplify } from 'aws-amplify';
import { loadConfig, RuntimeConfig } from './config';
import { AuthProvider } from './auth/AuthContext';
import { ConsentGate } from './consent/ConsentGate';
import { ProtectedRoute, AdminRoute } from './components/ProtectedRoute';
import { Welcome } from './pages/Welcome';
import { Dashboard } from './pages/Dashboard';
import { Chat } from './pages/Chat';
import { Admin } from './pages/Admin';

export function App() {
  const [config, setConfig] = useState<RuntimeConfig | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    loadConfig()
      .then(cfg => {
        Amplify.configure({
          Auth: {
            Cognito: {
              userPoolId: cfg.userPoolId,
              userPoolClientId: cfg.appClientId,
              identityPoolId: cfg.identityPoolId,
            },
          },
        });
        setConfig(cfg);
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load configuration'));
  }, []);

  if (error) {
    return (
      <div className="error-screen">
        <h1>Configuration Error</h1>
        <p>The application configuration could not be loaded.</p>
        <p className="error-detail">{error}</p>
      </div>
    );
  }

  if (!config) {
    return <div className="loading-screen"><p>Loading...</p></div>;
  }

  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Welcome />} />
          <Route path="/dashboard" element={
            <ProtectedRoute>
              <ConsentGate config={config}>
                <Dashboard config={config} />
              </ConsentGate>
            </ProtectedRoute>
          } />
          <Route path="/chat/:arn" element={
            <ProtectedRoute>
              <ConsentGate config={config}>
                <Chat config={config} />
              </ConsentGate>
            </ProtectedRoute>
          } />
          <Route path="/admin" element={
            <ProtectedRoute>
              <AdminRoute>
                <ConsentGate config={config}>
                  <Admin config={config} />
                </ConsentGate>
              </AdminRoute>
            </ProtectedRoute>
          } />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
