import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../api/axios';

const TOP_BANKS = [
  'Sonali Bank PLC',
  'Islami Bank Bangladesh PLC',
  'BRAC Bank PLC',
  'Dutch-Bangla Bank PLC',
  'Eastern Bank PLC',
];

const METHODS = [
  { id: 'EBANK', label: '🏦 E-Bank Account', fee: 0, hint: 'Instant transfer to your own or another client\'s E-Bank account, no fee' },
  { id: 'BKASH', label: '🟣 bKash', fee: 10, hint: 'To bKash personal number - fee ৳10' },
  { id: 'NAGAD', label: '🟠 Nagad', fee: 10, hint: 'To Nagad personal number - fee ৳10' },
  { id: 'BANK', label: '🏛️ Other Bank', fee: 15, hint: 'To any account of top 5 banks in the country - fee ৳15' },
];

export default function Transfer() {
  const location = useLocation();
  const [accs, setAccs] = useState([]);
  const [beneficiaries, setBeneficiaries] = useState([]);
  const [method, setMethod] = useState('EBANK');
  const [f, setF] = useState({
    fromAccountId: '',
    toAccountNumber: '',
    recipientName: '',
    recipientNumber: '',
    bankName: TOP_BANKS[0],
    amount: '',
    description: '',
  });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    api.get('/accounts/my')
      .then((r) => {
        setAccs(r.data);
        const firstActive = r.data.find((account) => account.status === 'ACTIVE');
        if (firstActive) setF((x) => ({ ...x, fromAccountId: firstActive.id }));
      })
      .catch(() => setErr('Failed to load accounts - please check if the backend is running'));
    api.get('/beneficiaries')
      .then((r) => setBeneficiaries(Array.isArray(r.data) ? r.data : []))
      .catch(() => setBeneficiaries([]));
  }, []);

  const selectBeneficiary = (beneficiaryId) => {
    const beneficiary = beneficiaries.find((item) => item.id === beneficiaryId);
    if (!beneficiary) return;

    if (beneficiary.bankName === 'E-Bank') {
      setMethod('EBANK');
      setF((currentForm) => ({
        ...currentForm,
        toAccountNumber: beneficiary.accountNumber,
        recipientName: beneficiary.name,
        recipientNumber: '',
      }));
      return;
    }

    const channel = beneficiary.bankName === 'bKash'
      ? 'BKASH'
      : beneficiary.bankName === 'Nagad'
        ? 'NAGAD'
        : 'BANK';
    setMethod(channel);
    setF((currentForm) => ({
      ...currentForm,
      toAccountNumber: '',
      recipientName: beneficiary.name,
      recipientNumber: beneficiary.accountNumber,
      bankName: channel === 'BANK' ? beneficiary.bankName : currentForm.bankName,
    }));
  };

  useEffect(() => {
    if (location.state?.beneficiaryId && beneficiaries.length) {
      selectBeneficiary(location.state.beneficiaryId);
    }
  }, [location.state?.beneficiaryId, beneficiaries]);

  const availableBeneficiaries = beneficiaries.filter((beneficiary) => {
    if (method === 'EBANK') return beneficiary.bankName === 'E-Bank';
    if (method === 'BKASH') return beneficiary.bankName === 'bKash';
    if (method === 'NAGAD') return beneficiary.bankName === 'Nagad';
    return TOP_BANKS.includes(beneficiary.bankName);
  });

  const current = METHODS.find((m) => m.id === method);
  const amount = Number(f.amount) || 0;
  const totalDebit = amount + (amount > 0 ? current.fee : 0);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setMsg(''); setErr('');

    if (!f.fromAccountId) return setErr('Please select your account first');
    if (!amount || amount <= 0) return setErr('Please enter a valid amount');

    try {
      if (method === 'EBANK') {
        if (!f.toAccountNumber.trim()) return setErr('Please enter the receiver\'s E-Bank account number');
        await api.post('/transfer', {
          fromAccountId: f.fromAccountId,
          toAccountNumber: f.toAccountNumber.trim(),
          amount,
          description: f.description,
        });
        setMsg(`✅ Successfully transferred ৳${amount.toLocaleString()} to E-Bank account ${f.toAccountNumber}`);
      } else {
        if (!f.recipientName.trim()) return setErr('Please enter the recipient\'s name');
        if (method === 'BKASH' || method === 'NAGAD') {
          if (!/^01[3-9]\d{8}$/.test(f.recipientNumber.replace(/[\s-]/g, '')))
            return setErr('Please enter a valid 11-digit mobile number starting with 01');
        } else if (!/^\d{10,20}$/.test(f.recipientNumber.replace(/[\s-]/g, ''))) {
          return setErr('Please enter a valid bank account number (10-20 digits)');
        }
        const { data } = await api.post('/transfer/external', {
          fromAccountId: f.fromAccountId,
          channel: method,
          bankName: method === 'BANK' ? f.bankName : undefined,
          recipientName: f.recipientName.trim(),
          recipientNumber: f.recipientNumber.trim(),
          amount,
          description: f.description,
        });
        setMsg(`✅ ${data.message} (fee ৳${data.fee}, total debited ৳${Number(data.totalDebit).toLocaleString()})`);
      }
      // Reload account list to refresh balance
      const r = await api.get('/accounts/my');
      setAccs(r.data);
      setF((x) => ({ ...x, amount: '', recipientNumber: '', toAccountNumber: '', description: '' }));
    } catch (x) {
      setErr('❌ ' + (x.response?.data?.message || 'Transfer failed - please check if the backend is running'));
    }
  };

  return (
    <form onSubmit={submit} className="box form" style={{ maxWidth: 560 }}>
      <h2>Transfer Money</h2>

      <label><b>1. Where do you want to send money?</b></label>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, margin: '8px 0 4px' }}>
        {METHODS.map((m) => (
          <button
            type="button"
            key={m.id}
            onClick={() => setMethod(m.id)}
            style={{
              background: method === m.id ? '#2563eb' : '#eef2ff',
              color: method === m.id ? '#fff' : '#1e293b',
              border: '1px solid #c7d2fe',
              textAlign: 'left',
            }}
          >
            {m.label}
          </button>
        ))}
      </div>
      <p style={{ color: '#555', marginTop: 0 }}>{current.hint}</p>

      <label><b>2. From which account?</b></label>
      <select value={f.fromAccountId} onChange={set('fromAccountId')} required disabled={!accs.some((account) => account.status === 'ACTIVE')}>
        {accs.filter((account) => account.status === 'ACTIVE').map((a) => (
          <option key={a.id} value={a.id}>
            {a.type} - {a.accountNumber} (৳{Number(a.balance).toLocaleString()})
          </option>
        ))}
      </select>
      {!accs.some((account) => account.status === 'ACTIVE') && <p style={{ color: '#b42318' }}>No active accounts available for transfers. Check your account status or contact the bank.</p>}

      <label><b>3. Who is the recipient?</b></label>
      {availableBeneficiaries.length > 0 && (
        <select
          className="saved-beneficiary-select"
          aria-label="Choose a saved recipient"
          value=""
          onChange={(event) => selectBeneficiary(event.target.value)}
        >
          <option value="">Choose a saved recipient</option>
          {availableBeneficiaries.map((beneficiary) => (
            <option key={beneficiary.id} value={beneficiary.id}>
              {beneficiary.name} · {beneficiary.accountNumber}
            </option>
          ))}
        </select>
      )}
      {method === 'EBANK' && (
        <input placeholder="Receiver's E-Bank account number" value={f.toAccountNumber} onChange={set('toAccountNumber')} required />
      )}
      {(method === 'BKASH' || method === 'NAGAD') && (
        <>
          <input placeholder="Recipient's name" value={f.recipientName} onChange={set('recipientName')} required />
          <input placeholder={`${method === 'BKASH' ? 'bKash' : 'Nagad'} number (11 digits, starting with 01)`} value={f.recipientNumber} onChange={set('recipientNumber')} required />
        </>
      )}
      {method === 'BANK' && (
        <>
          <select value={f.bankName} onChange={set('bankName')}>
            {TOP_BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <input placeholder="Account holder's name" value={f.recipientName} onChange={set('recipientName')} required />
          <input placeholder="Bank account number" value={f.recipientNumber} onChange={set('recipientNumber')} required />
        </>
      )}

      <label><b>4. How much amount?</b></label>
      <input placeholder="Amount (taka)" type="number" min="1" value={f.amount} onChange={set('amount')} required />
      <input placeholder="Note / Description (optional)" value={f.description} onChange={set('description')} />

      {amount > 0 && (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 10 }}>
          Amount: ৳{amount.toLocaleString()} &nbsp;|&nbsp; Fee: ৳{current.fee} &nbsp;|&nbsp; <b>Total debit from account: ৳{totalDebit.toLocaleString()}</b>
        </div>
      )}

      {err && <p style={{ color: '#b42318' }}>{err}</p>}
      {msg && <p style={{ color: '#067647' }}>{msg}</p>}

      <button style={{ width: '100%', marginTop: 10 }} disabled={!accs.some((account) => account.status === 'ACTIVE')}>Send Money</button>

      <p style={{ color: '#888', fontSize: 13 }}>
        Note: bKash / Nagad / other bank transfers are simulated within this project - money is debited from the account and recorded in transaction history. To send real money to those accounts, the provider's official API or a bank agreement is required.
      </p>
    </form>
  );
}