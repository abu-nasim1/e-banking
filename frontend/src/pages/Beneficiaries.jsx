import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, Check, Copy, Landmark, Pencil, Plus, Search, Smartphone, Trash2, WalletCards, X } from 'lucide-react';
import api from '../api/axios';

const BANKS = [
	'Sonali Bank PLC',
	'Islami Bank Bangladesh PLC',
	'BRAC Bank PLC',
	'Dutch-Bangla Bank PLC',
	'Eastern Bank PLC',
];

const FILTERS = ['All', 'E-Bank', 'Mobile wallet', 'Other bank'];

function getCategory(bankName) {
	if (bankName === 'E-Bank') return 'E-Bank';
	if (bankName === 'bKash' || bankName === 'Nagad') return 'Mobile wallet';
	return 'Other bank';
}

function getIcon(bankName) {
	if (bankName === 'E-Bank') return WalletCards;
	if (bankName === 'bKash' || bankName === 'Nagad') return Smartphone;
	return Landmark;
}

export default function Beneficiaries() {
	const navigate = useNavigate();
	const [list, setList] = useState([]);
	const [form, setForm] = useState({ name: '', accountNumber: '', bankName: 'E-Bank' });
	const [query, setQuery] = useState('');
	const [filter, setFilter] = useState('All');
	const [editingId, setEditingId] = useState('');
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState('');
	const [notice, setNotice] = useState('');
	const [copiedId, setCopiedId] = useState('');

	const load = async () => {
		try {
			setError('');
			const { data } = await api.get('/beneficiaries');
			setList(Array.isArray(data) ? data : []);
		} catch (requestError) {
			setError(requestError.response?.data?.message || 'Could not load saved recipients. Please try again.');
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
	}, []);

	const visibleList = useMemo(() => {
		const normalizedQuery = query.trim().toLowerCase();
		return list.filter((beneficiary) => {
			const matchesFilter = filter === 'All' || getCategory(beneficiary.bankName) === filter;
			const matchesQuery = !normalizedQuery || [beneficiary.name, beneficiary.accountNumber, beneficiary.bankName]
				.some((value) => String(value || '').toLowerCase().includes(normalizedQuery));
			return matchesFilter && matchesQuery;
		});
	}, [filter, list, query]);

	const resetForm = () => {
		setForm({ name: '', accountNumber: '', bankName: 'E-Bank' });
		setEditingId('');
	};

	const handleSubmit = async (event) => {
		event.preventDefault();
		setError('');
		setNotice('');
		setSaving(true);

		try {
			const request = editingId
				? api.put(`/beneficiaries/${editingId}`, form)
				: api.post('/beneficiaries', form);
			await request;
			setNotice(editingId ? 'Recipient details updated.' : 'Recipient saved and ready for transfer.');
			resetForm();
			await load();
		} catch (requestError) {
			setError(requestError.response?.data?.message || 'Could not save this recipient. Please try again.');
		} finally {
			setSaving(false);
		}
	};

	const startEdit = (beneficiary) => {
		setForm({
			name: beneficiary.name,
			accountNumber: beneficiary.accountNumber,
			bankName: beneficiary.bankName,
		});
		setEditingId(beneficiary.id);
		setError('');
		setNotice('');
		window.scrollTo({ top: 0, behavior: 'smooth' });
	};

	const remove = async (beneficiary) => {
		if (!window.confirm(`Remove ${beneficiary.name} from saved recipients?`)) return;
		setError('');
		setNotice('');
		try {
			await api.delete(`/beneficiaries/${beneficiary.id}`);
			if (editingId === beneficiary.id) resetForm();
			setNotice(`${beneficiary.name} was removed.`);
			await load();
		} catch (requestError) {
			setError(requestError.response?.data?.message || 'Could not remove this recipient.');
		}
	};

	const copyNumber = async (beneficiary) => {
		try {
			await navigator.clipboard.writeText(beneficiary.accountNumber);
			setCopiedId(beneficiary.id);
			window.setTimeout(() => setCopiedId(''), 1800);
		} catch {
			setError('Clipboard access is unavailable in this browser.');
		}
	};

	return (
		<div className="beneficiaries-page">
			<header className="beneficiaries-heading">
				<div>
					<span className="eyebrow">PAYMENTS</span>
					<h1>Beneficiaries</h1>
					<p>Keep trusted recipients ready for your next transfer.</p>
				</div>
				<div className="beneficiary-count">
					<strong>{list.length}</strong>
					<span>Saved recipients</span>
				</div>
			</header>

			{error && <div className="beneficiary-message error" role="alert">{error}</div>}
			{notice && <div className="beneficiary-message success" role="status">{notice}</div>}

			<div className="beneficiaries-layout">
				<section className="beneficiary-editor box">
					<div className="beneficiary-section-heading">
						<div className="beneficiary-heading-icon"><Plus size={18} /></div>
						<div>
							<h2>{editingId ? 'Edit recipient' : 'Add a recipient'}</h2>
							<p>Recipient details are stored securely with your account.</p>
						</div>
					</div>

					<form onSubmit={handleSubmit}>
						<label htmlFor="beneficiary-name">Recipient name</label>
						<input
							id="beneficiary-name"
							value={form.name}
							onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
							placeholder="e.g. Nasim Ahmed"
							minLength={2}
							maxLength={80}
							autoComplete="name"
							required
						/>

						<label htmlFor="beneficiary-destination">Destination</label>
						<select
							id="beneficiary-destination"
							value={form.bankName}
							onChange={(event) => setForm((current) => ({ ...current, bankName: event.target.value, accountNumber: '' }))}
						>
							<option value="E-Bank">E-Bank account</option>
							<option value="bKash">bKash wallet</option>
							<option value="Nagad">Nagad wallet</option>
							<optgroup label="Other banks">
								{BANKS.map((bank) => <option key={bank} value={bank}>{bank}</option>)}
							</optgroup>
						</select>

						<label htmlFor="beneficiary-number">
							{form.bankName === 'bKash' || form.bankName === 'Nagad' ? 'Mobile number' : 'Account number'}
						</label>
						<input
							id="beneficiary-number"
							type="text"
							inputMode="numeric"
							value={form.accountNumber}
							onChange={(event) => setForm((current) => ({ ...current, accountNumber: event.target.value }))}
							placeholder={form.bankName === 'bKash' || form.bankName === 'Nagad' ? '01XXXXXXXXX' : 'Enter account number'}
							autoComplete="off"
							required
						/>
						<p className="field-hint">
							{form.bankName === 'E-Bank' ? '6–20 digits' : form.bankName === 'bKash' || form.bankName === 'Nagad' ? '11-digit Bangladesh mobile number' : '10–20 digits'}
						</p>

						<div className="beneficiary-form-actions">
							{editingId && (
								<button className="button-secondary" type="button" onClick={resetForm}>
									<X size={16} /> Cancel
								</button>
							)}
							<button type="submit" disabled={saving}>
								{editingId ? <Check size={16} /> : <Plus size={16} />}
								{saving ? 'Saving...' : editingId ? 'Save changes' : 'Save recipient'}
							</button>
						</div>
					</form>
				</section>

				<section className="beneficiary-directory">
					<div className="directory-heading">
						<div>
							<h2>Your recipients</h2>
							<p>{visibleList.length} {visibleList.length === 1 ? 'recipient' : 'recipients'}</p>
						</div>
						<label className="beneficiary-search">
							<Search size={17} aria-hidden="true" />
							<input
								aria-label="Search beneficiaries"
								placeholder="Search recipients"
								value={query}
								onChange={(event) => setQuery(event.target.value)}
							/>
						</label>
					</div>

					<div className="beneficiary-filters" aria-label="Filter recipients">
						{FILTERS.map((item) => (
							<button
								className={filter === item ? 'filter-chip active' : 'filter-chip'}
								key={item}
								type="button"
								aria-pressed={filter === item}
								onClick={() => setFilter(item)}
							>
								{item}
							</button>
						))}
					</div>

					{loading ? (
						<div className="beneficiary-empty box">Loading recipients...</div>
					) : visibleList.length ? (
						<div className="beneficiary-list">
							{visibleList.map((beneficiary) => {
								const Icon = getIcon(beneficiary.bankName);
								return (
									<article className="beneficiary-card" key={beneficiary.id}>
										<div className="beneficiary-avatar"><Icon size={20} /></div>
										<div className="beneficiary-details">
											<div className="beneficiary-name-line">
												<h3>{beneficiary.name}</h3>
												<span className="destination-tag">{beneficiary.bankName}</span>
											</div>
											<p>{beneficiary.accountNumber}</p>
										</div>
										<div className="beneficiary-actions">
											<button className="icon-action" type="button" title="Copy account number" aria-label={`Copy ${beneficiary.name}'s account number`} onClick={() => copyNumber(beneficiary)}>
												{copiedId === beneficiary.id ? <Check size={17} /> : <Copy size={17} />}
											</button>
											<button className="icon-action" type="button" title="Edit recipient" aria-label={`Edit ${beneficiary.name}`} onClick={() => startEdit(beneficiary)}>
												<Pencil size={17} />
											</button>
											<button className="icon-action danger" type="button" title="Remove recipient" aria-label={`Remove ${beneficiary.name}`} onClick={() => remove(beneficiary)}>
												<Trash2 size={17} />
											</button>
											<button className="transfer-shortcut" type="button" onClick={() => navigate('/transfer', { state: { beneficiaryId: beneficiary.id } })}>
												Transfer <ArrowUpRight size={16} />
											</button>
										</div>
									</article>
								);
							})}
						</div>
					) : (
						<div className="beneficiary-empty box">
							<div className="beneficiary-empty-icon"><WalletCards size={22} /></div>
							<h3>{list.length ? 'No matching recipients' : 'No recipients saved yet'}</h3>
							<p>{list.length ? 'Try another search or destination filter.' : 'Add a trusted recipient and they will be available from the transfer form.'}</p>
							{list.length > 0 && <button className="button-secondary" type="button" onClick={() => { setQuery(''); setFilter('All'); }}>Clear filters</button>}
						</div>
					)}
				</section>
			</div>
		</div>
	);
}
