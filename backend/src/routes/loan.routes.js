const router = require('express').Router();
const prisma = require('../config/prisma');
const auth = require('../middleware/auth');

router.use(auth);

router.get('/my', async (req, res) => {
  try {
    const applications = await prisma.loanApplication.findMany({
      where: { applicantId: req.user.id },
      include: {
        account: { select: { accountNumber: true } },
        managerReviewedBy: { select: { name: true } },
        reviewedBy: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(applications);
  } catch (error) {
    console.error('Customer loan applications failed:', error);
    if (error.code === 'P1000') {
      return res.status(503).json({ message: 'Database login failed. Check DATABASE_URL in backend/.env against the running PostgreSQL server.' });
    }
    if (error.code === 'P2021') {
      return res.status(503).json({ message: 'Loan storage is not initialized. Run npx prisma db push from the backend folder.' });
    }
    res.status(500).json({ message: 'Could not load loan applications' });
  }
});

router.post('/', async (req, res) => {
  const { accountId, amount, termMonths, purpose, employment, monthlyIncome } = req.body;
  const loanAmount = Number(amount);
  const income = Number(monthlyIncome);
  const term = Number(termMonths);
  const cleanPurpose = typeof purpose === 'string' ? purpose.trim() : '';
  const cleanEmployment = typeof employment === 'string' ? employment.trim() : '';

  if (!accountId || !Number.isFinite(loanAmount) || loanAmount <= 0 || loanAmount > 9999999999.99 || !Number.isFinite(income) || income <= 0 || income > 9999999999.99 || !Number.isInteger(term) || term < 1 || term > 360 || cleanPurpose.length < 10 || cleanPurpose.length > 500 || cleanEmployment.length < 2 || cleanEmployment.length > 100) {
    return res.status(400).json({ message: 'Provide an active account, positive loan amount and monthly income, a 1-360 month term, employment details, and a purpose of 10-500 characters' });
  }

  try {
    const application = await prisma.$transaction(async (tx) => {
      const customer = await tx.user.findUnique({
        where: { id: req.user.id },
        select: { role: true, approvalStatus: true },
      });
      if (!customer || customer.role !== 'USER' || customer.approvalStatus !== 'ACTIVE') {
        throw Object.assign(new Error('Only active customer accounts can apply for a loan'), { status: 403 });
      }

      const account = await tx.account.findFirst({
        where: { id: accountId, userId: req.user.id, status: 'ACTIVE' },
        select: { id: true },
      });
      if (!account) throw Object.assign(new Error('Choose one of your active bank accounts'), { status: 400 });

      const pending = await tx.loanApplication.findFirst({
        where: { applicantId: req.user.id, status: { in: ['PENDING_MANAGER', 'PENDING_OWNER'] } },
        select: { id: true },
      });
      if (pending) throw Object.assign(new Error('You already have a loan application awaiting review'), { status: 409 });

      return tx.loanApplication.create({
        data: {
          accountId: account.id,
          applicantId: req.user.id,
          amount: loanAmount,
          termMonths: term,
          purpose: cleanPurpose,
          employment: cleanEmployment,
          monthlyIncome: income,
        },
        include: { account: { select: { accountNumber: true } } },
      });
    });
    res.status(201).json(application);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    console.error('Loan application submission failed:', error);
    res.status(500).json({ message: 'Could not submit loan application' });
  }
});

module.exports = router;