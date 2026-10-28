require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();
async function main(){
  const password = await bcrypt.hash('123456', 10);
  const user = await prisma.user.upsert({ where:{email:'demo@bank.com'}, update:{}, create:{ name:'Demo User', email:'demo@bank.com', phone:'01700000000', password }});
  for (const role of ['OWNER', 'MANAGER']) {
    const prefix = role;
    const email = process.env[`${prefix}_EMAIL`]?.trim().toLowerCase();
    const accountPassword = process.env[`${prefix}_PASSWORD`];
    if (!email && !accountPassword) continue;
    if (!email || !accountPassword || accountPassword.length < 12) {
      throw new Error(`${prefix}_EMAIL and a ${prefix}_PASSWORD of at least 12 characters are required together`);
    }
    const name = process.env[`${prefix}_NAME`]?.trim() || (role === 'OWNER' ? 'Bank Owner' : 'Bank Manager');
    const hashedPassword = await bcrypt.hash(accountPassword, 12);
    await prisma.user.upsert({
      where: { email },
      update: { role, password: hashedPassword, name },
      create: { email, password: hashedPassword, name, role },
    });
    console.log(`${role} account provisioned for ${email}`);
  }
  let acc = await prisma.account.findFirst({ where:{ userId:user.id }});
  if(!acc){
    acc = await prisma.account.create({ data:{ accountNumber:'1000000001', type:'SAVINGS', balance:100000, userId:user.id }});
    await prisma.transaction.create({ data:{ type:'DEPOSIT', amount:100000, balanceAfter:100000, description:'Opening balance', accountId:acc.id }});
    await prisma.card.create({ data:{ cardNumber:'4111 1111 1111 1111', expiry:'12/29', accountId:acc.id }});
  }
  console.log('Seed done. Login: demo@bank.com / 123456');
}
main().catch(e=>{console.error(e);process.exit(1)}).finally(()=>prisma.$disconnect());
