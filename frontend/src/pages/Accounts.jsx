import { useEffect, useState } from 'react';
import api from '../api/axios';

export default function Accounts() {
  const [accs, setAccs] = useState([]);
  const [loans, setLoans] = useState([]);
  const [applications, setApplications] = useState([]);
  const [amt, setAmt] = useState({});
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [withdrawal, setWithdrawal] = useState({});
  const [withdrawFor, setWithdrawFor] = useState('');
  const [otpDialog, setOtpDialog] = useState(null);
  const [otpCode, setOtpCode] = useState('');
  const [testOtp, setTestOtp] = useState('');
  const [requestingOtp, setRequestingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);

  // NEW: Account creation form
  const [showForm, setShowForm] = useState(false);
  const [accountType, setAccountType] = useState('');
  const [creating, setCreating] = useState(false);

  const [formData, setFormData] = useState({
    fullName: '',
    phone: '',
    email: '',
    nid: '',
    dateOfBirth: '',
    address: '',
    occupation: '',
    nomineeName: '',
    nomineePhone: '',
    initialDeposit: '',
  });

  const showError = (e, fallback) => {
    const m =
      e.response?.data?.message ||
      (e.response
        ? `Server error (${e.response.status})`
        : 'Backend e connect hocche na - backend terminal cholche kina check koro (http://localhost:5000/api/health)');

    setErr(m || fallback);
  };

  const load = async () => {
    try {
      setErr('');
      const [accountResponse, loanResponse] = await Promise.all([
        api.get('/accounts/my'),
        api.get('/loans/my'),
      ]);
      setAccs(Array.isArray(accountResponse.data) ? accountResponse.data : []);
      setLoans(Array.isArray(loanResponse.data) ? loanResponse.data : []);
    } catch (e) {
      showError(e, 'Account load korte parini');
    } finally {
      setLoading(false);
    }
  };

  const loadApplications = async () => {
    try {
      const { data } = await api.get('/accounts/applications/my');
      setApplications(Array.isArray(data) ? data : []);
    } catch (e) {
      showError(e, 'Could not load account applications');
    }
  };

  useEffect(() => {
    load();
    loadApplications();
  }, []);

  const setWithdrawalField = (id, field, value) => {
    setWithdrawal((prev) => ({
      ...prev,
      [id]: { method: 'BKASH', ...prev[id], [field]: value },
    }));
  };

  const act = async (id, kind) => {
    const amount = Number(amt[id]);

    if (!Number.isFinite(amount) || amount < 500) {
      setErr('Minimum deposit or withdrawal amount is ৳500.');
      setMsg('');
      return;
    }

    const destination = withdrawal[id] || {};
    if (
      kind === 'withdraw' &&
      (!destination.recipientName?.trim() || !destination.recipientNumber?.trim())
    ) {
      setErr('Enter the recipient name and destination details first.');
      return;
    }

    try {
      setRequestingOtp(true);
      setErr('');
      setMsg('');

      const { data } = await api.post('/accounts/otp/request', {
        accountId: id,
        type: kind === 'deposit' ? 'DEPOSIT' : 'WITHDRAW',
        amount,
        ...(kind === 'withdraw' ? destination : {}),
      });
      setOtpDialog({
        challengeId: data.challengeId,
        accountId: id,
        kind,
        amount,
      });
      setOtpCode('');
      setTestOtp(data.testCode || '');
      setWithdrawFor('');
      setMsg(
        data.delivery === 'development-test'
          ? `Development test code is ready for ${data.email}; no email was sent.`
          : `A verification code was sent to ${data.email}.`
      );
    } catch (e) {
      showError(e, 'Could not send the verification code');
    } finally {
      setRequestingOtp(false);
    }
  };

  const verifyOtp = async (e) => {
    e.preventDefault();
    if (!otpDialog) return;

    try {
      setVerifyingOtp(true);
      setErr('');
      const { data } = await api.post('/accounts/otp/verify', {
        challengeId: otpDialog.challengeId,
        code: otpCode,
      });
      setMsg(
        `${otpDialog.kind === 'deposit' ? 'Deposit' : 'Withdrawal'} completed. New balance: ৳${Number(data.account.balance).toLocaleString()}.`
      );
      setAmt((prev) => ({ ...prev, [otpDialog.accountId]: '' }));
      setWithdrawal((prev) => {
        const next = { ...prev };
        delete next[otpDialog.accountId];
        return next;
      });
      setOtpDialog(null);
      setOtpCode('');
      setTestOtp('');
      await load();
    } catch (e) {
      showError(e, 'OTP verification failed');
    } finally {
      setVerifyingOtp(false);
    }
  };

  // NEW: Open account form
  const openAccountForm = (type) => {
    setAccountType(type);
    setErr('');
    setMsg('');

    setFormData({
      fullName: '',
      phone: '',
      email: '',
      nid: '',
      dateOfBirth: '',
      address: '',
      occupation: '',
      nomineeName: '',
      nomineePhone: '',
      initialDeposit: '',
    });

    setShowForm(true);
  };

  // NEW: Handle form fields
  const handleChange = (e) => {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  // NEW: Submit account creation form
  const handleCreateAccount = async (e) => {
    e.preventDefault();

    if (
      !formData.fullName.trim() ||
      !formData.phone.trim() ||
      !formData.email.trim() ||
      !formData.nid.trim() ||
      !formData.dateOfBirth ||
      !formData.address.trim()
    ) {
      setErr('Please fill in all required fields.');
      return;
    }

    if (
      formData.initialDeposit &&
      Number(formData.initialDeposit) < 0
    ) {
      setErr('Initial deposit cannot be negative.');
      return;
    }

    try {
      setCreating(true);
      setErr('');
      setMsg('');

      await api.post('/accounts/applications', {
        type: accountType,

        fullName: formData.fullName,
        phone: formData.phone,
        email: formData.email,
        nid: formData.nid,
        dateOfBirth: formData.dateOfBirth,
        address: formData.address,
        occupation: formData.occupation,
        nomineeName: formData.nomineeName,
        nomineePhone: formData.nomineePhone,

        initialDeposit: Number(formData.initialDeposit) || 0,
      });

      setMsg(`Your ${accountType.toLowerCase()} account application was submitted for staff review.`);

      setShowForm(false);
      await loadApplications();
    } catch (e) {
      showError(e, 'Account toiri korte parini');
    } finally {
      setCreating(false);
    }
  };

  const closeForm = () => {
    setShowForm(false);
    setErr('');
  };

  if (loading) {
    return (
      <div className="box">
        <p>Accounts load hocche...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="accounts-heading">
        <div>
          <span className="eyebrow">YOUR MONEY</span>
          <h1>My Accounts</h1>
          <p>Manage account balances and protected transactions.</p>
        </div>
        <div className="account-create-actions">
          <button onClick={() => openAccountForm('SAVINGS')}>
          + New Savings Account
          </button>

          <button onClick={() => openAccountForm('CURRENT')}>
          + New Current Account
          </button>
        </div>
      </div>

      {/* ERROR MESSAGE */}
      {err && (
        <div
          className="box"
          style={{
            border: '1px solid #f5c2c0',
            background: '#fff1f0',
            color: '#b42318',
          }}
        >
          {err}
        </div>
      )}

      {/* SUCCESS MESSAGE */}
      {msg && (
        <div
          className="box"
          style={{
            border: '1px solid #b7ebc6',
            background: '#f0fff4',
          }}
        >
          {msg}
        </div>
      )}

      {/* ========================= */}
      {/* NEW ACCOUNT FORM */}
      {/* ========================= */}

      {showForm && (
        <div
          className="box"
          style={{
            marginBottom: 20,
            maxWidth: 750,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 20,
            }}
          >
            <div>
              <h2 style={{ margin: 0 }}>
                Open {accountType} Account
              </h2>

              <p
                style={{
                  marginTop: 6,
                  color: '#666',
                }}
              >
                Please provide your account information.
              </p>
            </div>

            <button
              type="button"
              onClick={closeForm}
              style={{
                background: '#e5e7eb',
                color: '#111',
              }}
            >
              Cancel
            </button>
          </div>

          <form onSubmit={handleCreateAccount}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns:
                  'repeat(auto-fit, minmax(250px, 1fr))',
                gap: 15,
              }}
            >
              {/* FULL NAME */}
              <div>
                <label>Full Name *</label>

                <input
                  type="text"
                  name="fullName"
                  placeholder="Enter full name"
                  value={formData.fullName}
                  onChange={handleChange}
                  required
                />
              </div>

              {/* PHONE */}
              <div>
                <label>Phone Number *</label>

                <input
                  type="tel"
                  name="phone"
                  placeholder="01XXXXXXXXX"
                  value={formData.phone}
                  onChange={handleChange}
                  required
                />
              </div>

              {/* EMAIL */}
              <div>
                <label>Email Address *</label>

                <input
                  type="email"
                  name="email"
                  placeholder="example@email.com"
                  value={formData.email}
                  onChange={handleChange}
                  required
                />
              </div>

              {/* NID */}
              <div>
                <label>NID Number *</label>

                <input
                  type="text"
                  name="nid"
                  placeholder="Enter NID number"
                  value={formData.nid}
                  onChange={handleChange}
                  required
                />
              </div>

              {/* DATE OF BIRTH */}
              <div>
                <label>Date of Birth *</label>

                <input
                  type="date"
                  name="dateOfBirth"
                  value={formData.dateOfBirth}
                  onChange={handleChange}
                  required
                />
              </div>

              {/* OCCUPATION */}
              <div>
                <label>Occupation</label>

                <input
                  type="text"
                  name="occupation"
                  placeholder="Your occupation"
                  value={formData.occupation}
                  onChange={handleChange}
                />
              </div>

              {/* NOMINEE */}
              <div>
                <label>Nominee Name</label>

                <input
                  type="text"
                  name="nomineeName"
                  placeholder="Nominee full name"
                  value={formData.nomineeName}
                  onChange={handleChange}
                />
              </div>

              {/* NOMINEE PHONE */}
              <div>
                <label>Nominee Phone</label>

                <input
                  type="tel"
                  name="nomineePhone"
                  placeholder="Nominee phone number"
                  value={formData.nomineePhone}
                  onChange={handleChange}
                />
              </div>

              {/* INITIAL DEPOSIT */}
              <div>
                <label>Initial Deposit (৳)</label>

                <input
                  type="number"
                  name="initialDeposit"
                  min="0"
                  placeholder="Example: 1000"
                  value={formData.initialDeposit}
                  onChange={handleChange}
                />
              </div>
            </div>

            {/* ADDRESS */}
            <div style={{ marginTop: 15 }}>
              <label>Present Address *</label>

              <textarea
                name="address"
                placeholder="Enter your present address"
                value={formData.address}
                onChange={handleChange}
                required
                rows="3"
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: 12,
                  border: '1px solid #ddd',
                  borderRadius: 8,
                  marginTop: 5,
                  resize: 'vertical',
                }}
              />
            </div>

            <div style={{ marginTop: 20 }}>
              <button
                type="submit"
                disabled={creating}
              >
                {creating
                  ? 'Creating Account...'
                  : `Create ${accountType} Account`}
              </button>
            </div>
          </form>
        </div>
      )}

      {applications.length > 0 && (
        <section className="account-applications">
          <div className="account-applications-heading">
            <div><h2>Account applications</h2><p>New accounts become available after bank staff approval.</p></div>
          </div>
          <div className="account-application-list">
            {applications.map((application) => (
              <article className="account-application-item" key={application.id}>
                <div><strong>{application.type} account</strong><small>Submitted {new Date(application.createdAt).toLocaleDateString()}</small></div>
                <span className={`status-tag ${application.status.toLowerCase()}`}>{application.status}</span>
                {application.account?.accountNumber && <small>Account {application.account.accountNumber}</small>}
                {application.decisionNote && <p>{application.decisionNote}</p>}
              </article>
            ))}
          </div>
        </section>
      )}

      {/* NO ACCOUNT */}
      {!accs.length && !err && (
        <div className="box">
          <h3>Kono account pawa jayni</h3>

          <p>
            Upore New Savings Account ba New Current Account
            button click kore account opening form fill up koro.
          </p>
        </div>
      )}

      {/* ACCOUNT LIST */}
      <div className="grid">
        {accs.map((a) => (
          <div key={a.id} className="box">
            <div className="account-card-heading"><h3>{a.type} Account</h3><span className={`status-tag ${a.status.toLowerCase()}`}>{a.status}</span></div>

            <p>{a.accountNumber}</p>

            {a.status === 'FROZEN' && <p className="account-frozen-notice">This account is temporarily disabled{a.frozenUntil ? ` until ${new Date(a.frozenUntil).toLocaleString()}` : ''}{a.statusReason ? `. ${a.statusReason}` : ''}</p>}

            <h2>
              ৳ {Number(a.balance).toLocaleString()}
            </h2>

            {loans.some((loan) => loan.accountId === a.id && loan.status === 'APPROVED' && loan.disbursedAt && Number(loan.amount) > Number(loan.repaidAmount || 0)) && <section className="account-loan-status">
              <h4>Loan status</h4>
              {loans.filter((loan) => loan.accountId === a.id && loan.status === 'APPROVED' && loan.disbursedAt && Number(loan.amount) > Number(loan.repaidAmount || 0)).map((loan) => {
                const outstanding = Math.max(0, Number(loan.amount) - Number(loan.repaidAmount || 0));
                const nextInstallment = loan.installments?.find((installment) => Number(installment.paidAmount) < Number(installment.amount));
                return <div className="account-loan-summary" key={loan.id}>
                  <strong>{loan.termMonths}-month loan</strong>
                  <span>Outstanding: ৳{outstanding.toLocaleString()}</span>
                  {nextInstallment && <span>Next due: ৳{(Number(nextInstallment.amount) - Number(nextInstallment.paidAmount)).toLocaleString()} · {new Date(nextInstallment.dueDate).toLocaleDateString()}</span>}
                </div>;
              })}
            </section>}

            <label htmlFor={`amount-${a.id}`}>Transaction amount (minimum ৳500)</label>
            <input
              id={`amount-${a.id}`}
              placeholder="Amount in taka"
              type="number"
              min="500"
              step="1"
              value={amt[a.id] || ''}
              onChange={(e) => setAmt((prev) => ({ ...prev, [a.id]: e.target.value }))}
            />

            <div className="account-action-row">
              <button disabled={requestingOtp || a.status !== 'ACTIVE'} onClick={() => act(a.id, 'deposit')}>
                Deposit
              </button>
              <button
                className="secondary-action"
                type="button"
                disabled={a.status !== 'ACTIVE'}
                onClick={() => {
                  setWithdrawFor(withdrawFor === a.id ? '' : a.id);
                  setErr('');
                }}
              >
                {withdrawFor === a.id ? 'Cancel' : 'Withdraw'}
              </button>
            </div>

            {withdrawFor === a.id && (
              <form
                className="withdrawal-details"
                onSubmit={(e) => {
                  e.preventDefault();
                  act(a.id, 'withdraw');
                }}
              >
                <label htmlFor={`method-${a.id}`}>Send withdrawal to</label>
                <select
                  id={`method-${a.id}`}
                  value={withdrawal[a.id]?.method || 'BKASH'}
                  onChange={(e) => setWithdrawalField(a.id, 'method', e.target.value)}
                >
                  <option value="BKASH">bKash</option>
                  <option value="NAGAD">Nagad</option>
                  <option value="BANK">Bank account</option>
                </select>
                {withdrawal[a.id]?.method === 'BANK' && (
                  <input
                    aria-label="Bank name"
                    placeholder="Bank name"
                    value={withdrawal[a.id]?.bankName || ''}
                    onChange={(e) => setWithdrawalField(a.id, 'bankName', e.target.value)}
                    required
                  />
                )}
                <input
                  aria-label="Recipient name"
                  placeholder="Recipient name"
                  value={withdrawal[a.id]?.recipientName || ''}
                  onChange={(e) => setWithdrawalField(a.id, 'recipientName', e.target.value)}
                  required
                />
                <input
                  aria-label={withdrawal[a.id]?.method === 'BANK' ? 'Bank account number' : 'Mobile number'}
                  placeholder={withdrawal[a.id]?.method === 'BANK' ? 'Bank account number' : '01XXXXXXXXX'}
                  value={withdrawal[a.id]?.recipientNumber || ''}
                  onChange={(e) => setWithdrawalField(a.id, 'recipientNumber', e.target.value)}
                  required
                />
                <button type="submit" disabled={requestingOtp}>
                  {requestingOtp ? 'Sending code...' : 'Continue with email OTP'}
                </button>
                <small>Withdrawal payout is simulated. The account is debited only after email verification.</small>
              </form>
            )}
          </div>
        ))}
      </div>

      {otpDialog && (
        <div className="otp-backdrop">
          <form className="otp-dialog" onSubmit={verifyOtp} role="dialog" aria-modal="true" aria-labelledby="otp-title">
            <span className="eyebrow">SECURITY CHECK</span>
            <h2 id="otp-title">Verify this transaction</h2>
            <p>Enter the 6-digit code sent to your registered email. It expires in 5 minutes.</p>
            {testOtp && (
              <div className="test-otp">
                Development test code: <strong>{testOtp}</strong>
              </div>
            )}
            {err && <p className="otp-error" role="alert">{err}</p>}
            <label htmlFor="transaction-otp">Email verification code</label>
            <input
              id="transaction-otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength="6"
              placeholder="6-digit code"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              required
              autoFocus
            />
            <div className="otp-actions">
              <button
                className="secondary-action"
                type="button"
                onClick={() => {
                  setOtpDialog(null);
                  setOtpCode('');
                  setTestOtp('');
                  setErr('');
                }}
              >
                Cancel
              </button>
              <button type="submit" disabled={verifyingOtp || otpCode.length !== 6}>
                {verifyingOtp ? 'Verifying...' : 'Verify and complete'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}