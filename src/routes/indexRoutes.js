// ─── API INDEX ROUTE ──────────────────────────────────
// Lists all available API endpoints
// Useful for developers integrating with the API
// Visit: GET /api

const express = require('express');
const router  = express.Router();

router.get('/', (req, res) => {
  res.json({
    name:        'Leave Management API',
    version:     '1.0.0',
    description: 'Enterprise Leave Management SaaS API',
    endpoints: {

      auth: {
        'POST /api/auth/register': 'Register a new company and admin user',
        'POST /api/auth/login':    'Login and receive a JWT token',
        'GET  /api/auth/me':       'Get the logged in user profile',
      },

      employees: {
        'POST   /api/employees':              'Add a new employee (hr_admin)',
        'GET    /api/employees':              'List all employees',
        'GET    /api/employees/:id':          'Get a single employee',
        'PUT    /api/employees/:id':          'Update an employee',
        'PUT    /api/employees/:id/reactivate': 'Reactivate an employee (hr_admin)',
        'DELETE /api/employees/:id':          'Deactivate an employee (hr_admin)',
      },

      leaveTypes: {
        'POST   /api/leave-types':     'Create a leave type (hr_admin)',
        'GET    /api/leave-types':     'List all leave types',
        'GET    /api/leave-types/:id': 'Get a single leave type',
        'PUT    /api/leave-types/:id': 'Update a leave type (hr_admin)',
        'DELETE /api/leave-types/:id': 'Deactivate a leave type (hr_admin)',
      },

      leaveBalances: {
        'POST /api/leave-balances/assign':        'Assign balance to employee (hr_admin)',
        'GET  /api/leave-balances/my':            'View my own balances',
        'GET  /api/leave-balances/employee/:id':  'View any employee balances (manager)',
        'PUT  /api/leave-balances/:id':           'Adjust a balance (hr_admin)',
        'POST /api/leave-balances/carry-over':    'Run year end carry over (super_admin)',
      },

      leaveRequests: {
        'POST /api/leave-requests':              'Submit a leave request',
        'GET  /api/leave-requests/my':           'View my requests',
        'GET  /api/leave-requests/pending':      'View pending approvals (manager)',
        'GET  /api/leave-requests/calendar':     'View leave calendar',
        'GET  /api/leave-requests/:id':          'Get a single request',
        'PUT  /api/leave-requests/:id/approve':  'Approve a request (manager)',
        'PUT  /api/leave-requests/:id/reject':   'Reject a request (manager)',
        'PUT  /api/leave-requests/:id/cancel':   'Cancel a request',
      },

      notifications: {
        'GET    /api/notifications':            'View my notifications',
        'PUT    /api/notifications/read-all':   'Mark all as read',
        'PUT    /api/notifications/:id/read':   'Mark one as read',
        'DELETE /api/notifications/:id':        'Delete a notification',
      },

      reports: {
        'GET /api/reports/summary':         'Company leave summary (hr_admin)',
        'GET /api/reports/employee/:id':    'Employee leave report (manager)',
        'GET /api/reports/team':            'Team overview (manager)',
        'GET /api/reports/absenteeism':     'Absenteeism report (hr_admin)',
        'GET /api/reports/upcoming':        'Upcoming approved leave (manager)',
      },

      publicHolidays: {
        'POST   /api/public-holidays/seed': 'Seed SA holidays (hr_admin)',
        'POST   /api/public-holidays':      'Add custom holiday (hr_admin)',
        'GET    /api/public-holidays':      'List all holidays',
        'DELETE /api/public-holidays/:id':  'Delete a holiday (hr_admin)',
      },
    },
  });
});

module.exports = router;