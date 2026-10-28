const router = require('express').Router();
const prisma = require('../config/prisma'); const auth = require('../middleware/auth');
const { genAccountNumber, genCardNumber } = require('../utils/helpers');
const { findUsableAccount, enableExpiredAccountFreezes } = require('../utils/account-status');
const crypto = require('crypto');
router.use(auth);
router.get('/my', async(req,res)=>{
  await enableExpiredAccountFreezes(prisma, {userId:req.user.id});
  res.json(await prisma.account.findMany({where:{userId:req.user.id}, include:{cards:true}, orderBy:{createdAt:'asc'}}));
});
router.get('/applications/my', async(req,res)=>{
  const applications = await prisma.accountApplication.findMany({
    where:{applicantId:req.user.id},
    include:{account:{select:{accountNumber:true}},reviewedBy:{select:{name:true}}},
    orderBy:{createdAt:'desc'},
  });
  res.json(applications);
});
router.post('/applications', async(req,res)=>{
  const {type,fullName,phone,email,nid,dateOfBirth,address,occupation,nomineeName,nomineePhone,initialDeposit} = req.body;
  const required = [fullName,phone,email,nid,dateOfBirth,address];
  if (!['SAVINGS','CURRENT'].includes(type) || !required.every(value=>typeof value==='string'&&value.trim())) {
    return res.status(400).json({message:'Account type and all required applicant details must be provided'});
  }
  if (!/^\S+@\S+\.\S+$/.test(email.trim()) || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
    return res.status(400).json({message:'Enter a valid email address and date of birth'});
  }
  const deposit = Number(initialDeposit || 0);
  if (!Number.isFinite(deposit) || deposit < 0) {
    return res.status(400).json({message:'Initial deposit must be zero or a positive amount'});
  }

  try {
    const pending = await prisma.accountApplication.findFirst({where:{applicantId:req.user.id,type,status:'PENDING'}});
    if (pending) return res.status(409).json({message:`You already have a pending ${type.toLowerCase()} account application`});
    const application = await prisma.accountApplication.create({data:{
      type,
      fullName:fullName.trim(),
      phone:phone.trim(),
      email:email.trim().toLowerCase(),
      nid:nid.trim(),
      dateOfBirth,
      address:address.trim(),
      occupation:occupation?.trim()||null,
      nomineeName:nomineeName?.trim()||null,
      nomineePhone:nomineePhone?.trim()||null,
      initialDeposit:deposit,
      applicantId:req.user.id,
    }});
    res.status(201).json(application);
  } catch(error) {
    console.error('Account application failed:',error);
    res.status(500).json({message:'Could not submit account application'});
  }
});
router.post('/', (_req,res)=>res.status(403).json({message:'New accounts require an application and staff approval'}));
const otpChallenges = new Map();
const otpCooldowns = new Map();
const MIN_TRANSACTION_AMOUNT = 500;
const OTP_LIFETIME_MS = 5 * 60 * 1000;
const OTP_COOLDOWN_MS = 30 * 1000;
const MAX_OTP_ATTEMPTS = 5;

const hashOtp = (code) => crypto.createHash('sha256').update(code).digest('hex');
const maskEmail = (email) => {
  const [name, domain] = email.split('@');
  return `${name.slice(0, 2)}***@${domain}`;
};
const mailConfigured = () => Boolean(
  process.env.SMTP_HOST &&
  process.env.SMTP_PORT &&
  process.env.SMTP_USER &&
  process.env.SMTP_PASS &&
  process.env.SMTP_FROM
);

router.post('/otp/request', async(req,res)=>{
  try {
    const { accountId, type, amount, method, recipientName, recipientNumber, bankName } = req.body;
    const value = Number(amount);
    if (!['DEPOSIT', 'WITHDRAW'].includes(type)) {
      return res.status(400).json({message:'Choose deposit or withdrawal'});
    }
    if (!Number.isFinite(value) || value < MIN_TRANSACTION_AMOUNT) {
      return res.status(400).json({message:'Minimum deposit or withdrawal is ৳500'});
    }

    const account = await findUsableAccount(prisma, {id:accountId, userId:req.user.id});
    if (!account) return res.status(404).json({message:'Account not found'});
    if (account.status !== 'ACTIVE') {
      return res.status(423).json({message:`This account is temporarily disabled${account.frozenUntil ? ` until ${account.frozenUntil.toLocaleString()}` : ''}${account.statusReason ? `: ${account.statusReason}` : ''}`});
    }
    if (type === 'WITHDRAW' && Number(account.balance) < value) {
      return res.status(400).json({message:'Insufficient balance'});
    }

    let destination = '';
    if (type === 'WITHDRAW') {
      if (!['BKASH', 'NAGAD', 'BANK'].includes(method) || !recipientName?.trim() || !recipientNumber?.trim()) {
        return res.status(400).json({message:'Select a withdrawal method and provide recipient details'});
      }
      const cleanNumber = recipientNumber.replace(/[\s-]/g, '');
      if (['BKASH', 'NAGAD'].includes(method) && !/^01[3-9]\d{8}$/.test(cleanNumber)) {
        return res.status(400).json({message:'Enter a valid 11-digit Bangladesh mobile number'});
      }
      if (method === 'BANK' && (!/^\d{10,20}$/.test(cleanNumber) || !bankName?.trim())) {
        return res.status(400).json({message:'Enter a bank name and a valid account number'});
      }
      destination = method === 'BANK'
        ? `Withdrawal to ${bankName.trim()} account ending ${cleanNumber.slice(-4)} (${recipientName.trim()})`
        : `Withdrawal to ${method} number ending ${cleanNumber.slice(-4)} (${recipientName.trim()})`;
    }

    const user = await prisma.user.findUnique({where:{id:req.user.id}, select:{email:true}});
    if (!user?.email) {
      return res.status(400).json({message:'Add an email address to your profile before requesting an OTP'});
    }
    const testMode = process.env.NODE_ENV === 'development' ||
      (process.env.NODE_ENV !== 'production' && process.env.OTP_TEST_MODE === 'true');
    const testRecipient = process.env.OTP_TEST_RECIPIENT?.trim();
    const otpEmail = testMode && testRecipient ? testRecipient : user.email;
    if (!mailConfigured() && !testMode) {
      return res.status(503).json({message:'Email delivery is not configured. Contact the administrator.'});
    }

    const lastRequested = otpCooldowns.get(req.user.id) || 0;
    if (Date.now() - lastRequested < OTP_COOLDOWN_MS) {
      return res.status(429).json({message:'Please wait 30 seconds before requesting another OTP'});
    }
    for (const [id, challenge] of otpChallenges) {
      if (challenge.expiresAt <= Date.now()) otpChallenges.delete(id);
    }

    const code = String(crypto.randomInt(100000, 1000000));
    const challengeId = crypto.randomUUID();
    if (mailConfigured()) {
      const nodemailer = require('nodemailer');
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
      await transporter.sendMail({
        from: process.env.SMTP_FROM,
        to: otpEmail,
        subject: 'Your E-Bank transaction verification code',
        text: `Your E-Bank ${type.toLowerCase()} OTP is ${code}. It expires in 5 minutes. If you did not request this, ignore this email.`,
        html: `<p>Your E-Bank ${type.toLowerCase()} verification code is:</p><p style="font-size:28px;font-weight:bold;letter-spacing:8px">${code}</p><p>This code expires in 5 minutes. If you did not request this, ignore this email.</p>`,
      });
    }

    otpChallenges.set(challengeId, {
      userId: req.user.id,
      accountId,
      type,
      amount: value,
      destination,
      codeHash: hashOtp(code),
      attempts: 0,
      expiresAt: Date.now() + OTP_LIFETIME_MS,
    });
    otpCooldowns.set(req.user.id, Date.now());

    res.json({
      challengeId,
      email: maskEmail(otpEmail),
      delivery: mailConfigured() ? 'email' : 'development-test',
      expiresIn: OTP_LIFETIME_MS / 1000,
      ...(testMode ? {testCode:code} : {}),
    });
  } catch (error) {
    console.error('OTP request failed:', error);
    res.status(500).json({message:'Could not create OTP challenge'});
  }
});

router.post('/otp/verify', async(req,res)=>{
  try {
    const { challengeId, code } = req.body;
    const challenge = otpChallenges.get(challengeId);
    if (!challenge || challenge.userId !== req.user.id) {
      return res.status(400).json({message:'OTP request not found. Request a new code.'});
    }
    if (challenge.expiresAt <= Date.now()) {
      otpChallenges.delete(challengeId);
      return res.status(400).json({message:'OTP expired. Request a new code.'});
    }
    if (challenge.attempts >= MAX_OTP_ATTEMPTS) {
      otpChallenges.delete(challengeId);
      return res.status(429).json({message:'Too many incorrect attempts. Request a new code.'});
    }

    const suppliedHash = hashOtp(String(code || ''));
    const validCode = /^\d{6}$/.test(String(code || '')) &&
      crypto.timingSafeEqual(Buffer.from(suppliedHash), Buffer.from(challenge.codeHash));
    if (!validCode) {
      challenge.attempts += 1;
      if (challenge.attempts >= MAX_OTP_ATTEMPTS) otpChallenges.delete(challengeId);
      return res.status(400).json({message:`Incorrect OTP. ${MAX_OTP_ATTEMPTS - challenge.attempts} attempts remaining.`});
    }

    otpChallenges.delete(challengeId);
    otpCooldowns.delete(req.user.id);
    const result = await prisma.$transaction(async(tx)=>{
      const account = await findUsableAccount(tx, {id:challenge.accountId, userId:req.user.id});
      if (!account) throw Object.assign(new Error('Account not found'), {status:404});
      if (account.status !== 'ACTIVE') {
        throw Object.assign(new Error('This account was disabled before OTP verification'), {status:423});
      }
      if (challenge.type === 'WITHDRAW' && Number(account.balance) < challenge.amount) {
        throw Object.assign(new Error('Insufficient balance'), {status:400});
      }

      const newBalance = challenge.type === 'DEPOSIT'
        ? Number(account.balance) + challenge.amount
        : Number(account.balance) - challenge.amount;
      const update = await tx.account.updateMany({where:{id:account.id,status:'ACTIVE'}, data:{balance:newBalance}});
      if (update.count !== 1) throw Object.assign(new Error('This account was disabled before the transaction completed'), {status:423});
      const updated = await tx.account.findUnique({where:{id:account.id}});
      const transaction = await tx.transaction.create({data:{
        type:challenge.type,
        amount:challenge.amount,
        balanceAfter:newBalance,
        description:challenge.destination || challenge.type,
        accountId:account.id,
      }});
      return {account:updated, transaction};
    });
    res.json(result);
  } catch (error) {
    if (error.status) return res.status(error.status).json({message:error.message});
    console.error('OTP verification failed:', error);
    res.status(500).json({message:'Could not complete the transaction'});
  }
});

router.post('/deposit', (_req,res)=>res.status(403).json({message:'OTP verification required'}));
router.post('/withdraw', (_req,res)=>res.status(403).json({message:'OTP verification required'}));
module.exports = router;
