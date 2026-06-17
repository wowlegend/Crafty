if (typeof window !== 'undefined') {
  window.__debugLogs = window.__debugLogs || [];
  window.__debugListeners = window.__debugListeners || new Set();

  const addLog = (type, args) => {
    const message = args.map(arg => {
      if (arg instanceof Error) return arg.stack || arg.toString();
      if (typeof arg === 'object') {
        try { return JSON.stringify(arg); } catch (e) { return String(arg); }
      }
      return String(arg);
    }).join(' ');

    const logEntry = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      type,
      message
    };

    window.__debugLogs.push(logEntry);
    if (window.__debugLogs.length > 100) {
      window.__debugLogs.shift();
    }

    window.__debugListeners.forEach(listener => {
      try { listener(logEntry); } catch(e) {}
    });
  };

  const origLog = console.log;
  const origWarn = console.warn;
  const origError = console.error;

  console.log = (...args) => { origLog(...args); addLog('info', args); };
  console.warn = (...args) => { origWarn(...args); addLog('warn', args); };
  console.error = (...args) => { origError(...args); addLog('error', args); };

  window.onerror = (message, source, lineno, colno, error) => {
    addLog('error', [`window.onerror: ${message} at ${source}:${lineno}:${colno}`, error]);
  };

  window.onunhandledrejection = (event) => {
    addLog('error', [`window.onunhandledrejection: ${event.reason}`]);
  };
}

import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import './theme/fonts.css';
import { applyThemeVars } from './theme/cssVars.js';
import App from './App';
import { useGameStore } from './store/useGameStore';

applyThemeVars(); // write --ui-* onto :root before first paint

if (typeof window !== 'undefined') {
  window.useGameStore = useGameStore;
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      // M6 #8: bold-flat last-resort crash screen. Self-contained inline styles (palette hex, NOT theme
      // tokens/Tailwind) since a crash can predate applyThemeVars/CSS. The raw component stack is DEV-only
      // (players see a clean reload prompt, not an internals dump).
      return (
        <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '24px', background: '#0D1320', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
          <div style={{ maxWidth: '560px', width: '100%', background: '#16213A', border: '4px solid #0A0F1A', borderRadius: '12px', boxShadow: '8px 8px 0 #0A0F1A', padding: '28px', color: '#E8EDF4' }}>
            <h1 style={{ margin: '0 0 12px', color: '#C9A86A', fontSize: '28px', fontWeight: 800, letterSpacing: '0.5px' }}>Something went wrong</h1>
            <p style={{ margin: '0 0 16px', color: '#CBD5E1' }}>The game hit an unexpected error. Reload to get back to the frontier.</p>
            <p style={{ margin: '0 0 18px', fontWeight: 700, color: '#F2B33D', fontSize: '14px', wordBreak: 'break-word' }}>{this.state.error && this.state.error.toString()}</p>
            <button onClick={() => window.location.reload()} style={{ background: '#C9A86A', color: '#0A0F1A', border: '3px solid #0A0F1A', borderRadius: '8px', boxShadow: '3px 3px 0 #0A0F1A', padding: '10px 18px', fontWeight: 800, fontSize: '15px', cursor: 'pointer' }}>Reload</button>
            {import.meta.env.DEV && this.state.errorInfo && (
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: '11px', color: '#8A97AB', marginTop: '18px', maxHeight: '40vh', overflow: 'auto' }}>
                {this.state.errorInfo.componentStack}
              </pre>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
