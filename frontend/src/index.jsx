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
import App from './App';
import { useGameStore } from './store/useGameStore';

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
      return (
        <div style={{ padding: '20px', backgroundColor: '#fee', color: 'red', height: '100vh', overflow: 'auto' }}>
          <h1>Something went wrong.</h1>
          <p style={{ fontWeight: 'bold' }}>{this.state.error && this.state.error.toString()}</p>
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: '12px' }}>
            {this.state.errorInfo && this.state.errorInfo.componentStack}
          </pre>
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
