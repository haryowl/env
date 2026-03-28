const express = require('express');
const Joi = require('joi');
const { authorizeRole } = require('../middleware/auth');
const { getRow, getRows, query } = require('../config/database');
const { ensureTenantsSchema } = require('../utils/ensureTenantsSchema');
const { validatePostLogoutRedirectUrl } = require('../utils/postLogoutRedirect');

const router = express.Router();

router.use(async (req, res, next) => {
  try {
    await ensureTenantsSchema();
  } catch (e) {
    console.error('ensureTenantsSchema:', e);
    return res.status(500).json({
      error: 'Database initialization failed',
      code: 'DB_INIT_ERROR',
      details: e.message,
    });
  }
  next();
});

const tenantBodySchema = Joi.object({
  name: Joi.string().min(1).max(255).required(),
  post_logout_redirect_url: Joi.string().allow('', null).max(2048).optional(),
});

const tenantUpdateSchema = Joi.object({
  name: Joi.string().min(1).max(255).optional(),
  post_logout_redirect_url: Joi.string().allow('', null).max(2048).optional(),
}).min(1);

router.get('/', authorizeRole(['super_admin', 'admin']), async (req, res) => {
  try {
    const tenants = await getRows(`
      SELECT tenant_id, name, post_logout_redirect_url, created_at, updated_at
      FROM tenants
      ORDER BY name ASC
    `);
    res.json({ tenants: tenants || [] });
  } catch (error) {
    console.error('List tenants error:', error);
    res.status(500).json({ error: 'Failed to list tenants', code: 'LIST_TENANTS_ERROR' });
  }
});

router.post('/', authorizeRole(['super_admin', 'admin']), async (req, res) => {
  try {
    const { error, value } = tenantBodySchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Invalid input',
        code: 'VALIDATION_ERROR',
        details: error.details,
      });
    }

    const urlCheck = validatePostLogoutRedirectUrl(value.post_logout_redirect_url);
    if (!urlCheck.ok) {
      return res.status(400).json({ error: urlCheck.error, code: 'INVALID_LOGOUT_URL' });
    }

    const result = await query(
      `
      INSERT INTO tenants (name, post_logout_redirect_url)
      VALUES ($1, $2)
      RETURNING tenant_id, name, post_logout_redirect_url, created_at, updated_at
    `,
      [value.name.trim(), urlCheck.url]
    );

    res.status(201).json({ tenant: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Tenant name already exists', code: 'TENANT_DUPLICATE' });
    }
    console.error('Create tenant error:', error);
    res.status(500).json({ error: 'Failed to create tenant', code: 'CREATE_TENANT_ERROR' });
  }
});

router.put('/:tenantId', authorizeRole(['super_admin', 'admin']), async (req, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId, 10);
    if (Number.isNaN(tenantId)) {
      return res.status(400).json({ error: 'Invalid tenant id', code: 'INVALID_ID' });
    }

    const { error, value } = tenantUpdateSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Invalid input',
        code: 'VALIDATION_ERROR',
        details: error.details,
      });
    }

    const existing = await getRow('SELECT tenant_id FROM tenants WHERE tenant_id = $1', [tenantId]);
    if (!existing) {
      return res.status(404).json({ error: 'Tenant not found', code: 'TENANT_NOT_FOUND' });
    }

    const fields = [];
    const vals = [];
    let i = 1;

    if (value.name !== undefined) {
      fields.push(`name = $${i++}`);
      vals.push(value.name.trim());
    }
    if (value.post_logout_redirect_url !== undefined) {
      const urlCheck = validatePostLogoutRedirectUrl(value.post_logout_redirect_url);
      if (!urlCheck.ok) {
        return res.status(400).json({ error: urlCheck.error, code: 'INVALID_LOGOUT_URL' });
      }
      fields.push(`post_logout_redirect_url = $${i++}`);
      vals.push(urlCheck.url);
    }

    if (!fields.length) {
      return res.status(400).json({ error: 'No fields to update', code: 'NO_FIELDS' });
    }

    fields.push('updated_at = NOW()');
    const tenantParam = i;
    vals.push(tenantId);

    const result = await query(
      `
      UPDATE tenants SET ${fields.join(', ')}
      WHERE tenant_id = $${tenantParam}
      RETURNING tenant_id, name, post_logout_redirect_url, created_at, updated_at
    `,
      vals
    );

    res.json({ tenant: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Tenant name already exists', code: 'TENANT_DUPLICATE' });
    }
    console.error('Update tenant error:', error);
    res.status(500).json({ error: 'Failed to update tenant', code: 'UPDATE_TENANT_ERROR' });
  }
});

router.delete('/:tenantId', authorizeRole(['super_admin', 'admin']), async (req, res) => {
  try {
    const tenantId = parseInt(req.params.tenantId, 10);
    if (Number.isNaN(tenantId)) {
      return res.status(400).json({ error: 'Invalid tenant id', code: 'INVALID_ID' });
    }

    const del = await query('DELETE FROM tenants WHERE tenant_id = $1 RETURNING tenant_id', [tenantId]);
    if (!del.rows.length) {
      return res.status(404).json({ error: 'Tenant not found', code: 'TENANT_NOT_FOUND' });
    }

    res.json({ message: 'Tenant deleted', tenant_id: tenantId });
  } catch (error) {
    console.error('Delete tenant error:', error);
    res.status(500).json({ error: 'Failed to delete tenant', code: 'DELETE_TENANT_ERROR' });
  }
});

module.exports = router;
