const Anthropic = require('@anthropic-ai/sdk');

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const CONTRACT_ANALYSIS_PROMPT = `
You are an expert real estate contract analyzer. Analyze this contract and extract key information into a structured JSON format.

CRITICAL REQUIREMENTS:
1. Extract EXACT dates, amounts, and names from the contract text
2. Determine pricing structure (per acre, per unit, per lot, lump sum, etc.)
3. Identify when deposits become non-refundable
4. Extract ALL contact information for parties, lawyers, title companies
5. Calculate deposit refundability timing precisely
6. If information is unclear or missing, use "TBD" or null
7. ALWAYS return VALID JSON with proper double quotes around ALL property names and string values
8. Do NOT include any text before or after the JSON object
9. Ensure all JSON property names are in double quotes, not single quotes
10. Do NOT include trailing commas in arrays or objects

REQUIRED JSON STRUCTURE (MUST be valid JSON):
{
  "property": {
    "address": "Full property address exactly as written",
    "apn": "Assessor Parcel Number if mentioned",
    "size": "Property size/acreage if mentioned",
    "purchasePrice": 0,
    "pricingStructure": "per acre|per unit|per lot|per square foot|lump sum|TBD",
    "pricePerUnit": 0,
    "unitType": "acres|lots|units|square feet|TBD",
    "propertyType": "residential|commercial|land|development"
  },
  "parties": {
    "buyer": {
      "name": "Exact legal name from signature block",
      "type": "Individual|LLC|Corporation|Partnership|Trust",
      "signatoryName": "Name of person signing if different from entity",
      "signatoryTitle": "Title of signatory",
      "noticeAddress": {
        "street": "Street address from notices section",
        "city": "City",
        "state": "State",
        "zipCode": "ZIP code",
        "fullAddress": "Complete formatted address"
      },
      "contactInfo": {
        "phone": "Primary phone from notices",
        "fax": "Fax number if provided",
        "email": "Email from notices section",
        "alternatePhone": "Secondary phone if provided",
        "alternateEmail": "Secondary email if provided"
      },
      "attorney": {
        "name": "Attorney name from notices",
        "firm": "Law firm name",
        "address": {
          "street": "Attorney street address",
          "city": "City",
          "state": "State",
          "zipCode": "ZIP code",
          "fullAddress": "Complete attorney address"
        },
        "phone": "Attorney phone",
        "fax": "Attorney fax",
        "email": "Attorney email"
      }
    },
    "seller": {
      "name": "Exact legal name from signature block",
      "type": "Individual|LLC|Corporation|Partnership|Trust",
      "signatoryName": "Name of person signing if different from entity",
      "signatoryTitle": "Title of signatory",
      "noticeAddress": {
        "street": "Street address from notices section",
        "city": "City",
        "state": "State",
        "zipCode": "ZIP code",
        "fullAddress": "Complete formatted address"
      },
      "contactInfo": {
        "phone": "Primary phone from notices",
        "fax": "Fax number if provided",
        "email": "Email from notices section",
        "alternatePhone": "Secondary phone if provided",
        "alternateEmail": "Secondary email if provided"
      },
      "attorney": {
        "name": "Attorney name from notices",
        "firm": "Law firm name",
        "address": {
          "street": "Attorney street address",
          "city": "City",
          "state": "State",
          "zipCode": "ZIP code",
          "fullAddress": "Complete attorney address"
        },
        "phone": "Attorney phone",
        "fax": "Attorney fax",
        "email": "Attorney email"
      }
    }
  },
  "titleCompany": {
    "name": "Title company name from notices or elsewhere",
    "officer": "Title officer name",
    "address": {
      "street": "Title company street address",
      "city": "City",
      "state": "State",
      "zipCode": "ZIP code",
      "fullAddress": "Complete title company address"
    },
    "phone": "Title company phone",
    "fax": "Title company fax",
    "email": "Title company email"
  },
  "escrowCompany": {
    "name": "Escrow company name (may be same as title company)",
    "officer": "Escrow officer name",
    "address": {
      "street": "Escrow company street address",
      "city": "City",
      "state": "State",
      "zipCode": "ZIP code",
      "fullAddress": "Complete escrow company address"
    },
    "phone": "Escrow company phone",
    "fax": "Escrow company fax",
    "email": "Escrow company email"
  },
  "escrow": {
    "openingDate": "YYYY-MM-DD format or TBD",
    "companyName": "Reference to escrowCompany above",
    "officerName": "Reference to escrowCompany officer above"
  },
  "deposits": {
    "firstDeposit": {
      "amount": 0,
      "timing": "Exact contract language about when due",
      "actualDate": "YYYY-MM-DD calculated from timing or TBD",
      "refundable": true,
      "refundableUntil": "YYYY-MM-DD when it becomes non-refundable",
      "status": "not_yet_due|due_soon|past_due|made"
    },
    "secondDeposit": {
      "amount": 0,
      "timing": "Exact contract language about when due",
      "actualDate": "YYYY-MM-DD calculated from timing or TBD",
      "refundable": false,
      "refundableUntil": "YYYY-MM-DD when it becomes non-refundable",
      "status": "not_yet_due|due_soon|past_due|made"
    },
    "totalDeposits": 0
  },
  "dueDiligence": {
    "period": "Exact contract language (e.g., '30 days from Opening of Escrow')",
    "startDate": "YYYY-MM-DD",
    "endDate": "YYYY-MM-DD",
    "tasks": [
      {
        "task": "Property Inspections",
        "timing": "Exact contract language with trigger reference",
        "triggerEvent": "Opening of Escrow|Title Commitment|Survey Completion|etc",
        "daysFromTrigger": 0,
        "businessDays": true,
        "actualDate": "YYYY-MM-DD calculated",
        "critical": true,
        "description": "What specifically must be done"
      }
    ]
  },
  "contingencies": [
    {
      "name": "Descriptive name",
      "timing": "Exact contract language",
      "triggerEvent": "Opening of Escrow|Title Commitment|etc",
      "daysFromTrigger": 0,
      "businessDays": true,
      "deadline": "YYYY-MM-DD calculated",
      "description": "What buyer/seller must do",
      "critical": true,
      "silenceRule": "Approval|Termination|N/A"
    }
  ],
  "closingInfo": {
    "outsideDate": "YYYY-MM-DD",
    "actualClosing": "Description of actual closing terms",
    "extensions": {
      "automatic": false,
      "buyerOptions": "Description",
      "sellerOptions": "Description"
    },
    "possession": "When buyer gets possession",
    "prorations": "How costs are split"
  },
  "specialConditions": [
    {
      "condition": "Description of special condition",
      "deadline": "YYYY-MM-DD if applicable",
      "party": "buyer|seller|both"
    }
  ],
  "financing": {
    "cashDeal": true,
    "loanAmount": 0,
    "loanType": "Conventional|FHA|VA|etc or null",
    "loanContingency": {
      "exists": false,
      "deadline": "YYYY-MM-DD or null",
      "terms": "Description"
    }
  }
}

IMPORTANT: Return ONLY the JSON object above, properly formatted with correct double quotes. Do not include any explanatory text before or after the JSON.

ANALYZE THIS CONTRACT:
`;

/**
 * Clean and fix malformed JSON string
 * @param {string} jsonString - Potentially malformed JSON string
 * @returns {string} - Fixed JSON string
 */
function cleanJsonString(jsonString) {
  try {
    // First, try to parse as-is
    JSON.parse(jsonString);
    return jsonString;
  } catch (error) {
    console.log('Initial JSON parse failed, attempting to fix...');
    
    let cleaned = jsonString;
    
    // Remove any text before the first {
    const firstBraceIndex = cleaned.indexOf('{');
    if (firstBraceIndex > 0) {
      cleaned = cleaned.substring(firstBraceIndex);
    }
    
    // Remove any text after the last }
    const lastBraceIndex = cleaned.lastIndexOf('}');
    if (lastBraceIndex >= 0 && lastBraceIndex < cleaned.length - 1) {
      cleaned = cleaned.substring(0, lastBraceIndex + 1);
    }
    
    // Fix common JSON issues
    cleaned = cleaned
      // Remove trailing commas before closing brackets/braces
      .replace(/,(\s*[}\]])/g, '$1')
      // Fix single quotes to double quotes (but be careful with content)
      .replace(/:\s*'([^']*?)'/g, ': "$1"')
      // Fix unquoted property names
      .replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":')
      // Fix escaped quotes that might be causing issues
      .replace(/\\"/g, '"')
      // Remove any remaining backslashes that aren't valid JSON escapes
      .replace(/\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, '')
      // Clean up any multiple consecutive commas
      .replace(/,{2,}/g, ',')
      // Clean up whitespace
      .replace(/\s+/g, ' ')
      .trim();
    
    return cleaned;
  }
}

/**
 * Extract JSON from potentially mixed content
 * @param {string} content - Content that may contain JSON
 * @returns {string|null} - Extracted JSON string or null
 */
function extractJsonFromContent(content) {
  // Look for JSON-like content between curly braces
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }
  
  // If no match found, try to find any object-like structure
  const openBrace = content.indexOf('{');
  const closeBrace = content.lastIndexOf('}');
  
  if (openBrace >= 0 && closeBrace > openBrace) {
    return content.substring(openBrace, closeBrace + 1);
  }
  
  return null;
}

/**
 * Create a fallback minimal contract structure
 * @param {string} contractText - Original contract text for basic extraction
 * @returns {Object} - Minimal contract data structure
 */
function createFallbackStructure(contractText) {
  console.log('Creating fallback structure due to JSON parsing failure');
  
  // Basic text extraction for critical info
  const lines = contractText.split('\n');
  let purchasePrice = 0;
  let address = '';
  
  // Simple regex patterns to extract basic info
  const priceMatch = contractText.match(/\$[\d,]+\.?\d*/);
  if (priceMatch) {
    purchasePrice = parseInt(priceMatch[0].replace(/[$,]/g, ''));
  }
  
  // Look for address patterns
  const addressMatch = contractText.match(/(?:property|address|located)[\s:]+([^\n]+)/i);
  if (addressMatch) {
    address = addressMatch[1].trim();
  }
  
  return {
    property: {
      address: address || 'Address not found',
      apn: null,
      size: null,
      purchasePrice: purchasePrice,
      pricingStructure: 'TBD',
      pricePerUnit: 0,
      unitType: 'TBD',
      propertyType: 'TBD'
    },
    parties: {
      buyer: {
        name: 'TBD',
        type: 'TBD',
        noticeAddress: {},
        contactInfo: {},
        attorney: {}
      },
      seller: {
        name: 'TBD',
        type: 'TBD',
        noticeAddress: {},
        contactInfo: {},
        attorney: {}
      }
    },
    titleCompany: {},
    escrowCompany: {},
    escrow: {
      openingDate: 'TBD'
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
      totalDeposits: 0
    },
    dueDiligence: {
      period: 'TBD',
      tasks: []
    },
    contingencies: [],
    closingInfo: {},
    specialConditions: [],
    financing: {
      cashDeal: true,
      loanAmount: 0,
      loanContingency: {
        exists: false
      }
    }
  };
}

/**
 * Analyze contract text using Claude AI with robust error handling
 * @param {string} contractText - Raw contract text
 * @returns {Promise<Object>} - Structured contract analysis
 */
async function analyzeContract(contractText) {
  try {
    console.log('🤖 Starting robust Claude analysis with improved JSON handling...');
    
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }

    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 8000,
      temperature: 0.1, // Lower temperature for more consistent JSON output
      messages: [
        {
          role: 'user',
          content: CONTRACT_ANALYSIS_PROMPT + contractText
        }
      ]
    });

    const responseText = message.content[0].text;
    console.log('📝 Raw Claude response length:', responseText.length);
    
    // Extract JSON from response
    let jsonString = extractJsonFromContent(responseText);
    if (!jsonString) {
      console.warn('⚠️ No JSON found in Claude response, using fallback structure');
      return createFallbackStructure(contractText);
    }

    // Clean and fix the JSON string
    jsonString = cleanJsonString(jsonString);
    
    let analysisResult;
    try {
      analysisResult = JSON.parse(jsonString);
      console.log('✅ Successfully parsed JSON from Claude response');
    } catch (parseError) {
      console.error('❌ JSON parse failed after cleaning:', parseError.message);
      console.log('Problematic JSON string:', jsonString.substring(0, 500) + '...');
      
      // Try one more aggressive cleaning attempt
      try {
        // More aggressive cleaning for stubborn cases
        const aggressivelyCleaned = jsonString
          .replace(/[\x00-\x1F\x7F-\x9F]/g, '') // Remove control characters
          .replace(/\\n/g, ' ') // Replace literal \n with space
          .replace(/\\r/g, ' ') // Replace literal \r with space
          .replace(/\\t/g, ' ') // Replace literal \t with space
          .replace(/\s+/g, ' ') // Normalize whitespace
          .trim();
        
        analysisResult = JSON.parse(aggressivelyCleaned);
        console.log('✅ Successfully parsed JSON after aggressive cleaning');
      } catch (secondParseError) {
        console.error('❌ Second JSON parse attempt failed:', secondParseError.message);
        console.log('Using fallback structure due to persistent JSON errors');
        return createFallbackStructure(contractText);
      }
    }
    
    // Validate and enhance the result
    const enhancedResult = enhanceContactInformation(analysisResult);
    
    // Validate critical fields
    const validation = validateAnalysis(enhancedResult);
    if (!validation.isValid) {
      console.warn('⚠️ Analysis validation issues:', validation.errors);
      // Don't fail completely on validation issues, just log them
    }
    
    console.log('✅ Contract analysis completed successfully');
    return enhancedResult;

  } catch (error) {
    console.error('❌ Contract analysis error:', error);
    
    // Return fallback structure instead of throwing
    console.log('Returning fallback structure due to analysis error');
    return createFallbackStructure(contractText);
  }
}

/**
 * Enhance and validate contact information
 * @param {Object} analysis - Raw analysis result
 * @returns {Object} - Enhanced analysis with better contact structure
 */
function enhanceContactInformation(analysis) {
  const enhanced = { ...analysis };
  
  // Ensure contact structure exists for buyer
  if (enhanced.parties?.buyer) {
    enhanced.parties.buyer = {
      ...enhanced.parties.buyer,
      noticeAddress: enhanced.parties.buyer.noticeAddress || {},
      contactInfo: enhanced.parties.buyer.contactInfo || {},
      attorney: enhanced.parties.buyer.attorney || {}
    };
  }
  
  // Ensure contact structure exists for seller
  if (enhanced.parties?.seller) {
    enhanced.parties.seller = {
      ...enhanced.parties.seller,
      noticeAddress: enhanced.parties.seller.noticeAddress || {},
      contactInfo: enhanced.parties.seller.contactInfo || {},
      attorney: enhanced.parties.seller.attorney || {}
    };
  }
  
  // Ensure escrow and title company structures exist
  enhanced.titleCompany = enhanced.titleCompany || {};
  enhanced.escrowCompany = enhanced.escrowCompany || {};
  
  // If escrow and title are the same company, reference appropriately
  if (enhanced.titleCompany.name && enhanced.escrowCompany.name && 
      enhanced.titleCompany.name === enhanced.escrowCompany.name) {
    enhanced.escrowCompany = { ...enhanced.titleCompany };
  }
  
  return enhanced;
}

/**
 * Validate analysis results to catch common errors
 * @param {Object} analysis - Analysis result object
 * @returns {Object} - Validation result with errors
 */
function validateAnalysis(analysis) {
  const errors = [];
  
  // Check required fields
  if (!analysis.property?.purchasePrice) {
    errors.push('Purchase price not found');
  }
  
  if (!analysis.parties?.buyer?.name) {
    errors.push('Buyer name not found');
  }
  
  if (!analysis.parties?.seller?.name) {
    errors.push('Seller name not found');
  }
  
  if (!analysis.escrow?.openingDate) {
    errors.push('Opening of escrow date not found');
  }
  
  // Validate contact information completeness
  const buyer = analysis.parties?.buyer;
  if (buyer && !buyer.noticeAddress?.fullAddress && !buyer.contactInfo?.email) {
    errors.push('Buyer contact information incomplete - missing address and email');
  }
  
  const seller = analysis.parties?.seller;
  if (seller && !seller.noticeAddress?.fullAddress && !seller.contactInfo?.email) {
    errors.push('Seller contact information incomplete - missing address and email');
  }
  
  // Validate date formats
  const dateFields = [
    analysis.escrow?.openingDate,
    analysis.dueDiligence?.endDate,
    analysis.closingInfo?.outsideDate
  ];
  
  dateFields.forEach((date, index) => {
    if (date && date !== 'TBD' && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      errors.push(`Invalid date format in field ${index}`);
    }
  });
  
  return {
    isValid: errors.length === 0,
    errors: errors
  };
}

module.exports = {
  analyzeContract,
  validateAnalysis,
  enhanceContactInformation,
  cleanJsonString,
  extractJsonFromContent,
  createFallbackStructure
};