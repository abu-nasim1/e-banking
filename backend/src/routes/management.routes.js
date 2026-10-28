const router = require('express').Router();
const prisma = require('../config/prisma');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/require-role');
const { genAccountNumber, genCardNumber } = require('../utils/helpers');
const { enableExpiredAccountFreezes } = require('../utils/account-status');

router.use(auth);

const ownerOnly = requireRole('OWNER', 'ADMIN');
const staffRead = requireRole('OWNER', 'ADMIN', 'MANAGER');
const includeEmployeeFields = {
  id: true,
  employeeCode: true,
  name: true,
  email: true,
  phone: true,
  jobTitle: true,
  department: true,
  monthlySalary: true,
  performanceScore: true,
  status: true,
  createdAt: true,
};
const managerEmployeeFields = {
  id: true,
  employeeCode: true,
  name: true,
  jobTitle: true,
  department: true,
  performanceScore: true,
  status: true,
};

const validScore = (score) => Number.isInteger(Number(score)) && Number(score) >= 0 && Number(score) <= 100;
const validSalary = (salary) => Number.isFinite(Number(salary)) && Number(salary) >= 0;
const writeAudit = (tx, actorId, action, entityType, entityId, details) => tx.auditLog.create({
  data: { actorId, action, entityType, entityId, details },
});

router.get('/overview', staffRead, async (_req, res) => {
  try {
    const [employeeCount, activeEmployeeCount, customerCount, pendingCustomerCount, accountCount, balance, transactionCount, recentTransactions, transactionTypes] = await Promise.all([
      prisma.employee.count(),
      prisma.employee.count({ where: { status: 'ACTIVE' } }),
      prisma.user.count({ where: { role: 'USER', approvalStatus: 'ACTIVE' } }),
      prisma.user.count({ where: { role: 'USER', approvalStatus: 'PENDING' } }),
      prisma.account.count(),
      prisma.account.aggregate({ _sum: { balance: true } }),
      prisma.transaction.count(),
      prisma.transaction.findMany({
        take: 8,
        orderBy: { createdAt: 'desc' },
        include: { account: { select: { accountNumber: true, user: { select: { name: true, email: true } } } } },
      }),
      prisma.transaction.groupBy({ by: ['type'], _sum: { amount: true }, _count: { _all: true } }),
    ]);
    res.json({
      employees: employeeCount,
      activeEmployees: activeEmployeeCount,
      customers: customerCount,
      pendingCustomers: pendingCustomerCount,
      accounts: accountCount,
      totalBalance: Number(balance._sum.balance || 0),
      transactions: transactionCount,
      recentTransactions,
      transactionTypes,
    });
  } catch (error) {
    console.error('Management overview failed:', error);
    res.status(500).json({ message: 'Could not load management overview' });
  }
});

router.get('/customer-registrations', staffRead, async (_req, res) => {
  try {
    const registrations = await prisma.user.findMany({
      where: { role: 'USER' },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        approvalStatus: true,
        approvalNote: true,
        createdAt: true,
        approvalReviewedAt: true,
        approvalReviewedBy: { select: { name: true } },
      },
      orderBy: [{ approvalStatus: 'asc' }, { createdAt: 'desc' }],
    });
    res.json(registrations);
  } catch (error) {
    console.error('Customer registrations failed:', error);
    res.status(500).json({ message: 'Could not load customer registrations' });
  }
});

router.post('/customer-registrations/:id/decision', staffRead, async (req, res) => {
  const decision = String(req.body.decision || '').toUpperCase();
  const approvalNote = typeof req.body.note === 'string' ? req.body.note.trim() : '';
  if (!['APPROVED', 'REJECTED'].includes(decision)) {
    return res.status(400).json({ message: 'Choose approve or reject' });
  }
  if (approvalNote.length > 300) {
    return res.status(400).json({ message: 'Review note must be 300 characters or fewer' });
  }

  try {
    const user = await prisma.$transaction(async (tx) => {
      const current = await tx.user.findUnique({ where: { id: req.params.id } });
      if (!current || current.role !== 'USER') throw Object.assign(new Error('Customer registration not found'), { status: 404 });
      if (current.approvalStatus !== 'PENDING') throw Object.assign(new Error('This registration has already been reviewed'), { status: 409 });

      const update = await tx.user.updateMany({
        where: { id: current.id, role: 'USER', approvalStatus: 'PENDING' },
        data: {
          approvalStatus: decision === 'APPROVED' ? 'ACTIVE' : 'REJECTED',
          approvalNote: approvalNote || null,
          approvalReviewedAt: new Date(),
          approvalReviewedById: req.user.id,
        },
      });
      if (update.count !== 1) throw Object.assign(new Error('This registration has already been reviewed'), { status: 409 });

      await writeAudit(tx, req.user.id, `CUSTOMER_REGISTRATION_${decision}`, 'User', current.id, {
        email: current.email,
        note: approvalNote || null,
      });
      return tx.user.findUnique({
        where: { id: current.id },
        select: { id: true, name: true, email: true, phone: true, approvalStatus: true, approvalNote: true, approvalReviewedAt: true, approvalReviewedBy: { select: { name: true } } },
      });
    });
    res.json(user);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    console.error('Customer registration decision failed:', error);
    res.status(500).json({ message: 'Could not review customer registration' });
  }
});

router.delete('/customers/:id/permanent', ownerOnly, async (req, res) => {
  try {
    await prisma.$transaction(async (tx) => {
      const customer = await tx.user.findUnique({
        where: { id: req.params.id },
        select: { id: true, role: true },
      });
      if (!customer || customer.role !== 'USER') {
        throw Object.assign(new Error('Customer not found'), { status: 404 });
      }

      await tx.auditLog.deleteMany({ where: { actorId: customer.id } });
      await tx.user.delete({ where: { id: customer.id } });
      await writeAudit(tx, req.user.id, 'CUSTOMER_DATA_PERMANENTLY_ERASED', 'User', null, { permanent: true });
    });
    res.json({ message: 'Customer registration and linked data were permanently removed.' });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    console.error('Customer data erasure failed:', error);
    res.status(500).json({ message: 'Could not permanently remove customer data' });
  }
});

router.get('/accounts', staffRead, async (req, res) => {
  try {
    await enableExpiredAccountFreezes(prisma);
    const search = String(req.query.search || '').trim();
    const employeeMatches = search ? await prisma.employee.findMany({
      where: {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { employeeCode: { contains: search, mode: 'insensitive' } },
          { department: { contains: search, mode: 'insensitive' } },
          { jobTitle: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      },
      select: { email: true },
    }) : [];
    const employeeEmails = employeeMatches.map((employee) => employee.email);
    const accounts = await prisma.account.findMany({
      where: search ? {
        OR: [
          { accountNumber: { contains: search, mode: 'insensitive' } },
          { user: { name: { contains: search, mode: 'insensitive' } } },
          { user: { email: { contains: search, mode: 'insensitive' } } },
          ...(employeeEmails.length ? [{ user: { email: { in: employeeEmails } } }] : []),
        ],
      } : {},
      select: {
        id: true,
        accountNumber: true,
        type: true,
        balance: true,
        status: true,
        frozenUntil: true,
        statusReason: true,
        createdAt: true,
        user: { select: { name: true, email: true, phone: true } },
        transactions: { select: { id: true, type: true, amount: true, createdAt: true, description: true }, orderBy: { createdAt: 'desc' }, take: 10 },
      },
      orderBy: { createdAt: 'desc' },
    });
    const accountEmails = [...new Set(accounts.map((account) => account.user.email))];
    const employees = accountEmails.length ? await prisma.employee.findMany({
      where: { email: { in: accountEmails } },
      select: { employeeCode: true, name: true, email: true, jobTitle: true, department: true },
    }) : [];
    const employeesByEmail = new Map(employees.map((employee) => [employee.email, employee]));
    res.json(accounts.map((account) => ({ ...account, employee: employeesByEmail.get(account.user.email) || null })));
  } catch (error) {
    console.error('Management accounts failed:', error);
    res.status(500).json({ message: 'Could not load customer accounts' });
  }
});

router.get('/accounts/:id/activity', staffRead, async (req, res) => {
  const requestedPage = Number(req.query.page || 1);
  if (!Number.isInteger(requestedPage) || requestedPage < 1) {
    return res.status(400).json({ message: 'Page must be a positive whole number' });
  }
  const pageSize = 50;

  try {
    await enableExpiredAccountFreezes(prisma, { id: req.params.id });
    const account = await prisma.account.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        accountNumber: true,
        type: true,
        balance: true,
        status: true,
        frozenUntil: true,
        statusReason: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            role: true,
            approvalStatus: true,
            approvalNote: true,
            approvalReviewedAt: true,
            approvalReviewedBy: { select: { name: true } },
            closedAt: true,
            createdAt: true,
          },
        },
      },
    });
    if (!account) return res.status(404).json({ message: 'Account not found' });

    const [employee, customerAccounts, accountApplications, totalTransactions, transactionTypes, transactions] = await Promise.all([
      prisma.employee.findUnique({
        where: { email: account.user.email },
        select: { employeeCode: true, name: true, jobTitle: true, department: true, status: true },
      }),
      prisma.account.findMany({
        where: { userId: account.user.id },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          accountNumber: true,
          type: true,
          balance: true,
          status: true,
          frozenUntil: true,
          statusReason: true,
          createdAt: true,
          cards: { select: { cardNumber: true, expiry: true, status: true } },
        },
      }),
      prisma.accountApplication.findMany({
        where: { applicantId: account.user.id },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          type: true,
          fullName: true,
          phone: true,
          email: true,
          nid: true,
          dateOfBirth: true,
          address: true,
          occupation: true,
          nomineeName: true,
          nomineePhone: true,
          initialDeposit: true,
          status: true,
          decisionNote: true,
          reviewedAt: true,
          createdAt: true,
          reviewedBy: { select: { name: true } },
        },
      }),
      prisma.transaction.count({ where: { accountId: account.id } }),
      prisma.transaction.groupBy({ by: ['type'], where: { accountId: account.id }, _sum: { amount: true }, _count: { _all: true } }),
      prisma.transaction.findMany({
        where: { accountId: account.id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (requestedPage - 1) * pageSize,
        take: pageSize,
        select: { id: true, type: true, amount: true, balanceAfter: true, description: true, createdAt: true },
      }),
    ]);
    res.json({
      account: { ...account, employee },
      customer: {
        ...account.user,
        accounts: customerAccounts.map((customerAccount) => ({
          ...customerAccount,
          cards: customerAccount.cards.map((card) => ({
            lastFour: card.cardNumber.replace(/\D/g, '').slice(-4),
            expiry: card.expiry,
            status: card.status,
          })),
        })),
        applications: accountApplications,
      },
      totalTransactions,
      page: requestedPage,
      pageSize,
      totalPages: Math.max(1, Math.ceil(totalTransactions / pageSize)),
      transactionTypes,
      transactions,
    });
  } catch (error) {
    console.error('Management account activity failed:', error);
    res.status(500).json({ message: 'Could not load account details and transactions' });
  }
});

router.post('/accounts/:id/freeze', ownerOnly, async (req, res) => {
  const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';
  const durationMinutes = req.body.durationMinutes === null || req.body.durationMinutes === undefined
    ? null
    : Number(req.body.durationMinutes);
  if (durationMinutes !== null && (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 43200)) {
    return res.status(400).json({ message: 'Freeze duration must be from 1 minute to 30 days, or blank for no expiry' });
  }
  if (reason.length > 300) return res.status(400).json({ message: 'Reason must be 300 characters or fewer' });

  try {
    const frozenUntil = durationMinutes === null ? null : new Date(Date.now() + durationMinutes * 60 * 1000);
    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.account.findUnique({ where: { id: req.params.id } });
      if (!current) throw Object.assign(new Error('Account not found'), { status: 404 });
      const account = await tx.account.update({
        where: { id: current.id },
        data: { status: 'FROZEN', frozenUntil, statusReason: reason || 'Temporarily disabled by bank owner' },
        select: { id: true, accountNumber: true, status: true, frozenUntil: true, statusReason: true },
      });
      await writeAudit(tx, req.user.id, 'ACCOUNT_FROZEN', 'Account', account.id, {
        accountNumber: account.accountNumber,
        frozenUntil: account.frozenUntil?.toISOString() || null,
        reason: account.statusReason,
      });
      return account;
    });
    res.json(result);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    console.error('Account freeze failed:', error);
    res.status(500).json({ message: 'Could not disable this account' });
  }
});

router.post('/accounts/:id/enable', ownerOnly, async (req, res) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.account.findUnique({ where: { id: req.params.id } });
      if (!current) throw Object.assign(new Error('Account not found'), { status: 404 });
      const account = await tx.account.update({
        where: { id: current.id },
        data: { status: 'ACTIVE', frozenUntil: null, statusReason: null },
        select: { id: true, accountNumber: true, status: true, frozenUntil: true, statusReason: true },
      });
      await writeAudit(tx, req.user.id, 'ACCOUNT_ENABLED', 'Account', account.id, { accountNumber: account.accountNumber });
      return account;
    });
    res.json(result);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    console.error('Account enable failed:', error);
    res.status(500).json({ message: 'Could not enable this account' });
  }
});

router.get('/transactions', staffRead, async (_req, res) => {
  try {
    const transactions = await prisma.transaction.findMany({
      take: 100,
      include: { account: { select: { accountNumber: true, user: { select: { name: true, email: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(transactions);
  } catch (error) {
    console.error('Management transactions failed:', error);
    res.status(500).json({ message: 'Could not load customer transactions' });
  }
});

router.get('/applications', staffRead, async (_req, res) => {
  try {
    const applications = await prisma.accountApplication.findMany({
      include: {
        applicant: { select: { name: true, email: true } },
        reviewedBy: { select: { name: true } },
        account: { select: { accountNumber: true } },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
    res.json(applications);
  } catch (error) {
    console.error('Account applications failed:', error);
    res.status(500).json({ message: 'Could not load account applications' });
  }
});

router.post('/applications/:id/decision', staffRead, async (req, res) => {
  const decision = String(req.body.decision || '').toUpperCase();
  const decisionNote = typeof req.body.note === 'string' ? req.body.note.trim() : '';
  if (!['APPROVED', 'REJECTED'].includes(decision)) {
    return res.status(400).json({ message: 'Choose approve or reject' });
  }
  if (decision === 'REJECTED' && decisionNote.length < 5) {
    return res.status(400).json({ message: 'Add a short reason when rejecting an application' });
  }

  try {
    const application = await prisma.$transaction(async (tx) => {
      const current = await tx.accountApplication.findUnique({ where: { id: req.params.id } });
      if (!current) throw Object.assign(new Error('Application not found'), { status: 404 });
      if (current.status !== 'PENDING') throw Object.assign(new Error('This application has already been reviewed'), { status: 409 });

      const claim = await tx.accountApplication.updateMany({
        where: { id: current.id, status: 'PENDING' },
        data: { status: decision, decisionNote: decisionNote || null, reviewedById: req.user.id, reviewedAt: new Date() },
      });
      if (claim.count !== 1) throw Object.assign(new Error('This application has already been reviewed'), { status: 409 });

      let account = null;
      if (decision === 'APPROVED') {
        account = await tx.account.create({ data: {
          accountNumber: genAccountNumber(),
          type: current.type,
          balance: current.initialDeposit,
          userId: current.applicantId,
        }});
        await tx.card.create({ data: { cardNumber: genCardNumber(), expiry: '12/29', accountId: account.id } });
        if (Number(current.initialDeposit) > 0) {
          await tx.transaction.create({ data: {
            type: 'DEPOSIT',
            amount: current.initialDeposit,
            balanceAfter: current.initialDeposit,
            description: 'Initial deposit on approved account application',
            accountId: account.id,
          }});
        }
        await tx.accountApplication.update({ where: { id: current.id }, data: { accountId: account.id } });
      }

      await writeAudit(tx, req.user.id, `ACCOUNT_APPLICATION_${decision}`, 'AccountApplication', current.id, {
        applicantId: current.applicantId,
        accountType: current.type,
        decisionNote: decisionNote || null,
        accountId: account?.id || null,
      });
      return tx.accountApplication.findUnique({
        where: { id: current.id },
        include: { applicant: { select: { name: true, email: true } }, reviewedBy: { select: { name: true } }, account: { select: { accountNumber: true } } },
      });
    });
    res.json(application);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    console.error('Account application decision failed:', error);
    res.status(500).json({ message: 'Could not review account application' });
  }
});

router.get('/loans', staffRead, async (req, res) => {
  try {
    const where = req.user.role === 'MANAGER'
      ? { OR: [{ status: 'PENDING_MANAGER' }, { managerReviewedById: req.user.id }] }
      : {};
    const applications = await prisma.loanApplication.findMany({
      where,
      include: {
        applicant: { select: { name: true, email: true, phone: true } },
        account: { select: { accountNumber: true, balance: true } },
        managerReviewedBy: { select: { name: true } },
        reviewedBy: { select: { name: true } },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
    res.json(applications);
  } catch (error) {
    console.error('Loan applications failed:', error);
    if (error.code === 'P1000') {
      return res.status(503).json({ message: 'Database login failed. Check DATABASE_URL in backend/.env against the running PostgreSQL server.' });
    }
    if (error.code === 'P2021') {
      return res.status(503).json({ message: 'Loan storage is not initialized. Run npx prisma db push from the backend folder.' });
    }
    res.status(500).json({ message: 'Could not load loan applications' });
  }
});

router.post('/loans/:id/decision', staffRead, async (req, res) => {
  const decision = String(req.body.decision || '').toUpperCase();
  const note = typeof req.body.note === 'string' ? req.body.note.trim() : '';
  if (!['APPROVED', 'REJECTED'].includes(decision)) {
    return res.status(400).json({ message: 'Choose approve or reject' });
  }
  if (decision === 'REJECTED' && note.length < 5) {
    return res.status(400).json({ message: 'Add a short reason when rejecting a loan application' });
  }
  if (note.length > 500) {
    return res.status(400).json({ message: 'Review note must be 500 characters or fewer' });
  }

  const isOwner = ['OWNER', 'ADMIN'].includes(req.user.role);
  try {
    const application = await prisma.$transaction(async (tx) => {
      const current = await tx.loanApplication.findUnique({ where: { id: req.params.id } });
      if (!current) throw Object.assign(new Error('Loan application not found'), { status: 404 });

      if (!isOwner) {
        if (current.status !== 'PENDING_MANAGER') {
          throw Object.assign(new Error('Only manager-stage loan applications can be reviewed'), { status: 409 });
        }
        const nextStatus = decision === 'APPROVED' ? 'PENDING_OWNER' : 'REJECTED';
        const claim = await tx.loanApplication.updateMany({
          where: { id: current.id, status: 'PENDING_MANAGER' },
          data: {
            status: nextStatus,
            managerNote: note || null,
            managerReviewedAt: new Date(),
            managerReviewedById: req.user.id,
          },
        });
        if (claim.count !== 1) throw Object.assign(new Error('This loan application has already been reviewed'), { status: 409 });
        await writeAudit(tx, req.user.id, `LOAN_APPLICATION_MANAGER_${decision}`, 'LoanApplication', current.id, {
          applicantId: current.applicantId,
          nextStatus,
          note: note || null,
        });
      } else {
        if (!['PENDING_MANAGER', 'PENDING_OWNER'].includes(current.status)) {
          throw Object.assign(new Error('This loan application already has a final decision'), { status: 409 });
        }
        const claim = await tx.loanApplication.updateMany({
          where: { id: current.id, status: { in: ['PENDING_MANAGER', 'PENDING_OWNER'] } },
          data: {
            status: decision,
            decisionNote: note || null,
            reviewedAt: new Date(),
            reviewedById: req.user.id,
          },
        });
        if (claim.count !== 1) throw Object.assign(new Error('This loan application already has a final decision'), { status: 409 });
        await writeAudit(tx, req.user.id, `LOAN_APPLICATION_OWNER_${decision}`, 'LoanApplication', current.id, {
          applicantId: current.applicantId,
          previousStatus: current.status,
          note: note || null,
        });
      }

      return tx.loanApplication.findUnique({
        where: { id: current.id },
        include: {
          applicant: { select: { name: true, email: true, phone: true } },
          account: { select: { accountNumber: true, balance: true } },
          managerReviewedBy: { select: { name: true } },
          reviewedBy: { select: { name: true } },
        },
      });
    });
    res.json(application);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    console.error('Loan application decision failed:', error);
    res.status(500).json({ message: 'Could not review loan application' });
  }
});

router.get('/employees', staffRead, async (req, res) => {
  try {
    const search = String(req.query.search || '').trim();
    const status = String(req.query.status || '').trim();
    const employees = await prisma.employee.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(search ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { employeeCode: { contains: search, mode: 'insensitive' } },
            { department: { contains: search, mode: 'insensitive' } },
            { jobTitle: { contains: search, mode: 'insensitive' } },
          ],
        } : {}),
      },
      select: req.user.role === 'MANAGER' ? managerEmployeeFields : includeEmployeeFields,
      orderBy: [{ status: 'asc' }, { name: 'asc' }],
    });
    res.json(employees);
  } catch (error) {
    console.error('Employee list failed:', error);
    res.status(500).json({ message: 'Could not load employee records' });
  }
});

router.post('/employees', ownerOnly, async (req, res) => {
  const { employeeCode, name, email, phone, jobTitle, department, monthlySalary, performanceScore } = req.body;
  if (![employeeCode, name, email, jobTitle, department].every((value) => typeof value === 'string' && value.trim())) {
    return res.status(400).json({ message: 'Employee code, name, email, title, and department are required' });
  }
  if (!validSalary(monthlySalary) || !validScore(performanceScore ?? 50)) {
    return res.status(400).json({ message: 'Enter a valid salary and performance score from 0 to 100' });
  }

  try {
    const employee = await prisma.$transaction(async (tx) => {
      const created = await tx.employee.create({
        data: {
          employeeCode: employeeCode.trim(),
          name: name.trim(),
          email: email.trim().toLowerCase(),
          phone: phone?.trim() || null,
          jobTitle: jobTitle.trim(),
          department: department.trim(),
          monthlySalary: Number(monthlySalary),
          performanceScore: Number(performanceScore ?? 50),
        },
        select: includeEmployeeFields,
      });
      await writeAudit(tx, req.user.id, 'EMPLOYEE_CREATED', 'Employee', created.id, { employeeCode: created.employeeCode });
      return created;
    });
    res.status(201).json(employee);
  } catch (error) {
    if (error.code === 'P2002') return res.status(409).json({ message: 'Employee code or email already exists' });
    console.error('Employee create failed:', error);
    res.status(500).json({ message: 'Could not create employee' });
  }
});

router.patch('/employees/:id', ownerOnly, async (req, res) => {
  const allowedFields = ['name', 'email', 'phone', 'jobTitle', 'department', 'monthlySalary', 'performanceScore', 'status'];
  const data = Object.fromEntries(Object.entries(req.body).filter(([key]) => allowedFields.includes(key)));
  if (!Object.keys(data).length) return res.status(400).json({ message: 'No editable employee fields provided' });
  if (data.monthlySalary !== undefined && !validSalary(data.monthlySalary)) {
    return res.status(400).json({ message: 'Salary must be a non-negative number' });
  }
  if (data.performanceScore !== undefined && !validScore(data.performanceScore)) {
    return res.status(400).json({ message: 'Performance score must be from 0 to 100' });
  }
  if (data.status !== undefined && !['ACTIVE', 'ON_LEAVE', 'INACTIVE'].includes(data.status)) {
    return res.status(400).json({ message: 'Choose a valid employee status' });
  }
  for (const field of ['name', 'email', 'jobTitle', 'department']) {
    if (data[field] !== undefined && (typeof data[field] !== 'string' || !data[field].trim())) {
      return res.status(400).json({ message: `${field} cannot be empty` });
    }
    if (typeof data[field] === 'string') data[field] = data[field].trim();
  }
  if (data.email) data.email = data.email.toLowerCase();
  if (data.phone !== undefined) data.phone = data.phone?.trim() || null;
  if (data.monthlySalary !== undefined) data.monthlySalary = Number(data.monthlySalary);
  if (data.performanceScore !== undefined) data.performanceScore = Number(data.performanceScore);

  try {
    const employee = await prisma.$transaction(async (tx) => {
      const updated = await tx.employee.update({ where: { id: req.params.id }, data, select: includeEmployeeFields });
      await writeAudit(tx, req.user.id, 'EMPLOYEE_UPDATED', 'Employee', updated.id, data);
      return updated;
    });
    res.json(employee);
  } catch (error) {
    if (error.code === 'P2025') return res.status(404).json({ message: 'Employee not found' });
    if (error.code === 'P2002') return res.status(409).json({ message: 'Email already belongs to another employee' });
    console.error('Employee update failed:', error);
    res.status(500).json({ message: 'Could not update employee' });
  }
});

router.get('/employees/:id/adjustments', ownerOnly, async (req, res) => {
  try {
    const adjustments = await prisma.payrollAdjustment.findMany({
      where: { employeeId: req.params.id },
      include: { createdBy: { select: { name: true, email: true } }, approvedBy: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(adjustments);
  } catch (error) {
    console.error('Payroll adjustments load failed:', error);
    res.status(500).json({ message: 'Could not load payroll adjustments' });
  }
});

router.post('/employees/:id/adjustments', ownerOnly, async (req, res) => {
  const amount = Number(req.body.amount);
  const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';
  const payrollPeriod = String(req.body.payrollPeriod || '');
  if (!Number.isFinite(amount) || amount <= 0 || !reason || reason.length < 10 || !/^\d{4}-(0[1-9]|1[0-2])$/.test(payrollPeriod)) {
    return res.status(400).json({ message: 'Provide a positive amount, a detailed reason, and payroll period (YYYY-MM)' });
  }

  try {
    const adjustment = await prisma.$transaction(async (tx) => {
      const employee = await tx.employee.findUnique({ where: { id: req.params.id } });
      if (!employee) throw Object.assign(new Error('Employee not found'), { status: 404 });
      if (employee.status !== 'ACTIVE') throw Object.assign(new Error('Only active employees can receive a payroll adjustment'), { status: 400 });
      if (amount > Number(employee.monthlySalary)) throw Object.assign(new Error('Adjustment cannot exceed monthly salary'), { status: 400 });
      if (Number(employee.performanceScore) >= 50) throw Object.assign(new Error('A performance deduction requires a score below 50'), { status: 400 });

      const created = await tx.payrollAdjustment.create({
        data: {
          employeeId: employee.id,
          amount,
          reason,
          performanceScore: employee.performanceScore,
          payrollPeriod,
          createdById: req.user.id,
        },
      });
      await writeAudit(tx, req.user.id, 'PAYROLL_ADJUSTMENT_CREATED', 'PayrollAdjustment', created.id, {
        employeeId: employee.id,
        amount,
        payrollPeriod,
        performanceScore: employee.performanceScore,
      });
      return created;
    });
    res.status(201).json(adjustment);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    console.error('Payroll adjustment create failed:', error);
    res.status(500).json({ message: 'Could not create payroll adjustment' });
  }
});

router.post('/adjustments/:id/approve', ownerOnly, async (req, res) => {
  try {
    const adjustment = await prisma.$transaction(async (tx) => {
      const current = await tx.payrollAdjustment.findUnique({ where: { id: req.params.id } });
      if (!current) throw Object.assign(new Error('Adjustment not found'), { status: 404 });
      if (current.status !== 'PENDING') throw Object.assign(new Error('Only pending adjustments can be approved'), { status: 400 });
      const approved = await tx.payrollAdjustment.update({
        where: { id: current.id },
        data: { status: 'APPROVED', approvedById: req.user.id, approvedAt: new Date() },
      });
      await writeAudit(tx, req.user.id, 'PAYROLL_ADJUSTMENT_APPROVED', 'PayrollAdjustment', approved.id, { amount: Number(approved.amount) });
      return approved;
    });
    res.json(adjustment);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    console.error('Payroll approval failed:', error);
    res.status(500).json({ message: 'Could not approve payroll adjustment' });
  }
});

router.get('/audit-logs', ownerOnly, async (_req, res) => {
  try {
    const logs = await prisma.auditLog.findMany({
      take: 100,
      include: { actor: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(logs);
  } catch (error) {
    console.error('Audit log load failed:', error);
    res.status(500).json({ message: 'Could not load audit history' });
  }
});

module.exports = router;