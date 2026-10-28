-- ============================================
-- E-Banking Database - PostgreSQL
-- Project: React + Node + PostgreSQL er jonno
-- Use: pgAdmin e 'ebanking' database select kore
--      Query Tool e ei file ta open kore Run (F5) koro
-- Note: Ei SQL run korle Prisma migrate lagbe na.
--       Jekono ekta method use koro - SQL othoba migrate.
-- ============================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Types
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');
CREATE TYPE "AccountType" AS ENUM ('SAVINGS', 'CURRENT');
CREATE TYPE "TxType" AS ENUM ('DEPOSIT', 'WITHDRAW', 'TRANSFER_IN', 'TRANSFER_OUT');

-- 1. Users table
CREATE TABLE "User" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT,
  "password" TEXT NOT NULL,
  "role" "Role" NOT NULL DEFAULT 'USER',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- 2. Accounts table
CREATE TABLE "Account" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "accountNumber" TEXT NOT NULL,
  "type" "AccountType" NOT NULL DEFAULT 'SAVINGS',
  "balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'BDT',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Account_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "Account_accountNumber_key" ON "Account"("accountNumber");

-- 3. Transactions table
CREATE TABLE "Transaction" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "type" "TxType" NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "description" TEXT,
  "balanceAfter" DECIMAL(12,2) NOT NULL,
  "accountId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE
);

-- 4. Cards table
CREATE TABLE "Card" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "cardNumber" TEXT NOT NULL,
  "expiry" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "accountId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Card_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Card_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "Card_cardNumber_key" ON "Card"("cardNumber");

-- 5. Beneficiaries table
CREATE TABLE "Beneficiary" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "name" TEXT NOT NULL,
  "accountNumber" TEXT NOT NULL,
  "bankName" TEXT NOT NULL DEFAULT 'E-Bank',
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Beneficiary_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Beneficiary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);
