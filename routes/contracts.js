const Anthropic = require('@anthropic-ai/sdk');

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Simplified, more focused prompt that's proven to work better with Claude
const CONTRACT_ANALYSIS_PROMPT = `You are a real estate contract analysis expert. Analyze this contract and extract key information.

CRITICAL INSTRUCTIONS:
1. Return ONLY valid JSON - no explanations, no preamble, no text before or after
2. Use "TBD" for missing information
3. Use null for truly empty fields
4. All property names must be in double quotes
5. No trailing commas

Extract this exact JSON structure:

{
  "property": {
    "address": "exact address from contract",
    "purchasePrice": 0,
    "pricingStructure": "lump sum",
    "propertyType": "residential"
  },
  "parties": {
    "buyer": {
      "name": "buyer legal name",
      "type": "Individual"
    },
    "seller": {
      "name": "seller legal name", 
      "type": "Individual"
    }
  },
  "escrow": {
    "openingDate": "YYYY-MM-DD or TBD"
  },
  "deposits": {
    "firstDeposit": {
      "amount": 0,
      "timing": "contract language",
      "refundable": true
    },
    "totalDeposits": 0
  },
  "dueDiligence": {
    "period": "exact contract language",
    "tasks": []
  },
  "contingencies": [],
  "closingInfo": {
    "outsideDate": "YYYY-MM-DD or TBD"
  },
  "financing": {
    "cashDeal": true,
    "loanAmount": 0
  }
}

CONTRACT TEXT:
`;

/**
 * Enhanced JSON extraction and cleaning
 */
function extractAndCleanJSON(responseText) {
  console.log('🔍 Analyzing Claude response...');
  console.log('Response length:', responseText.length);
  console.log('First 200 chars:', responseText.substring(0, 200));
  
  // Remove common preambles that Claude adds
  let cleaned = responseText
    .replace(/^.*?(?=\{)/s, '') // Remove everything before first {
    .replace(/\}[^}]*$/s, '}') // Remove everything after last }
    .trim();
  
  // If no JSON structure found, try looking for partial matches
  if (!cleaned.startsWith('{')) {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      cleaned = jsonMatch[0];
    } else {
      console.error('❌ No JSON structure found in response');
      return null;
    }
  }
  
  // Fix common JSON issues
  cleaned = cleaned
    // Remove comments that might appear
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    // Fix trailing commas
    .replace(/,(\s*[}\]])/g, '$1')
    // Fix unquoted property names
    .replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":')
    // Fix single quotes to double quotes for strings
    .replace(/:\s*'([^']*)'/g, ': "$1"')
    // Remove control characters
    .replace(/[\x00-\x1F\x7F-\x9F]/g, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
  
  console.log('Cleaned JSON length:', cleaned.length);
  console.log('Cleaned JSON preview:', cleaned.substring(0, 300) + '...');
  
  return cleaned;
}

/**
 * Validate and parse JSON with multiple attempts
 */
function parseJSONWithFallbacks(jsonString) {
  const attempts = [
    // First attempt: parse as-is
    () => JSON.parse(jsonString),
    
    // Second attempt: more aggressive cleaning
    () => {
      const aggressive = jsonString
        .replace(/,(\s*[}\]])/g, '$1') // Remove trailing commas
        .replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":') // Quote property names
        .replace(/:\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*([,}])/g, ': "$1"$2') // Quote unquoted string values
        .replace(/\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, ''); // Remove invalid escapes
      return JSON.parse(aggressive);
    },
    
    // Third attempt: try to fix bracket issues
    () => {
      let fixed = jsonString;
      let openBraces = 0;
      let lastValidIndex = 0;
      
      for (let i = 0; i < fixed.length; i++) {
        if (fixed[i] === '{') openBraces++;
        if (fixed[i] === '}') {
          openBraces--;
          if (openBraces === 0) {
            lastValidIndex = i;
            break;
          }
        }
      }
      
      if (lastValidIndex > 0) {
        fixed = fixed.substring(0, lastValidIndex + 1);
      }
      
      return JSON.parse(fixed);
    }
  ];
  
  for (let i = 0; i < attempts.length; i++) {
    try {
      console.log(`🔄 JSON parsing attempt ${i + 1}...`);
      const result = attempts[i]();
      console.log('✅ JSON parsing successful on attempt', i + 1);
      return result;
    } catch (error) {
      console.log(`❌ Parsing attempt ${i + 1} failed:`, error.message);
      if (i === attempts.length - 1) {
        console.error('💥 All JSON parsing attempts failed');
        throw new Error(`All JSON parsing attempts failed. Last error: ${error.message}`);
      }
    }
  }
}

/**
 * Create a more robust fallback structure
 */
function createRobustFallback(contractText) {
  console.log('🛠️ Creating robust fallback structure...');
  
  // Enhanced text extraction patterns
  const patterns = {
    price: [
      /purchase\s+price[:\s]+\$?([\d,]+\.?\d*)/i,
      /total\s+price[:\s]+\$?([\d,]+\.?\d*)/i,
      /amount[:\s]+\$?([\d,]+\.?\d*)/i,
      /\$\s*([\d,]+\.?\d*)/,
    ],
    address: [
      /property[:\s]+([^\n]{10,100})/i,
      /address[:\s]+([^\n]{10,100})/i,
      /located\s+at[:\s]+([^\n]{10,100})/i,
      /premises[:\s]+([^\n]{10,100})/i,
    ],
    buyer: [
      /purchaser[:\s]+([^\n,]{5,50})/i,
      /buyer[:\s]+([^\n,]{5,50})/i,
      /vendee[:\s]+([^\n,]{5,50})/i,
    ],
    seller: [
      /vendor[:\s]+([^\n,]{5,50})/i,
      /seller[:\s]+([^\n,]{5,50})/i,
      /grantor[:\s]+([^\n,]{5,50})/i,
    ]
  };
  
  let extractedData = {
    purchasePrice: 0,
    address: 'Not found',
    buyer: 'Not found',
    seller: 'Not found'
  };
  
  // Try to extract each piece of information
  Object.keys(patterns).forEach(key => {
    for (const pattern of patterns[key]) {
      const match = contractText.match(pattern);
      if (match && match[1]) {
        if (key === 'price') {
          extractedData.purchasePrice = parseInt(match[1].replace(/[,$]/g, '')) || 0;
        } else {
          extractedData[key] = match[1].trim();
        }
        break;
      }
    }
  });
  
  return {
    property: {
      address: extractedData.address,
      apn: null,
      size: null,
      purchasePrice: extractedData.purchasePrice,
      pricingStructure: 'TBD',
      pricePerUnit: 0,
      unitType: 'TBD',
      propertyType: 'TBD'
    },
    parties: {
      buyer: {
        name: extractedData.buyer,
        type: 'TBD',
        signatoryName: null,
        signatoryTitle: null,
        noticeAddress: {},
        contactInfo: {},
        attorney: {}
      },
      seller: {
        name: extractedData.seller,
        type: 'TBD',
        signatoryName: null,
        signatoryTitle: null,
        noticeAddress: {},
        contactInfo: {},
        attorney: {}
      }
    },
    titleCompany: {},
    escrowCompany: {},
    escrow: {
      openingDate: 'TBD',
      companyName: null,
      officerName: null
    },
    deposits: {
      firstDeposit: {
        amount: 0,
        timing: 'TBD',
        actualDate: 'TBD',
        refundable: true,
        refundableUntil: 'TBD',
        status: 'not_yet_due'
      },
      secondDeposit: {
        amount: 0,
        timing: 'TBD',
        actualDate: 'TBD',
        refundable: false,
        refundableUntil: 'TBD',
        status: 'not_yet_due'
      },
      totalDeposits: 0
    },
    dueDiligence: {
      period: 'TBD',
      startDate: 'TBD',
      endDate: 'TBD',
      tasks: []
    },
    contingencies: [],
    closingInfo: {
      outsideDate: 'TBD',
      actualClosing: 'TBD',
      extensions: {
        automatic: false,
        buyerOptions: 'TBD',
        sellerOptions: 'TBD'
      },
      possession: 'TBD',
      prorations: 'TBD'
    },
    specialConditions: [],
    financing: {
      cashDeal: true,
      loanAmount: 0,
      loanType: null,
      loanContingency: {
        exists: false,
        deadline: null,
        terms: 'TBD'
      }
    }
  };
}

/**
 * Main contract analysis function with improved error handling
 */
async function analyzeContract(contractText) {
  try {
    console.log('🤖 Starting improved Claude analysis...');
    console.log('Contract text length:', contractText.length);
    
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }

    if (!contractText || contractText.trim().length < 100) {
      console.warn('⚠️ Contract text too short, using fallback');
      return createRobustFallback(contractText);
    }

    // Truncate very long contracts to avoid token limits
    let processedText = contractText;
    if (contractText.length > 50000) {
      console.log('📄 Contract text too long, truncating...');
      processedText = contractText.substring(0, 50000) + '\n\n[CONTRACT TRUNCATED]';
    }

    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022', // Using your current model
      max_tokens: 4000, // Reduced to ensure we have room for response
      temperature: 0, // Zero temperature for consistent output
      messages: [
        {
          role: 'user',
          content: CONTRACT_ANALYSIS_PROMPT + processedText
        }
      ]
    });

    const responseText = message.content[0].text;
    console.log('📝 Claude response received, length:', responseText.length);
    
    // Extract and clean JSON
    const cleanedJSON = extractAndCleanJSON(responseText);
    if (!cleanedJSON) {
      console.warn('⚠️ Could not extract JSON from Claude response, using fallback');
      return createRobustFallback(contractText);
    }

    // Parse JSON with fallbacks
    let analysisResult;
    try {
      analysisResult = parseJSONWithFallbacks(cleanedJSON);
    } catch (error) {
      console.error('❌ All JSON parsing failed:', error.message);
      console.log('Using fallback structure...');
      return createRobustFallback(contractText);
    }

    // Validate the structure
    if (!analysisResult || typeof analysisResult !== 'object') {
      console.warn('⚠️ Invalid analysis result structure, using fallback');
      return createRobustFallback(contractText);
    }

    // Ensure required structure exists
    const enhancedResult = {
      ...createRobustFallback(contractText), // Start with fallback
      ...analysisResult // Override with AI results
    };

    // Merge nested objects properly
    if (analysisResult.property) {
      enhancedResult.property = { ...enhancedResult.property, ...analysisResult.property };
    }
    if (analysisResult.parties) {
      enhancedResult.parties = { ...enhancedResult.parties, ...analysisResult.parties };
    }
    if (analysisResult.deposits) {
      enhancedResult.deposits = { ...enhancedResult.deposits, ...analysisResult.deposits };
    }

    console.log('✅ Contract analysis completed successfully');
    console.log('Extracted data summary:', {
      hasAddress: !!enhancedResult.property?.address && enhancedResult.property.address !== 'Not found',
      hasPrice: !!enhancedResult.property?.purchasePrice && enhancedResult.property.purchasePrice > 0,
      hasBuyer: !!enhancedResult.parties?.buyer?.name && enhancedResult.parties.buyer.name !== 'Not found',
      hasSeller: !!enhancedResult.parties?.seller?.name && enhancedResult.parties.seller.name !== 'Not found',
      hasEscrowDate: !!enhancedResult.escrow?.openingDate && enhancedResult.escrow.openingDate !== 'TBD'
    });

    return enhancedResult;

  } catch (error) {
    console.error('❌ Contract analysis error:', error);
    
    // If it's an API error, provide more specific feedback
    if (error.message.includes('rate limit') || error.message.includes('quota')) {
      console.log('Rate limit hit, will retry later');
      throw new Error('API rate limit exceeded. Please try again in a few minutes.');
    } else if (error.message.includes('invalid') || error.message.includes('unauthorized')) {
      console.log('API key issue detected');
      throw new Error('API authentication failed. Please check your Anthropic API key.');
    }
    
    // For any other error, return fallback with extracted data
    console.log('Returning fallback structure due to analysis error');
    return createRobustFallback(contractText || '');
  }
}

/**
 * Test function to validate the analysis works
 */
async function testAnalysis() {
  const sampleContract = `
    PURCHASE AGREEMENT
    
    Property Address: 123 Main Street, Anytown, CA 90210
    Purchase Price: $500,000
    
    Buyer: John Smith
    Seller: Jane Doe Properties LLC
    
    Opening of Escrow: 2024-01-15
    
    First Deposit: $25,000 due within 3 business days of opening escrow
    
    Due diligence period: 30 days from opening of escrow
  `;
  
  try {
    const result = await analyzeContract(sampleContract);
    console.log('🧪 Test analysis result:', JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    console.error('🚨 Test failed:', error);
    throw error;
  }
}

module.exports = {
  analyzeContract,
  testAnalysis,
  createRobustFallback,
  extractAndCleanJSON,
  parseJSONWithFallbacks
};