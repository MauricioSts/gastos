import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import Login from './componentes/telas/Login';
import { temSessao } from './api';
import { esconderSplash } from './splash';
import './fontes.css';
import './index.css';

// Sem sessão, nem o App monta: ele pediria dados ao backend no boot. O logout
// (botão em Ajustes ou 401 em qualquer chamada) volta para cá.
function Portao() {
  const [logado, setLogado] = useState(temSessao);

  useEffect(() => {
    const sair = () => setLogado(false);
    window.addEventListener('minimau:sair', sair);
    return () => window.removeEventListener('minimau:sair', sair);
  }, []);

  useEffect(() => {
    if (!logado) esconderSplash();
  }, [logado]);

  return logado ? <App /> : <Login aoEntrar={() => setLogado(true)} />;
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Portao />
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
