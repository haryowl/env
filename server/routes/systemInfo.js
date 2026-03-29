const express = require('express');
const { authorizeRole } = require('../middleware/auth');
const { getFullSystemInfo } = require('../services/systemInfoService');

const router = express.Router();

router.get('/', authorizeRole(['super_admin', 'admin']), async (req, res) => {
  try {
    const info = await getFullSystemInfo();
    res.json(info);
  } catch (error) {
    console.error('System info error:', error);
    res.status(500).json({
      error: 'Failed to read system information',
      code: 'SYSTEM_INFO_ERROR',
      details: error.message,
    });
  }
});

module.exports = router;
