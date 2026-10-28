import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  BadgeDollarSign,
  Building2,
  ClipboardList,
  ClipboardCheck,
  LayoutDashboard,
  LogOut,
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  Eye,
  Search,
  ShieldCheck,
  Users,
  UserCheck,
  WalletCards,
  HandCoins,
  X,
} from 'lucide-react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

const emptyEmployee = {
  employeeCode: '',
  name: '',
  email: '',
  phone: '',
  jobTitle: '',
  department: '',
  monthlySalary: '',
  performanceScore: 50,
};

const navItems = [
  { id: 'overview', label: 'Overview', path: '/management', icon: LayoutDashboard },
  { id: 'employees', label: 'Employees', path: '/management/employees', icon: Users },
  { id: 'customer-approvals', label: 'Customer approvals', path: '/management/customer-approvals', icon: UserCheck },
  { id: 'accounts', label: 'Customer accounts', path: '/management/accounts', icon: WalletCards },
  { id: 'applications', label: 'Applications', path: '/management/applications', icon: ClipboardCheck },
  { id: 'loans', label: 'Loan review', path: '/management/loans', icon: HandCoins },
  { id: 'transactions', label: 'Transactions', path: '/management/transactions', icon: ArrowLeftRight },
  { id: 'payroll', label: 'Payroll review', path: '/management/payroll', icon: BadgeDollarSign, ownerOnly: true },
  { id: 'audit', label: 'Audit history', path: '/management/audit', icon: ClipboardList, ownerOnly: true },
];

const currency = (value) => `৳${Number(value || 0).toLocaleString()}`;

export default function Management() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isOwner = ['OWNER', 'ADMIN'].includes(user?.role);
  const section = location.pathname.endsWith('/employees')
    ? 'employees'
    : location.pathname.endsWith('/customer-approvals')
      ? 'customer-approvals'
    : location.pathname.endsWith('/accounts')
      ? 'accounts'
      : location.pathname.endsWith('/applications')
        ? 'applications'
        : location.pathname.endsWith('/loans')
          ? 'loans'
        : location.pathname.endsWith('/transactions')
          ? 'transactions'
    : location.pathname.endsWith('/payroll')
      ? 'payroll'
      : location.pathname.endsWith('/audit')
        ? 'audit'
        : 'overview';
  const [overview, setOverview] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [accountActivity, setAccountActivity] = useState(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [freezeSettings, setFreezeSettings] = useState({});
  const [transactions, setTransactions] = useState([]);
  const [applications, setApplications] = useState([]);
  const [loanApplications, setLoanApplications] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [registrationNotes, setRegistrationNotes] = useState({});
  const [applicationNotes, setApplicationNotes] = useState({});
  const [loanNotes, setLoanNotes] = useState({});
  const [adjustments, setAdjustments] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [search, setSearch] = useState('');
  const [showEmployeeForm, setShowEmployeeForm] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState('');
  const [employeeForm, setEmployeeForm] = useState(emptyEmployee);
  const [deductionForm, setDeductionForm] = useState({ amount: '', reason: '', payrollPeriod: new Date().toISOString().slice(0, 7) });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isOwner && ['payroll', 'audit'].includes(section)) {
      navigate('/management/employees', { replace: true });
    }
  }, [isOwner, navigate, section]);

  useEffect(() => {
    let active = true;
    api.get('/management/employees', { params: { search } })
      .then(({ data }) => {
        if (!active) return;
        setEmployees(data);
        setSelectedEmployee((current) => current || data[0]?.id || '');
      })
      .catch((e) => active && setError(e.response?.data?.message || 'Could not load employee records'));
    return () => { active = false; };
  }, [search]);

  useEffect(() => {
    let active = true;
    const requests = [];
    if (section === 'overview') requests.push(api.get('/management/overview').then(({ data }) => active && setOverview(data)));
    if (section === 'accounts') requests.push(api.get('/management/accounts', { params: { search } }).then(({ data }) => active && setAccounts(data)));
    if (section === 'transactions') requests.push(api.get('/management/transactions').then(({ data }) => active && setTransactions(data)));
    if (section === 'applications') requests.push(api.get('/management/applications').then(({ data }) => active && setApplications(data)));
    if (section === 'loans') requests.push(api.get('/management/loans').then(({ data }) => active && setLoanApplications(data)));
    if (section === 'customer-approvals') requests.push(api.get('/management/customer-registrations').then(({ data }) => active && setRegistrations(data)));
    if (isOwner && section === 'audit') requests.push(api.get('/management/audit-logs').then(({ data }) => active && setAuditLogs(data)));
    if (isOwner && section === 'payroll' && selectedEmployee) {
      requests.push(api.get(`/management/employees/${selectedEmployee}/adjustments`).then(({ data }) => active && setAdjustments(data)));
    }
    Promise.all(requests).catch((e) => active && setError(e.response?.data?.message || 'Could not load management data'));
    return () => { active = false; };
  }, [isOwner, section, selectedEmployee, search]);

  const updateEmployeeForm = (event) => {
    const { name, value } = event.target;
    setEmployeeForm((current) => ({ ...current, [name]: value }));
  };

  const startCreateEmployee = () => {
    setEditingEmployee('');
    setEmployeeForm(emptyEmployee);
    setShowEmployeeForm(true);
    setError('');
    setNotice('');
  };

  const startEditEmployee = (employee) => {
    setEditingEmployee(employee.id);
    setEmployeeForm({
      employeeCode: employee.employeeCode,
      name: employee.name,
      email: employee.email,
      phone: employee.phone || '',
      jobTitle: employee.jobTitle,
      department: employee.department,
      monthlySalary: employee.monthlySalary,
      performanceScore: employee.performanceScore,
      status: employee.status,
    });
    setShowEmployeeForm(true);
    setError('');
    setNotice('');
  };

  const saveEmployee = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (editingEmployee) {
        const { employeeCode, ...updates } = employeeForm;
        await api.patch(`/management/employees/${editingEmployee}`, updates);
        setNotice('Employee record updated.');
      } else {
        await api.post('/management/employees', employeeForm);
        setNotice('Employee added to the directory.');
      }
      setShowEmployeeForm(false);
      setEditingEmployee('');
      const { data } = await api.get('/management/employees', { params: { search } });
      setEmployees(data);
    } catch (e) {
      setError(e.response?.data?.message || 'Could not save employee');
    } finally {
      setBusy(false);
    }
  };

  const submitDeduction = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api.post(`/management/employees/${selectedEmployee}/adjustments`, deductionForm);
      const { data } = await api.get(`/management/employees/${selectedEmployee}/adjustments`);
      setAdjustments(data);
      setDeductionForm((current) => ({ ...current, amount: '', reason: '' }));
      setNotice('Payroll deduction recorded as pending owner approval.');
    } catch (e) {
      setError(e.response?.data?.message || 'Could not record payroll deduction');
    } finally {
      setBusy(false);
    }
  };

  const approveAdjustment = async (id) => {
    setBusy(true);
    setError('');
    try {
      await api.post(`/management/adjustments/${id}/approve`);
      const { data } = await api.get(`/management/employees/${selectedEmployee}/adjustments`);
      setAdjustments(data);
      setNotice('Payroll adjustment approved and added to the audit history.');
    } catch (e) {
      setError(e.response?.data?.message || 'Could not approve payroll adjustment');
    } finally {
      setBusy(false);
    }
  };

  const decideApplication = async (application, decision) => {
    const note = applicationNotes[application.id] || '';
    if (decision === 'REJECTED' && note.trim().length < 5) {
      setError('Add a short reason before rejecting this application.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api.post(`/management/applications/${application.id}/decision`, { decision, note });
      const { data } = await api.get('/management/applications');
      setApplications(data);
      setNotice(decision === 'APPROVED' ? 'Application approved and account opened.' : 'Application rejected with a recorded reason.');
    } catch (e) {
      setError(e.response?.data?.message || 'Could not review account application');
    } finally {
      setBusy(false);
    }
  };

  const decideLoan = async (application, decision) => {
    const note = loanNotes[application.id] || '';
    if (decision === 'REJECTED' && note.trim().length < 5) {
      setError('Add a short reason before rejecting this loan application.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api.post(`/management/loans/${application.id}/decision`, { decision, note });
      const { data } = await api.get('/management/loans');
      setLoanApplications(data);
      setNotice(isOwner
        ? `Loan application ${decision.toLowerCase()} by owner.`
        : decision === 'APPROVED'
          ? 'Loan application forwarded to the owner for final approval.'
          : 'Loan application rejected with a recorded reason.');
    } catch (e) {
      setError(e.response?.data?.message || 'Could not review loan application');
    } finally {
      setBusy(false);
    }
  };

  const setAccountStatus = async (account, freeze) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (freeze) {
        const settings = freezeSettings[account.id] || {};
        await api.post(`/management/accounts/${account.id}/freeze`, {
          durationMinutes: settings.durationMinutes ? Number(settings.durationMinutes) : null,
          reason: settings.reason || '',
        });
      } else {
        await api.post(`/management/accounts/${account.id}/enable`);
      }
      const { data } = await api.get('/management/accounts', { params: { search } });
      setAccounts(data);
      setNotice(freeze ? `Account ${account.accountNumber} temporarily disabled.` : `Account ${account.accountNumber} enabled.`);
    } catch (e) {
      setError(e.response?.data?.message || 'Could not update account status');
    } finally {
      setBusy(false);
    }
  };

  const loadAccountActivity = async (account, page = 1) => {
    setActivityLoading(true);
    setError('');
    setAccountActivity({
      account,
      customer: {
        ...account.user,
        role: 'USER',
        approvalStatus: account.user.approvalStatus || 'ACTIVE',
        approvalNote: null,
        approvalReviewedAt: null,
        approvalReviewedBy: null,
        closedAt: null,
        createdAt: account.user.createdAt || account.createdAt,
        accounts: [{ ...account, cards: [] }],
        applications: [],
      },
      transactions: [],
      transactionTypes: [],
      totalTransactions: 0,
      page,
      totalPages: 1,
    });
    try {
      const { data } = await api.get(`/management/accounts/${account.id}/activity`, { params: { page } });
      setAccountActivity(data);
    } catch (e) {
      setError(e.response?.data?.message || 'Could not load account transaction history');
      setAccountActivity(null);
    } finally {
      setActivityLoading(false);
    }
  };

  const decideRegistration = async (registration, decision) => {
    const note = registrationNotes[registration.id] || '';
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api.post(`/management/customer-registrations/${registration.id}/decision`, { decision, note });
      const { data } = await api.get('/management/customer-registrations');
      setRegistrations(data);
      setNotice(decision === 'APPROVED' ? `${registration.name} can now sign in and request an account.` : `${registration.name}'s registration was rejected.`);
    } catch (e) {
      setError(e.response?.data?.message || 'Could not review customer registration');
    } finally {
      setBusy(false);
    }
  };

  const permanentlyRemoveCustomer = async (registration) => {
    const confirmed = window.confirm(`Permanently remove ${registration.name} and all linked accounts, transactions, applications, and customer data? This cannot be undone.`);
    if (!confirmed) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api.delete(`/management/customers/${registration.id}/permanent`);
      const { data } = await api.get('/management/customer-registrations');
      setRegistrations(data);
      setNotice('Customer and linked data were permanently removed. The action is recorded in the audit history.');
    } catch (e) {
      setError(e.response?.data?.message || 'Could not permanently remove customer data');
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const currentTitle = navItems.find((item) => item.id === section)?.label || 'Overview';
  const currentEmployee = employees.find((employee) => employee.id === selectedEmployee);

  return (
    <div className="management-shell">
      <aside className="management-sidebar">
        <div className="management-brand"><span><Building2 size={22} /></span><div><strong>AN Bank</strong><small>Management</small></div></div>
        <div className="management-role"><ShieldCheck size={15} />{isOwner ? 'Owner access' : 'Manager review access'}</div>
        <nav className="management-nav" aria-label="Management navigation">
          {navItems.filter((item) => isOwner || !item.ownerOnly).map((item) => {
            const Icon = item.icon;
            return <button key={item.id} className={section === item.id ? 'active' : ''} onClick={() => navigate(item.path)}><Icon size={18} /><span>{item.label}</span></button>;
          })}
        </nav>
        <div className="management-user"><div className="management-avatar">{user?.name?.[0]?.toUpperCase() || 'U'}</div><div><strong>{user?.name}</strong><small>{user?.email}</small></div></div>
        <button className="management-logout" onClick={handleLogout}><LogOut size={17} />Sign out</button>
      </aside>

      <main className="management-main">
        <header className="management-header"><div><span className="eyebrow">AN BANK · MANAGEMENT</span><h1>{currentTitle}</h1></div><div className="management-header-user">{isOwner ? 'Owner workspace' : 'Manager workspace'}</div></header>
        <div className="management-content">
          {error && <div className="management-alert error" role="alert">{error}</div>}
          {notice && <div className="management-alert success" role="status">{notice}</div>}

          {section === 'overview' && (
            <>
              <div className="management-page-intro"><div><h2>Institution snapshot</h2><p>Customer accounts, deposits and activity across the bank.</p></div><span className="live-indicator">Management data</span></div>
              <div className="management-stats">
                <article><span>Employees</span><strong>{overview?.employees ?? '—'}</strong><small>{overview?.activeEmployees ?? 0} active</small></article>
                <article><span>Customers</span><strong>{overview?.customers ?? '—'}</strong><small>{overview?.pendingCustomers ?? 0} pending approval</small></article>
                <article><span>Customer accounts</span><strong>{overview?.accounts ?? '—'}</strong><small>Across all account holders</small></article>
                <article><span>Account balances</span><strong>{overview ? currency(overview.totalBalance) : '—'}</strong><small>Aggregate ledger balance</small></article>
                <article><span>Transactions</span><strong>{overview?.transactions ?? '—'}</strong><small>Recorded transaction count</small></article>
              </div>
              <section className="management-panel">
                <div className="management-panel-heading"><div><h2>Recent customer activity</h2><p>Latest entries in the transaction ledger.</p></div><Activity size={20} /></div>
                <div className="management-table-wrap"><table className="management-table"><thead><tr><th>Customer</th><th>Account</th><th>Type</th><th>Amount</th><th>Recorded</th></tr></thead><tbody>
                  {(overview?.recentTransactions || []).map((transaction) => <tr key={transaction.id}><td><strong>{transaction.account.user.name}</strong><small>{transaction.account.user.email}</small></td><td>{transaction.account.accountNumber}</td><td><span className="status-tag">{transaction.type.replace('_', ' ')}</span></td><td>{currency(transaction.amount)}</td><td>{new Date(transaction.createdAt).toLocaleString()}</td></tr>)}
                  {!overview?.recentTransactions?.length && <tr><td colSpan="5" className="empty-cell">No transactions recorded yet.</td></tr>}
                </tbody></table></div>
              </section>
              <section className="management-panel"><div className="management-panel-heading"><div><h2>Transaction totals</h2><p>Aggregate amounts by transaction type.</p></div><Activity size={20} /></div><div className="management-type-list">{(overview?.transactionTypes || []).map((item) => <div key={item.type}><span>{item.type.replace('_', ' ')}</span><strong>{currency(item._sum.amount)}</strong><small>{item._count._all} transactions</small></div>)}</div></section>
            </>
          )}

          {section === 'employees' && (
            <>
              <div className="management-page-intro"><div><h2>Employee directory</h2><p>{isOwner ? 'Manage staff details and review performance.' : 'Staff information available in read-only mode.'}</p></div>{isOwner && <button onClick={startCreateEmployee}><Users size={17} />Add employee</button>}</div>
              <div className="management-toolbar"><label className="management-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, code, department" /></label><span>{employees.length} employees</span></div>
              {showEmployeeForm && isOwner && <form className="management-panel management-form" onSubmit={saveEmployee}>
                <div className="management-panel-heading"><div><h2>{editingEmployee ? 'Update employee' : 'Add employee'}</h2><p>Access to this record is restricted by role.</p></div><button className="button-secondary" type="button" onClick={() => setShowEmployeeForm(false)}>Cancel</button></div>
                <div className="management-form-grid">
                  {!editingEmployee && <label>Employee code<input name="employeeCode" value={employeeForm.employeeCode} onChange={updateEmployeeForm} required /></label>}
                  <label>Full name<input name="name" value={employeeForm.name} onChange={updateEmployeeForm} required /></label>
                  <label>Work email<input type="email" name="email" value={employeeForm.email} onChange={updateEmployeeForm} required /></label>
                  <label>Phone<input name="phone" value={employeeForm.phone} onChange={updateEmployeeForm} /></label>
                  <label>Job title<input name="jobTitle" value={employeeForm.jobTitle} onChange={updateEmployeeForm} required /></label>
                  <label>Department<input name="department" value={employeeForm.department} onChange={updateEmployeeForm} required /></label>
                  <label>Monthly salary<input type="number" min="0" step="0.01" name="monthlySalary" value={employeeForm.monthlySalary} onChange={updateEmployeeForm} required /></label>
                  <label>Performance score (0-100)<input type="number" min="0" max="100" name="performanceScore" value={employeeForm.performanceScore} onChange={updateEmployeeForm} required /></label>
                  {editingEmployee && <label>Status<select name="status" value={employeeForm.status} onChange={updateEmployeeForm}><option value="ACTIVE">Active</option><option value="ON_LEAVE">On leave</option><option value="INACTIVE">Inactive</option></select></label>}
                </div>
                <button type="submit" disabled={busy}>{busy ? 'Saving...' : editingEmployee ? 'Save employee' : 'Create employee'}</button>
              </form>}
              <section className="management-panel"><div className="management-table-wrap"><table className="management-table"><thead><tr><th>Employee</th><th>Department</th><th>Performance</th><th>Status</th>{isOwner && <><th>Monthly salary</th><th>Contact</th><th></th></>}</tr></thead><tbody>
                {employees.map((employee) => <tr key={employee.id}><td><strong>{employee.name}</strong><small>{employee.employeeCode} · {employee.jobTitle}</small></td><td>{employee.department}</td><td><div className="score-meter"><span style={{ width: `${employee.performanceScore}%` }} /> </div><small>{employee.performanceScore}/100</small></td><td><span className={`status-tag ${employee.status.toLowerCase()}`}>{employee.status.replace('_', ' ')}</span></td>{isOwner && <><td>{currency(employee.monthlySalary)}</td><td><strong>{employee.email}</strong><small>{employee.phone || 'No phone'}</small></td><td><button className="table-action" onClick={() => startEditEmployee(employee)}>Edit</button></td></>}</tr>)}
                {!employees.length && <tr><td colSpan={isOwner ? 7 : 4} className="empty-cell">No employee records found. Add employees to start the directory.</td></tr>}
              </tbody></table></div></section>
            </>
          )}

          {section === 'customer-approvals' && (
            <>
              <div className="management-page-intro"><div><h2>Customer registrations</h2><p>Approve access before a new customer can sign in or request an account.</p></div><span className="status-tag pending">{registrations.filter((registration) => registration.approvalStatus === 'PENDING').length} pending</span></div>
              <div className="registration-list">
                {registrations.map((registration) => (
                  <article className="management-panel registration-card" key={registration.id}>
                    <div className="registration-card-heading"><div><span className="eyebrow">Registered {new Date(registration.createdAt).toLocaleString()}</span><h2>{registration.name}</h2><p>{registration.email}{registration.phone ? ` · ${registration.phone}` : ''}</p></div><span className={`status-tag ${registration.approvalStatus.toLowerCase()}`}>{registration.approvalStatus}</span></div>
                    {registration.approvalStatus === 'PENDING' ? <div className="registration-review-actions"><label>Review note (optional)<input value={registrationNotes[registration.id] || ''} onChange={(event) => setRegistrationNotes((current) => ({ ...current, [registration.id]: event.target.value }))} placeholder="Optional note for rejection" maxLength="300" /></label><div><button type="button" disabled={busy} onClick={() => decideRegistration(registration, 'APPROVED')}>Approve access</button><button type="button" className="button-danger" disabled={busy} onClick={() => decideRegistration(registration, 'REJECTED')}>Reject</button></div></div> : <p className="application-reviewer">Reviewed by {registration.approvalReviewedBy?.name || 'Bank staff'} · {registration.approvalNote || registration.approvalStatus}</p>}
                    {isOwner && <div className="registration-delete-actions"><button type="button" className="button-danger" disabled={busy} onClick={() => permanentlyRemoveCustomer(registration)}>Permanently remove customer and all data</button></div>}
                  </article>
                ))}
                {!registrations.length && <section className="management-panel empty-cell">No customer registrations yet.</section>}
              </div>
            </>
          )}

          {section === 'accounts' && (
            <>
              <div className="management-page-intro"><div><h2>Customer accounts</h2><p>Balances and recent activity for accounts held at the bank.</p></div></div>
              <div className="management-toolbar"><label className="management-search"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search customer or account number" /></label><span>{accounts.length} accounts</span></div>
              <section className="management-panel"><div className="management-table-wrap"><table className="management-table account-management-table"><thead><tr><th>Customer</th><th>Account</th><th>Type</th><th>Balance</th><th>Status</th><th>Latest transaction</th><th>Activity</th>{isOwner && <th>Account access</th>}</tr></thead><tbody>
                {accounts.map((account) => <tr key={account.id}><td><strong>{account.user.name}{account.employee && <span className="employee-link-tag">Employee</span>}</strong><small>{account.user.email} · {account.user.phone || 'No phone'}</small>{account.employee && <small>{account.employee.employeeCode} · {account.employee.department}</small>}</td><td>{account.accountNumber}</td><td>{account.type}</td><td>{currency(account.balance)}</td><td><span className={`status-tag ${account.status.toLowerCase()}`}>{account.status}</span>{account.status === 'FROZEN' && <small>{account.frozenUntil ? `Until ${new Date(account.frozenUntil).toLocaleString()}` : 'No automatic expiry'}{account.statusReason ? ` · ${account.statusReason}` : ''}</small>}</td><td>{account.transactions[0] ? <>{account.transactions[0].type.replace('_', ' ')} · {currency(account.transactions[0].amount)}<small>{new Date(account.transactions[0].createdAt).toLocaleString()}</small></> : 'No activity'}</td><td><button className="table-action" type="button" onClick={() => loadAccountActivity(account)}><Eye size={14} />View history</button></td>{isOwner && <td><div className="account-access-controls">{account.status === 'FROZEN' ? <button className="table-action" type="button" disabled={busy} onClick={() => setAccountStatus(account, false)}>Enable account</button> : <><select aria-label={`Freeze duration for ${account.accountNumber}`} value={freezeSettings[account.id]?.durationMinutes ?? '60'} onChange={(event) => setFreezeSettings((current) => ({ ...current, [account.id]: { ...current[account.id], durationMinutes: event.target.value } }))}><option value="60">1 hour</option><option value="1440">24 hours</option><option value="10080">7 days</option><option value="43200">30 days</option><option value="">Until enabled</option></select><input aria-label={`Reason for disabling ${account.accountNumber}`} placeholder="Reason (optional)" value={freezeSettings[account.id]?.reason || ''} onChange={(event) => setFreezeSettings((current) => ({ ...current, [account.id]: { ...current[account.id], reason: event.target.value } }))} /><button className="table-action danger" type="button" disabled={busy} onClick={() => setAccountStatus(account, true)}>Disable</button></>}</div></td>}</tr>)}
                {!accounts.length && <tr><td colSpan={isOwner ? '8' : '7'} className="empty-cell">No customer accounts found.</td></tr>}
              </tbody></table></div></section>
            </>
          )}

          {section === 'applications' && (
            <>
              <div className="management-page-intro"><div><h2>Account applications</h2><p>Review customer details and record an approval decision.</p></div><span className="status-tag">{applications.filter((application) => application.status === 'PENDING').length} pending</span></div>
              <div className="application-list">
                {applications.map((application) => (
                  <article className="management-panel application-card" key={application.id}>
                    <div className="application-card-heading"><div><span className="eyebrow">{application.type} · {new Date(application.createdAt).toLocaleDateString()}</span><h2>{application.fullName}</h2><p>{application.email} · {application.phone}</p></div><span className={`status-tag ${application.status.toLowerCase()}`}>{application.status}</span></div>
                    <dl className="application-details">
                      <div><dt>Applicant account</dt><dd>{application.applicant.name} · {application.applicant.email}</dd></div>
                      <div><dt>Date of birth</dt><dd>{application.dateOfBirth}</dd></div>
                      <div><dt>NID</dt><dd>{application.nid}</dd></div>
                      <div><dt>Address</dt><dd>{application.address}</dd></div>
                      <div><dt>Occupation</dt><dd>{application.occupation || 'Not provided'}</dd></div>
                      <div><dt>Nominee</dt><dd>{application.nomineeName || 'Not provided'}{application.nomineePhone ? ` · ${application.nomineePhone}` : ''}</dd></div>
                      <div><dt>Initial deposit</dt><dd>{currency(application.initialDeposit)}</dd></div>
                      {application.account && <div><dt>Opened account</dt><dd>{application.account.accountNumber}</dd></div>}
                      {application.decisionNote && <div><dt>Decision note</dt><dd>{application.decisionNote}</dd></div>}
                    </dl>
                    {application.status === 'PENDING' ? <div className="application-review-actions"><label>Review note<textarea rows="2" value={applicationNotes[application.id] || ''} onChange={(event) => setApplicationNotes((current) => ({ ...current, [application.id]: event.target.value }))} placeholder="Required when rejecting; optional when approving" /></label><div><button type="button" disabled={busy} onClick={() => decideApplication(application, 'APPROVED')}>Approve & open account</button><button type="button" className="button-danger" disabled={busy} onClick={() => decideApplication(application, 'REJECTED')}>Reject application</button></div></div> : <p className="application-reviewer">Reviewed by {application.reviewedBy?.name || 'Bank staff'} · {new Date(application.reviewedAt).toLocaleString()}</p>}
                  </article>
                ))}
                {!applications.length && <section className="management-panel empty-cell">No account applications have been submitted.</section>}
              </div>
            </>
          )}

          {section === 'loans' && (
            <>
              <div className="management-page-intro"><div><h2>Loan applications</h2><p>{isOwner ? 'Review all loan statuses and make a final decision at either review stage.' : 'Review new requests and forward approved applications to the owner.'}</p></div><span className="status-tag pending">{loanApplications.filter((application) => isOwner ? ['PENDING_MANAGER', 'PENDING_OWNER'].includes(application.status) : application.status === 'PENDING_MANAGER').length} awaiting your review</span></div>
              <div className="application-list">
                {loanApplications.map((application) => {
                  const canReview = isOwner
                    ? ['PENDING_MANAGER', 'PENDING_OWNER'].includes(application.status)
                    : application.status === 'PENDING_MANAGER';
                  return (
                    <article className="management-panel application-card" key={application.id}>
                      <div className="application-card-heading"><div><span className="eyebrow">Submitted {new Date(application.createdAt).toLocaleString()}</span><h2>{application.applicant.name}</h2><p>{application.applicant.email}{application.applicant.phone ? ` · ${application.applicant.phone}` : ''}</p></div><span className={`status-tag ${application.status.toLowerCase()}`}>{application.status.replaceAll('_', ' ')}</span></div>
                      <dl className="application-details">
                        <div><dt>Requested amount</dt><dd>{currency(application.amount)}</dd></div>
                        <div><dt>Repayment term</dt><dd>{application.termMonths} months</dd></div>
                        <div><dt>Monthly income</dt><dd>{currency(application.monthlyIncome)}</dd></div>
                        <div><dt>Bank account</dt><dd>{application.account.accountNumber} · balance {currency(application.account.balance)}</dd></div>
                        <div><dt>Employment</dt><dd>{application.employment}</dd></div>
                        <div><dt>Purpose</dt><dd>{application.purpose}</dd></div>
                        {application.managerReviewedBy && <div><dt>Manager review</dt><dd>{application.managerReviewedBy.name} · {application.managerNote || 'Forwarded to owner'}</dd></div>}
                        {application.reviewedBy && <div><dt>Owner decision</dt><dd>{application.reviewedBy.name} · {application.decisionNote || application.status}</dd></div>}
                      </dl>
                      {canReview ? <div className="application-review-actions"><label>Review note<textarea rows="2" maxLength="500" value={loanNotes[application.id] || ''} onChange={(event) => setLoanNotes((current) => ({ ...current, [application.id]: event.target.value }))} placeholder="Required when rejecting; optional when approving" /></label><div>{isOwner ? <button type="button" disabled={busy} onClick={() => decideLoan(application, 'APPROVED')}>Final approve</button> : <button type="button" disabled={busy} onClick={() => decideLoan(application, 'APPROVED')}>Forward to owner</button>}<button type="button" className="button-danger" disabled={busy} onClick={() => decideLoan(application, 'REJECTED')}>Reject</button></div></div> : <p className="application-reviewer">Reviewed by {application.reviewedBy?.name || application.managerReviewedBy?.name || 'Bank staff'} · {application.decisionNote || application.managerNote || application.status.replaceAll('_', ' ')}</p>}
                    </article>
                  );
                })}
                {!error && !loanApplications.length && <section className="management-panel empty-cell">No loan applications have been submitted.</section>}
              </div>
            </>
          )}

          {section === 'transactions' && (
            <>
              <div className="management-page-intro"><div><h2>Bank transactions</h2><p>Latest 100 recorded customer transactions across the bank.</p></div><span className="live-indicator">{transactions.length} records</span></div>
              <section className="management-panel"><div className="management-table-wrap"><table className="management-table"><thead><tr><th>Customer</th><th>Account</th><th>Type</th><th>Amount</th><th>Balance after</th><th>Recorded</th></tr></thead><tbody>
                {transactions.map((transaction) => <tr key={transaction.id}><td><strong>{transaction.account.user.name}</strong><small>{transaction.account.user.email}</small></td><td>{transaction.account.accountNumber}</td><td><span className="status-tag">{transaction.type.replace('_', ' ')}</span></td><td>{currency(transaction.amount)}</td><td>{currency(transaction.balanceAfter)}</td><td>{new Date(transaction.createdAt).toLocaleString()}</td></tr>)}
                {!transactions.length && <tr><td colSpan="6" className="empty-cell">No transactions have been recorded.</td></tr>}
              </tbody></table></div></section>
            </>
          )}

          {section === 'payroll' && isOwner && (
            <>
              <div className="management-page-intro"><div><h2>Performance-based payroll review</h2><p>Record a reasoned deduction for an employee with a performance score below 50.</p></div><span className="status-tag">Owner approval required</span></div>
              <section className="management-panel payroll-panel">
                <label>Employee<select value={selectedEmployee} onChange={(event) => setSelectedEmployee(event.target.value)}><option value="">Select an employee</option>{employees.filter((employee) => employee.status === 'ACTIVE').map((employee) => <option key={employee.id} value={employee.id}>{employee.employeeCode} · {employee.name} · score {employee.performanceScore}</option>)}</select></label>
                {currentEmployee && <div className="payroll-employee-summary"><span>{currentEmployee.name}</span><strong>{currency(currentEmployee.monthlySalary)} / month</strong><small>Performance score: {currentEmployee.performanceScore}/100</small></div>}
                {currentEmployee && <form onSubmit={submitDeduction} className="deduction-form"><label>Deduction amount<input type="number" min="0.01" max={currentEmployee.monthlySalary} step="0.01" value={deductionForm.amount} onChange={(event) => setDeductionForm({ ...deductionForm, amount: event.target.value })} required /></label><label>Payroll period<input type="month" value={deductionForm.payrollPeriod} onChange={(event) => setDeductionForm({ ...deductionForm, payrollPeriod: event.target.value })} required /></label><label className="full-field">Performance-related reason<textarea minLength="10" value={deductionForm.reason} onChange={(event) => setDeductionForm({ ...deductionForm, reason: event.target.value })} required rows="3" placeholder="Document the review and the specific reason for this adjustment." /></label><p className="management-note">This creates a pending payroll record only. It does not transfer money or change a bank account balance.</p><button disabled={busy || currentEmployee.performanceScore >= 50}>{busy ? 'Recording...' : 'Record deduction for approval'}</button>{currentEmployee.performanceScore >= 50 && <small className="field-hint">Deductions are unavailable for a performance score of 50 or higher.</small>}</form>}
              </section>
              <section className="management-panel"><div className="management-panel-heading"><div><h2>Adjustment history</h2><p>Pending entries must be explicitly approved by an owner.</p></div><BadgeDollarSign size={20} /></div><div className="management-table-wrap"><table className="management-table"><thead><tr><th>Period</th><th>Amount</th><th>Reason</th><th>Status</th><th>Created by</th><th></th></tr></thead><tbody>{adjustments.map((adjustment) => <tr key={adjustment.id}><td>{adjustment.payrollPeriod}</td><td>{currency(adjustment.amount)}</td><td>{adjustment.reason}<small>Performance score: {adjustment.performanceScore}</small></td><td><span className={`status-tag ${adjustment.status.toLowerCase()}`}>{adjustment.status}</span></td><td>{adjustment.createdBy.name}</td><td>{adjustment.status === 'PENDING' && <button className="table-action" disabled={busy} onClick={() => approveAdjustment(adjustment.id)}>Approve</button>}</td></tr>)}{!adjustments.length && <tr><td colSpan="6" className="empty-cell">Select an employee to review payroll records.</td></tr>}</tbody></table></div></section>
            </>
          )}

          {section === 'audit' && isOwner && <section className="management-panel"><div className="management-panel-heading"><div><h2>Administrative audit history</h2><p>Owner actions are recorded with timestamp and entity reference.</p></div><ShieldCheck size={20} /></div><div className="management-table-wrap"><table className="management-table"><thead><tr><th>Action</th><th>Entity</th><th>Actor</th><th>Details</th><th>Time</th></tr></thead><tbody>{auditLogs.map((log) => <tr key={log.id}><td><span className="status-tag">{log.action.replaceAll('_', ' ')}</span></td><td>{log.entityType}<small>{log.entityId || '—'}</small></td><td><strong>{log.actor.name}</strong><small>{log.actor.email}</small></td><td>{log.details ? JSON.stringify(log.details) : '—'}</td><td>{new Date(log.createdAt).toLocaleString()}</td></tr>)}{!auditLogs.length && <tr><td colSpan="5" className="empty-cell">No administrative actions have been recorded.</td></tr>}</tbody></table></div></section>}
        </div>
        {accountActivity && (
          <div className="account-activity-backdrop" onClick={() => setAccountActivity(null)}>
            <section className="account-activity-dialog" role="dialog" aria-modal="true" aria-labelledby="account-activity-title" onClick={(event) => event.stopPropagation()}>
              <header className="account-activity-header">
                <div><span className="eyebrow">CUSTOMER ACCOUNT</span><h2 id="account-activity-title">{accountActivity.account.user.name}</h2><p>{accountActivity.account.user.email} · {accountActivity.account.accountNumber} · {accountActivity.account.type}</p></div>
                <button className="account-activity-close" type="button" aria-label="Close account activity" onClick={() => setAccountActivity(null)}><X size={19} /></button>
              </header>
              <div className="account-activity-meta">
                <span className={`status-tag ${accountActivity.account.status.toLowerCase()}`}>{accountActivity.account.status}</span>
                {accountActivity.account.employee && <span className="employee-link-tag">Employee · {accountActivity.account.employee.employeeCode} · {accountActivity.account.employee.department}</span>}
                <span>Current balance <strong>{currency(accountActivity.account.balance)}</strong></span>
              </div>
              <div className="account-customer-details">
                <section className="customer-detail-section">
                  <div className="customer-detail-heading"><h3>Customer profile</h3><span className={`status-tag ${accountActivity.customer.approvalStatus.toLowerCase()}`}>{accountActivity.customer.approvalStatus}</span></div>
                  <dl className="customer-profile-grid">
                    <div><dt>Full name</dt><dd>{accountActivity.customer.name}</dd></div>
                    <div><dt>Email</dt><dd>{accountActivity.customer.email}</dd></div>
                    <div><dt>Phone</dt><dd>{accountActivity.customer.phone || 'Not provided'}</dd></div>
                    <div><dt>Registered</dt><dd>{new Date(accountActivity.customer.createdAt).toLocaleString()}</dd></div>
                    {accountActivity.customer.approvalReviewedAt && <div><dt>Access reviewed</dt><dd>{new Date(accountActivity.customer.approvalReviewedAt).toLocaleString()} · {accountActivity.customer.approvalReviewedBy?.name || 'Bank staff'}</dd></div>}
                    {accountActivity.customer.closedAt && <div><dt>Closed</dt><dd>{new Date(accountActivity.customer.closedAt).toLocaleString()}</dd></div>}
                    {accountActivity.customer.approvalNote && <div className="customer-detail-wide"><dt>Review note</dt><dd>{accountActivity.customer.approvalNote}</dd></div>}
                  </dl>
                </section>
                <section className="customer-detail-section">
                  <div className="customer-detail-heading"><h3>All customer accounts</h3><span>{accountActivity.customer.accounts.length} accounts</span></div>
                  <div className="customer-linked-accounts">
                    {accountActivity.customer.accounts.map((customerAccount) => (
                      <article key={customerAccount.id} className={customerAccount.id === accountActivity.account.id ? 'selected' : ''}>
                        <div><strong>{customerAccount.type} · {customerAccount.accountNumber}</strong><span className={`status-tag ${customerAccount.status.toLowerCase()}`}>{customerAccount.status}</span></div>
                        <p>{currency(customerAccount.balance)} · Opened {new Date(customerAccount.createdAt).toLocaleDateString()}</p>
                        {customerAccount.frozenUntil && <small>Disabled until {new Date(customerAccount.frozenUntil).toLocaleString()}</small>}
                        {customerAccount.cards.map((card, index) => <small key={`${customerAccount.id}-${card.lastFour}-${index}`}>Card •••• {card.lastFour} · {card.expiry} · {card.status}</small>)}
                      </article>
                    ))}
                  </div>
                </section>
                <section className="customer-detail-section">
                  <div className="customer-detail-heading"><h3>Account applications & KYC</h3><span>{accountActivity.customer.applications.length} records</span></div>
                  {accountActivity.customer.applications.length ? <div className="customer-kyc-list">
                    {accountActivity.customer.applications.map((application) => (
                      <article key={application.id}>
                        <div className="customer-detail-heading"><strong>{application.type} · {new Date(application.createdAt).toLocaleDateString()}</strong><span className={`status-tag ${application.status.toLowerCase()}`}>{application.status}</span></div>
                        <dl className="customer-profile-grid">
                          <div><dt>Applicant name</dt><dd>{application.fullName}</dd></div>
                          <div><dt>Date of birth</dt><dd>{application.dateOfBirth}</dd></div>
                          <div><dt>Email</dt><dd>{application.email}</dd></div>
                          <div><dt>Phone</dt><dd>{application.phone}</dd></div>
                          <div><dt>National ID</dt><dd>{application.nid}</dd></div>
                          <div><dt>Occupation</dt><dd>{application.occupation || 'Not provided'}</dd></div>
                          <div className="customer-detail-wide"><dt>Address</dt><dd>{application.address}</dd></div>
                          <div><dt>Nominee</dt><dd>{application.nomineeName || 'Not provided'}</dd></div>
                          <div><dt>Nominee phone</dt><dd>{application.nomineePhone || 'Not provided'}</dd></div>
                          <div><dt>Initial deposit</dt><dd>{currency(application.initialDeposit)}</dd></div>
                          {application.reviewedAt && <div><dt>Reviewed</dt><dd>{new Date(application.reviewedAt).toLocaleString()} · {application.reviewedBy?.name || 'Bank staff'}</dd></div>}
                          {application.decisionNote && <div className="customer-detail-wide"><dt>Decision note</dt><dd>{application.decisionNote}</dd></div>}
                        </dl>
                      </article>
                    ))}
                  </div> : <p className="customer-detail-empty">No account application or KYC record available.</p>}
                </section>
              </div>
              <div className="account-activity-summary">
                <article><span>Transactions</span><strong>{accountActivity.totalTransactions}</strong></article>
                {(accountActivity.transactionTypes || []).map((item) => <article key={item.type}><span>{item.type.replaceAll('_', ' ')}</span><strong>{currency(item._sum.amount)}</strong><small>{item._count._all} entries</small></article>)}
              </div>
              <div className="management-table-wrap account-activity-table-wrap">
                <table className="management-table"><thead><tr><th>Date</th><th>Type</th><th>Description</th><th>Amount</th><th>Balance after</th></tr></thead><tbody>
                  {(accountActivity.transactions || []).map((transaction) => <tr key={transaction.id}><td>{new Date(transaction.createdAt).toLocaleString()}</td><td><span className="status-tag">{transaction.type.replaceAll('_', ' ')}</span></td><td>{transaction.description || '—'}</td><td>{currency(transaction.amount)}</td><td>{currency(transaction.balanceAfter)}</td></tr>)}
                  {!activityLoading && !accountActivity.transactions?.length && <tr><td colSpan="5" className="empty-cell">No transactions recorded for this account.</td></tr>}
                  {activityLoading && <tr><td colSpan="5" className="empty-cell">Loading transaction history…</td></tr>}
                </tbody></table>
              </div>
              <footer className="account-activity-footer"><span>Page {accountActivity.page} of {accountActivity.totalPages}</span><div><button className="button-secondary" type="button" disabled={activityLoading || accountActivity.page <= 1} onClick={() => loadAccountActivity(accountActivity.account, accountActivity.page - 1)}><ChevronLeft size={16} />Previous</button><button className="button-secondary" type="button" disabled={activityLoading || accountActivity.page >= accountActivity.totalPages} onClick={() => loadAccountActivity(accountActivity.account, accountActivity.page + 1)}>Next<ChevronRight size={16} /></button></div></footer>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}