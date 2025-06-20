const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();

// Security middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// CORS configuration - Allow all origins for testing
app.use(cors({
  origin: true,  // Allow all origins
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  preflightContinue: false,
  optionsSuccessStatus: 200
}));

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Railway-compatible health checks (MUST BE FIRST)
app.get('/', (req, res) => {
  res.status(200).send('OK');
});

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Detailed status endpoint
app.get('/status', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    port: process.env.PORT || 3001
  });
});

// Test API endpoint
app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'API is working!', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Simple test route
app.get('/api/simple', (req, res) => {
  res.json({ 
    message: 'Simple route works!',
    method: req.method,
    path: req.path 
  });
});

// Debug routes endpoint
app.get('/api/routes', (req, res) => {
  const routes = [];
  app._router.stack.forEach(function(r){
    if (r.route && r.route.path){
      routes.push({
        path: r.route.path,
        methods: Object.keys(r.route.methods)
      });
    } else if (r.name === 'router') {
      r.handle.stack.forEach(function(nestedR) {
        if (nestedR.route) {
          routes.push({
            path: nestedR.route.path,
            methods: Object.keys(nestedR.route.methods)
          });
        }
      });
    }
  });
  res.json({ routes, totalRoutes: routes.length });
});

// Debug file system
app.get('/api/debug', (req, res) => {
  const fs = require('fs');
  const path = require('path');
  
  try {
    const files = fs.readdirSync(path.join(__dirname));
    const routesExist = fs.existsSync(path.join(__dirname, 'routes'));
    const authExists = fs.existsSync(path.join(__dirname, 'routes', 'auth.js'));
    const contractsExists = fs.existsSync(path.join(__dirname, 'routes', 'contracts.js'));
    
    res.json({
      currentDirectory: __dirname,
      files: files,
      routesFolder: routesExist,
      authFile: authExists,
      contractsFile: contractsExists,
      environmentVariables: {
        hasSupabaseUrl: !!process.env.SUPABASE_URL,
        hasSupabaseKey: !!process.env.SUPABASE_SERVICE_KEY,
        hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
        hasJwtSecret: !!process.env.JWT_SECRET,
        nodeEnv: process.env.NODE_ENV
      }
    });
  } catch (error) {
    res.json({ error: error.message });
  }
});

// Import and use route modules
try {
  const authRoutes = require('./routes/auth');
  const contractRoutes = require('./routes/contracts');
  
  // Mount API routes
  app.use('/api/auth', authRoutes);
  app.use('/api/contracts', contractRoutes);
  
  console.log('✅ Routes loaded successfully');
} catch (error) {
  console.error('❌ Error loading routes:', error.message);
  console.error('Stack:', error.stack);
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Error:', err.message);
  console.error('Stack:', err.stack);
  
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 404 handler
app.use('*', (req, res) => {
  console.log(`❌ 404 - Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    error: 'Route not found',
    method: req.method,
    path: req.originalUrl,
    availableRoutes: ['/', '/health', '/status', '/api/test', '/api/routes', '/api/auth/*', '/api/contracts/*']
  });
});

// Database connection test
const testDatabaseConnection = async () => {
  try {
    const supabase = require('./config/database');
    const { data, error } = await supabase.from('contracts').select('count').limit(1);
    if (error) throw error;
    console.log('✅ Database connected successfully');
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
  }
};

// Start server - Railway compatible
const PORT = process.env.PORT || 3001;

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
  
  // Test database connection
  testDatabaseConnection();
});

// Graceful shutdown handlers
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
    process.exit(0);
  });
});

module.exports = app;