const toCents = (amount) => Math.round(Number(amount) * 100);
const fromCents = (cents) => Number((cents / 100).toFixed(2));

const addMonths = (date, months) => {
  const target = new Date(date);
  const day = target.getDate();
  target.setDate(1);
  target.setMonth(target.getMonth() + months);
  const finalDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, finalDay));
  return target;
};

const buildInstallments = (amount, termMonths, disbursedAt) => {
  const totalCents = toCents(amount);
  const regularAmount = Math.floor(totalCents / termMonths);
  return Array.from({ length: termMonths }, (_, index) => ({
    installmentNumber: index + 1,
    dueDate: addMonths(disbursedAt, index + 1),
    amount: fromCents(index === termMonths - 1
      ? totalCents - regularAmount * (termMonths - 1)
      : regularAmount),
  }));
};

module.exports = { toCents, fromCents, buildInstallments };