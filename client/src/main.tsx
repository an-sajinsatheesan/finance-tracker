import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { MonthProvider } from './context/MonthContext';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <MonthProvider>
          <App />
        </MonthProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
