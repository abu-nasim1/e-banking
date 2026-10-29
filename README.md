# E-Banking Project - React + Node.js + PostgreSQL

Full-stack e-banking app: React frontend, Express backend, PostgreSQL + Prisma.

## Features
- Register / Login with JWT + bcrypt
- Dashboard with total balance
- Apply for Savings / Current accounts; bank staff review and decide
- Customer loan applications with manager review followed by owner approval; owners can make a final decision at either review stage
- Approved loans are disbursed to the selected account with a 0%-interest monthly schedule; customers can pay installments or settle the full outstanding balance
- Owner can temporarily disable/enable customer accounts with automatic expiry
- Deposit, Withdraw, Transfer to another account number
- Transaction history (safe DB transaction - balance & history always in sync)
- Downloadable per-account PDF statements with date ranges
- Cards & Beneficiaries
- Owner-provisioned employee logins with assigned usernames, passwords, roles, and an employee dashboard
- Protected routes, Admin role in DB schema

## Tech Stack
Frontend: React 18, Vite, React Router, Axios
Backend: Node.js, Express, Prisma ORM, JWT, bcryptjs
Database: PostgreSQL 16 (Docker)

## Quick Start

### 1. Database chalaw
```bash
docker compose up -d
# or nijer PostgreSQL thakle .env e DATABASE_URL change koro
```

### 2. Backend
```bash
cd backend
cp .env.example .env
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run seed
npm run dev
# Backend: http://localhost:5000  | Health: /api/health
```

### 3. Frontend (notun terminal e)
```bash
cd frontend
npm install
npm run dev
# Frontend: http://localhost:5173
```

## Demo Login (seed er por)
- Email: `demo@bank.com`
- Password: `123456`
- Demo account balance: 100000 BDT, ekta card shoho

## Bank Management Roles
Public customer registration starts in `PENDING` and does not create a login session. Owners/managers review it under **Customer approvals**; approval enables sign-in, while rejection blocks login and records the review note. Customers may close their own login from the customer workspace; this marks the account `CLOSED` and retains bank records. Owners may permanently remove a customer from **Customer approvals**, which erases the user and linked customer data. Existing customer and staff accounts default to `ACTIVE`. Configure `OWNER_EMAIL`, `OWNER_PASSWORD` (minimum 12 characters), and optionally `OWNER_NAME` in `backend/.env`, then run `npm run seed` from `backend/` to provision the owner. Set `MANAGER_EMAIL`, `MANAGER_PASSWORD` (minimum 12 characters), and optionally `MANAGER_NAME` the same way for a manager. Do not use the demo customer credentials for privileged access; public registration cannot assign privileged roles.

Owners can review institution-wide account/transaction metrics, customer accounts, loan application statuses, and application decisions; create and update employee records and their login accounts; terminate employees, withdraw termination, and permanently delete employee data only after termination; create and approve logged payroll deduction records; inspect audit history; and temporarily disable/enable accounts. Employee logins use an owner-assigned username and password. Owners can assign the restricted `EMPLOYEE` portal role or the existing `MANAGER` role. Employee portal access is disabled when the linked employee record is not active. Termination is recorded in the audit history and disables the employee's login and existing sessions. Freeze can expire after 1 hour, 24 hours, 7 days, 30 days, or remain until manually enabled. Expired freezes are cleared on account access. Frozen accounts cannot deposit, withdraw, send or receive transfers; customer login remains available for status information. Managers can view the bank overview, customer accounts and transaction history, employee directory, and loan requests awaiting manager review. A manager approval forwards a loan request to the owner; an owner can make a final decision at either stage. Rejections require a reason. Owner approval disburses loan principal to the customer's selected account and creates equal monthly principal installments with 0% interest. Customers can pay the next installment, another amount, or settle the full outstanding balance; repayments debit their bank account and appear in transaction history. Account opening creates a pending application; approval opens the account and card in one database transaction. Payroll adjustments are records only and do not initiate an external salary payment. To update an existing database after schema changes, run `npx prisma db push`, `npx prisma generate`, and `npm run seed` from `backend/`.

## Email OTP for Deposits and Withdrawals
Deposits and withdrawals require at least ৳500 and a 6-digit OTP sent to the signed-in user's email. Configure these variables in `backend/.env` to send real email:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-provider-app-password
SMTP_FROM=E-Bank <your-email@gmail.com>
OTP_TEST_RECIPIENT=abunasim.bdcalling@gmail.com
```

For Gmail, use an App Password rather than your account password. In development (`NODE_ENV=development`), `OTP_TEST_RECIPIENT` routes OTP emails to the test inbox above; remove or change it to use the signed-in user's email. SMTP credentials are required for an actual email to arrive. Without SMTP in development, the OTP is shown in the Accounts page for testing instead. In production, the test recipient override and test code are disabled; the OTP goes only to the signed-in user's registered email. OTPs expire after 5 minutes and allow up to 5 attempts.

## API
| Method | Endpoint | Description |
|---|---|---|
| POST | /api/auth/register | Register a customer |
| POST | /api/auth/login | Login, JWT pabe |
| GET | /api/auth/me | Current user |
| GET | /api/accounts/my | Amar accounts |
| GET | /api/accounts/applications/my | Customer's account applications |
| POST | /api/accounts/applications | Submit account-opening application |
| GET | /api/loans/my | Customer's loan applications |
| POST | /api/loans | Apply for a loan using an active account and income/employment details |
| POST | /api/loans/:id/payments | Pay an installment, partial amount, or full outstanding loan balance |
| GET | /api/management/overview | Institution metrics (staff) |
| GET | /api/management/accounts | Customer account balances (staff) |
| GET | /api/management/accounts/:id/activity?page=1 | Account details and paginated transaction history (staff) |
| GET | /api/management/transactions | Recent bank transactions (staff) |
| GET | /api/management/applications | Applications (staff) |
| POST | /api/management/applications/:id/decision | Approve/reject application (staff) |
| GET | /api/management/loans | Manager review queue or owner-wide loan status list |
| POST | /api/management/loans/:id/decision | Manager forwards/rejects; owner makes the final decision |
| POST | /api/management/employees | Create an employee profile and login account (owner) |
| PATCH | /api/management/employees/:id | Update employee profile, role, username, or password (owner) |
| POST | /api/management/employees/:id/terminate | Terminate or withdraw termination; restores previous status (owner) |
| DELETE | /api/management/employees/:id/permanent | Permanently remove a terminated employee and linked data (owner) |
| GET | /api/employee/me | Signed-in employee's own dashboard profile |
| GET | /api/management/customer-registrations | Customer signups awaiting/after review (staff) |
| POST | /api/management/customer-registrations/:id/decision | Approve/reject customer login access (staff) |
| DELETE | /api/auth/me | Close own customer login; retain bank records |
| DELETE | /api/management/customers/:id/permanent | Owner-only permanent customer data removal |
| POST | /api/management/accounts/:id/freeze | Temporarily disable account (owner) |
| POST | /api/management/accounts/:id/enable | Re-enable account (owner) |
| POST | /api/accounts/deposit | Disabled; OTP verification required |
| POST | /api/accounts/withdraw | Disabled; OTP verification required |
| POST | /api/accounts/otp/request | Request email OTP for a deposit or withdrawal |
| POST | /api/accounts/otp/verify | Verify OTP and complete the transaction |
| POST | /api/transfer | Onno account e transfer |
| GET | /api/transactions | Transaction history |
| GET | /api/transactions/statement?accountId=...&from=YYYY-MM-DD&to=YYYY-MM-DD | Owned account statement data for PDF export |
| GET | /api/cards/my | Amar cards |
| GET/POST | /api/beneficiaries | Beneficiary list/add |
| DELETE | /api/beneficiaries/:id | Beneficiary delete |

## Project Structure
```
e-banking/
  docker-compose.yml
  backend/  prisma/schema.prisma, prisma/seed.js, src/{server,app}.js, src/routes/, src/middleware/
  frontend/ src/pages/, src/components/, src/context/, src/api/
```
