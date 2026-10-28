import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children, allowedRoles, redirectTo = '/' }) {
	const { user, checkingSession } = useAuth();
	if (checkingSession) return <div className="auth-loading">Checking account access...</div>;
	if (!user) return <Navigate to="/login" replace />;
	if (allowedRoles && !allowedRoles.includes(user.role || 'USER')) {
		return <Navigate to={redirectTo} replace />;
	}
	return children;
}
