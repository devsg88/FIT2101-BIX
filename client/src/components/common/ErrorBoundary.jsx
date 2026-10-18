import { Component } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

// NFR-03 / SCRUM-191. If any page throws while rendering, React would
// otherwise unmount the whole app and leave a blank screen. This catches it
// and shows a plain message with a way out instead - never the error itself,
// its stack or component names.
//
// Recovery stays inside the app: the login lives only in memory
// (AuthContext), so a full page reload would sign the user out. "Return to
// dashboard" navigates instead, and moving to any other page clears the
// error, so the boundary never gets stuck on a page that has since changed.
// It reuses the AccessDenied page's styling rather than adding new styles.
class ErrorBoundaryInner extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidUpdate(previousProps) {
    if (this.state.hasError && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="access-denied" role="alert">
        <h1 className="access-denied__title">Something went wrong</h1>
        <p className="access-denied__message">
          This page ran into a problem and could not be shown. Your work has not been
          changed. You can try again, or go back to your dashboard.
        </p>
        <button type="button" className="access-denied__back" onClick={() => this.setState({ hasError: false })}>
          Try again
        </button>
        <button type="button" className="access-denied__back" onClick={this.props.onReturnToDashboard}>
          Return to dashboard
        </button>
      </div>
    );
  }
}

export default function ErrorBoundary({ children }) {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <ErrorBoundaryInner resetKey={location.pathname} onReturnToDashboard={() => navigate('/dashboard')}>
      {children}
    </ErrorBoundaryInner>
  );
}
