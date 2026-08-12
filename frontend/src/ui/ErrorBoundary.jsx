import React from 'react';
import { t } from '../i18n/i18n.js';

// M6 #8: the last-resort crash screen. Lifted out of index.jsx 2026-08-12 so it can be RENDERED by a
// test rather than grepped. It used to live inside the bootstrap module, next to
// `ReactDOM.createRoot(document.getElementById('root'))` and the `window.useGameStore` assignment — so
// importing it meant booting the whole app, and the only reachable gate was a regex over index.jsx
// asserting that two literal hex strings and the substring `window.location.reload` appeared somewhere
// in the file. That gate could not tell whether the fallback renders, whether the button is wired, or
// whether the component stack is actually withheld from players. It went red on a palette refactor and
// stayed green through anything that mattered.
//
// The styles are deliberately SELF-CONTAINED inline hex rather than theme tokens or Tailwind classes:
// this thing has to paint during a crash that may have happened before `applyThemeVars` ran or the CSS
// loaded. A crash screen that depends on the system that crashed is not a crash screen.
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error', error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div data-testid="error-boundary" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '24px', background: '#0D1320', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
          <div style={{ maxWidth: '560px', width: '100%', background: '#16213A', border: '4px solid #0A0F1A', borderRadius: '12px', boxShadow: '8px 8px 0 #0A0F1A', padding: '28px', color: '#E8EDF4' }}>
            <h1 style={{ margin: '0 0 12px', color: '#C9A86A', fontSize: '28px', fontWeight: 800, letterSpacing: '0.5px' }}>{t('error.title')}</h1>
            <p style={{ margin: '0 0 16px', color: '#CBD5E1' }}>{t('error.body')}</p>
            <p style={{ margin: '0 0 18px', fontWeight: 700, color: '#F2B33D', fontSize: '14px', wordBreak: 'break-word' }}>{this.state.error && this.state.error.toString()}</p>
            <button data-testid="error-reload" onClick={() => window.location.reload()} style={{ background: '#C9A86A', color: '#0A0F1A', border: '3px solid #0A0F1A', borderRadius: '8px', boxShadow: '3px 3px 0 #0A0F1A', padding: '10px 18px', fontWeight: 800, fontSize: '15px', cursor: 'pointer' }}>{t('ui.reload')}</button>
            {import.meta.env.DEV && this.state.errorInfo && (
              <pre data-testid="error-stack" style={{ whiteSpace: 'pre-wrap', fontSize: '11px', color: '#8A97AB', marginTop: '18px', maxHeight: '40vh', overflow: 'auto' }}>
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
