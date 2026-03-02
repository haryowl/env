const { query } = require('../config/database');

const logRoleAction = async (action, roleId, userId, performedBy, details, req) => {
  try {
    await query(`
      INSERT INTO role_audit_logs (action, role_id, user_id, performed_by, details, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      action,
      roleId,
      userId,
      performedBy,
      JSON.stringify(details),
      req.ip || req.connection.remoteAddress,
      req.get('User-Agent')
    ]);
  } catch (error) {
    console.error('Failed to log role action:', error);
    // Don't fail the main operation if audit logging fails
  }
};

const roleAuditMiddleware = (action) => {
  return async (req, res, next) => {
    const originalSend = res.send;
    
    res.send = function(data) {
      // Log the action after the response is sent
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const roleId = req.params.roleId || req.body.role_id;
        const userId = req.body.user_id || req.body.user_ids;
        const performedBy = req.user?.user_id;
        
        const details = {
          method: req.method,
          path: req.path,
          body: req.body,
          params: req.params,
          statusCode: res.statusCode,
          response: typeof data === 'string' ? data : JSON.stringify(data)
        };

        logRoleAction(action, roleId, userId, performedBy, details, req);
      }
      
      return originalSend.call(this, data);
    };
    
    next();
  };
};

module.exports = {
  logRoleAction,
  roleAuditMiddleware
}; 