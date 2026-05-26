# LeaveSync API

> Enterprise Leave Management SaaS — Backend REST API

A production-ready, multi-tenant leave management REST API built for South African companies. Powers the LeaveSync platform which enables organisations to manage employee leave requests, approvals, balances, policies, and compliance reporting.

---

## 🚀 Live Demo

- **Frontend App:** https://leave-management-frontend-beige.vercel.app
- **API Health Check:** https://leavesync-api.onrender.com/api/health
- **API Base URL:** https://leavesync-api.onrender.com/api

---

## ✨ Features

- 🔐 **JWT Authentication** with role-based access control (4 roles)
- 🏢 **Multi-tenant Architecture** — every company is fully isolated
- 📋 **Leave Management** — submit, approve, reject, cancel requests
- ⚖️ **Multi-Level Approvals** — manager approval + HR sign-off for long leave
- 📊 **Reports and Analytics** — absenteeism, team overview, monthly trends
- 🔔 **Email Notifications** — branded HTML emails via Nodemailer
- 🗓️ **Public Holiday Engine** — South African holidays, excludes from leave counts
- 📜 **Audit Trail** — POPIA-compliant log of all sensitive actions
- 🏆 **Role Requests** — self-service promotion workflow with HR approval
- 📐 **Leave Policies** — role-based entitlements with auto-assignment
- 🔑 **Forgot Password** — secure token-based reset via email link
- 🏢 **Company Settings** — multi-tenant profile management
- 💳 **PayFast Billing** — South African subscription payment integration

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 20.x |
| Framework | Express.js |
| Database | PostgreSQL (Supabase) |
| Authentication | JWT (jsonwebtoken) |
| Password Hashing | bcryptjs (12 salt rounds) |
| Email | Nodemailer + Gmail SMTP |
| Security | Helmet, express-rate-limit, CORS |
| Logging | Morgan |
| Dev Tool | Nodemon |

---

## 📁 Project Structure

leave-management-api/
├── migrations/
│   ├── 001_create_companies.sql
│   ├── 002_create_users.sql
│   ├── 003_create_leave_types.sql
│   ├── 004_create_leave_balances.sql
│   ├── 005_create_leave_requests.sql
│   ├── 006_create_public_holidays.sql
│   ├── 007_create_notifications.sql
│   ├── 008_create_audit_logs.sql
│   ├── 009_create_leave_policies.sql
│   ├── 010_create_role_requests.sql
│   ├── 011_update_leave_requests_multi_approval.sql
│   ├── 012_add_password_reset_tokens.sql
│   ├── 013_create_subscriptions.sql
│   └── run.js
├── src/
│   ├── config/
│   │   ├── db.js
│   │   └── email.js
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── employeeController.js
│   │   ├── leaveTypeController.js
│   │   ├── leaveBalanceController.js
│   │   ├── leaveRequestController.js
│   │   ├── notificationController.js
│   │   ├── reportController.js
│   │   ├── publicHolidayController.js
│   │   ├── auditController.js
│   │   ├── leavePolicyController.js
│   │   ├── roleRequestController.js
│   │   ├── companyController.js
│   │   └── billingController.js
│   ├── middleware/
│   │   ├── auth.js
│   │   ├── errorHandler.js
│   │   ├── planLimits.js
│   │   └── security.js
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── employeeRoutes.js
│   │   ├── leaveTypeRoutes.js
│   │   ├── leaveBalanceRoutes.js
│   │   ├── leaveRequestRoutes.js
│   │   ├── notificationRoutes.js
│   │   ├── reportRoutes.js
│   │   ├── publicHolidayRoutes.js
│   │   ├── auditRoutes.js
│   │   ├── leavePolicyRoutes.js
│   │   ├── roleRequestRoutes.js
│   │   ├── companyRoutes.js
│   │   └── billingRoutes.js
│   ├── utils/
│   │   ├── auditLogger.js
│   │   ├── emailService.js
│   │   ├── emailTemplates.js
│   │   └── jwt.js
│   └── index.js
├── .env.example
├── .gitignore
├── package.json
├── Procfile
└── README.md

---

## ⚙️ Getting Started

### Prerequisites

- Node.js 20.x or higher
- PostgreSQL database (we use Supabase)
- Gmail account with App Password

### Installation

```bash
# Clone the repository
git clone https://github.com/OdwaDynty/leave-management-api.git

# Navigate into the project
cd leave-management-api

# Install dependencies
npm install

# Copy environment template
cp .env.example .env
```

### Environment Variables

Fill in your `.env` file:

```bash
NODE_ENV=development
PORT=3000

# Supabase connection string
DATABASE_URL=postgresql://postgres:password@host:5432/postgres

# Local development fallback
DB_HOST=localhost
DB_PORT=5432
DB_NAME=leave_management
DB_USER=postgres
DB_PASSWORD=your_password

# JWT
JWT_SECRET=your_long_random_secret
JWT_EXPIRES_IN=7d

# Frontend URL for email links
APP_URL=http://localhost:5173

# Gmail + App Password
EMAIL_FROM=your.gmail@gmail.com
EMAIL_PASSWORD=your16charapppassword
EMAIL_FROM_NAME=LeaveSync
```

### Database Setup

```bash
# Run all migrations
npm run migrate
```

### Run Locally

```bash
# Development with auto-restart
npm run dev

# Production
npm start
```

Visit `http://localhost:3000/api/health` to confirm it is running.

---

## 🔐 User Roles

| Role | Description |
|---|---|
| `employee` | Submit and view own leave only |
| `manager` | Approve team leave, view team reports |
| `hr_admin` | Full staff management, policies, reports |
| `super_admin` | Everything including billing and settings |

---

## 📡 Key API Endpoints

POST   /api/auth/register           Register company + admin
POST   /api/auth/login              Login
GET    /api/auth/me                 Get own profile
POST   /api/auth/forgot-password    Request password reset
POST   /api/auth/reset-password     Reset password
GET    /api/employees               List employees
POST   /api/employees               Add employee
PUT    /api/employees/:id           Update employee
POST   /api/leave-requests          Submit leave request
GET    /api/leave-requests/pending  Pending approvals
PUT    /api/leave-requests/:id/approve    Manager approve
PUT    /api/leave-requests/:id/hr-approve HR final approve
PUT    /api/leave-requests/:id/reject     Reject request
GET    /api/reports/summary         Company summary
GET    /api/audit                   Audit trail
GET    /api/billing/plans           Subscription plans
POST   /api/billing/initiate        Start payment
POST   /api/billing/webhook         PayFast ITN webhook

---

## 🗄️ Database Schema

| Table | Purpose |
|---|---|
| `companies` | Multi-tenant company accounts |
| `users` | All employees across all companies |
| `leave_types` | Annual, Sick, Study etc. |
| `leave_balances` | Days entitled/used/remaining per year |
| `leave_requests` | All leave applications |
| `public_holidays` | SA public holidays per company |
| `notifications` | In-app notification feed |
| `audit_logs` | POPIA-compliant action history |
| `leave_policies` | Role-based entitlement rules |
| `role_requests` | Self-service promotion requests |
| `password_reset_tokens` | Secure reset tokens |
| `subscriptions` | PayFast billing records |

---

## 🚀 Deployment

| Platform | Service | Purpose |
|---|---|---|
| Render | Web Service | Hosts the Node.js API |
| Supabase | PostgreSQL | Hosts the database |
| Vercel | Static Site | Hosts the React frontend |

**Auto-deploy:** Every push to `main` triggers automatic redeployment on Render.

---

## 🔒 Security

- JWT tokens with 7-day expiry
- bcrypt password hashing — 12 salt rounds
- Helmet.js HTTP security headers
- Rate limiting on all routes
- Trust proxy configured for Render
- Multi-tenant isolation via `company_id`
- POPIA-compliant audit logging

---

## 👤 Author

**Odwa Dyantyi**
Master's in Information Systems — University of the Western Cape
IT Educator | Full-Stack Developer | SaaS Builder

---

## 📄 License

MIT License

Autho:

Odwa Dyantyi