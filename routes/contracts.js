const express = require('express');
const multer = require('multer');
const supabase = require('../config/database');
const { extractTextFromFile, validateFile } = require('../services/fileProcessor');
const { analyzeContract } = require('../services/aiAnalysis');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const validation = validateFile(file);
    if (validation.valid) {
      cb(null, true);
    } else {
      cb(new Error(validation.error));
    }
  }
});

/**
 * POST /api/contracts/upload
 * Upload and analyze contract
 */
router.post('/upload', authenticateToken, upload.single('contract'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { originalname, buffer, size, mimetype } = req.file;
    const userId = req.user.id;

    console.log(`📄 Processing upload: ${originalname} (${size} bytes) for user ${userId}`);

    // Validate file
    const validation = validateFile(req.file);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

   // Create initial contract record
const { data: contract, error: contractError } = await supabase
  .from('contracts')
  .insert([{
    user_id: userId,
    title: originalname.replace(/\.[^/.]+$/, ""), // Remove file extension
    file_name: originalname,
    file_size: size,
    file_type: mimetype,
    ai_analysis_status: 'processing',
    contract_data: {}, // Add this - empty object to satisfy NOT NULL constraint
    global_triggers: {} // Add this too for good measure
  }])
  .select()
  .single();
    if (contractError) {
      console.error('Database error:', contractError);
      return res.status(500).json({ error: 'Failed to create contract record' });
    }

    console.log(`✅ Contract record created with ID: ${contract.id}`);

    // Process file in background
    processContractAsync(contract.id, buffer, originalname);

    res.json({
      success: true,
      contractId: contract.id,
      message: 'File uploaded successfully. Analysis in progress...',
      contract: {
        id: contract.id,
        title: contract.title,
        fileName: contract.file_name,
        status: contract.ai_analysis_status
      }
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message || 'Upload failed' });
  }
});

/**
 * Background processing function
 */
async function processContractAsync(contractId, fileBuffer, fileName) {
  try {
    console.log(`🔄 Starting background processing for contract ${contractId}`);

    // Extract text from file
    const contractText = await extractTextFromFile(fileBuffer, fileName);
    console.log(`📝 Extracted ${contractText.length} characters from ${fileName}`);

    // Analyze with AI
    const analysisResult = await analyzeContract(contractText);
    console.log(`🤖 AI analysis completed for contract ${contractId}`);

    // Update contract with analysis results
    const { error: updateError } = await supabase
      .from('contracts')
      .update({
        contract_data: analysisResult,
        ai_analysis_status: 'completed',
        ai_analysis_result: analysisResult,
        property_address: analysisResult.property?.address || null,
        purchase_price: analysisResult.property?.purchasePrice || null,
        global_triggers: {
          "Opening of Escrow": analysisResult.escrow?.openingDate || null,
          "Title Commitment": null,
          "Loan Application": null,
          "Environmental Report": null,
          "Survey Completion": null
        },
        updated_at: new Date().toISOString()
      })
      .eq('id', contractId);

    if (updateError) {
      console.error('Failed to update contract:', updateError);
      await markContractAsFailed(contractId, 'Failed to save analysis results');
    } else {
      console.log(`✅ Contract ${contractId} processing completed successfully`);
    }

  } catch (error) {
    console.error(`❌ Contract processing error for ${contractId}:`, error);
    await markContractAsFailed(contractId, error.message);
  }
}

/**
 * Mark contract as failed
 */
async function markContractAsFailed(contractId, errorMessage) {
  await supabase
    .from('contracts')
    .update({
      ai_analysis_status: 'failed',
      ai_analysis_result: { error: errorMessage },
      updated_at: new Date().toISOString()
    })
    .eq('id', contractId);
}

/**
 * GET /api/contracts
 * Get user's contracts
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get user's own contracts
    const { data: ownContracts, error: ownError } = await supabase
      .from('contracts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (ownError) {
      throw ownError;
    }

    // Get shared contracts
    const { data: sharedContracts, error: sharedError } = await supabase
      .from('contract_shares')
      .select(`
        contracts (
          id,
          title,
          property_address,
          purchase_price,
          ai_analysis_status,
          created_at,
          updated_at,
          file_name,
          contract_data,
          global_triggers
        )
      `)
      .eq('shared_with_email', req.user.email);

    if (sharedError) {
      throw sharedError;
    }

    const sharedContractsList = sharedContracts.map(share => ({
      ...share.contracts,
      shared: true
    }));

    res.json({
      success: true,
      ownContracts,
      sharedContracts: sharedContractsList
    });

  } catch (error) {
    console.error('Error fetching contracts:', error);
    res.status(500).json({ error: 'Failed to fetch contracts' });
  }
});

/**
 * GET /api/contracts/:id
 * Get specific contract
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const contractId = req.params.id;
    const userId = req.user.id;

    // Check if user owns the contract or has shared access
    const { data: contract, error } = await supabase
      .from('contracts')
      .select('*')
      .eq('id', contractId)
      .single();

    if (error || !contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    // Check access rights
    const hasAccess = contract.user_id === userId || await checkSharedAccess(contractId, req.user.email);
    
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({
      success: true,
      contract
    });

  } catch (error) {
    console.error('Error fetching contract:', error);
    res.status(500).json({ error: 'Failed to fetch contract' });
  }
});

/**
 * PUT /api/contracts/:id
 * Update contract
 */
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const contractId = req.params.id;
    const userId = req.user.id;
    const updates = req.body;

    // Verify ownership
    const { data: contract, error: fetchError } = await supabase
      .from('contracts')
      .select('user_id')
      .eq('id', contractId)
      .single();

    if (fetchError || !contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    if (contract.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Update contract
    const { data: updatedContract, error: updateError } = await supabase
      .from('contracts')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', contractId)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    res.json({
      success: true,
      contract: updatedContract
    });

  } catch (error) {
    console.error('Error updating contract:', error);
    res.status(500).json({ error: 'Failed to update contract' });
  }
});

/**
 * POST /api/contracts/:id/share
 * Share contract with another user
 */
router.post('/:id/share', authenticateToken, async (req, res) => {
  try {
    const contractId = req.params.id;
    const userId = req.user.id;
    const { email, role = 'viewer' } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Verify ownership
    const { data: contract, error: fetchError } = await supabase
      .from('contracts')
      .select('user_id, title')
      .eq('id', contractId)
      .single();

    if (fetchError || !contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    if (contract.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Create share record
    const { data: share, error: shareError } = await supabase
      .from('contract_shares')
      .insert([{
        contract_id: contractId,
        shared_with_email: email,
        shared_by: userId,
        role: role
      }])
      .select()
      .single();

    if (shareError) {
      if (shareError.code === '23505') { // Unique constraint violation
        return res.status(400).json({ error: 'Contract already shared with this email' });
      }
      throw shareError;
    }

    res.json({
      success: true,
      message: `Contract "${contract.title}" shared with ${email}`,
      share
    });

  } catch (error) {
    console.error('Error sharing contract:', error);
    res.status(500).json({ error: 'Failed to share contract' });
  }
});

/**
 * GET /api/contracts/:id/status
 * Get contract analysis status
 */
router.get('/:id/status', authenticateToken, async (req, res) => {
  try {
    const contractId = req.params.id;
    const userId = req.user.id;

    const { data: contract, error } = await supabase
      .from('contracts')
      .select('ai_analysis_status, ai_analysis_result, updated_at')
      .eq('id', contractId)
      .single();

    if (error || !contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    // Check access
    const hasAccess = await checkOwnershipOrSharedAccess(contractId, userId, req.user.email);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({
      success: true,
      status: contract.ai_analysis_status,
      lastUpdated: contract.updated_at,
      ...(contract.ai_analysis_status === 'failed' && {
        error: contract.ai_analysis_result?.error
      })
    });

  } catch (error) {
    console.error('Error getting contract status:', error);
    res.status(500).json({ error: 'Failed to get contract status' });
  }
});

/**
 * Helper function to check shared access
 */
async function checkSharedAccess(contractId, userEmail) {
  const { data, error } = await supabase
    .from('contract_shares')
    .select('id')
    .eq('contract_id', contractId)
    .eq('shared_with_email', userEmail)
    .single();

  return !error && data;
}

/**
 * Helper function to check ownership or shared access
 */
async function checkOwnershipOrSharedAccess(contractId, userId, userEmail) {
  // Check ownership
  const { data: contract } = await supabase
    .from('contracts')
    .select('user_id')
    .eq('id', contractId)
    .single();

  if (contract?.user_id === userId) {
    return true;
  }

  // Check shared access
  return await checkSharedAccess(contractId, userEmail);
}

// Add this test route at the end of routes/contracts.js, before module.exports
router.get('/test-db', authenticateToken, async (req, res) => {
  try {
    console.log('Testing database connection...');
    console.log('User ID:', req.user.id);
    
    // Test simple select
    const { data, error } = await supabase
      .from('contracts')
      .select('count')
      .limit(1);
    
    if (error) {
      console.error('Database test error:', error);
      return res.status(500).json({ error: 'Database error', details: error });
    }
    
    res.json({ 
      success: true, 
      message: 'Database connection working',
      userId: req.user.id,
      userEmail: req.user.email
    });
  } catch (err) {
    console.error('Test error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Add this to routes/contracts.js
router.post('/:id/feedback', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, contractData, timestamp } = req.body;
    const userId = req.user.id;

    // Store feedback in database (you'll need to create the table)
    console.log('Feedback received:', { contractId: id, rating, userId });
    
    res.json({ success: true, message: 'Feedback submitted successfully' });
  } catch (error) {
    console.error('Feedback submission error:', error);
    res.status(500).json({ error: 'Failed to submit feedback' });
  }
});

module.exports = router;