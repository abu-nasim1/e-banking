const router = require('express').Router();
const prisma = require('../config/prisma'); const auth = require('../middleware/auth');
router.use(auth);
router.get('/statement', async(req,res)=>{
  const {accountId,from,to} = req.query;
  if (typeof accountId !== 'string' || typeof from !== 'string' || typeof to !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return res.status(400).json({message:'Choose an account and valid start/end dates'});
  }
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate()+1);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end || end > new Date(Date.now()+86400000)) {
    return res.status(400).json({message:'Choose a valid date range not ending in the future'});
  }

  try {
    const account = await prisma.account.findFirst({
      where:{id:accountId,userId:req.user.id},
      select:{id:true,accountNumber:true,type:true,currency:true,user:{select:{name:true,email:true}}},
    });
    if (!account) return res.status(404).json({message:'Account not found'});
    const [previous,transactions] = await Promise.all([
      prisma.transaction.findFirst({where:{accountId,createdAt:{lt:start}},orderBy:{createdAt:'desc'},select:{balanceAfter:true}}),
      prisma.transaction.findMany({where:{accountId,createdAt:{gte:start,lt:end}},orderBy:[{createdAt:'asc'},{id:'asc'}],select:{id:true,type:true,amount:true,description:true,balanceAfter:true,createdAt:true}}),
    ]);
    const openingBalance = Number(previous?.balanceAfter || 0);
    const closingBalance = transactions.length ? Number(transactions[transactions.length-1].balanceAfter) : openingBalance;
    res.json({account,period:{from,to},openingBalance,closingBalance,transactions});
  } catch(error) {
    console.error('Statement generation failed:',error);
    res.status(500).json({message:'Could not prepare account statement'});
  }
});
router.get('/', async(req,res)=>{
  const accounts = await prisma.account.findMany({where:{userId:req.user.id}, select:{id:true}});
  const txs = await prisma.transaction.findMany({ where:{accountId:{in:accounts.map(a=>a.id)}}, orderBy:{createdAt:'desc'}, take:100, include:{account:{select:{accountNumber:true,type:true}}} });
  res.json(txs);
});
module.exports = router;
