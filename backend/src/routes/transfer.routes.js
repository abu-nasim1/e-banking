const router = require('express').Router();
const prisma = require('../config/prisma'); const auth = require('../middleware/auth');
const { findUsableAccount } = require('../utils/account-status');
router.use(auth);
const TOP_BANKS = [
  'Sonali Bank PLC',
  'Islami Bank Bangladesh PLC',
  'BRAC Bank PLC',
  'Dutch-Bangla Bank PLC',
  'Eastern Bank PLC',
];
const FEES = { BKASH: 10, NAGAD: 10, BANK: 15 };

router.post('/', async(req,res)=>{
  try{
    const {fromAccountId, toAccountNumber, amount, description} = req.body; const amt = Number(amount);
    if(!amt || amt<=0) return res.status(400).json({message:'Valid amount dao'});
    const from = await findUsableAccount(prisma, {id:fromAccountId, userId:req.user.id});
    const to = await findUsableAccount(prisma, {accountNumber:toAccountNumber});
    if(!from) return res.status(404).json({message:'Source account not found'});
    if(!to) return res.status(404).json({message:'Receiver account not found'});
    if(from.status !== 'ACTIVE') return res.status(423).json({message:'Your source account is temporarily disabled'});
    if(to.status !== 'ACTIVE') return res.status(423).json({message:'The receiver account is temporarily disabled'});
    if(from.id===to.id) return res.status(400).json({message:'Same account e transfer hobe na'});
    if(Number(from.balance) < amt) return res.status(400).json({message:'Insufficient balance'});
    await prisma.$transaction([
      prisma.account.update({where:{id:from.id}, data:{balance:Number(from.balance)-amt}}),
      prisma.account.update({where:{id:to.id}, data:{balance:Number(to.balance)+amt}}),
      prisma.transaction.create({data:{type:'TRANSFER_OUT', amount:amt, balanceAfter:Number(from.balance)-amt, description:description||`Transfer to ${toAccountNumber}`, accountId:from.id}}),
      prisma.transaction.create({data:{type:'TRANSFER_IN', amount:amt, balanceAfter:Number(to.balance)+amt, description:description||`Transfer from ${from.accountNumber}`, accountId:to.id}}),
    ]);
    res.json({message:'Transfer successful'});
  }catch(e){ console.error(e); res.status(500).json({message:'Transfer failed'}); }
});

router.post('/external', async(req,res)=>{
  try{
    const {fromAccountId, channel, bankName, recipientName, recipientNumber, amount, description} = req.body;
    const amt = Number(amount);
    if(!['BKASH','NAGAD','BANK'].includes(channel)) return res.status(400).json({message:'Please select a valid transfer method'});
    if(!recipientName || !String(recipientName).trim()) return res.status(400).json({message:'Please enter the recipient\'s name'});
    if(!amt || amt<=0) return res.status(400).json({message:'Please enter a valid amount'});

    const number = String(recipientNumber || '').replace(/[\s-]/g, '');
    let destination = '';
    if(channel === 'BKASH' || channel === 'NAGAD'){
      if(!/^01[3-9]\d{8}$/.test(number)) return res.status(400).json({message:'Please enter a valid 11-digit mobile number starting with 01'});
      destination = `${channel === 'BKASH' ? 'bKash' : 'Nagad'} ${number} (${recipientName})`;
    }else{
      if(!TOP_BANKS.includes(bankName)) return res.status(400).json({message:'Please select a bank from the list'});
      if(!/^\d{10,20}$/.test(number)) return res.status(400).json({message:'Please enter a valid bank account number (10-20 digits)'});
      destination = `${bankName} A/C ${number} (${recipientName})`;
    }

    const from = await findUsableAccount(prisma, {id:fromAccountId, userId:req.user.id});
    if(!from) return res.status(404).json({message:'Source account not found'});
    if(from.status !== 'ACTIVE') return res.status(423).json({message:'Your source account is temporarily disabled'});

    const fee = FEES[channel];
    const totalDebit = amt + fee;
    if(Number(from.balance) < totalDebit) return res.status(400).json({message:`Insufficient balance - total amount including fee requires ৳${totalDebit}`});

    const finalBalance = Number(from.balance) - totalDebit;
    const ops = [
      prisma.account.update({where:{id:from.id}, data:{balance:finalBalance}}),
      prisma.transaction.create({data:{type:'TRANSFER_OUT', amount:amt, balanceAfter:Number(from.balance)-amt, description:description ? `${destination}\n${description}` : `Transfer to ${destination}`, accountId:from.id}}),
      prisma.transaction.create({data:{type:'TRANSFER_OUT', amount:fee, balanceAfter:finalBalance, description:`Transfer fee - ${destination}`, accountId:from.id}}),
    ];
    await prisma.$transaction(ops);
    res.json({message:`Transfer successful to ${destination}`, fee, totalDebit});
  }catch(e){ console.error(e); res.status(500).json({message:'Transfer failed'}); }
});

router.get('/banks', (req,res)=>res.json(TOP_BANKS));
module.exports = router;
