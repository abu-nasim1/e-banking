const router = require('express').Router();
const prisma = require('../config/prisma');
const auth = require('../middleware/auth');

router.use(auth);

const TOP_BANKS = [
  'Sonali Bank PLC',
  'Islami Bank Bangladesh PLC',
  'BRAC Bank PLC',
  'Dutch-Bangla Bank PLC',
  'Eastern Bank PLC',
];

const FEES = { BKASH: 10, NAGAD: 10, BANK: 15 };

// ---- Internal transfer: E-Bank account to E-Bank account ----
router.post('/', async (req, res) => {
  try {
    const { fromAccountId, toAccountNumber, amount, description } = req.body;
    const amt = Number(amount);
    if (!amt || amt <= 0) return res.status(400).json({ message: 'Please enter a valid amount' });
    const from = await prisma.account.findFirst({ where: { id: fromAccountId, userId: req.user.id } });
    const to = await prisma.account.findUnique({ where: { accountNumber: toAccountNumber } });
    if (!from) return res.status(404).json({ message: 'Source account not found' });
    if (!to) return res.status(404).json({ message: 'Receiver account not found' });
    if (from.id === to.id) return res.status(400).json({ message: 'Cannot transfer to the same account' });
    if (Number(from.balance) < amt) return res.status(400).json({ message: 'Insufficient balance' });
    await prisma.$transaction([
      prisma.account.update({ where: { id: from.id }, data: { balance: Number(from.balance) - amt } }),
      prisma.account.update({ where: { id: to.id }, data: { balance: Number(to.balance) + amt } }),
      prisma.transaction.create({ data: { type: 'TRANSFER_OUT', amount: amt, balanceAfter: Number(from.balance) - amt, description: description || `Transfer to ${toAccountNumber}`, accountId: from.id } }),
      prisma.transaction.create({ data: { type: 'TRANSFER_IN', amount: amt, balanceAfter: Number(to.balance) + amt, description: description || `Transfer from ${from.accountNumber}`, accountId: to.id } }),
    ]);
    res.json({ message: 'Transfer successful' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Transfer failed' });
  }
});

// ---- External transfer: bKash / Nagad / Top 5 Banks ----
// Note: Demo/simulated settlement. To send real money, the provider's
// official API + merchant/bank agreement is required. Here, money is debited
// from the user's account and recorded in the transaction history.
router.post('/external', async (req, res) => {
  try {
    const { fromAccountId, channel, bankName, recipientName, recipientNumber, amount, description } = req.body;
    const amt = Number(amount);
    if (!['BKASH', 'NAGAD', 'BANK'].includes(channel)) return res.status(400).json({ message: 'Please select a valid transfer method' });
    if (!recipientName || !String(recipientName).trim()) return res.status(400).json({ message: 'Please enter the recipient\'s name' });
    if (!amt || amt <= 0) return res.status(400).json({ message: 'Please enter a valid amount' });

    const number = String(recipientNumber || '').replace(/[\s-]/g, '');
    let destination = '';
    if (channel === 'BKASH' || channel === 'NAGAD') {
      if (!/^01[3-9]\d{8}$/.test(number)) return res.status(400).json({ message: 'Please enter a valid 11-digit mobile number starting with 01' });
      destination = `${channel === 'BKASH' ? 'bKash' : 'Nagad'} ${number} (${recipientName})`;
    } else {
      if (!TOP_BANKS.includes(bankName)) return res.status(400).json({ message: 'Please select a bank from the list' });
      if (!/^\d{10,20}$/.test(number)) return res.status(400).json({ message: 'Please enter a valid bank account number (10-20 digits)' });
      destination = `${bankName} A/C ${number} (${recipientName})`;
    }

    const from = await prisma.account.findFirst({ where: { id: fromAccountId, userId: req.user.id } });
    if (!from) return res.status(404).json({ message: 'Source account not found' });

    const fee = FEES[channel] || 0;
    const totalDebit = amt + fee;
    if (Number(from.balance) < totalDebit) return res.status(400).json({ message: `Insufficient balance - total amount including fee requires ৳${totalDebit}` });

    const balanceAfterTransfer = Number(from.balance) - amt;
    const finalBalance = Number(from.balance) - totalDebit;

    const ops = [
      prisma.account.update({ where: { id: from.id }, data: { balance: finalBalance } }),
      prisma.transaction.create({
        data: {
          type: 'TRANSFER_OUT',
          amount: amt,
          balanceAfter: balanceAfterTransfer,
          description: description ? `${destination}\n${description}` : `Transfer to ${destination}`,
          accountId: from.id,
        },
      }),
    ];
    if (fee > 0) {
      ops.push(
        prisma.transaction.create({
          data: {
            type: 'TRANSFER_OUT',
            amount: fee,
            balanceAfter: finalBalance,
            description: `Transfer fee - ${destination}`,
            accountId: from.id,
          },
        })
      );
    }
    await prisma.$transaction(ops);
    res.json({ message: `Transfer successful to ${destination}`, fee, totalDebit });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: 'Transfer failed' });
  }
});

router.get('/banks', (req, res) => res.json(TOP_BANKS));

module.exports = router;