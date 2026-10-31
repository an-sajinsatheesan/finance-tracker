import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { PrimeReactProvider } from 'primereact/api';
import { ConfirmDialog } from 'primereact/confirmdialog';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { LookupProvider } from './context/LookupContext';
import { MonthProvider } from './context/MonthContext';
import { ToastProvider } from './components/ui';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PrimeReactProvider value={{ ripple: false }}>
      <BrowserRouter>
        <ToastProvider>
          <ConfirmDialog />
          <AuthProvider>
            <LookupProvider>
              <MonthProvider>
                <App />
              </MonthProvider>
            </LookupProvider>
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </PrimeReactProvider>
  </StrictMode>,
);
