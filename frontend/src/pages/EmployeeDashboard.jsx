import { useEffect, useState } from 'react';
import { BriefcaseBusiness, LogOut, ShieldCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

export default function EmployeeDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [employee, setEmployee] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api.get('/employee/me')
      .then(({ data }) => active && setEmployee(data))
      .catch((requestError) => active && setError(requestError.response?.data?.message || 'Could not load employee dashboard'));
    return () => { active = false; };
  }, []);

  const signOut = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <main className="management-main employee-portal">
      <header className="management-header">
        <div><span className="eyebrow">AN BANK · EMPLOYEE PORTAL</span><h1>{employee?.name || user?.name || 'Employee dashboard'}</h1></div>
        <button type="button" className="employee-sign-out" onClick={signOut}><LogOut size={16} />Sign out</button>
      </header>
      <div className="management-content">
        {error && <div className="management-alert error" role="alert">{error}</div>}
        <div className="management-page-intro"><div><h2>Employee dashboard</h2><p>Your staff profile and current employment information.</p></div>{employee && <span className="status-tag active"><ShieldCheck size={14} /> {employee.status}</span>}</div>
        {employee && <>
          <div className="management-stats">
            <article><span>Employee code</span><strong>{employee.employeeCode}</strong><small>Assigned staff ID</small></article>
            <article><span>Department</span><strong>{employee.department}</strong><small>{employee.jobTitle}</small></article>
            <article><span>Performance score</span><strong>{employee.performanceScore}/100</strong><small>Current review score</small></article>
          </div>
          <section className="management-panel employee-profile-panel">
            <div className="management-panel-heading"><div><h2><BriefcaseBusiness size={18} /> Profile</h2><p>Contact details on file with the bank.</p></div></div>
            <dl className="application-details">
              <div><dt>Work email</dt><dd>{employee.email}</dd></div>
              <div><dt>Phone</dt><dd>{employee.phone || 'Not provided'}</dd></div>
              <div><dt>Role</dt><dd>{user?.role === 'MANAGER' ? 'Manager' : 'Employee'}</dd></div>
              <div><dt>Joined</dt><dd>{new Date(employee.createdAt).toLocaleDateString()}</dd></div>
            </dl>
          </section>
        </>}
        {!employee && !error && <section className="management-panel empty-cell">Loading employee profile...</section>}
      </div>
    </main>
  );
}