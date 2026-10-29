import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

const STAFF_ROLES = ['OWNER', 'ADMIN', 'MANAGER', 'EMPLOYEE'];

export default function Login() {
	const location = useLocation();
	const [roleMode, setRoleMode] = useState(location.state?.mode === 'staff' ? 'staff' : 'customer');
	const [f, setF] = useState(() => ({
		email: location.state?.mode === 'staff' ? '' : 'demo@bank.com',
		password: location.state?.mode === 'staff' ? '' : '123456',
	}));
	const [err, setErr] = useState('');
	const { login } = useAuth();
	const nav = useNavigate();

	const chooseMode = (mode) => {
		setRoleMode(mode);
		setF({ email: '', password: '' });
		setErr('');
	};

	const submit = async (e) => {
		e.preventDefault();
		setErr('');
		try {
			const { data } = await api.post('/auth/login', {
				username: f.email.trim().toLowerCase(),
				password: f.password,
			});
			const isStaff = STAFF_ROLES.includes(data.user.role);
			if ((roleMode === 'staff') !== isStaff) {
				setErr(roleMode === 'staff'
					? 'These credentials are not for a bank staff account.'
					: 'This is a staff account. Choose Bank Staff sign in.');
				return;
			}

			login(data);
			nav(data.user.role === 'EMPLOYEE' ? '/employee' : data.user.role === 'MANAGER' ? '/management/employees' : isStaff ? '/management' : '/');
		} catch (error) {
			setErr(error.response?.data?.message || 'Login failed');
		}
	};

	return (
		<div className="auth">
			<form onSubmit={submit} className="card">
				<h1>E-Bank Sign In</h1>
				<div className="auth-mode-switch" role="group" aria-label="Choose sign-in type">
					<button
						type="button"
						className={roleMode === 'customer' ? 'active' : ''}
						aria-pressed={roleMode === 'customer'}
						onClick={() => chooseMode('customer')}
					>
						Customer
					</button>
					<button
						type="button"
						className={roleMode === 'staff' ? 'active' : ''}
						aria-pressed={roleMode === 'staff'}
						onClick={() => chooseMode('staff')}
					>
						Bank Staff
					</button>
				</div>
				{err && <p className="err" role="alert">{err}</p>}
				{roleMode === 'staff' && (
					<p className="staff-login-note">
						Use the username and password assigned by your bank owner.
					</p>
				)}
				<input
					type="text"
					autoComplete="username"
					placeholder="Username or email"
					value={f.email}
					onChange={(e) => setF({ ...f, email: e.target.value })}
					required
				/>
				<input
					type="password"
					autoComplete="current-password"
					placeholder="Password"
					value={f.password}
					onChange={(e) => setF({ ...f, password: e.target.value })}
					required
				/>
				<button type="submit">Sign in</button>
				{roleMode === 'customer' ? (
					<p>New to E-Bank? <Link to="/register">Create a customer account</Link></p>
				) : (
					<p>Need a customer account? <button className="auth-text-button" type="button" onClick={() => chooseMode('customer')}>Customer sign in</button></p>
				)}
				{roleMode === 'customer' && <small>Demo customer: demo@bank.com / 123456</small>}
			</form>
		</div>
	);
}
