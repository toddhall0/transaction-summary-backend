const Anthropic = require('@anthropic-ai/sdk');

// Initialize Anthropic client with error handling
let anthropic;
try {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY environment variable is not set');
  }
  anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  });
} catch (error) {
  console.error('Failed to initialize Anthropic client:', error);
}

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

You must return ONLY valid JSON. No explanatory text.

REQUIRED JSON STRUCTURE:
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

ANALYZE THIS CONTRACT:
`;

/**
 * Clean and fix malformed JSON string with multiple strategies
 */
function cleanJsonString(jsonString) {
  try {
    JSON.parse(jsonString);
    return jsonString;
  } catch (error) {
    console.log('JSON parse failed, attempting to fix...');
    
    let cleaned = jsonString.trim();
    
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
    
    // Apply fixes in order of importance
    cleaned = cleaned
      // Remove trailing commas before closing brackets/braces
      .replace(/,(\s*[}\]])/g, '$1')
      // Fix unquoted property names (but be careful with content)
      .replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":')
      // Fix single quotes to double quotes for property names and simple values
      .replace(/:\s*'([^']*?)'/g, ': "$1"')
      // Remove any control characters that might break JSON
      .replace(/[\x00-\x1F\x7F-\x9F]/g, '')
      // Clean up any multiple consecutive commas
      .replace(/,{2,}/g, ',')
      // Normalize whitespace
      .replace(/\s+/g, ' ')
      .trim();
    
    return cleaned;
  }
}

/**
 * Extract JSON from potentially mixed content
 */
function extractJsonFromContent(content) {
  // First try to find complete JSON object
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }
  
  // Fallback: find any object-like structure
  const openBrace = content.indexOf('{');
  const closeBrace = content.lastIndexOf('}');
  
  if (openBrace >= 0 && closeBrace > openBrace) {
    return content.substring(openBrace, closeBrace + 1);
  }
  
  return null;
}

/**
 * Create a minimal fallback structure when AI analysis fails
 */
function createFallbackStructure(contractText) {
  console.log('Creating fallback structure due to AI analysis failure');
  
  // Basic text extraction for critical info
  let purchasePrice = 0;
  let address = 'Address not found';
  
  try {
    // Simple regex patterns to extract basic info
    const priceMatch = contractText.match(/\$[\d,]+(?:\.\d{2})?/);
    if (priceMatch) {
      const priceStr = priceMatch[0].replace(/[$,]/g, '');
      purchasePrice = parseFloat(priceStr) || 0;
    }
    
    // Look for address patterns
    const addressPatterns = [
      /(?:property|address|located|premises)[\s:]+([^\n\r]{10,100})/i,
      /(?:situated|located)\s+(?:at|in)\s+([^\n\r]{10,100})/i,
      /\d+\s+[A-Za-z\s]+(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd)[^\n\r]{0,50}/i
    ];
    
    for (const pattern of addressPatterns) {
      const match = contractText.match(pattern);
      if (match) {
        address = match[1] ? match[1].trim() : match[0].trim();
        break;
      }
    }
  } catch (error) {
    console.warn('Error in basic text extraction:', error);
  }
  
  return {
    property: {
      address: address,
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
 * Analyze contract text using Claude AI with comprehensive error handling
 */
async function analyzeContract(contractText) {
  const startTime = Date.now();
  
  try {
    console.log('🤖 Starting Claude AI analysis...');
    
    if (!anthropic) {
      throw new Error('Anthropic client not initialized - check API key');
    }

    if (!contractText || contractText.trim().length === 0) {
      throw new Error('No contract text provided for analysis');
    }

    if (contractText.length > 100000) {
      console.warn('Contract text is very long, truncating to 100k characters');
      contractText = contractText.substring(0, 100000);
    }

    console.log(`Analyzing contract text (${contractText.length} characters)...`);

    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 8000,
      temperature: 0.1,
      timeout: 120000, // 2 minute timeout
      messages: [
        {
          role: 'user',
          content: CONTRACT_ANALYSIS_PROMPT + '\n\n' + contractText
        }
      ]
    });

    const responseText = message.content[0]?.text;
    if (!responseText) {
      throw new Error('Empty response from Claude AI');
    }

    console.log(`Claude response received (${responseText.length} chars) in ${Date.now() - startTime}ms`);
    
    // Extract and clean JSON
    let jsonString = extractJsonFromContent(responseText);
    if (!jsonString) {
      console.warn('No JSON found in Claude response');
      return createFallbackStructure(contractText);
    }

    jsonString = cleanJsonString(jsonString);
    
    let analysisResult;
    try {
      analysisResult = JSON.parse(jsonString);
      console.log('✅ Successfully parsed JSON from Claude response');
    } catch (parseError) {
      console.error('❌ JSON parse failed:', parseError.message);
      console.log('Problematic JSON (first 500 chars):', jsonString.substring(0, 500));
      
      // Try aggressive cleaning
      try {
        const aggressivelyCleaned = jsonString
          .replace(/[\x00-\x1F\x7F-\x9F]/g, '') // Remove control characters
          .replace(/\\n/g, ' ')
          .replace(/\\r/g, ' ')
          .replace(/\\t/g, ' ')
          .replace(/\\/g, '') // Remove remaining backslashes
          .replace(/\s+/g, ' ')
          .trim();
        
        analysisResult = JSON.parse(aggressivelyCleaned);
        console.log('✅ Successfully parsed JSON after aggressive cleaning');
      } catch (secondError) {
        console.error('❌ Aggressive cleaning also failed:', secondError.message);
        return createFallbackStructure(contractText);
      }
    }
    
    // Enhance and validate the result
    const enhancedResult = enhanceContactInformation(analysisResult);
    const validation = validateAnalysis(enhancedResult);
    
    if (!validation.isValid) {
      console.warn('⚠️ Analysis validation warnings:', validation.errors);
    }
    
    console.log(`✅ Contract analysis completed in ${Date.now() - startTime}ms`);
    return enhancedResult;

  } catch (error) {
    console.error('❌ Contract analysis error:', error.message);
    
    // Check for specific error types
    if (error.message.includes('timeout')) {
      console.error('Analysis timed out - contract may be too complex');
    } else if (error.message.includes('rate_limit')) {
      console.error('Rate limit exceeded - too many requests');
    } else if (error.message.includes('API key')) {
      console.error('API authentication failed');
    }
    
    // Always return fallback structure instead of throwing
    return createFallbackStructure(contractText);
  }
}

/**
 * Enhance and validate contact information
 */
function enhanceContactInformation(analysis) {
  if (!analysis || typeof analysis !== 'object') {
    return analysis;
  }

  const enhanced = { ...analysis };
  
  // Ensure proper structure for parties
  if (enhanced.parties) {
    ['buyer', 'seller'].forEach(party => {
      if (enhanced.parties[party]) {
        enhanced.parties[party] = {
          ...enhanced.parties[party],
          noticeAddress: enhanced.parties[party].noticeAddress || {},
          contactInfo: enhanced.parties[party].contactInfo || {},
          attorney: enhanced.parties[party].attorney || {}
        };
      }
    });
  }
  
  // Ensure company structures exist
  enhanced.titleCompany = enhanced.titleCompany || {};
  enhanced.escrowCompany = enhanced.escrowCompany || {};
  
  // If title and escrow are the same company, reference appropriately
  if (enhanced.titleCompany.name && enhanced.escrowCompany.name && 
      enhanced.titleCompany.name === enhanced.escrowCompany.name) {
    enhanced.escrowCompany = { ...enhanced.titleCompany };
  }
  
  return enhanced;
}

/**
 * Validate analysis results
 */
function validateAnalysis(analysis) {
  const errors = [];
  
  if (!analysis || typeof analysis !== 'object') {
    errors.push('Analysis result is not a valid object');
    return { isValid: false, errors };
  }
  
  // Check critical fields
  if (!analysis.property?.purchasePrice || analysis.property.purchasePrice === 0) {
    errors.push('Purchase price not found or is zero');
  }
  
  if (!analysis.parties?.buyer?.name || analysis.parties.buyer.name === 'TBD') {
    errors.push('Buyer name not found');
  }
  
  if (!analysis.parties?.seller?.name || analysis.parties.seller.name === 'TBD') {
    errors.push('Seller name not found');
  }
  
  if (!analysis.escrow?.openingDate || analysis.escrow.openingDate === 'TBD') {
    errors.push('Opening of escrow date not found');
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