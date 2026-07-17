import { createRoot } from 'react-dom/client';

import App from './App';

import './index.css';

createRoot(document.getElementById('root')!).render(<App />);

// Register service worker for PWA install support (production only)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .catch((err) => console.warn('SW registration failed:', err));
  });
}

// In dev, unregister any previously installed service workers so stale
// caches don't cause a blank preview in the Replit pane.
if ('serviceWorker' in navigator && import.meta.env.DEV) {
  navigator.serviceWorker.getRegistrations().then((regs) => {
    regs.forEach((r) => r.unregister());
  });
}
