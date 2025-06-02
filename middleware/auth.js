const supabase = require('../config/database');

/**
 * Middleware to authenticate JWT tokens from Supabase
 * @param {Request} req 
 * @param {Response} res 
 * @param {Function} next 
 */
async function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ 
        error: 'Access token required',
        code: 'MISSING_TOKEN'
      });
    }

    // Verify JWT token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      console.error('Token verification failed:', error?.message);
      return res.status(403).json({ 
        error: 'Invalid or expired token',
        code: 'INVALID_TOKEN'
      });
    }

    // Attach user info to request object
    req.user = user;
    req.token = token;
    
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(403).json({ 
      error: 'Token verification failed',
      code: 'AUTH_ERROR'
    });
  }
}

/**
 * Optional authentication - doesn't fail if no token
 * @param {Request} req 
 * @param {Response} res 
 * @param {Function} next 
 */
async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const { data: { user }, error } = await supabase.auth.getUser(token);
      
      if (!error && user) {
        req.user = user;
        req.token = token;
      }
    }
    
    next();
  } catch (error) {
    // Silent fail for optional auth
    next();
  }
}

module.exports = {
  authenticateToken,
  optionalAuth
};