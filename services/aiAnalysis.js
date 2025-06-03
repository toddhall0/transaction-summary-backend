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
3. Identify when deposits become non-refundable (deposits are typically refundable until end of feasibility/due diligence period)
4. Extract ALL contact information from notice provisions and signature blocks
5. Due diligence and feasibility periods are THE SAME THING - do not create separate periods
6. Identify ALL individual contingencies and approvals separately
7. If information is unclear or missing, use "TBD" or null

NOTICE PROVISIONS EXTRACTION:
- Look for "Notice" sections that list all parties and their contact information
- Extract addresses, phone numbers, emails for buyer, seller, attorneys, title company
- Include law firm names, title company names, escrow company details
- This is typically near the end of the contract in signature blocks or notice sections

DEPOSIT REFUNDABILITY RULES:
- First deposit: Usually refundable until end of feasibility/due diligence period
- Second deposit: Usually refundable until deposited, then becomes non-refundable 
- Additional deposits: Typically non-refundable once deposited
- Look for specific language about when deposits become "hard" or "non-refundable"

DUE DILIGENCE = FEASIBILITY PERIOD:
- These are the same period, just different names
- Do not create separate "Due Diligence" and "Feasibility" periods
- Use whichever term appears in the contract
- Typical length: 30-180 days from opening of escrow

CONTINGENCIES - IDENTIFY EACH SEPARATELY:
Instead of "Government Approvals", list each specific approval:
- City Planning Commission Approval
- County Zoning Approval  
- Building Permit Approval
- Environmental Impact Review
- Fire Department Approval
- Utility Connection Approvals
- Each should be a separate contingency with its own deadline

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
      "refundableUntil": "YYYY-MM-DD when feasibility/due diligence period ends",
      "status": "not_yet_due|due_soon|past_due|made",
      "refundabilityReason": "Refundable until end of feasibility period"
    },
    "secondDeposit": {
      "amount": <numeric value>,
      "timing": "Exact contract language about when due", 
      "actualDate": "YYYY-MM-DD calculated from timing or TBD",
      "refundable": true,
      "refundableUntil": "YYYY-MM-DD when deposit is actually made",
      "status": "not_yet_due|due_soon|past_due|made",
      "refundabilityReason": "Refundable until deposited, then becomes non-refundable"
    },
    "totalDeposits": <sum of all deposits>
  },
  "dueDiligence": {
    "period": "Exact contract language (e.g., '60 days from Opening of Escrow' OR '180 day feasibility period')",
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
      "name": "City Planning Commission Approval",
      "timing": "Exact contract language",
      "deadline": "YYYY-MM-DD calculated or TBD",
      "daysFromTrigger": <number>,
      "triggerEvent": "Opening of Escrow|Application Submission|etc",
      "description": "Specific approval required from City Planning Commission",
      "critical": true,
      "silenceRule": "Approval|Termination|N/A",
      "party": "buyer|seller|both"
    },
    {
      "name": "County Zoning Approval",
      "timing": "Exact contract language",
      "deadline": "YYYY-MM-DD calculated or TBD",
      "daysFromTrigger": <number>,
      "triggerEvent": "Opening of Escrow|Application Submission|etc",
      "description": "Specific approval required from County Zoning Department",
      "critical": true,
      "silenceRule": "Approval|Termination|N/A", 
      "party": "buyer|seller|both"
    },
    {
      "name": "Building Permit Approval",
      "timing": "Exact contract language",
      "deadline": "YYYY-MM-DD calculated or TBD",
      "daysFromTrigger": <number>,
      "triggerEvent": "Opening of Escrow|Application Submission|etc",
      "description": "Building permits for proposed development",
      "critical": true,
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