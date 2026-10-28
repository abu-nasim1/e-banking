const router = require('express').Router();
const prisma = require('../config/prisma');
const auth = require('../middleware/auth');

const TOP_BANKS = [
	'Sonali Bank PLC',
	'Islami Bank Bangladesh PLC',
	'BRAC Bank PLC',
	'Dutch-Bangla Bank PLC',
	'Eastern Bank PLC',
];
const VALID_DESTINATIONS = new Set(['E-Bank', 'bKash', 'Nagad', ...TOP_BANKS]);

function parseBeneficiary(body) {
	const name = String(body.name || '').trim();
	const bankName = String(body.bankName || 'E-Bank').trim();
	let accountNumber = String(body.accountNumber || '').trim();

	if (name.length < 2 || name.length > 80) {
		return { error: 'Name must be between 2 and 80 characters' };
	}
	if (!VALID_DESTINATIONS.has(bankName)) {
		return { error: 'Please select a supported destination' };
	}

	const normalizedNumber = accountNumber.replace(/[\s-]/g, '');
	if (bankName === 'bKash' || bankName === 'Nagad') {
		if (!/^01[3-9]\d{8}$/.test(normalizedNumber)) {
			return { error: 'Enter a valid 11-digit mobile number starting with 01' };
		}
		accountNumber = normalizedNumber;
	} else if (bankName === 'E-Bank') {
		if (!/^\d{6,20}$/.test(normalizedNumber)) {
			return { error: 'E-Bank account number must contain 6 to 20 digits' };
		}
		accountNumber = normalizedNumber;
	} else {
		if (!/^\d{10,20}$/.test(normalizedNumber)) {
			return { error: 'Bank account number must contain 10 to 20 digits' };
		}
		accountNumber = normalizedNumber;
	}

	return { data: { name, accountNumber, bankName } };
}

async function findDuplicate(userId, accountNumber, bankName, exceptId) {
	const existing = await prisma.beneficiary.findMany({
		where: { userId, bankName, ...(exceptId ? { id: { not: exceptId } } : {}) },
		select: { accountNumber: true },
	});
	const normalizedNumber = accountNumber.replace(/[\s-]/g, '').toLowerCase();
	return existing.some((item) => item.accountNumber.replace(/[\s-]/g, '').toLowerCase() === normalizedNumber);
}

router.use(auth);

router.get('/', async (req, res) => {
	try {
		const beneficiaries = await prisma.beneficiary.findMany({
			where: { userId: req.user.id },
			orderBy: { createdAt: 'desc' },
		});
		res.json(beneficiaries);
	} catch (error) {
		console.error(error);
		res.status(500).json({ message: 'Could not load beneficiaries' });
	}
});

router.post('/', async (req, res) => {
	try {
		const parsed = parseBeneficiary(req.body);
		if (parsed.error) return res.status(400).json({ message: parsed.error });
		if (await findDuplicate(req.user.id, parsed.data.accountNumber, parsed.data.bankName)) {
			return res.status(409).json({ message: 'This recipient is already saved' });
		}

		const beneficiary = await prisma.beneficiary.create({
			data: { ...parsed.data, userId: req.user.id },
		});
		res.status(201).json(beneficiary);
	} catch (error) {
		console.error(error);
		res.status(500).json({ message: 'Could not save beneficiary' });
	}
});

router.put('/:id', async (req, res) => {
	try {
		const parsed = parseBeneficiary(req.body);
		if (parsed.error) return res.status(400).json({ message: parsed.error });

		const existing = await prisma.beneficiary.findFirst({
			where: { id: req.params.id, userId: req.user.id },
		});
		if (!existing) return res.status(404).json({ message: 'Beneficiary not found' });
		if (await findDuplicate(req.user.id, parsed.data.accountNumber, parsed.data.bankName, existing.id)) {
			return res.status(409).json({ message: 'This recipient is already saved' });
		}

		const beneficiary = await prisma.beneficiary.update({
			where: { id: existing.id },
			data: parsed.data,
		});
		res.json(beneficiary);
	} catch (error) {
		console.error(error);
		res.status(500).json({ message: 'Could not update beneficiary' });
	}
});

router.delete('/:id', async (req, res) => {
	try {
		const result = await prisma.beneficiary.deleteMany({
			where: { id: req.params.id, userId: req.user.id },
		});
		if (!result.count) return res.status(404).json({ message: 'Beneficiary not found' });
		res.json({ message: 'Beneficiary deleted' });
	} catch (error) {
		console.error(error);
		res.status(500).json({ message: 'Could not delete beneficiary' });
	}
});

module.exports = router;
