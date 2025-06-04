const express = require('express');
const multer = require('multer');
const supabase = require('../config/database');
const { extractTextFromFile, validateFile } = require('../services/fileProcessor');
const { analyzeContract } = require('../services/aiAnalysis');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const validation = validateFile(file);
    if (validation.valid) cb(null, true);
    else cb(new Error(validation.error));
  }
});

// Upload route with improved error handling
router.post('/upload', authenticateToken, upload.single('contract'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const { originalname, buffer, size, mimetype } = req.file;
    const userId = req.user.id;
    
    // Parse metadata safely
    let metadata = {};
    try {
      metadata = JSON.parse(req.body.metadata || '{}');
    } catch (error) {
      console.warn('Invalid metadata JSON, using empty object');
    }

    // Create initial contract record
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .insert([{
        user_id: userId,
        title: originalname.replace(/\.[^/.]+$/, ""),
        file_name: originalname,
        file_size: size,
        file_type: mimetype,
        ai_analysis_status: 'processing',
        contract_data: {},
        global_triggers: {},
        metadata,
        notes: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (contractError) {
      console.error('Database error:', contractError);
      return res.status(500).json({ error: 'Failed to create contract record' });
    }

    console.log(`Contract ${contract.id} created, starting analysis...`);

    // Start async processing but don't wait for it
    processContractAsync(contract.id, buffer, originalname);
    
    // Return immediately with contract ID
    res.json({ 
      success: true, 
      contractId: contract.id, 
      contract: contract,
      message: 'Upload successful, analysis started'
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Improved async processing with better error handling
async function processContractAsync(contractId, fileBuffer, fileName) {
  try {
    console.log(`Starting text extraction for contract ${contractId}`);
    
    // Extract text from file
    const contractText = await extractTextFromFile(fileBuffer, fileName);
    
    if (!contractText || contractText.trim().length === 0) {
      throw new Error('No text could be extracted from the file');
    }

    console.log(`Text extracted (${contractText.length} chars), starting AI analysis...`);

    // Analyze contract with AI
    const analysisResult = await analyzeContract(contractText);
    
    if (!analysisResult) {
      throw new Error('AI analysis returned no results');
    }

    console.log(`AI analysis completed for contract ${contractId}`);

    // Update contract with results
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
          ...extractAdditionalTriggers(analysisResult)
        },
        updated_at: new Date().toISOString()
      })
      .eq('id', contractId);

    if (updateError) {
      console.error('Update error:', updateError);
      await markContractAsFailed(contractId, 'Failed to save analysis results');
    } else {
      console.log(`Contract ${contractId} analysis completed successfully`);
    }
    
  } catch (error) {
    console.error(`Contract ${contractId} analysis failed:`, error);
    await markContractAsFailed(contractId, error.message);
  }
}

// Helper function to extract additional trigger dates
function extractAdditionalTriggers(analysisResult) {
  const triggers = {};
  
  // Extract due diligence end date
  if (analysisResult.dueDiligence?.endDate && analysisResult.dueDiligence.endDate !== 'TBD') {
    triggers['Due Diligence End'] = analysisResult.dueDiligence.endDate;
  }
  
  // Extract closing date
  if (analysisResult.closingInfo?.outsideDate && analysisResult.closingInfo.outsideDate !== 'TBD') {
    triggers['Outside Closing Date'] = analysisResult.closingInfo.outsideDate;
  }
  
  // Extract contingency deadlines
  if (analysisResult.contingencies && Array.isArray(analysisResult.contingencies)) {
    analysisResult.contingencies.forEach((contingency, index) => {
      if (contingency.deadline && contingency.deadline !== 'TBD') {
        triggers[contingency.name || `Contingency ${index + 1}`] = contingency.deadline;
      }
    });
  }
  
  return triggers;
}

async function markContractAsFailed(contractId, errorMessage) {
  try {
    await supabase
      .from('contracts')
      .update({
        ai_analysis_status: 'failed',
        ai_analysis_result: { error: errorMessage },
        updated_at: new Date().toISOString()
      })
      .eq('id', contractId);
  } catch (error) {
    console.error('Failed to mark contract as failed:', error);
  }
}

// Check contract status endpoint
router.get('/:id/status', authenticateToken, async (req, res) => {
  try {
    const contractId = req.params.id;
    const userId = req.user.id;

    const { data: contract, error } = await supabase
      .from('contracts')
      .select('id, ai_analysis_status, ai_analysis_result, user_id')
      .eq('id', contractId)
      .single();

    if (error || !contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    // Check if user has access
    if (contract.user_id !== userId) {
      // Check if it's shared
      const hasSharedAccess = await checkSharedAccess(contractId, req.user.email);
      if (!hasSharedAccess) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    res.json({
      success: true,
      status: contract.ai_analysis_status,
      error: contract.ai_analysis_result?.error || null
    });

  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({ error: 'Failed to check status' });
  }
});

// Fetch all contracts for the user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const userEmail = req.user.email;

    // Get user's own contracts
    const { data: ownContracts, error: ownError } = await supabase
      .from('contracts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (ownError) {
      console.error('Error fetching own contracts:', ownError);
      return res.status(500).json({ error: 'Failed to fetch contracts' });
    }

    // Get shared contracts
    const { data: sharedContracts, error: sharedError } = await supabase
      .from('contract_shares')
      .select(`
        contracts (
          id, title, file_name, file_size, file_type, ai_analysis_status,
          contract_data, property_address, purchase_price, created_at, updated_at, metadata
        )
      `)
      .eq('shared_with_email', userEmail);

    if (sharedError) {
      console.error('Error fetching shared contracts:', sharedError);
      // Don't fail the whole request if shared contracts fail
    }

    const sharedContractsList = sharedContracts ? 
      sharedContracts.map(s => ({ ...s.contracts, shared: true })) : [];

    res.json({ 
      success: true, 
      ownContracts: ownContracts || [], 
      sharedContracts: sharedContractsList 
    });

  } catch (error) {
    console.error('Error fetching contracts:', error);
    res.status(500).json({ error: 'Failed to fetch contracts' });
  }
});

// Get a specific contract
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const contractId = req.params.id;
    const userId = req.user.id;
    const userEmail = req.user.email;

    const { data: contract, error } = await supabase
      .from('contracts')
      .select('*')
      .eq('id', contractId)
      .single();

    if (error || !contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    // Check access permissions
    const hasAccess = contract.user_id === userId || 
                     await checkSharedAccess(contractId, userEmail);
    
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({ success: true, contract });

  } catch (error) {
    console.error('Error fetching contract:', error);
    res.status(500).json({ error: 'Failed to fetch contract' });
  }
});

// Update a contract
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const contractId = req.params.id;
    const userId = req.user.id;
    const updates = req.body;

    // Verify ownership
    const { data: contract, error: fetchError } = await supabase
      .from('contracts')
      .select('user_id, notes')
      .eq('id', contractId)
      .single();

    if (fetchError || !contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    if (contract.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Handle notes update specially
    if (updates.notes) {
      // If it's an array, replace the notes
      if (Array.isArray(updates.notes)) {
        updates.notes = updates.notes;
      } else {
        // Otherwise, merge with existing notes
        const currentNotes = contract.notes || [];
        updates.notes = [...currentNotes, updates.notes];
      }
    }

    // Add updated timestamp
    updates.updated_at = new Date().toISOString();

    const { data: updatedContract, error: updateError } = await supabase
      .from('contracts')
      .update(updates)
      .eq('id', contractId)
      .select()
      .single();

    if (updateError) {
      console.error('Update error:', updateError);
      return res.status(500).json({ error: 'Failed to update contract' });
    }

    res.json({ success: true, contract: updatedContract });

  } catch (error) {
    console.error('Update error:', error);
    res.status(500).json({ error: 'Failed to update contract' });
  }
});

// Update contract status (closed, archived, etc)
router.put('/:id/status', authenticateToken, async (req, res) => {
  try {
    const contractId = req.params.id;
    const userId = req.user.id;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    const { data: contract, error } = await supabase
      .from('contracts')
      .select('user_id, metadata')
      .eq('id', contractId)
      .single();

    if (!contract || error) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    if (contract.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const updatedMetadata = {
      ...(contract.metadata || {}),
      status
    };

    const { error: updateError } = await supabase
      .from('contracts')
      .update({ 
        metadata: updatedMetadata, 
        updated_at: new Date().toISOString() 
      })
      .eq('id', contractId);

    if (updateError) {
      console.error('Status update error:', updateError);
      return res.status(500).json({ error: 'Failed to update status' });
    }

    res.json({ success: true, message: 'Status updated successfully' });

  } catch (error) {
    console.error('Status update error:', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// Delete contract
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const contractId = req.params.id;
    const userId = req.user.id;

    const { data: contract, error } = await supabase
      .from('contracts')
      .select('user_id')
      .eq('id', contractId)
      .single();

    if (!contract || error) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    if (contract.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Delete related shares first
    await supabase
      .from('contract_shares')
      .delete()
      .eq('contract_id', contractId);

    // Delete the contract
    const { error: deleteError } = await supabase
      .from('contracts')
      .delete()
      .eq('id', contractId);

    if (deleteError) {
      console.error('Delete error:', deleteError);
      return res.status(500).json({ error: 'Failed to delete contract' });
    }

    res.json({ success: true, message: 'Contract deleted successfully' });

  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: 'Failed to delete contract' });
  }
});

// Share contract
router.post('/:id/share', authenticateToken, async (req, res) => {
  try {
    const contractId = req.params.id;
    const userId = req.user.id;
    const { email, role = 'viewer' } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const { data: contract, error } = await supabase
      .from('contracts')
      .select('user_id, title')
      .eq('id', contractId)
      .single();

    if (!contract || error) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    if (contract.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Check if already shared
    const { data: existingShare } = await supabase
      .from('contract_shares')
      .select('id')
      .eq('contract_id', contractId)
      .eq('shared_with_email', email)
      .single();

    if (existingShare) {
      return res.status(400).json({ error: 'Contract already shared with this email' });
    }

    const { data: share, error: shareError } = await supabase
      .from('contract_shares')
      .insert([{ 
        contract_id: contractId, 
        shared_with_email: email, 
        shared_by: userId, 
        role,
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (shareError) {
      console.error('Share error:', shareError);
      return res.status(500).json({ error: 'Failed to share contract' });
    }

    res.json({ 
      success: true, 
      message: `Contract shared with ${email}`, 
      share 
    });

  } catch (error) {
    console.error('Share error:', error);
    res.status(500).json({ error: 'Failed to share contract' });
  }
});

// Submit feedback
router.post('/:id/feedback', authenticateToken, async (req, res) => {
  try {
    const contractId = req.params.id;
    const userId = req.user.id;
    const { rating, contractData, timestamp } = req.body;

    // Verify access to contract
    const { data: contract } = await supabase
      .from('contracts')
      .select('user_id')
      .eq('id', contractId)
      .single();

    if (!contract || contract.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Store feedback (you may want to create a feedback table)
    console.log(`Feedback received for contract ${contractId}: ${rating}`);
    
    res.json({ success: true, message: 'Feedback submitted' });

  } catch (error) {
    console.error('Feedback error:', error);
    res.status(500).json({ error: 'Failed to submit feedback' });
  }
});

// Helper: check shared access
async function checkSharedAccess(contractId, userEmail) {
  try {
    const { data, error } = await supabase
      .from('contract_shares')
      .select('id')
      .eq('contract_id', contractId)
      .eq('shared_with_email', userEmail)
      .single();
    
    return !error && data;
  } catch (error) {
    return false;
  }
}

module.exports = router;