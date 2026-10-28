import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';

export default function Register() {
	const [f, setF] = useState({ name: '', email: '', phone: '', password: '' });
	const [err, setErr] = useState('');
	const [submitted, setSubmitted] = useState(false);

	const submit = async (e) => {
		e.preventDefault();
		try {
			const { data } = await api.post('/auth/register', f);
			setSubmitted(true);
			setErr(data.message || 'Registration submitted for bank approval.');
		} catch (error) {
			setErr(error.response?.data?.message || 'Registration failed');
		}
	};

	if (submitted) {
		return (
			<div className="auth">
				<section className="card registration-pending">
					<span className="eyebrow">APPLICATION RECEIVED</span>
					<h1>Waiting for bank approval</h1>
					<p>{err}</p>
					<p>You can sign in with this email and password after a bank owner or manager approves your registration.</p>
					<Link className="registration-login-link" to="/login">Return to sign in</Link>
				</section>
			</div>
		);
	}

	return (
		<div className="auth">
			<form onSubmit={submit} className="card">
				<h1>Create Customer Account</h1>
				{err && <p className="err" role="alert">{err}</p>}
				<input placeholder="Full name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
				<input type="email" placeholder="Email address" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required />
				<input type="tel" placeholder="Phone (optional)" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
				<input type="password" autoComplete="new-password" placeholder="Password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required />
				<button type="submit">Create account</button>
				<p>Already a customer? <Link to="/login">Sign in</Link></p>
				<p className="staff-login-note">
					Bank staff cannot register publicly. <Link to="/login" state={{ mode: 'staff' }}>Sign in as owner or manager</Link> with assigned credentials.
				</p>
			</form>
		</div>
	);
}
