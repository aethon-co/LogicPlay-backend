const express = require('express');
const router = express.Router();

const adminController = require('../controllers/adminController');
const { requireAdminKey } = require('../middleware/adminAuth');

router.post(
  '/students/import',
  requireAdminKey,
  express.text({ type: ['text/csv', 'application/csv', 'text/plain'], limit: '10mb' }),
  adminController.importStudentsCsv,
);

module.exports = router;

