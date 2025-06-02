const pdf = require('pdf-parse');
const mammoth = require('mammoth');

/**
 * Extract text content from uploaded files
 * @param {Buffer} fileBuffer - The file buffer
 * @param {string} fileName - Original filename
 * @returns {Promise<string>} - Extracted text content
 */
async function extractTextFromFile(fileBuffer, fileName) {
  const fileExtension = fileName.toLowerCase().split('.').pop();

  console.log(`📄 Processing ${fileExtension.toUpperCase()} file: ${fileName}`);

  try {
    switch (fileExtension) {
      case 'pdf':
        console.log('🔍 Extracting text from PDF...');
        const pdfData = await pdf(fileBuffer);
        const pdfText = pdfData.text;
        
        if (!pdfText || pdfText.trim().length < 100) {
          throw new Error('PDF appears to be empty or contains very little text. It might be a scanned document.');
        }
        
        console.log(`✅ PDF processed: ${pdfText.length} characters extracted`);
        return pdfText;

      case 'doc':
      case 'docx':
        console.log('🔍 Extracting text from Word document...');
        const docResult = await mammoth.extractRawText({ buffer: fileBuffer });
        const docText = docResult.value;
        
        if (!docText || docText.trim().length < 100) {
          throw new Error('Word document appears to be empty or contains very little text.');
        }
        
        console.log(`✅ Word document processed: ${docText.length} characters extracted`);
        return docText;

      case 'txt':
        console.log('🔍 Processing text file...');
        const txtContent = fileBuffer.toString('utf-8');
        
        if (!txtContent || txtContent.trim().length < 100) {
          throw new Error('Text file appears to be empty or too short.');
        }
        
        console.log(`✅ Text file processed: ${txtContent.length} characters`);
        return txtContent;

      default:
        throw new Error(`Unsupported file type: ${fileExtension.toUpperCase()}. Supported types: PDF, DOC, DOCX, TXT`);
    }
  } catch (error) {
    console.error(`❌ File processing error for ${fileName}:`, error.message);
    
    // Provide helpful error messages
    if (error.message.includes('PDF parsing failed') || error.message.includes('Invalid PDF')) {
      throw new Error('The PDF file appears to be corrupted or password-protected. Please try a different file.');
    }
    
    if (error.message.includes('mammoth')) {
      throw new Error('Unable to process Word document. The file may be corrupted or in an unsupported format.');
    }
    
    throw new Error(`Failed to extract text from ${fileExtension.toUpperCase()} file: ${error.message}`);
  }
}

/**
 * Validate file before processing
 * @param {Object} file - Multer file object
 * @returns {Object} - Validation result
 */
function validateFile(file) {
  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ];
  
  const maxSize = 10 * 1024 * 1024; // 10MB
  
  if (!file) {
    return { valid: false, error: 'No file provided' };
  }
  
  if (!allowedTypes.includes(file.mimetype)) {
    return { 
      valid: false, 
      error: 'Invalid file type. Please upload PDF, DOC, DOCX, or TXT files only.' 
    };
  }
  
  if (file.size > maxSize) {
    return { 
      valid: false, 
      error: 'File too large. Maximum size is 10MB.' 
    };
  }
  
  return { valid: true };
}

module.exports = {
  extractTextFromFile,
  validateFile
};