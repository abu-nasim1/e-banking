async function findUsableAccount(client, where) {
  let account = await client.account.findFirst({ where });
  if (!account || account.status !== 'FROZEN' || !account.frozenUntil || account.frozenUntil > new Date()) {
    return account;
  }

  await client.account.updateMany({
    where: { id: account.id, status: 'FROZEN', frozenUntil: { lte: new Date() } },
    data: { status: 'ACTIVE', frozenUntil: null, statusReason: null },
  });
  account = await client.account.findFirst({ where });
  return account;
}

async function enableExpiredAccountFreezes(client, where = {}) {
  return client.account.updateMany({
    where: { ...where, status: 'FROZEN', frozenUntil: { lte: new Date() } },
    data: { status: 'ACTIVE', frozenUntil: null, statusReason: null },
  });
}

module.exports = { findUsableAccount, enableExpiredAccountFreezes };