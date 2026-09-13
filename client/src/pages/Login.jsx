import LoginForm from '../components/auth/LoginForm.jsx';

export default function Login() {
  return (
    <main className="login-page">
      <section className="login-brand">
        <div className="login-brand__content">
          <h1 className="login-brand__logo">BIX</h1>

          <p className="login-brand__tagline">
            Task coordination for teams that move work through
            <br />
            stages, together.
          </p>

          <div className="login-brand__divider" />

          <div className="login-brand__boards" aria-hidden="true">
            <div className="mini-board">
              <div className="mini-board__header" />
              <div className="mini-board__dots">
                <span />
                <span />
                <span />
                <span />
              </div>
              <div className="mini-board__card" />
              <div className="mini-board__card" />
            </div>

            <div className="mini-board">
              <div className="mini-board__header" />
              <div className="mini-board__dots">
                <span />
                <span />
                <span />
                <span />
              </div>
              <div className="mini-board__card" />
              <div className="mini-board__card" />
              <div className="mini-board__card" />
            </div>

            <div className="mini-board">
              <div className="mini-board__header" />
              <div className="mini-board__dots">
                <span />
                <span />
                <span />
                <span />
              </div>
              <div className="mini-board__card" />
            </div>

            <div className="mini-board">
              <div className="mini-board__header" />
              <div className="mini-board__dots">
                <span />
                <span />
                <span />
                <span />
              </div>
              <div className="mini-board__card" />
              <div className="mini-board__card" />
            </div>
          </div>
        </div>
      </section>

      <section className="login-panel">
        <LoginForm />
      </section>
    </main>
  );
}