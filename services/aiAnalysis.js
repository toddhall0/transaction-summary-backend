const Anthropic = require('@anthropic-ai/sdk');

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const CONTRACT_ANALYSIS_PROMPT = `
You are an expert real estate contract analyzer. Analyze this contract and extract key information into a structured JSON format.

CRITICAL REQUIREMENTS:
1. Extract EXACT dates, amounts, and names from the contract text
2. If information is unclear or missing, use "TBD" or null
3. Calculate all date dependencies accurately
4. Identify ALL contingencies and deadlines
5. Capture complete party information including entity types

REQUIRED JSON STRUCTURE:
{
  "property": {
    "address": "Full property address exactly as written",
    "apn": "Assessor Parcel Number if mentioned",
    "size": "Property size/acreage if mentioned",
    "purchasePrice": <numeric value only>,
    "propertyType": "residential|commercial|land|development"
  },
  "parties": {
    "buyer": {
      "name": "Exact legal name",
      "type": "Individual|LLC|Corporation|Partnership|Trust",
      "contact": "Primary contact person if different from entity",
      "phone": "Phone number if provided",
      "email": "Email if provided",
      "address": "Address if provided"
    },
    "seller": {
      "name": "Exact legal name", 
      "type": "Individual|LLC|Corporation|Partnership|Trust",
      "contact": "Primary contact person if different from entity",
      "phone": "Phone number if provided",
      "email": "Email if provided",
      "address": "Address if provided"
    }
  },
  "escrow": {
    "openingDate": "YYYY-MM-DD format",
    "escrowCompany": "Name if mentioned",
    "escrowOfficer": "Name if mentioned"
  },
  "deposits": {
    "firstDeposit": {
      "amount": <numeric value>,
      "timing": "Exact contract language about when due",
      "actualDate": "YYYY-MM-DD calculated from timing",
      "refundable": boolean,
      "refundableUntil": "YYYY-MM-DD or null"
    },
    "secondDeposit": {
      "amount": <numeric value>,
      "timing": "Exact contract language about when due", 
      "actualDate": "YYYY-MM-DD calculated from timing",
      "refundable": boolean,
      "refundableUntil": "YYYY-MM-DD or null"
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
        "actualDate": "YYYY-MM-DD calculated",
        "critical": boolean,
        "triggerKey": "Opening of Escrow|Title Commitment|Survey Completion|etc",
        "daysFromTrigger": <number>
      }
    ]
  },
  "contingencies": [
    {
      "name": "Descriptive name",
      "timing": "Exact contract language",
      "deadline": "YYYY-MM-DD calculated",
      "description": "What buyer/seller must do",
      "critical": boolean,
      "silenceRule": "Approval|Termination|N/A",
      "triggerKey": "Opening of Escrow|etc",
      "daysFromTrigger": <number>
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
  "closingDocuments": {
    "exhibits": [
      {
        "document": "Document name",
        "exhibit": "Letter/Number",
        "included": boolean
      }
    ],
    "required": [
      {
        "document": "Document name", 
        "exhibit": "None or letter/number",
        "included": boolean
      }
    ]
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

DATE CALCULATION RULES:
- Always calculate actual dates from trigger dates + business days/calendar days as specified
- If contract says "5 business days after X", count only weekdays
- If contract says "30 days from X", count calendar days
- If trigger date is unknown, use "TBD" for actual date

COMMON TRIGGER EVENTS:
- Opening of Escrow
- Title Commitment received
- Survey completion
- Environmental report completion
- Loan application submission
- Feasibility period start
- Due diligence period start

ENTITY TYPE IDENTIFICATION:
- Look for "LLC", "Inc.", "Corporation", "Partnership", "Trust", "LP"
- Individual if no entity designator
- Pay attention to exact legal names

CRITICAL vs STANDARD TASKS:
- Critical: Could terminate contract if not met
- Standard: Important but typically don't terminate contract

ANALYZE THIS CONTRACT:
`;

/**
 * Analyze contract text using Claude AI
 * @param {string} contractText - Raw contract text
 * @returns {Promise<Object>} - Structured contract analysis
 */
async function analyzeContract(contractText) {
  try {
    console.log('🤖 Starting enhanced Claude analysis...');
    
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set');
    }

    const message = await anthropic.messages.create({
      model: 'claude-3-sonnet-20240229',
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
    
    // Validate critical fields
    const validation = validateAnalysis(analysisResult);
    if (!validation.isValid) {
      console.warn('⚠️ Analysis validation issues:', validation.errors);
    }
    
    console.log('✅ Contract analysis completed successfully');
    return analysisResult;

  } catch (error) {
    console.error('❌ Contract analysis error:', error);
    throw new Error(`Contract analysis failed: ${error.message}`);
  }
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
  
  // Validate date formats
  const dateFields = [
    analysis.escrow?.openingDate,
    analysis.dueDiligence?.endDate,
    analysis.closingInfo?.outsideDate
  ];
  
  dateFields.forEach((date, index) => {
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
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
  validateAnalysis
};