const Anthropic = require('@anthropic-ai/sdk');

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const CONTRACT_ANALYSIS_PROMPT = `
You are an expert real estate contract analyzer. Analyze this contract and extract key information into a structured JSON format.

CRITICAL REQUIREMENTS FOR CONTACT INFORMATION:
1. Look specifically for "NOTICE" or "NOTICES" sections in the contract
2. These sections typically contain official mailing addresses, email addresses, phone numbers
3. Extract attorney information from notice addresses, not just signature blocks
4. Find escrow/title company details from notice addresses
5. Distinguish between mailing addresses and property addresses
6. Extract ALL contact methods for each party (phone, email, fax, address)

REQUIRED JSON STRUCTURE:
{
  "property": {
    "address": "Full property address exactly as written",
    "apn": "Assessor Parcel Number if mentioned",
    "size": "Property size/acreage if mentioned",
    "purchasePrice": <numeric value only>,
    "pricingStructure": "per acre|per unit|per lot|per square foot|lump sum|TBD",
    "pricePerUnit": <numeric value if applicable>,
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
      "amount": <numeric value>,
      "timing": "Exact contract language about when due",
      "actualDate": "YYYY-MM-DD calculated from timing or TBD",
      "refundable": boolean,
      "refundableUntil": "YYYY-MM-DD when it becomes non-refundable",
      "status": "not_yet_due|due_soon|past_due|made"
    },
    "secondDeposit": {
      "amount": <numeric value>,
      "timing": "Exact contract language about when due",
      "actualDate": "YYYY-MM-DD calculated from timing or TBD", 
      "refundable": boolean,
      "refundableUntil": "YYYY-MM-DD when it becomes non-refundable",
      "status": "not_yet_due|due_soon|past_due|made"
    },
    "totalDeposits": <sum of all deposits>
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
        "daysFromTrigger": <number>,
        "businessDays": boolean,
        "actualDate": "YYYY-MM-DD calculated",
        "critical": boolean,
        "description": "What specifically must be done"
      }
    ]
  },
  "contingencies": [
    {
      "name": "Descriptive name",
      "timing": "Exact contract language", 
      "triggerEvent": "Opening of Escrow|Title Commitment|etc",
      "daysFromTrigger": <number>,
      "businessDays": boolean,
      "deadline": "YYYY-MM-DD calculated",
      "description": "What buyer/seller must do",
      "critical": boolean,
      "silenceRule": "Approval|Termination|N/A"
    }
  ],
  "closingInfo": {
    "outsideDate": "YYYY-MM-DD",
    "actualClosing": "Description of actual closing terms", 
    "extensions": {
      "automatic": boolean,
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
    "cashDeal": boolean,
    "loanAmount": <numeric or null>,
    "loanType": "Conventional|FHA|VA|etc or null",
    "loanContingency": {
      "exists": boolean,
      "deadline": "YYYY-MM-DD or null",
      "terms": "Description"
    }
  }
}

EXTRACTION PRIORITY FOR CONTACTS:
1. NOTICES section is primary source for all contact information
2. Look for phrases like "Notice to Buyer:", "Notice to Seller:", "Notice to Escrow:"
3. Attorney information often appears as "with a copy to:" in notices
4. Escrow/Title company info may be in separate notices section
5. Phone numbers may include office, cell, and fax
6. Email addresses are critical - extract all mentioned

COMMON NOTICE SECTION PATTERNS:
- "All notices required or permitted hereunder shall be in writing and shall be served..."
- "Buyer: [Name and Address]"
- "Seller: [Name and Address]" 
- "With a copy to: [Attorney information]"
- "Title/Escrow Company: [Company details]"

DATE CALCULATION RULES:
- Always calculate actual dates from trigger dates + business days/calendar days as specified
- If contract says "5 business days after X", count only weekdays
- If contract says "30 days from X", count calendar days
- If trigger date is unknown, use "TBD" for actual date

ENTITY TYPE IDENTIFICATION:
- Look for "LLC", "Inc.", "Corporation", "Partnership", "Trust", "LP"
- Individual if no entity designator
- Pay attention to exact legal names vs. signatory names

DEPOSIT REFUNDABILITY ANALYSIS:
- Determine exactly when deposits become non-refundable
- Usually tied to expiration of due diligence period
- May have different rules for different deposits
- Look for specific non-refundability language

ANALYZE THIS CONTRACT:
`;

/**
 * Analyze contract text using Claude AI with enhanced contact extraction
 * @param {string} contractText - Raw contract text
 * @returns {Promise<Object>} - Structured contract analysis
 */
async function analyzeContract(contractText) {
  try {
    console.log('🤖 Starting enhanced Claude analysis with notice address focus...');
    
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }

    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 8000,
      temperature: 0.1, // Lower temperature for more consistent extraction
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
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in Claude response');
    }

    const analysisResult = JSON.parse(jsonMatch[0]);
    
    // Validate and enhance contact information
    const enhancedResult = enhanceContactInformation(analysisResult);
    
    // Validate critical fields
    const validation = validateAnalysis(enhancedResult);
    if (!validation.isValid) {
      console.warn('⚠️ Analysis validation issues:', validation.errors);
    }
    
    console.log('✅ Enhanced contract analysis completed successfully');
    return enhancedResult;

  } catch (error) {
    console.error('❌ Contract analysis error:', error);
    throw new Error(`Contract analysis failed: ${error.message}`);
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
  enhanceContactInformation
};