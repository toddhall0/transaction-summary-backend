const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const CONTRACT_ANALYSIS_PROMPT = `
You are an expert real estate contract analyzer. Analyze this contract and extract key information in the following JSON structure. Be precise with dates, amounts, and timing language from the contract.

Return ONLY valid JSON in this exact structure:

{
  "property": {
    "address": "full property address",
    "apn": "assessor parcel number or null",
    "size": "lot size or square footage or null",
    "purchasePrice": number
  },
  "escrow": {
    "openingDate": "YYYY-MM-DD"
  },
  "parties": {
    "buyer": {
      "name": "buyer entity name",
      "type": "entity type (LLC, Corp, Individual, etc.)",
      "contact": "contact person or null",
      "phone": "phone number or null",
      "email": "email address or null"
    },
    "seller": {
      "name": "seller entity name",
      "type": "entity type",
      "contact": "contact person or null",
      "phone": "phone number or null", 
      "email": "email address or null"
    }
  },
  "deposits": {
    "firstDeposit": {
      "amount": number,
      "timing": "exact timing description from contract",
      "refundable": boolean,
      "refundableUntil": "date or condition description"
    },
    "secondDeposit": {
      "amount": number or null,
      "timing": "timing description or null",
      "refundable": boolean
    },
    "totalDeposits": number
  },
  "dueDiligence": {
    "period": "description from contract",
    "startDate": "YYYY-MM-DD",
    "endDate": "YYYY-MM-DD",
    "tasks": [
      {
        "task": "task name",
        "timing": "timing from contract with full trigger reference",
        "critical": boolean,
        "triggerKey": "Opening of Escrow|Title Commitment|Loan Application|Environmental Report|Survey Completion",
        "daysFromTrigger": number
      }
    ]
  },
  "contingencies": [
    {
      "name": "contingency name",
      "timing": "timing description from contract",
      "description": "what must happen",
      "critical": boolean,
      "silenceRule": "Approval|Termination|N/A",
      "triggerKey": "Opening of Escrow|Title Commitment|Loan Application|Environmental Report|Survey Completion|null",
      "daysFromTrigger": number or null
    }
  ],
  "closingInfo": {
    "outsideDate": "YYYY-MM-DD",
    "actualClosing": "description from contract",
    "extensions": {
      "automatic": boolean,
      "buyerOptions": "description or None",
      "sellerOptions": "description or None"
    }
  },
  "closingDocuments": {
    "exhibits": [
      {
        "document": "document name",
        "exhibit": "exhibit letter",
        "included": true
      }
    ],
    "required": [
      {
        "document": "document name",
        "exhibit": "None",
        "included": false
      }
    ]
  }
}

Important instructions:
- Extract dates in YYYY-MM-DD format
- If information is missing, use null
- Be precise with timing language from the contract
- Identify trigger events accurately
- For triggerKey, use exactly one of the predefined options or null
- Ensure all amounts are numbers, not strings
- Make sure the JSON is valid and properly formatted

Contract text:
`;

async function analyzeContractWithClaude(contractText) {
  try {
    console.log('🤖 Starting Claude analysis...');
    
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4000,
      temperature: 0.1,
      messages: [{
        role: 'user',
        content: CONTRACT_ANALYSIS_PROMPT + contractText
      }]
    });

    const analysisText = response.content[0].text;
    console.log('📄 Claude response received, parsing JSON...');
    
    // Extract JSON from the response
    const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No valid JSON found in Claude response');
    }

    const analysisResult = JSON.parse(jsonMatch[0]);
    console.log('✅ Claude analysis completed successfully');
    
    return analysisResult;
  } catch (error) {
    console.error('❌ Claude analysis error:', error);
    throw new Error(`AI analysis failed: ${error.message}`);
  }
}

async function analyzeContract(contractText, aiProvider = 'claude') {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }
  
  // For now, we only support Claude. OpenAI can be added later.
  return await analyzeContractWithClaude(contractText);
}

module.exports = {
  analyzeContract
};