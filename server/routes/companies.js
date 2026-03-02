const express = require('express');
const router = express.Router();
const { query, getRow, getRows } = require('../config/database');
const { authenticateToken, authorizeMenuAccess } = require('../middleware/auth');

// Apply authentication middleware to all routes
router.use(authenticateToken);
router.use(authorizeMenuAccess('/company-site'));

// GET /api/companies - Get all companies
router.get('/', async (req, res) => {
  try {
    console.log('Fetching companies for user:', req.user.user_id);
    const companies = await getRows(`
      SELECT DISTINCT
        c.company_id,
        c.company_name,
        c.address,
        c.contact_person_name,
        c.contact_person_phone,
        c.created_at,
        c.updated_at,
        c.created_by
      FROM companies c
      LEFT JOIN sites s ON c.company_id = s.company_id
      LEFT JOIN user_sites us ON s.site_id = us.site_id
      WHERE (c.created_by = $1 OR c.created_by IS NULL OR us.user_id = $1)
      ORDER BY c.company_name
    `, [req.user.user_id]);
    console.log('Companies fetched:', companies.length);
    res.json(companies);
  } catch (error) {
    console.error('Get companies error:', error);
    res.status(500).json({
      error: 'Failed to get companies',
      code: 'GET_COMPANIES_ERROR',
      details: error.message
    });
  }
});

// GET /api/companies/:id - Get company by ID
router.get('/:id', async (req, res) => {
  try {
    const company = await getRow(`
      SELECT 
        company_id,
        company_name,
        address,
        contact_person_name,
        contact_person_phone,
        created_at,
        updated_at,
        created_by
      FROM companies 
      WHERE company_id = $1 AND (created_by = $2 OR created_by IS NULL)
    `, [req.params.id, req.user.user_id]);

    if (!company) {
      return res.status(404).json({
        error: 'Company not found',
        code: 'COMPANY_NOT_FOUND'
      });
    }

    res.json(company);
  } catch (error) {
    console.error('Get company error:', error);
    res.status(500).json({
      error: 'Failed to get company',
      code: 'GET_COMPANY_ERROR'
    });
  }
});

// POST /api/companies - Create new company
router.post('/', async (req, res) => {
  try {
    const { company_name, address, contact_person_name, contact_person_phone } = req.body;

    // Validation
    if (!company_name || company_name.trim() === '') {
      return res.status(400).json({
        error: 'Company name is required',
        code: 'COMPANY_NAME_REQUIRED'
      });
    }

    // Check if company name already exists
    const existingCompany = await getRow(`
      SELECT company_id FROM companies WHERE company_name = $1
    `, [company_name]);

    if (existingCompany) {
      return res.status(409).json({
        error: 'Company name already exists',
        code: 'COMPANY_NAME_EXISTS'
      });
    }

    const result = await query(`
      INSERT INTO companies (company_name, address, contact_person_name, contact_person_phone, created_by)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING company_id, company_name, address, contact_person_name, contact_person_phone, created_at
    `, [company_name, address, contact_person_name, contact_person_phone, req.user.user_id]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create company error:', error);
    res.status(500).json({
      error: 'Failed to create company',
      code: 'CREATE_COMPANY_ERROR'
    });
  }
});

// PUT /api/companies/:id - Update company
router.put('/:id', async (req, res) => {
  try {
    const { company_name, address, contact_person_name, contact_person_phone } = req.body;
    const companyId = req.params.id;

    // Validation
    if (!company_name || company_name.trim() === '') {
      return res.status(400).json({
        error: 'Company name is required',
        code: 'COMPANY_NAME_REQUIRED'
      });
    }

    // Check if company exists and user has permission
    const existingCompany = await getRow(`
      SELECT company_id FROM companies 
      WHERE company_id = $1 AND (created_by = $2 OR created_by IS NULL)
    `, [companyId, req.user.user_id]);

    if (!existingCompany) {
      return res.status(404).json({
        error: 'Company not found or access denied',
        code: 'COMPANY_NOT_FOUND'
      });
    }

    // Check if company name already exists (excluding current company)
    const duplicateCompany = await getRow(`
      SELECT company_id FROM companies WHERE company_name = $1 AND company_id != $2
    `, [company_name, companyId]);

    if (duplicateCompany) {
      return res.status(409).json({
        error: 'Company name already exists',
        code: 'COMPANY_NAME_EXISTS'
      });
    }

    const result = await query(`
      UPDATE companies 
      SET 
        company_name = $1,
        address = $2,
        contact_person_name = $3,
        contact_person_phone = $4,
        updated_at = CURRENT_TIMESTAMP
      WHERE company_id = $5 AND (created_by = $6 OR created_by IS NULL)
      RETURNING company_id, company_name, address, contact_person_name, contact_person_phone, updated_at
    `, [company_name, address, contact_person_name, contact_person_phone, companyId, req.user.user_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Company not found or access denied',
        code: 'COMPANY_NOT_FOUND'
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update company error:', error);
    res.status(500).json({
      error: 'Failed to update company',
      code: 'UPDATE_COMPANY_ERROR'
    });
  }
});

// DELETE /api/companies/:id - Delete company
router.delete('/:id', async (req, res) => {
  try {
    const companyId = req.params.id;

    // Check if company exists and user has permission
    const existingCompany = await getRow(`
      SELECT company_id FROM companies 
      WHERE company_id = $1 AND (created_by = $2 OR created_by IS NULL)
    `, [companyId, req.user.user_id]);

    if (!existingCompany) {
      return res.status(404).json({
        error: 'Company not found or access denied',
        code: 'COMPANY_NOT_FOUND'
      });
    }

    // Check if company is referenced by sites
    const referencedSites = await getRows(`
      SELECT COUNT(*) as count FROM sites WHERE company_id = $1
    `, [companyId]);

    if (referencedSites[0].count > 0) {
      return res.status(409).json({
        error: 'Cannot delete company that has associated sites',
        code: 'COMPANY_HAS_SITES'
      });
    }

    const result = await query(`
      DELETE FROM companies 
      WHERE company_id = $1 AND (created_by = $2 OR created_by IS NULL)
      RETURNING company_id
    `, [companyId, req.user.user_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Company not found or access denied',
        code: 'COMPANY_NOT_FOUND'
      });
    }

    res.json({ message: 'Company deleted successfully' });
  } catch (error) {
    console.error('Delete company error:', error);
    res.status(500).json({
      error: 'Failed to delete company',
      code: 'DELETE_COMPANY_ERROR'
    });
  }
});

module.exports = router;
