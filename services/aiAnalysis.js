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
      "name": "Exact legal name",
      "type": "Individual|LLC|Corporation|Partnership|Trust",
      "contact": "Primary contact person if different from entity",
      "phone": "Phone number if provided",
      "email": "Email if provided",
      "address": "Address if provided",
      "attorney": {
        "name": "Attorney name if mentioned",
        "firm": "Law firm name",
        "phone": "Attorney phone",
        "email": "Attorney email",
        "address": "Attorney address"
      }
    },
    "seller": {
      "name": "Exact legal name", 
      "type": "Individual|LLC|Corporation|Partnership|Trust",
      "contact": "Primary contact person if different from entity",
      "phone": "Phone number if provided",
      "email": "Email if provided",
      "address": "Address if provided",
      "attorney": {
        "name": "Attorney name if mentioned",
        "firm": "Law firm name",
        "phone": "Attorney phone",
        "email": "Attorney email",
        "address": "Attorney address"
      }
    }
  },
  "titleCompany": {
    "name": "Title company name",
    "officer": "Title officer name",
    "phone": "Title company phone",
    "email": "Title company email",
    "address": "Title company address"
  },
  "escrow": {
    "openingDate": "YYYY-MM-DD format or TBD",
    "escrowCompany": "Name if mentioned",
    "escrowOfficer": "Name if mentioned",
    "phone": "Escrow company phone",
    "email": "Escrow company email"
  },
  "deposits": {
    "firstDeposit": {
      "amount": <numeric value>,
      "timing": "Exact contract language about when due",
      "actualDate": "YYYY-MM-DD calculated from timing or TBD",
      "refundable": true,
      "refundableUntil": "YYYY-MM-DD when it becomes non-refundable or TBD",
      "status": "not_yet_due|due_soon|past_due|made",
      "refundabilityReason": "Due diligence expiration|Feasibility period end|etc"
    },
    "secondDeposit": {
      "amount": <numeric value>,
      "timing": "Exact contract language about when due", 
      "actualDate": "YYYY-MM-DD calculated from timing or TBD",
      "refundable": false,
      "refundableUntil": null,
      "status": "not_yet_due|due_soon|past_due|made",
      "refundabilityReason": "Non-refundable from submission"
    },
    "totalDeposits": <sum of all deposits>
  },
  "dueDiligence": {
    "period": "Exact contract language (e.g., '30 days from Opening of Escrow')",
    "startDate": "YYYY-MM-DD or TBD",
    "endDate": "YYYY-MM-DD or TBD", 
    "daysFromTrigger": <number of days>,
    "triggerEvent": "Opening of Escrow|Title Commitment|etc",
    "tasks": [
      {
        "task": "Property Inspections",
        "timing": "Exact contract language with trigger reference",
        "actualDate": "YYYY-MM-DD calculated or TBD",
        "daysFromTrigger": <number>,
        "triggerEvent": "Opening of Escrow|Title Commitment|etc",
        "critical": boolean,
        "description": "What specifically must be done"
      }
    ]
  },
  "contingencies": [
    {
      "name": "Descriptive name",
      "timing": "Exact contract language",
      "deadline": "YYYY-MM-DD calculated or TBD",
      "daysFromTrigger": <number>,
      "triggerEvent": "Opening of Escrow|etc",
      "description": "What buyer/seller must do",
      "critical": boolean,
      "silenceRule": "Approval|Termination|N/A",
      "party": "buyer|seller|both"
    }
  ],
  "closingInfo": {
    "outsideDate": "YYYY-MM-DD or TBD",
    "actualClosing": "Description of actual closing terms",
    "daysFromTrigger": <number if calculated>,
    "triggerEvent": "Due diligence end|Government approvals|etc",
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
      "deadline": "YYYY-MM-DD if applicable or TBD",
      "daysFromTrigger": <number if applicable>,
      "triggerEvent": "Event that starts the clock",
      "party": "buyer|seller|both"
    }
  ],
  "financing": {
    "cashDeal": boolean,
    "loanAmount": <numeric or null>,
    "loanType": "Conventional|FHA|VA|etc or null",
    "loanContingency": {
      "exists": boolean,
      "deadline": "YYYY-MM-DD or TBD",
      "daysFromTrigger": <number>,
      "triggerEvent": "Loan application|Opening of Escrow|etc",
      "terms": "Description"
    }
  }
}

PRICING STRUCTURE ANALYSIS:
- Look for language like "per acre", "per lot", "per unit", "$X per square foot"
- Calculate price per unit if total price and unit count are given
- Examples: "$50,000 per acre", "$500,000 for 60 lots = $8,333 per lot"

DEPOSIT REFUNDABILITY RULES:
- Identify EXACTLY when each deposit becomes non-refundable
- Common triggers: Due diligence expiration, feasibility period end, loan approval
- Mark as refundable until specific event occurs
- Status calculation based on current date vs due date

DATE CALCULATION RULES:
- Always show both days from trigger AND calculated date
- Business days = weekdays only (exclude weekends)
- Calendar days = all days including weekends
- If trigger date is TBD, actual date should be TBD

TRIGGER EVENT IDENTIFICATION:
- Opening of Escrow (most common)
- Title Commitment received
- Survey completion
- Environmental report completion
- Loan application submission
- Due diligence period end
- Government approvals received

CONTACT INFORMATION EXTRACTION:
- Extract ALL phone numbers, emails, addresses
- Identify roles (buyer, seller, attorney, title officer, escrow officer)
- Include law firm names and title company details
- Look for signature blocks, letterheads, contact sections

ENTITY TYPE IDENTIFICATION:
- LLC = "Limited Liability Company" or "LLC"
- Corporation = "Inc.", "Corp.", "Corporation"
- Trust = "Trust", "Trustee"
- Partnership = "Partnership", "LP", "LLP"
- Individual = No entity designator

CRITICAL vs STANDARD CLASSIFICATION:
- Critical: Could terminate contract if not met (feasibility, due diligence, loan approval)
- Standard: Important but typically don't terminate contract (title review, inspections)

ANALYZE THIS CONTRACT:
`;

/**
 * Analyze contract text using Claude AI with enhanced extraction
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
    
    // Enhanced validation and post-processing
    const enhancedResult = enhanceAnalysisResult(analysisResult);
    
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
 * Enhance and post-process analysis results
 * @param {Object} analysis - Raw analysis result
 * @returns {Object} - Enhanced analysis result
 */
function enhanceAnalysisResult(analysis) {
  const enhanced = { ...analysis };
  
  // Calculate deposit statuses based on dates
  if (enhanced.deposits) {
    const today = new Date();
    
    ['firstDeposit', 'secondDeposit'].forEach(depositKey => {
      const deposit = enhanced.deposits[depositKey];
      if (deposit && deposit.actualDate && deposit.actualDate !== 'TBD') {
        const dueDate = new Date(deposit.actualDate);
        const daysDiff = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
        
        if (daysDiff > 7) {
          deposit.status = 'not_yet_due';
        } else if (daysDiff > 0) {
          deposit.status = 'due_soon';
        } else if (daysDiff < 0) {
          deposit.status = 'past_due';
        }
      }
    });
  }
  
  // Calculate pricing per unit if possible
  if (enhanced.property) {
    const prop = enhanced.property;
    if (prop.purchasePrice && prop.size && !prop.pricePerUnit) {
      // Try to extract numeric value from size
      const sizeMatch = prop.size?.match(/(\d+(?:\.\d+)?)/);
      if (sizeMatch) {
        const numericSize = parseFloat(sizeMatch[1]);
        prop.pricePerUnit = Math.round(prop.purchasePrice / numericSize);
        
        // Determine unit type from size description
        if (prop.size.toLowerCase().includes('acre')) {
          prop.unitType = 'acres';
          prop.pricingStructure = 'per acre';
        } else if (prop.size.toLowerCase().includes('lot')) {
          prop.unitType = 'lots';
          prop.pricingStructure = 'per lot';
        } else if (prop.size.toLowerCase().includes('unit')) {
          prop.unitType = 'units';
          prop.pricingStructure = 'per unit';
        }
      }
    }
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
  
  // Validate deposit refundability logic
  if (analysis.deposits) {
    ['firstDeposit', 'secondDeposit'].forEach(key => {
      const deposit = analysis.deposits[key];
      if (deposit) {
        if (deposit.refundable && !deposit.refundableUntil) {
          errors.push(`${key} marked refundable but no refundableUntil date provided`);
        }
        if (!deposit.refundable && deposit.refundableUntil) {
          errors.push(`${key} marked non-refundable but has refundableUntil date`);
        }
      }
    });
  }
  
  return {
    isValid: errors.length === 0,
    errors: errors
  };
}

module.exports = {
  analyzeContract,
  validateAnalysis,
  enhanceAnalysisResult
};