import { Component } from 'react';
import { RotateCcw } from 'lucide-react';

/**
 * Catches a crash in a page so the rest of the app (sidebar, header) keeps working.
 * Pass a resetKey (e.g. the current path) so navigating away clears the error.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, key: props.resetKey };
  }

  static getDerivedStateFromProps(props, state) {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null;
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[KinCast] page crashed:', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="page">
        <div className="empty">
          <h3>Something went wrong on this page</h3>
          <p>Reloading usually fixes it. If it keeps happening, let your KinCast admin know.</p>
          <p className="mono small muted">{String(this.state.error?.message || this.state.error).slice(0, 200)}</p>
          <button className="btn btn--primary" onClick={() => window.location.reload()}><RotateCcw size={16} /> Reload</button>
        </div>
      </div>
    );
  }
}
