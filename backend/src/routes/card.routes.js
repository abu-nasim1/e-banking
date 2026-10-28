const router = require('express').Router();
const prisma = require('../config/prisma'); const auth = require('../middleware/auth');
router.use(auth);
router.get('/my', async(req,res)=>{
  const accounts = await prisma.account.findMany({where:{userId:req.user.id}, select:{id:true}});
  res.json(await prisma.card.findMany({where:{accountId:{in:accounts.map(a=>a.id)}}, include:{account:{select:{accountNumber:true,type:true,balance:true,status:true,frozenUntil:true,statusReason:true}}}}));
});
module.exports = router;
