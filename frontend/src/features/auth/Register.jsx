import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { registerUser } from "./authSlice";
import ThemeToggle from "../theme/ThemeToggle";

export default function Register() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { loading, error } = useSelector((state) => state.auth);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", organizationName: "" });

  const handleChange = (event) => {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const result = await dispatch(registerUser(form));
    if (registerUser.fulfilled.match(result)) navigate(result.payload.token ? "/" : "/login");
  };

  return (
    <main className="auth-page">
      <div className="auth-top-actions"><ThemeToggle /></div>
      <section className="auth-layout register-layout">
        <aside className="auth-showcase">
          <div className="auth-showcase-brand"><span className="brand-mark">K</span><span>KanbanFlow</span></div>
          <div className="auth-showcase-copy">
            <span className="showcase-kicker"><span className="live-dot" /> MAKE SPACE FOR PROGRESS</span>
            <h1>One workspace. <em>Infinite momentum.</em></h1>
            <p>Start with a clear view of your work. Invite your team, organize the moving pieces, and make progress visible.</p>
            <div className="register-benefits">
              <div><span>✓</span><p><b>Everything in one place</b><small>Boards, tasks, and team activity together.</small></p></div>
              <div><span>✓</span><p><b>Stay in sync</b><small>See changes as your team makes them.</small></p></div>
              <div><span>✓</span><p><b>Work your way</b><small>Switch between light and dark themes.</small></p></div>
            </div>
          </div>
          <div className="auth-showcase-footer"><span>✦</span> Your next chapter starts here.</div>
        </aside>

        <div className="auth-form-side">
          <form className="auth-card register-card" onSubmit={handleSubmit}>
            <div className="auth-mobile-brand"><span className="brand-mark">K</span><b>KanbanFlow</b></div>
            <span className="eyebrow">GET STARTED — IT'S FREE</span>
            <h2>Create your workspace</h2>
            <p className="auth-description">A few details and you're ready to bring your team together.</p>
            {error && <div className="alert error" role="alert">{error}</div>}

            <label htmlFor="register-name">Your name</label>
            <input id="register-name" name="name" value={form.name} onChange={handleChange} placeholder="e.g. Sameer Md" autoComplete="name" required />

            <label htmlFor="register-email">Work email</label>
            <input id="register-email" type="email" name="email" value={form.email} onChange={handleChange} placeholder="name@company.com" autoComplete="email" required />

            <label htmlFor="register-organization">Organization name</label>
            <input id="register-organization" name="organizationName" value={form.organizationName} onChange={handleChange} placeholder="e.g. Acme Studio" required />

            <label htmlFor="register-password">Create password</label>
            <div className="password-field">
              <input id="register-password" type={showPassword ? "text" : "password"} name="password" value={form.password} onChange={handleChange} minLength={8} placeholder="At least 8 characters" autoComplete="new-password" required />
              <button type="button" className="password-toggle" onClick={() => setShowPassword((value) => !value)}>{showPassword ? "Hide" : "Show"}</button>
            </div>
            <p className="field-hint">Use at least 8 characters for a stronger password.</p>

            <button className="primary-button auth-submit" disabled={loading}>{loading ? <><span className="button-spinner"/> Creating workspace...</> : <>Create account <span>→</span></>}</button>
            <p className="auth-switch">Already have an account? <Link to="/login">Sign in <span>→</span></Link></p>
            <div className="auth-secure-note"><span>◈</span> Your workspace is private and secure</div>
          </form>
        </div>
      </section>
    </main>
  );
}
