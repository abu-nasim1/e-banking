const router = require('express').Router();
const { Prisma } = require('@prisma/client');
const prisma = require('../config/prisma');
const auth = require('../middleware/auth');
const { fromCents, toCents } = require('../utils/loan-schedule');

router.use(auth);

router.get('/my', async (req, res) => {
  try {
    const applications = await prisma.loanApplication.findMany({
      where: { applicantId: req.user.id },
      include: {
        account: { select: { id: true, accountNumber: true, balance: true, status: true } },
        installments: { orderBy: { installmentNumber: 'asc' } },
        repayments: { orderBy: { createdAt: 'desc' }, select: { id: true, amount: true, paymentType: true, createdAt: true } },
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

router.post('/:id/payments', async (req, res) => {
  const fullSettlement = req.body.fullSettlement === true;
  const requestedAmount = Number(req.body.amount);
  if (!fullSettlement && (!Number.isFinite(requestedAmount) || requestedAmount < 0.01)) {
    return res.status(400).json({ message: 'Enter a positive repayment amount or choose full settlement' });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const loan = await tx.loanApplication.findFirst({
        where: { id: req.params.id, applicantId: req.user.id },
        include: {
          account: { select: { id: true, accountNumber: true, balance: true, status: true } },
          installments: { orderBy: { installmentNumber: 'asc' } },
        },
      });
      if (!loan) throw Object.assign(new Error('Loan not found'), { status: 404 });
      if (loan.status !== 'APPROVED') throw Object.assign(new Error('Only an active approved loan can be repaid'), { status: 409 });

      const principalCents = toCents(loan.amount);
      const repaidCents = toCents(loan.repaidAmount);
      const outstandingCents = principalCents - repaidCents;
      const paymentCents = fullSettlement ? outstandingCents : toCents(requestedAmount);
      if (paymentCents <= 0 || paymentCents > outstandingCents) {
        throw Object.assign(new Error('Repayment cannot exceed the outstanding loan balance'), { status: 400 });
      }
      if (loan.account.status !== 'ACTIVE') {
        throw Object.assign(new Error('The loan account is not active and cannot make repayments'), { status: 423 });
      }

      const paymentAmount = fromCents(paymentCents);
      const accountUpdate = await tx.account.updateMany({
        where: {
          id: loan.accountId,
          userId: req.user.id,
          status: 'ACTIVE',
          balance: { gte: paymentAmount },
        },
        data: { balance: { decrement: paymentAmount } },
      });
      if (accountUpdate.count !== 1) {
        throw Object.assign(new Error('Insufficient account balance for this repayment'), { status: 400 });
      }

      const nextRepaidCents = repaidCents + paymentCents;
      const loanUpdate = await tx.loanApplication.updateMany({
        where: {
          id: loan.id,
          applicantId: req.user.id,
          status: 'APPROVED',
          repaidAmount: { lte: fromCents(principalCents - paymentCents) },
        },
        data: {
          repaidAmount: { increment: paymentAmount },
          ...(nextRepaidCents === principalCents ? { status: 'PAID' } : {}),
        },
      });
      if (loanUpdate.count !== 1) throw Object.assign(new Error('Loan balance changed. Refresh and retry the payment.'), { status: 409 });

      let remainingPaymentCents = paymentCents;
      for (const installment of loan.installments) {
        if (remainingPaymentCents <= 0) break;
        const installmentCents = toCents(installment.amount);
        const alreadyPaidCents = toCents(installment.paidAmount);
        const dueCents = installmentCents - alreadyPaidCents;
        if (dueCents <= 0) continue;
        const appliedCents = Math.min(dueCents, remainingPaymentCents);
        const newPaidCents = alreadyPaidCents + appliedCents;
        const installmentPaid = newPaidCents === installmentCents;
        await tx.loanInstallment.update({
          where: { id: installment.id },
          data: {
            paidAmount: fromCents(newPaidCents),
            status: installmentPaid ? 'PAID' : 'PENDING',
            paidAt: installmentPaid ? new Date() : null,
          },
        });
        remainingPaymentCents -= appliedCents;
      }
      if (remainingPaymentCents !== 0) throw Object.assign(new Error('Repayment schedule does not match the outstanding loan amount'), { status: 409 });

      const account = await tx.account.findUnique({ where: { id: loan.accountId }, select: { balance: true } });
      const transaction = await tx.transaction.create({
        data: {
          accountId: loan.accountId,
          type: 'LOAN_REPAYMENT',
          amount: paymentAmount,
          balanceAfter: Number(account.balance),
          description: nextRepaidCents === principalCents ? 'Loan full settlement' : 'Loan repayment',
        },
      });
      const nextInstallment = loan.installments.find((installment) => toCents(installment.paidAmount) < toCents(installment.amount));
      const paymentType = nextRepaidCents === principalCents
        ? 'FULL_SETTLEMENT'
        : paymentCents === (nextInstallment ? toCents(nextInstallment.amount) - toCents(nextInstallment.paidAmount) : 0)
          ? 'INSTALLMENT'
          : 'PARTIAL';
      await tx.loanRepayment.create({
        data: {
          loanApplicationId: loan.id,
          transactionId: transaction.id,
          amount: paymentAmount,
          paymentType,
        },
      });

      const updatedLoan = await tx.loanApplication.findUnique({
        where: { id: loan.id },
        include: {
          account: { select: { id: true, accountNumber: true, balance: true, status: true } },
          installments: { orderBy: { installmentNumber: 'asc' } },
          repayments: { orderBy: { createdAt: 'desc' }, select: { id: true, amount: true, paymentType: true, createdAt: true } },
        },
      });
      return updatedLoan;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    res.json(result);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    if (error.code === 'P2034') return res.status(409).json({ message: 'Another repayment was processed at the same time. Refresh and retry.' });
    console.error('Loan repayment failed:', error);
    res.status(500).json({ message: 'Could not process loan repayment' });
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
        where: {
          applicantId: req.user.id,
          OR: [
            { status: { in: ['PENDING_MANAGER', 'PENDING_OWNER'] } },
            { status: 'APPROVED', disbursedAt: { not: null } },
          ],
        },
        select: { id: true },
      });
      if (pending) throw Object.assign(new Error('You already have a loan application awaiting review or an active loan to repay'), { status: 409 });

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