import { useEffect, useState } from 'react';
import { HandCoins } from 'lucide-react';
import api from '../api/axios';

const emptyForm = {
  accountId: '',
  amount: '',
  termMonths: '12',
  purpose: '',
  employment: '',
  monthlyIncome: '',
};

const currency = (value) => `৳${Number(value || 0).toLocaleString()}`;
const statusLabel = (status) => ({
  PENDING_MANAGER: 'Awaiting manager review',
  PENDING_OWNER: 'Awaiting owner approval',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
}[status] || status);

export default function Loans() {
  const [accounts, setAccounts] = useState([]);
  const [applications, setApplications] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async () => {
    try {
      setError('');
      const [accountResponse, applicationResponse] = await Promise.all([
        api.get('/accounts/my'),
        api.get('/loans/my'),
      ]);
      const activeAccounts = accountResponse.data.filter((account) => account.status === 'ACTIVE');
      setAccounts(activeAccounts);
      setApplications(applicationResponse.data);
      setForm((current) => ({
        ...current,
        accountId: activeAccounts.some((account) => account.id === current.accountId)
          ? current.accountId
          : activeAccounts[0]?.id || '',
      }));
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not load loan information');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const updateForm = (event) => {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  };

  const submitApplication = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api.post('/loans', {
        ...form,
        amount: Number(form.amount),
        termMonths: Number(form.termMonths),
        monthlyIncome: Number(form.monthlyIncome),
      });
      setNotice('Your loan application was sent to the manager for review.');
      setForm((current) => ({ ...emptyForm, accountId: current.accountId }));
      await load();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Could not submit loan application');
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <div className="box"><p>Loading loan information...</p></div>;

  const hasPendingApplication = applications.some((application) => ['PENDING_MANAGER', 'PENDING_OWNER'].includes(application.status));

  return (
    <div className="loan-page">
      <div className="accounts-heading">
        <div>
          <span className="eyebrow">BORROWING</span>
          <h1>Loan applications</h1>
          <p>Submit your request for manager review, followed by owner approval.</p>
        </div>
      </div>

      {error && <div className="management-alert error" role="alert">{error}</div>}
      {notice && <div className="management-alert success" role="status">{notice}</div>}

      <section className="box loan-eligibility">
        <h2>Application requirements</h2>
        <p>You need an active bank account. Provide a positive requested amount, monthly income, employment details, repayment term from 1 to 360 months, and a purpose of at least 10 characters. Approval is subject to bank review.</p>
      </section>

      <section className="box loan-form-panel">
        <div className="loan-section-heading"><HandCoins size={21} /><div><h2>Apply for a loan</h2><p>Your information will be reviewed by bank staff.</p></div></div>
        {accounts.length && !hasPendingApplication ? (
          <form onSubmit={submitApplication} className="loan-form">
            <label>Disbursement account<select name="accountId" value={form.accountId} onChange={updateForm} required>{accounts.map((account) => <option key={account.id} value={account.id}>{account.type} · {account.accountNumber}</option>)}</select></label>
            <label>Loan amount<input name="amount" type="number" min="0.01" max="9999999999.99" step="0.01" value={form.amount} onChange={updateForm} required /></label>
            <label>Repayment term (months)<input name="termMonths" type="number" min="1" max="360" step="1" value={form.termMonths} onChange={updateForm} required /></label>
            <label>Monthly income<input name="monthlyIncome" type="number" min="0.01" max="9999999999.99" step="0.01" value={form.monthlyIncome} onChange={updateForm} required /></label>
            <label>Employment / occupation<input name="employment" minLength="2" maxLength="100" value={form.employment} onChange={updateForm} required /></label>
            <label className="loan-purpose-field">Loan purpose<textarea name="purpose" minLength="10" maxLength="500" rows="3" value={form.purpose} onChange={updateForm} required /></label>
            <button type="submit" disabled={busy}>{busy ? 'Submitting...' : 'Submit application'}</button>
          </form>
        ) : hasPendingApplication ? (
          <p className="loan-form-notice">You already have an application under review. Wait for a decision before applying again.</p>
        ) : (
          <p className="loan-form-notice">You need an active bank account before you can apply for a loan.</p>
        )}
      </section>

      <section className="loan-history">
        <div className="loan-section-heading"><div><h2>Your applications</h2><p>Review progress and staff decisions.</p></div></div>
        {applications.length ? applications.map((application) => (
          <article className="box loan-application-card" key={application.id}>
            <div className="loan-application-heading"><div><span className="eyebrow">Submitted {new Date(application.createdAt).toLocaleDateString()}</span><h3>{currency(application.amount)} · {application.termMonths} months</h3></div><span className={`status-tag ${application.status.toLowerCase()}`}>{statusLabel(application.status)}</span></div>
            <dl className="application-details">
              <div><dt>Account</dt><dd>{application.account.accountNumber}</dd></div>
              <div><dt>Monthly income</dt><dd>{currency(application.monthlyIncome)}</dd></div>
              <div><dt>Employment</dt><dd>{application.employment}</dd></div>
              <div><dt>Purpose</dt><dd>{application.purpose}</dd></div>
              {application.managerReviewedBy && <div><dt>Manager review</dt><dd>{application.managerReviewedBy.name}{application.managerNote ? ` · ${application.managerNote}` : ''}</dd></div>}
              {application.reviewedBy && <div><dt>Owner decision</dt><dd>{application.reviewedBy.name}{application.decisionNote ? ` · ${application.decisionNote}` : ''}</dd></div>}
            </dl>
          </article>
        )) : <div className="box"><p>No loan applications yet.</p></div>}
      </section>
    </div>
  );
}