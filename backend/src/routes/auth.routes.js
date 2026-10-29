const router = require('express').Router();
const bcrypt = require('bcryptjs'); const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma'); const auth = require('../middleware/auth');
const sign = u => jwt.sign({id:u.id, email:u.email, role:u.role}, process.env.JWT_SECRET, {expiresIn:'7d'});
router.post('/register', async(req,res)=>{
  try{
    const {name,email,password,phone} = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if(!name||!normalizedEmail||!password) return res.status(400).json({message:'Name, email, password lagbe'});
    if(await prisma.user.findUnique({where:{email:normalizedEmail}})) return res.status(400).json({message:'Email already used'});
    const user = await prisma.user.create({ data:{ name:name.trim(),email:normalizedEmail,phone,approvalStatus:'PENDING',password: await bcrypt.hash(password,10)}});
    res.status(202).json({ message:'Registration submitted. You can sign in after a bank owner or manager approves your account.', approvalStatus:user.approvalStatus });
  }catch(e){ console.error(e); res.status(500).json({message:'Server error'}); }
});
router.post('/login', async(req,res)=>{
  const {username,password}=req.body;
  const loginName = String(username || req.body.email || '').trim().toLowerCase();
  const user = await prisma.user.findFirst({where:{OR:[{email:loginName},{username:loginName}]}});
  if(!user || !(await bcrypt.compare(password, user.password))) return res.status(400).json({message:'Invalid email or password'});
  if (['EMPLOYEE', 'MANAGER'].includes(user.role)) {
    const employee = await prisma.employee.findUnique({where:{userId:user.id}, select:{status:true}});
    if ((user.role === 'EMPLOYEE' && !employee) || (employee && employee.status !== 'ACTIVE')) {
      return res.status(403).json({message:'This employee login is inactive. Contact the bank owner.'});
    }
  }
  if (user.role === 'USER' && user.approvalStatus === 'CLOSED') {
    return res.status(403).json({code:'ACCOUNT_CLOSED',message:'This customer account is closed. Contact the bank if you need help.'});
  }
  if (user.role === 'USER' && user.approvalStatus === 'PENDING') {
    return res.status(403).json({code:'ACCOUNT_PENDING',message:'Your registration is awaiting bank approval.'});
  }
  if (user.role === 'USER' && user.approvalStatus === 'REJECTED') {
    return res.status(403).json({code:'ACCOUNT_REJECTED',message:user.approvalNote ? `Your registration was not approved: ${user.approvalNote}` : 'Your registration was not approved. Contact the bank for more information.'});
  }
  res.json({ token:sign(user), user:{id:user.id,name:user.name,email:user.email,username:user.username,role:user.role,approvalStatus:user.approvalStatus} });
});
router.get('/me', auth, async(req,res)=>{
  const user = await prisma.user.findUnique({where:{id:req.user.id}, select:{id:true,name:true,email:true,username:true,phone:true,role:true,approvalStatus:true,closedAt:true,createdAt:true}});
  res.json(user);
});
router.delete('/me', auth, async(req,res)=>{
  if (req.user.role !== 'USER') return res.status(403).json({message:'Only customer accounts can be closed from the customer portal'});
  try {
    await prisma.$transaction(async(tx)=>{
      await tx.user.update({
        where:{id:req.user.id},
        data:{approvalStatus:'CLOSED',closedAt:new Date()},
      });
      await tx.account.updateMany({
        where:{userId:req.user.id},
        data:{status:'CLOSED',frozenUntil:null,statusReason:'Customer profile closed'},
      });
      await tx.auditLog.create({data:{
        actorId:req.user.id,
        action:'CUSTOMER_ACCOUNT_CLOSED',
        entityType:'User',
        details:{customerDataRetained:true,linkedAccountsClosed:true},
      }});
    });
    res.json({message:'Your account has been closed. Bank records have been retained.'});
  } catch(error) {
    console.error('Customer account closure failed:',error);
    res.status(500).json({message:'Could not close your account'});
  }
});
module.exports = router;
