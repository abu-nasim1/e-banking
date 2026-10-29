const jwt = require('jsonwebtoken');
const prisma = require('../config/prisma');
module.exports = async (req,res,next)=>{
  const h = req.headers.authorization;
  if(!h || !h.startsWith('Bearer ')) return res.status(401).json({message:'No token'});
  try{
    const tokenUser = jwt.verify(h.split(' ')[1], process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({where:{id:tokenUser.id},select:{id:true,email:true,role:true,approvalStatus:true,approvalNote:true}});
    if(!user) return res.status(401).json({message:'Account not found'});
    if(['EMPLOYEE','MANAGER'].includes(user.role)) {
      const employee = await prisma.employee.findUnique({where:{userId:user.id},select:{status:true}});
      if((user.role === 'EMPLOYEE' && !employee) || (employee && employee.status !== 'ACTIVE')) {
        return res.status(403).json({message:'This employee login is inactive. Contact the bank owner.'});
      }
    }
    if(user.role === 'USER' && user.approvalStatus !== 'ACTIVE') {
      const message = user.approvalStatus === 'PENDING'
        ? 'Your registration is awaiting bank approval.'
        : user.approvalStatus === 'CLOSED'
          ? 'Your customer account is closed.'
          : user.approvalNote ? `Your registration was not approved: ${user.approvalNote}` : 'Your registration was not approved.';
      return res.status(403).json({code:`ACCOUNT_${user.approvalStatus}`,message});
    }
    req.user = {...tokenUser,...user};
    next();
  }
  catch{ return res.status(401).json({message:'Invalid token'}); }
};
