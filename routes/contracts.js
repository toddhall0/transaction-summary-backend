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

// Upload route
router.post('/upload', authenticateToken, upload.single('contract'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const { originalname, buffer, size, mimetype } = req.file;
    const userId = req.user.id;
    const metadata = JSON.parse(req.body.metadata || '{}');

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
        metadata // NEW: store firm/client/division/etc
      }])
      .select()
      .single();

    if (contractError) {
      console.error('Database error:', contractError);
      return res.status(500).json({ error: 'Failed to create contract record' });
    }

    processContractAsync(contract.id, buffer, originalname);
    res.json({ success: true, contractId: contract.id, contract });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

async function processContractAsync(contractId, fileBuffer, fileName) {
  try {
    const contractText = await extractTextFromFile(fileBuffer, fileName);
    const analysisResult = await analyzeContract(contractText);

    const { error: updateError } = await supabase
      .from('contracts')
      .update({
        contract_data: analysisResult,
        ai_analysis_status: 'completed',
        ai_analysis_result: analysisResult,
        property_address: analysisResult.property?.address || null,
        purchase_price: analysisResult.property?.purchasePrice || null,
        global_triggers: {
          "Opening of Escrow": analysisResult.escrow?.openingDate || null
        },
        updated_at: new Date().toISOString()
      })
      .eq('id', contractId);

    if (updateError) {
      console.error('Update error:', updateError);
      await markContractAsFailed(contractId, 'Failed to save analysis');
    }
  } catch (error) {
    await markContractAsFailed(contractId, error.message);
  }
}

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

// Fetch all contracts for the user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const userEmail = req.user.email;

    const { data: ownContracts, error: ownError } = await supabase
      .from('contracts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    const { data: sharedContracts, error: sharedError } = await supabase
      .from('contract_shares')
      .select(`contracts(*)`)
      .eq('shared_with_email', userEmail);

    const sharedContractsList = sharedContracts.map(s => ({ ...s.contracts, shared: true }));

    res.json({ success: true, ownContracts, sharedContracts: sharedContractsList });

  } catch (error) {
    console.error('Error fetching contracts:', error);
    res.status(500).json({ error: 'Failed to fetch contracts' });
  }
});

// Get a specific contract
router.get('/:id', authenticateToken, async (req, res) => {
  const contractId = req.params.id;
  const userId = req.user.id;
  const userEmail = req.user.email;

  const { data: contract, error } = await supabase
    .from('contracts')
    .select('*')
    .eq('id', contractId)
    .single();

  if (error || !contract) return res.status(404).json({ error: 'Not found' });

  const hasAccess = contract.user_id === userId || await checkSharedAccess(contractId, userEmail);
  if (!hasAccess) return res.status(403).json({ error: 'Access denied' });

  res.json({ success: true, contract });
});

// Update a contract
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const contractId = req.params.id;
    const userId = req.user.id;
    let updates = req.body;

    if (updates.notes) {
      const { data: existing } = await supabase
        .from('contracts')
        .select('notes')
        .eq('id', contractId)
        .single();
      const currentNotes = existing?.notes || [];
      updates.notes = [...currentNotes, ...updates.notes];
    }

    const { data: contract, error: fetchError } = await supabase
      .from('contracts')
      .select('user_id')
      .eq('id', contractId)
      .single();

    if (fetchError || !contract) return res.status(404).json({ error: 'Not found' });
    if (contract.user_id !== userId) return res.status(403).json({ error: 'Access denied' });

    const { data: updatedContract, error: updateError } = await supabase
      .from('contracts')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', contractId)
      .select()
      .single();

    res.json({ success: true, contract: updatedContract });

  } catch (error) {
    console.error('Update error:', error);
    res.status(500).json({ error: 'Failed to update' });
  }
});

// Update status (closed, archived, etc)
router.put('/:id/status', authenticateToken, async (req, res) => {
  const contractId = req.params.id;
  const userId = req.user.id;
  const { status } = req.body;

  const { data: contract, error } = await supabase
    .from('contracts')
    .select('user_id, metadata')
    .eq('id', contractId)
    .single();

  if (!contract || error) return res.status(404).json({ error: 'Contract not found' });
  if (contract.user_id !== userId) return res.status(403).json({ error: 'Access denied' });

  const updatedMetadata = {
    ...(contract.metadata || {}),
    status
  };

  const { error: updateError } = await supabase
    .from('contracts')
    .update({ metadata: updatedMetadata, updated_at: new Date().toISOString() })
    .eq('id', contractId);

  if (updateError) return res.status(500).json({ error: 'Failed to update status' });

  res.json({ success: true, message: 'Status updated' });
});

// Delete contract
router.delete('/:id', authenticateToken, async (req, res) => {
  const contractId = req.params.id;
  const userId = req.user.id;

  const { data: contract, error } = await supabase
    .from('contracts')
    .select('user_id')
    .eq('id', contractId)
    .single();

  if (!contract || error) return res.status(404).json({ error: 'Not found' });
  if (contract.user_id !== userId) return res.status(403).json({ error: 'Access denied' });

  const { error: deleteError } = await supabase
    .from('contracts')
    .delete()
    .eq('id', contractId);

  if (deleteError) return res.status(500).json({ error: 'Delete failed' });

  res.json({ success: true, message: 'Deleted' });
});

// Share contract
router.post('/:id/share', authenticateToken, async (req, res) => {
  const contractId = req.params.id;
  const userId = req.user.id;
  const { email, role = 'viewer' } = req.body;

  const { data: contract, error } = await supabase
    .from('contracts')
    .select('user_id, title')
    .eq('id', contractId)
    .single();

  if (!contract || error) return res.status(404).json({ error: 'Not found' });
  if (contract.user_id !== userId) return res.status(403).json({ error: 'Access denied' });

  const { data: share, error: shareError } = await supabase
    .from('contract_shares')
    .insert([{ contract_id: contractId, shared_with_email: email, shared_by: userId, role }])
    .select()
    .single();

  if (shareError) return res.status(500).json({ error: 'Share failed' });

  res.json({ success: true, message: `Shared with ${email}`, share });
});

// Helper: check shared access
async function checkSharedAccess(contractId, userEmail) {
  const { data, error } = await supabase
    .from('contract_shares')
    .select('id')
    .eq('contract_id', contractId)
    .eq('shared_with_email', userEmail)
    .single();
  return !error && data;
}

module.exports = router;
