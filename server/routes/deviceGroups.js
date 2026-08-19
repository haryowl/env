const express = require('express');
const Joi = require('joi');
const { getRow, getRows, query } = require('../config/database');
const { authorizeRole } = require('../middleware/auth');

const router = express.Router();

const groupSchema = Joi.object({
  name: Joi.string().trim().min(1).max(100).required(),
  description: Joi.string().trim().max(2000).allow('', null),
});

async function ensureDeviceGroupsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS device_groups (
      group_id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      description TEXT,
      created_by INTEGER REFERENCES users(user_id),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

router.get('/', async (req, res) => {
  try {
    await ensureDeviceGroupsTable();
    const groups = await getRows(`
      SELECT
        dg.group_id,
        dg.name,
        dg.description,
        dg.created_at,
        dg.updated_at,
        COUNT(d.device_id)::int AS device_count
      FROM device_groups dg
      LEFT JOIN devices d
        ON d.group_id = dg.group_id
       AND COALESCE(d.is_deleted, false) = false
      GROUP BY dg.group_id, dg.name, dg.description, dg.created_at, dg.updated_at
      ORDER BY dg.name ASC
    `);
    res.json({ groups });
  } catch (error) {
    console.error('List device groups error:', error);
    res.status(500).json({ error: 'Failed to list device groups', code: 'DEVICE_GROUPS_LIST_ERROR' });
  }
});

router.post('/', authorizeRole(['super_admin', 'admin']), async (req, res) => {
  try {
    await ensureDeviceGroupsTable();
    const { error, value } = groupSchema.validate(req.body, { stripUnknown: true });
    if (error) {
      return res.status(400).json({ error: error.message, code: 'VALIDATION_ERROR' });
    }

    const existing = await getRow(
      'SELECT group_id FROM device_groups WHERE lower(name) = lower($1)',
      [value.name]
    );
    if (existing) {
      return res.status(409).json({ error: 'A group with this name already exists', code: 'GROUP_EXISTS' });
    }

    const result = await query(
      `INSERT INTO device_groups (name, description, created_by)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [value.name, value.description || null, req.user.user_id]
    );
    res.status(201).json({ group: result.rows[0] });
  } catch (error) {
    console.error('Create device group error:', error);
    res.status(500).json({ error: 'Failed to create device group', code: 'DEVICE_GROUPS_CREATE_ERROR' });
  }
});

router.put('/:groupId', authorizeRole(['super_admin', 'admin']), async (req, res) => {
  try {
    await ensureDeviceGroupsTable();
    const groupId = Number(req.params.groupId);
    if (!Number.isInteger(groupId)) {
      return res.status(400).json({ error: 'Invalid group id', code: 'VALIDATION_ERROR' });
    }

    const { error, value } = groupSchema.validate(req.body, { stripUnknown: true });
    if (error) {
      return res.status(400).json({ error: error.message, code: 'VALIDATION_ERROR' });
    }

    const existing = await getRow('SELECT group_id FROM device_groups WHERE group_id = $1', [groupId]);
    if (!existing) {
      return res.status(404).json({ error: 'Device group not found', code: 'NOT_FOUND' });
    }

    const nameClash = await getRow(
      'SELECT group_id FROM device_groups WHERE lower(name) = lower($1) AND group_id <> $2',
      [value.name, groupId]
    );
    if (nameClash) {
      return res.status(409).json({ error: 'A group with this name already exists', code: 'GROUP_EXISTS' });
    }

    const result = await query(
      `UPDATE device_groups
       SET name = $1, description = $2, updated_at = NOW()
       WHERE group_id = $3
       RETURNING *`,
      [value.name, value.description || null, groupId]
    );
    res.json({ group: result.rows[0] });
  } catch (error) {
    console.error('Update device group error:', error);
    res.status(500).json({ error: 'Failed to update device group', code: 'DEVICE_GROUPS_UPDATE_ERROR' });
  }
});

router.delete('/:groupId', authorizeRole(['super_admin', 'admin']), async (req, res) => {
  try {
    await ensureDeviceGroupsTable();
    const groupId = Number(req.params.groupId);
    if (!Number.isInteger(groupId)) {
      return res.status(400).json({ error: 'Invalid group id', code: 'VALIDATION_ERROR' });
    }

    const existing = await getRow('SELECT group_id FROM device_groups WHERE group_id = $1', [groupId]);
    if (!existing) {
      return res.status(404).json({ error: 'Device group not found', code: 'NOT_FOUND' });
    }

    await query('UPDATE devices SET group_id = NULL, updated_at = NOW() WHERE group_id = $1', [groupId]);
    await query('DELETE FROM device_groups WHERE group_id = $1', [groupId]);
    res.json({ ok: true });
  } catch (error) {
    console.error('Delete device group error:', error);
    res.status(500).json({ error: 'Failed to delete device group', code: 'DEVICE_GROUPS_DELETE_ERROR' });
  }
});

module.exports = router;
