import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { loginUser } from "./authSlice";
import ThemeToggle from "../theme/ThemeToggle";

export default function Login() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { loading, error } = useSelector((state) => state.auth);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ email: "", password: "" });

  const handleChange = (event) => {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const result = await dispatch(loginUser(form));
    if (loginUser.fulfilled.match(result)) navigate("/");
  };

  return (
    <main className="auth-page">
      <div className="auth-top-actions"><ThemeToggle /></div>
      <section className="auth-layout">
        <aside className="auth-showcase">
          <div className="auth-showcase-brand"><span className="brand-mark">K</span><span>KanbanFlow</span></div>
          <div className="auth-showcase-copy">
            <span className="showcase-kicker"><span className="live-dot" /> YOUR TEAM, IN SYNC</span>
            <h1>Great work happens when everything <em>flows.</em></h1>
            <p>Bring your projects, people, and priorities together in one beautifully organized workspace.</p>
            <div className="showcase-preview" aria-hidden="true">
              <div className="preview-top"><span /><span /><span /><b>Team workspace</b><i>•••</i></div>
              <div className="preview-columns">
                <div><small>TO DO</small><article><i className="preview-line purple"/><b>Plan product launch</b><span>Design the rollout plan</span><footer><i/> <i/> <small>Today</small></footer></article><article><i className="preview-line orange"/><b>Review feedback</b><span>Collect team notes</span></article></div>
                <div><small>IN PROGRESS</small><article><i className="preview-line blue"/><b>Build dashboard</b><span>Polish the experience</span><footer><i/> <i/> <small>2 days</small></footer></article></div>
                <div><small>DONE</small><article><i className="preview-line green"/><b>Project kickoff</b><span>Everyone aligned</span><footer><i/> <small>Done</small></footer></article></div>
              </div>
            </div>
          </div>
          <div className="auth-showcase-footer"><span>✦</span> A calmer way to get work done.</div>
        </aside>

        <div className="auth-form-side">
          <form className="auth-card" onSubmit={handleSubmit}>
            <div className="auth-mobile-brand"><span className="brand-mark">K</span><b>KanbanFlow</b></div>
            <span className="eyebrow">WELCOME BACK</span>
            <h2>Sign in to your workspace</h2>
            <p className="auth-description">Pick up where you left off. Your team is waiting.</p>
            {error && <div className="alert error" role="alert">{error}</div>}

            <label htmlFor="login-email">Email address</label>
            <input id="login-email" type="email" name="email" value={form.email} onChange={handleChange} placeholder="name@company.com" autoComplete="email" required />

            <div className="password-label-row"><label htmlFor="login-password">Password</label></div>
            <div className="password-field">
              <input id="login-password" type={showPassword ? "text" : "password"} name="password" value={form.password} onChange={handleChange} placeholder="Enter your password" autoComplete="current-password" required />
              <button type="button" className="password-toggle" onClick={() => setShowPassword((value) => !value)}>{showPassword ? "Hide" : "Show"}</button>
            </div>

            <button className="primary-button auth-submit" disabled={loading}>{loading ? <><span className="button-spinner"/> Signing in...</> : <>Sign in <span>→</span></>}</button>
            <p className="auth-switch">New to KanbanFlow? <Link to="/register">Create an account <span>→</span></Link></p>
            <div className="auth-secure-note"><span>◈</span> Your workspace is private and secure</div>
          </form>
        </div>
      </section>
    </main>
  );
}
