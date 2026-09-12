import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './fontes.css';
import './index.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Service worker: e ele que faz a segunda abertura do app ser instantanea.
// Registrado depois do primeiro render de proposito -- registrar antes competiria
// por rede justamente no instante em que o bundle e as fontes estao chegando.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Sem service worker o app funciona igual, so abre mais devagar.
    });
  });
}
