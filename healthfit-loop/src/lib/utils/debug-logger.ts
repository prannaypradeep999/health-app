import { writeFileSync } from 'fs';
import { join } from 'path';

interface RestaurantDebugData {
  restaurantName: string;
  tavilyQueries: Array<{
    strategy: string;
    query: string;
    maxResults: number;
    purpose: string;
    results?: any[];
    error?: string;
  }>;
  rawTavilyContent: Array<{
    url: string;
    title: string;
    content: string;
    source: string;
  }>;
  filteredResults: {
    deliveryUrls: string[];
    menuContentUrls: string[];
    bestDeliveryUrl?: string;
  };
  llmMenuPrompt: string;
  llmRawResponse: string;
  parsedMenuItems: any[];
  finalOrderingUrl?: string;
  errors: string[];
  timestamp: string;
}

export class RestaurantDebugLogger {
  private static logDir = join(process.cwd(), 'logs', 'restaurant-debug');

  static logRestaurantDebug(data: RestaurantDebugData) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `${data.restaurantName.replace(/[^a-zA-Z0-9]/g, '_')}_${timestamp}.txt`;
      const filePath = join(this.logDir, fileName);

      const logContent = this.formatDebugLog(data);

      writeFileSync(filePath, logContent, 'utf8');
      console.log(`[DEBUG-LOGGER] ✅ Restaurant debug log saved: ${filePath}`);

      return filePath;
    } catch (error) {
      console.error(`[DEBUG-LOGGER] ❌ Failed to save restaurant debug log:`, error);
      return null;
    }
  }

  static logLLMPrompt(
    restaurant: string,
    stepName: string,
    prompt: string,
    response: string,
    parsedData?: any
  ) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `${restaurant.replace(/[^a-zA-Z0-9]/g, '_')}_${stepName}_${timestamp}.txt`;
      const filePath = join(this.logDir, fileName);

      const logContent = `
================================
LLM PROMPT DEBUG LOG
================================
Restaurant: ${restaurant}
Step: ${stepName}
Timestamp: ${new Date().toISOString()}

================================
PROMPT SENT TO LLM:
================================
${prompt}

================================
RAW LLM RESPONSE:
================================
${response}

${parsedData ? `
================================
PARSED DATA:
================================
${JSON.stringify(parsedData, null, 2)}
` : ''}

================================
END LOG
================================
`;

      writeFileSync(filePath, logContent, 'utf8');
      console.log(`[DEBUG-LOGGER] ✅ LLM prompt log saved: ${filePath}`);

      return filePath;
    } catch (error) {
      console.error(`[DEBUG-LOGGER] ❌ Failed to save LLM prompt log:`, error);
      return null;
    }
  }

  private static formatDebugLog(data: RestaurantDebugData): string {
    return `
================================
RESTAURANT DEBUG LOG
================================
Restaurant: ${data.restaurantName}
Timestamp: ${data.timestamp}

================================
TAVILY SEARCH QUERIES:
================================
${data.tavilyQueries.map((query, i) => `
Query ${i + 1}: ${query.strategy}
Purpose: ${query.purpose}
Query: ${query.query}
Max Results: ${query.maxResults}
Results Found: ${query.results?.length || 0}
${query.error ? `Error: ${query.error}` : ''}
`).join('\n')}

================================
RAW TAVILY CONTENT:
================================
${data.rawTavilyContent.map((content, i) => `
--- Content ${i + 1} ---
URL: ${content.url}
Title: ${content.title}
Source: ${content.source}
Full Content: ${content.content}
`).join('\n')}

================================
FILTERED RESULTS:
================================
Delivery URLs Found: ${data.filteredResults.deliveryUrls.length}
${data.filteredResults.deliveryUrls.map(url => `  - ${url}`).join('\n')}

Menu Content URLs Found: ${data.filteredResults.menuContentUrls.length}
${data.filteredResults.menuContentUrls.map(url => `  - ${url}`).join('\n')}

Best Delivery URL: ${data.filteredResults.bestDeliveryUrl || 'None found'}

================================
LLM MENU ANALYSIS PROMPT:
================================
${data.llmMenuPrompt}

================================
RAW LLM RESPONSE:
================================
${data.llmRawResponse}

================================
PARSED MENU ITEMS:
================================
${JSON.stringify(data.parsedMenuItems, null, 2)}

================================
FINAL ORDERING URL:
================================
${data.finalOrderingUrl || 'None'}

================================
ERRORS:
================================
${data.errors.length > 0 ? data.errors.join('\n') : 'No errors'}

================================
END DEBUG LOG
================================
`;
  }
}