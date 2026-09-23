import React from 'react';
import { AlertTriangle } from 'lucide-react';

// React only unmounts to a blank screen when an error escapes render with no
// boundary to catch it. This is the generic catch-all: any screen that
// renders third-party/relationship data it doesn't fully control (a
// caregiver's profile fields, a list that can be mutated mid-render, etc.)
// wraps itself in this instead of risking a whiteout on an edge case no
// specific null-check anticipated.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary caught:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="page max-w-2xl">
          <div className="panel-light p-8 sm:p-10 text-center space-y-5 max-w-lg mx-auto">
            <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto" style={{ background: 'rgba(205,78,78,0.12)', color: 'var(--alert)' }}>
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-display text-xl sm:text-2xl font-medium">Something went wrong</h3>
              <p className="text-sm mt-2 text-ink-soft">This screen ran into a problem. Reloading usually fixes it.</p>
            </div>
            <button type="button" className="btn btn-on-light" onClick={() => window.location.reload()}>Reload</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
