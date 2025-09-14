// Spoonacular API Response Auditing and Data Validation System
// Note: File operations only work in Node.js environment (API routes)
let fs: any = null;
let path: any = null;

if (typeof window === 'undefined') {
  // Only import fs in server environment
  try {
    fs = require('fs');
    path = require('path');
  } catch (e) {
    console.warn('File system operations not available in this environment');
  }
}

export interface SpoonacularAuditEntry {
  timestamp: string;
  endpoint: string;
  requestParams: any;
  rawResponse: any;
  processedData: any;
  displayData: any;
  validationFlags: ValidationFlag[];
}

export interface ValidationFlag {
  severity: 'error' | 'warning' | 'info';
  field: string;
  issue: string;
  value: any;
  expected?: any;
}

export interface DataSource {
  nutrition: 'spoonacular_verified' | 'ai_estimated' | 'calculated' | 'unknown';
  pricing: 'spoonacular_data' | 'ai_estimated' | 'unknown';
  menuItem: 'verified_menu_item' | 'estimated_item' | 'unknown';
  confidence: number; // 0-100%
}

export class SpoonacularAuditor {
  private auditDir: string;
  private sessionId: string;

  constructor() {
    this.sessionId = `session_${Date.now()}`;

    if (typeof window === 'undefined' && fs && path) {
      this.auditDir = path.join(process.cwd(), 'audit-logs');

      // Ensure audit directory exists
      if (!fs.existsSync(this.auditDir)) {
        fs.mkdirSync(this.auditDir, { recursive: true });
      }
    } else {
      this.auditDir = '';
    }
  }

  // Main audit function - call this for every Spoonacular API response
  auditApiResponse(
    endpoint: string,
    requestParams: any,
    rawResponse: any,
    processedData?: any,
    displayData?: any
  ): SpoonacularAuditEntry {
    const timestamp = new Date().toISOString();

    const auditEntry: SpoonacularAuditEntry = {
      timestamp,
      endpoint,
      requestParams,
      rawResponse,
      processedData: processedData || null,
      displayData: displayData || null,
      validationFlags: this.validateData(rawResponse, processedData, displayData)
    };

    // Save to timestamped file
    this.saveAuditEntry(auditEntry);

    // Save clean meal data for easy review
    this.saveMealItemData(auditEntry);

    // Log to console with clear data pipeline
    this.logDataPipeline(auditEntry);

    return auditEntry;
  }

  // Validate data for accuracy and flag suspicious values
  private validateData(rawResponse: any, processedData: any, displayData: any): ValidationFlag[] {
    const flags: ValidationFlag[] = [];

    if (rawResponse) {
      // Validate menu items if they exist
      const items = rawResponse.menuItems || [rawResponse];

      for (const item of Array.isArray(items) ? items : [items]) {
        if (item) {
          flags.push(...this.validateMenuItem(item, 'spoonacular_raw'));
        }
      }
    }

    if (processedData) {
      flags.push(...this.validateProcessedData(processedData));
    }

    if (displayData) {
      flags.push(...this.validateDisplayData(displayData));
    }

    return flags;
  }

  // Validate individual menu item data
  private validateMenuItem(item: any, source: string): ValidationFlag[] {
    const flags: ValidationFlag[] = [];

    // Price validation - flag anything over $50
    if (item.price && (typeof item.price === 'number' ? item.price : parseFloat(item.price)) > 50) {
      flags.push({
        severity: 'error',
        field: `${source}.price`,
        issue: 'Price exceeds $50 - likely data error',
        value: item.price
      });
    }

    // Nutrition validation - calories should roughly match macros
    if (item.nutrition || (item.calories && (item.protein || item.carbs || item.fat))) {
      const nutrition = item.nutrition || item;
      const calories = parseFloat(nutrition.calories || '0');
      const protein = parseFloat((nutrition.protein || '0').toString().replace(/[^\d.]/g, ''));
      const carbs = parseFloat((nutrition.carbs || '0').toString().replace(/[^\d.]/g, ''));
      const fat = parseFloat((nutrition.fat || '0').toString().replace(/[^\d.]/g, ''));

      // Calculate expected calories (4 cal/g for protein and carbs, 9 cal/g for fat)
      const expectedCalories = (protein * 4) + (carbs * 4) + (fat * 9);
      const caloriesDiff = Math.abs(calories - expectedCalories);

      if (calories > 0 && expectedCalories > 0 && caloriesDiff > (expectedCalories * 0.3)) {
        flags.push({
          severity: 'warning',
          field: `${source}.nutrition.calories`,
          issue: 'Calories don\'t match macronutrients calculation',
          value: calories,
          expected: Math.round(expectedCalories)
        });
      }

      // Flag unrealistic values
      if (calories > 3000) {
        flags.push({
          severity: 'warning',
          field: `${source}.nutrition.calories`,
          issue: 'Extremely high calorie count',
          value: calories
        });
      }

      if (protein > 100) {
        flags.push({
          severity: 'warning',
          field: `${source}.nutrition.protein`,
          issue: 'Extremely high protein content',
          value: protein
        });
      }
    }

    // Restaurant name validation
    if (!item.restaurantChain || item.restaurantChain.trim() === '') {
      flags.push({
        severity: 'warning',
        field: `${source}.restaurantChain`,
        issue: 'Missing restaurant chain information',
        value: item.restaurantChain
      });
    }

    return flags;
  }

  // Validate processed data from AI
  private validateProcessedData(processedData: any): ValidationFlag[] {
    const flags: ValidationFlag[] = [];

    // Add validation for AI processing step
    if (processedData.estimatedPrice && processedData.estimatedPrice > 5000) { // > $50
      flags.push({
        severity: 'error',
        field: 'processed.estimatedPrice',
        issue: 'AI estimated price exceeds reasonable range',
        value: processedData.estimatedPrice
      });
    }

    return flags;
  }

  // Validate final display data
  private validateDisplayData(displayData: any): ValidationFlag[] {
    const flags: ValidationFlag[] = [];

    // Validate final prices shown to users
    const priceMatch = displayData.priceEstimate?.match(/\$(\d+(?:,\d{3})*(?:\.\d{2})?)/);
    if (priceMatch) {
      const price = parseFloat(priceMatch[1].replace(/,/g, ''));
      if (price > 50) {
        flags.push({
          severity: 'error',
          field: 'display.priceEstimate',
          issue: 'Display price exceeds $50 - Data Error - Review Required',
          value: displayData.priceEstimate
        });
      }
    }

    return flags;
  }

  // Save audit entry to file
  private saveAuditEntry(entry: SpoonacularAuditEntry): void {
    // Only save files in server environment
    if (!this.auditDir || !fs || !path) {
      return;
    }

    const filename = `spoonacular_responses_${new Date().toISOString().split('T')[0]}.txt`;
    const filepath = path.join(this.auditDir, filename);

    const logContent = `
===============================================
TIMESTAMP: ${entry.timestamp}
ENDPOINT: ${entry.endpoint}
SESSION: ${this.sessionId}
===============================================

REQUEST PARAMS:
${JSON.stringify(entry.requestParams, null, 2)}

RAW SPOONACULAR RESPONSE:
${JSON.stringify(entry.rawResponse, null, 2)}

PROCESSED DATA:
${JSON.stringify(entry.processedData, null, 2)}

DISPLAY DATA:
${JSON.stringify(entry.displayData, null, 2)}

VALIDATION FLAGS (${entry.validationFlags.length}):
${entry.validationFlags.map(flag =>
  `[${flag.severity.toUpperCase()}] ${flag.field}: ${flag.issue} (Value: ${JSON.stringify(flag.value)}${flag.expected ? `, Expected: ${flag.expected}` : ''})`
).join('\n')}

===============================================

`;

    fs.appendFileSync(filepath, logContent, 'utf8');

    // Also save discrepancy report if there are errors
    const errorFlags = entry.validationFlags.filter(f => f.severity === 'error');
    if (errorFlags.length > 0) {
      this.saveDiscrepancyReport(entry, errorFlags);
    }
  }

  // Save discrepancy report for errors
  private saveDiscrepancyReport(entry: SpoonacularAuditEntry, errorFlags: ValidationFlag[]): void {
    if (!this.auditDir || !fs || !path) {
      return;
    }

    const filename = `data_discrepancy_report.txt`;
    const filepath = path.join(this.auditDir, filename);

    const reportContent = `
[${entry.timestamp}] CRITICAL DATA ERRORS DETECTED
Endpoint: ${entry.endpoint}
Session: ${this.sessionId}

ERRORS:
${errorFlags.map(flag => `- ${flag.field}: ${flag.issue} (Value: ${JSON.stringify(flag.value)})`).join('\n')}

Raw Response: ${JSON.stringify(entry.rawResponse)}
Display Data: ${JSON.stringify(entry.displayData)}

---

`;

    fs.appendFileSync(filepath, reportContent, 'utf8');
  }

  // Save clean, readable meal item data for easy human review
  private saveMealItemData(entry: SpoonacularAuditEntry): void {
    if (!this.auditDir || !fs || !path) {
      return;
    }

    const filename = `MEAL_ITEMS_NUTRITION_AND_PRICING.txt`;
    const filepath = path.join(this.auditDir, filename);

    // Extract meal items from the response
    const items = this.extractMealItems(entry);

    if (items.length === 0) return;

    const cleanData = items.map(item => {
      const costAnalysis = this.analyzeCostSource(item, entry);
      const nutritionSource = this.analyzeNutritionSource(item, entry);

      // Format numbers with proper precision and units
      const formatNutrition = (value: number | string, unit: string): string => {
        if (!value || value === 'Unknown' || value === 0) return 'Unknown';
        const numValue = typeof value === 'string' ? parseFloat(value) : value;
        return isNaN(numValue) ? 'Unknown' : `${numValue.toFixed(1)}${unit}`;
      };

      const curlCommand = `curl "https://api.spoonacular.com/food/menuItems/${item.spoonacularId}?apiKey=YOUR_API_KEY"`;

      // Show processed data if available
      const processedInfo = entry.processedData ? `
🔄 PROCESSED BY MEAL ORCHESTRATOR:
   Calories: ${entry.processedData.nutrition?.calories || 'null'}
   Protein:  ${entry.processedData.nutrition?.protein || 'null'}g
   Carbs:    ${entry.processedData.nutrition?.carbs || 'null'}g
   Fat:      ${entry.processedData.nutrition?.fat || 'null'}g
   Fiber:    ${entry.processedData.nutrition?.fiber || 'null'}g
   Sodium:   ${entry.processedData.nutrition?.sodium || 'null'}mg
   Data Source: ${entry.processedData.dataSource || 'Unknown'}
` : '';

      return `
═══════════════════════════════════════════════════════════════════════════════
📍 RESTAURANT: ${item.restaurantName || 'Unknown'}
🍽️  ITEM: ${item.itemName || 'Unknown'}
🆔 SPOONACULAR ID: ${item.spoonacularId || 'Unknown'}
⏰ TIMESTAMP: ${entry.timestamp}
═══════════════════════════════════════════════════════════════════════════════

🥗 RAW SPOONACULAR NUTRITIONAL DATA:
   Calories: ${item.calories || 'Not provided'} ${nutritionSource.includes('Spoonacular') ? '✅' : '❌'} (${nutritionSource})
   Protein:  ${formatNutrition(item.protein, 'g')}
   Carbs:    ${formatNutrition(item.carbs, 'g')}
   Fat:      ${formatNutrition(item.fat, 'g')}
   Fiber:    ${formatNutrition(item.fiber, 'g')}
   Sodium:   ${formatNutrition(item.sodium, 'mg')}
${processedInfo}
💰 PRICING ANALYSIS:
   ${costAnalysis}

🔍 DATA QUALITY:
   ${entry.validationFlags.length > 0 ?
     entry.validationFlags.map(f => `   ${f.severity.toUpperCase()}: ${f.issue}`).join('\n') :
     '   No issues detected'}

🔗 MANUAL VERIFICATION COMMANDS:
   ${curlCommand}

   Or test with your API key:
   curl "https://api.spoonacular.com/food/menuItems/${item.spoonacularId}?apiKey=YOUR_ACTUAL_API_KEY"

───────────────────────────────────────────────────────────────────────────────
`;
    }).join('\n');

    const headerContent = `
FYTR MEAL ITEMS - NUTRITION AND PRICING ANALYSIS
Generated: ${new Date().toISOString()}
Session: ${this.sessionId}

This file contains ONLY the actual meal items with their nutrition data and pricing analysis.
Technical API details are saved separately in spoonacular_responses_[date].txt

═══════════════════════════════════════════════════════════════════════════════
`;

    // Append to file (create if doesn't exist)
    if (!fs.existsSync(filepath)) {
      fs.writeFileSync(filepath, headerContent, 'utf8');
    }

    fs.appendFileSync(filepath, cleanData, 'utf8');

    // Also create a separate file with just curl commands for easy testing
    const curlFilename = `CURL_COMMANDS_FOR_MANUAL_TESTING.txt`;
    const curlFilepath = path.join(this.auditDir, curlFilename);

    const curlCommands = items.map(item => {
      return `# ${item.restaurantName} - ${item.itemName} (ID: ${item.spoonacularId})
curl "https://api.spoonacular.com/food/menuItems/${item.spoonacularId}?apiKey=YOUR_API_KEY" | jq .

`;
    }).join('\n');

    const curlHeader = `# SPOONACULAR API MANUAL TESTING COMMANDS
# Generated: ${new Date().toISOString()}
# Replace YOUR_API_KEY with your actual Spoonacular API key
# Install jq for pretty JSON formatting: brew install jq

`;

    if (!fs.existsSync(curlFilepath)) {
      fs.writeFileSync(curlFilepath, curlHeader, 'utf8');
    }

    fs.appendFileSync(curlFilepath, curlCommands, 'utf8');
  }

  // Extract meal items from API response
  private extractMealItems(entry: SpoonacularAuditEntry): any[] {
    const items: any[] = [];

    // Handle menu search responses
    if (entry.rawResponse?.menuItems) {
      entry.rawResponse.menuItems.forEach((item: any) => {
        items.push({
          restaurantName: item.restaurantChain || 'Unknown',
          itemName: item.title || 'Unknown',
          calories: item.calories || item.nutrition?.calories,
          protein: item.protein || item.nutrition?.protein,
          carbs: item.carbs || item.nutrition?.carbs,
          fat: item.fat || item.nutrition?.fat,
          fiber: item.fiber || item.nutrition?.fiber,
          sodium: item.sodium || item.nutrition?.sodium,
          spoonacularPrice: item.price || 'Not provided by Spoonacular',
          spoonacularId: item.id
        });
      });
    }

    // Handle single item detail responses
    if (entry.rawResponse?.title && !entry.rawResponse?.menuItems) {
      // Parse nutrition from nutrients array format
      const parseNutritionValue = (nutrients: any[], nutrientName: string): number => {
        if (!nutrients || !Array.isArray(nutrients)) return 0;
        const nutrient = nutrients.find(n => n.name === nutrientName);
        return nutrient?.amount || 0;
      };

      const nutrients = entry.rawResponse.nutrition?.nutrients || [];

      items.push({
        restaurantName: entry.rawResponse.restaurantChain || 'Unknown',
        itemName: entry.rawResponse.title || 'Unknown',
        calories: parseNutritionValue(nutrients, 'Calories'),
        protein: parseNutritionValue(nutrients, 'Protein'),
        carbs: parseNutritionValue(nutrients, 'Carbohydrates'),
        fat: parseNutritionValue(nutrients, 'Fat'),
        fiber: parseNutritionValue(nutrients, 'Fiber'),
        sodium: parseNutritionValue(nutrients, 'Sodium'),
        spoonacularPrice: entry.rawResponse.price || 'Not provided by Spoonacular',
        spoonacularId: entry.rawResponse.id
      });
    }

    return items;
  }

  // Analyze how the cost was determined
  private analyzeCostSource(item: any, entry: SpoonacularAuditEntry): string {
    const parts: string[] = [];

    // Check Spoonacular pricing
    if (item.spoonacularPrice && item.spoonacularPrice !== 'Not provided by Spoonacular') {
      parts.push(`🏪 SPOONACULAR PROVIDED: $${item.spoonacularPrice} ✅`);
    } else {
      parts.push(`🏪 SPOONACULAR PROVIDED: No pricing data ❌`);
    }

    // Check processed/AI pricing
    if (entry.processedData?.estimatedPrice) {
      const aiPrice = (entry.processedData.estimatedPrice / 100).toFixed(2);
      parts.push(`🤖 AI ESTIMATED: $${aiPrice} ${entry.processedData.estimatedPrice > 5000 ? '❌ SUSPICIOUS' : '✅'}`);
    }

    // Check display pricing
    if (entry.displayData?.priceEstimate) {
      const displayPrice = entry.displayData.priceEstimate;
      const priceMatch = displayPrice.match(/\$(\d+(?:,\d{3})*(?:\.\d{2})?)/);
      const price = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : 0;
      parts.push(`👤 SHOWN TO USER: ${displayPrice} ${price > 50 ? '❌ DATA ERROR' : '✅'}`);
    }

    // Add explanation
    if (item.spoonacularPrice === 'Not provided by Spoonacular' && entry.processedData?.estimatedPrice) {
      parts.push(`\n   ℹ️  COST CALCULATION: Since Spoonacular doesn't provide pricing, AI estimated the cost.`);
      if (entry.processedData.estimatedPrice > 5000) {
        parts.push(`   ❌ ERROR: AI estimate of $${(entry.processedData.estimatedPrice/100).toFixed(2)} is unrealistic for restaurant food.`);
      }
    }

    return parts.join('\n   ');
  }

  // Analyze nutrition data source
  private analyzeNutritionSource(item: any, entry: SpoonacularAuditEntry): string {
    if (entry.endpoint.includes('details') && item.calories) {
      return 'Spoonacular API verified';
    } else if (entry.endpoint.includes('search') && item.calories) {
      return 'Spoonacular API (search result)';
    } else if (entry.processedData?.nutrition) {
      return 'AI estimated/calculated';
    }
    return 'Unknown source';
  }

  // Log data pipeline to console
  private logDataPipeline(entry: SpoonacularAuditEntry): void {
    console.log(`\n🔍 [SPOONACULAR-AUDIT] Data Pipeline Trace:`);
    console.log(`📅 ${entry.timestamp} | 🎯 ${entry.endpoint}`);

    // Show key data points through the pipeline
    if (entry.rawResponse?.menuItems?.[0] || entry.rawResponse?.title) {
      const item = entry.rawResponse.menuItems?.[0] || entry.rawResponse;
      console.log(`📊 RAW API DATA:`);
      console.log(`   Restaurant: ${item.restaurantChain || 'Unknown'}`);
      console.log(`   Item: ${item.title || 'Unknown'}`);
      console.log(`   Calories: ${item.calories || item.nutrition?.calories || 'Unknown'}`);
      console.log(`   Price: ${item.price || 'Not provided by Spoonacular'}`);
    }

    if (entry.processedData) {
      console.log(`🤖 AI PROCESSING:`);
      console.log(`   Estimated Price: ${entry.processedData.estimatedPrice || 'No estimation'}`);
      console.log(`   Processing Changes: ${entry.processedData.changes || 'None logged'}`);
    }

    if (entry.displayData) {
      console.log(`👤 USER DISPLAY:`);
      console.log(`   Price Shown: ${entry.displayData.priceEstimate || 'Unknown'}`);
      console.log(`   Calories Shown: ${entry.displayData.calories || entry.displayData.verifiedNutrition?.calories || 'Unknown'}`);
    }

    // Show validation results
    const errors = entry.validationFlags.filter(f => f.severity === 'error');
    const warnings = entry.validationFlags.filter(f => f.severity === 'warning');

    if (errors.length > 0) {
      console.log(`❌ CRITICAL ERRORS (${errors.length}):`);
      errors.forEach(e => console.log(`   - ${e.field}: ${e.issue}`));
    }

    if (warnings.length > 0) {
      console.log(`⚠️  WARNINGS (${warnings.length}):`);
      warnings.forEach(w => console.log(`   - ${w.field}: ${w.issue}`));
    }

    console.log(`📋 Full audit saved to: audit-logs/spoonacular_responses_${new Date().toISOString().split('T')[0]}.txt\n`);
  }

  // Generate data source tracking info
  generateDataSource(item: any, processingContext?: any): DataSource {
    let nutrition: DataSource['nutrition'] = 'unknown';
    let pricing: DataSource['pricing'] = 'unknown';
    let menuItem: DataSource['menuItem'] = 'unknown';
    let confidence = 0;

    // Determine nutrition source
    if (item.nutrition && item.dataSource === 'Verified by Spoonacular') {
      nutrition = 'spoonacular_verified';
      confidence += 40;
    } else if (item.nutrition && processingContext?.aiGenerated) {
      nutrition = 'ai_estimated';
      confidence += 20;
    } else if (item.nutrition) {
      nutrition = 'calculated';
      confidence += 30;
    }

    // Determine pricing source
    if (item.priceEstimate && item.priceEstimate.includes('$') && !item.priceEstimate.includes('varies')) {
      if (processingContext?.spoonacularPrice) {
        pricing = 'spoonacular_data';
        confidence += 30;
      } else {
        pricing = 'ai_estimated';
        confidence += 15;
      }
    }

    // Determine menu item validity
    if (item.restaurantName && item.dishName && processingContext?.spoonacularVerified) {
      menuItem = 'verified_menu_item';
      confidence += 30;
    } else if (item.restaurantName && item.dishName) {
      menuItem = 'estimated_item';
      confidence += 15;
    }

    return { nutrition, pricing, menuItem, confidence: Math.min(confidence, 100) };
  }

  // Create summary report
  generateSummaryReport(): void {
    if (!this.auditDir || !fs || !path) {
      console.log('📊 Audit summary: File system not available, summary logged to console only');
      return;
    }

    const date = new Date().toISOString().split('T')[0];
    const summaryPath = path.join(this.auditDir, `spoonacular_audit_${date}.txt`);

    const summary = `
FYTR SPOONACULAR API AUDIT SUMMARY
Generated: ${new Date().toISOString()}
Session: ${this.sessionId}

This audit system tracks all Spoonacular API responses and validates data accuracy.

FILES GENERATED:
- spoonacular_responses_${date}.txt: All API responses with validation
- data_discrepancy_report.txt: Critical errors and suspicious data
- Console logs: Real-time data pipeline traces

VALIDATION CHECKS:
✅ Price validation (flags >$50 as errors)
✅ Nutrition cross-validation (calories vs macros)
✅ Data completeness checks
✅ Restaurant chain verification

SUSPICIOUS VALUES DETECTED IN CURRENT DASHBOARD:
- Freshii items showing prices $67-69, $1214-1216 (likely data errors)
- Pret A Manger items showing prices $809-811 (likely data errors)

Next steps: Review raw Spoonacular responses to determine if errors originate from:
1. Spoonacular API itself
2. AI processing pipeline
3. Display formatting logic
`;

    fs.writeFileSync(summaryPath, summary, 'utf8');
    console.log(`📊 Audit summary saved to: ${summaryPath}`);
  }
}

// Singleton instance for global use
export const spoonacularAuditor = new SpoonacularAuditor();