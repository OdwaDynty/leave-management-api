# LeaveSync API

> Enterprise Leave Management SaaS — Backend REST API

A production-ready multi-tenant leave management API built with Node.js, Express, and PostgreSQL. Powers the LeaveSync platform which enables South African companies to manage employee leave requests, approvals, balances, policies, and compliance reporting.

---

## 🚀 Live Demo

- **API Base URL:** Coming soon
- **Frontend App:** Coming soon
- **API Documentation:** `GET /api` after running locally

---

## ✨ Features

- 🔐 **JWT Authentication** with role-based access control
- 👥 **Multi-tenant Architecture** — each company is fully isolated
- 📋 **Leave Management** — submit, approve, reject, cancel requests
- ⚖️ **Multi-Level Approvals** — manager approval + HR sign-off for long leave
- 📊 **Reports & Analytics** — absenteeism, team overview, monthly trends
- 🔔 **Email Notifications** — branded HTML emails via Nodemailer/Gmail
- 🗓️ **Public Holiday Engine** — SA holidays auto-seeded, excludes from leave counts
- 📜 **Audit Trail** — full POPIA-compliant log of all sensitive actions
- 🏆 **Role Requests** — self-service promotion workflow with HR approval
- 📐 **Leave Policies** — role-based entitlements with auto-assignment
- 🔑 **Forgot Password** — secure token-based reset via email
- 🏢 **Company Settings** — multi-tenant profile management

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js v24 |
| Framework | Express.js |
| Database | PostgreSQL 18 |
| Authentication | JWT (jsonwebtoken) |
| Password Hashing | bcryptjs (12 salt rounds) |
| Email | Nodemailer + Gmail SMTP |
| Security | Helmet, express-rate-limit, CORS |
| Logging | Morgan |
| Dev Tool | Nodemon |

---

## 📁 Project Structure

leave-management-api/
├── migrations/              # SQL migration files
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
│   └── run.js
├── src/
│   ├── config/
│   │   ├── db.js            # PostgreSQL connection pool
│   │   └── email.js         # Nodemailer transporter
│   ├── controllers/         # Business logic per feature
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
│   │   └── companyController.js
│   ├── middleware/
│   │   ├── auth.js          # JWT verify + role guard
│   │   ├── errorHandler.js  # Global error handler
│   │   ├── requestLogger.js # Morgan HTTP logger
│   │   └── security.js      # Helmet + rate limiting
│   ├── routes/              # Express route definitions
│   ├── utils/
│   │   ├── auditLogger.js   # Audit trail writer
│   │   ├── emailService.js  # Email sending functions
│   │   ├── emailTemplates.js# HTML email templates
│   │   └── jwt.js           # Token helpers
│   └── index.js             # App entry point
├── .env.example             # Environment variable template
├── .gitignore
├── package.json
└── README.md

---

## ⚙️ Getting Started

### Prerequisites

- Node.js v18 or higher
- PostgreSQL 15 or higher
- A Gmail account with App Password enabled

### Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/leave-management-api.git

# Navigate into the project
cd leave-management-api

# Install all dependencies
npm install

# Copy the environment template
cp .env.example .env
```

### Environment Variables

Open `.env` and fill in your values:

```bash
# Server
PORT=3000
NODE_ENV=development

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=leave_management
DB_USER=postgres
DB_PASSWORD=your_postgres_password

# JWT — use a long random string
JWT_SECRET=your_super_secret_key_here
JWT_EXPIRES_IN=7d

# App URL — frontend URL for email links
APP_URL=http://localhost:5173

# Email — Gmail with App Password
EMAIL_FROM=your.gmail@gmail.com
EMAIL_PASSWORD=your_16_char_app_password
EMAIL_FROM_NAME=LeaveSync
```

### Database Setup

```bash
# Create the database
psql -U postgres -c "CREATE DATABASE leave_management;"

# Run all migrations to create tables
npm run migrate
```

### Run the Server

```bash
# Development — auto-restarts on file save
npm run dev

# Production
npm start
```

Visit `http://localhost:3000/api/health` to confirm the server is running.

---

## 🗄️ Database Schema

| Table | Description |
|---|---|
| `companies` | Tenant accounts — one row per company |
| `users` | All employees, managers, HR admins |
| `leave_types` | Annual, Sick, Study etc. per company |
| `leave_balances` | Days entitled/used/remaining per employee per year |
| `leave_requests` | All leave applications and their status |
| `public_holidays` | SA public holidays per company |
| `notifications` | In-app notification feed |
| `audit_logs` | POPIA-compliant action history |
| `leave_policies` | Role-based entitlement rules |
| `role_requests` | Self-service promotion requests |
| `password_reset_tokens` | Secure one-time reset tokens |

---

## 🔐 User Roles

| Role | Permissions |
|---|---|
| `employee` | Own leave requests and balances only |
| `manager` | Approve/reject team leave, view team reports |
| `hr_admin` | Full staff management, policies, company reports |
| `super_admin` | Everything including company settings and billing |

---

## 📡 API Endpoints

### Authentication

POST   /api/auth/register          Register company + admin
POST   /api/auth/login             Login → JWT token
GET    /api/auth/me                Get own profile
POST   /api/auth/forgot-password   Request reset email
POST   /api/auth/reset-password    Reset with token

### Employees

POST   /api/employees              Add employee
GET    /api/employees              List employees
GET    /api/employees/:id          Get employee
PUT    /api/employees/:id          Update employee
PUT    /api/employees/:id/reactivate  Reactivate
DELETE /api/employees/:id          Deactivate

### Leave Requests

POST   /api/leave-requests              Submit request
GET    /api/leave-requests/my           Own requests
GET    /api/leave-requests/pending      Pending approvals
GET    /api/leave-requests/calendar     Leave calendar
PUT    /api/leave-requests/:id/approve  Approve (manager)
PUT    /api/leave-requests/:id/hr-approve  HR final approval
PUT    /api/leave-requests/:id/reject   Reject with reason
PUT    /api/leave-requests/:id/cancel   Cancel own request

### Reports

GET    /api/reports/summary        Company leave summary
GET    /api/reports/team           Team overview
GET    /api/reports/absenteeism    Absenteeism report
GET    /api/reports/upcoming       Upcoming leave
GET    /api/reports/employee/:id   Employee history

*See `GET /api` for the complete list of all 45+ endpoints.*

---

## 🔒 Security

- JWT tokens with 7-day expiry
- bcrypt password hashing — 12 salt rounds
- Helmet.js HTTP security headers
- Rate limiting — 100 req/15min general, 10 req/15min on auth
- CORS configured per environment
- Multi-tenant isolation — every query scoped by `company_id`
- Password reset tokens hashed before storage, expire in 1 hour
- Audit logging for all sensitive actions (POPIA compliant)

---

## 🧪 Running Tests

All API endpoints have been manually tested using Thunder Client. Run the server and use the included test credentials:

Company:  Acme Corp (subdomain: acme)
Admin:    odwa@acme.com / Password123  (super_admin)
Employee: thabo@acme.com / Password123 (employee)

---

## 📄 License

MIT License — free to use, modify and distribute.

---

## 👤 Author

**Odwa Dyantyi**
Master's in Information Systems — University of the Western Cape

