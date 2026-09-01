import { Component, type ErrorInfo, type ReactNode } from "react";
import { Link } from "react-router-dom";

type OwnerLegalErrorBoundaryProps = {
  children: ReactNode;
};

type OwnerLegalErrorBoundaryState = {
  failed: boolean;
};

export class OwnerLegalErrorBoundary extends Component<OwnerLegalErrorBoundaryProps, OwnerLegalErrorBoundaryState> {
  state: OwnerLegalErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): OwnerLegalErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // The fallback deliberately avoids exposing technical details in the owner UI.
  }

  render() {
    if (this.state.failed) {
      return (
        <section className="card settings-detail-card" role="alert">
          <h1>Diese Seite konnte nicht geladen werden.</h1>
          <p className="muted">Bitte versuche es erneut. Deine gespeicherten Einstellungen bleiben unverändert.</p>
          <div className="owner-legal-actions">
            <button className="button" onClick={() => this.setState({ failed: false })} type="button">Erneut versuchen</button>
            <Link className="button secondary" to="/admin">Zum Dashboard</Link>
          </div>
        </section>
      );
    }

    return this.props.children;
  }
}
