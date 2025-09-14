// Data Source Tracking and UI Indicators
import { DataSource, spoonacularAuditor } from './spoonacular-audit';

export interface TrackedMealOption {
  // Original meal option data
  optionNumber: number;
  optionType: 'restaurant' | 'home';
  restaurantName?: string;
  dishName?: string;
  description?: string;
  verifiedNutrition: {
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    fiber?: number;
    sodium?: number;
  };
  priceEstimate?: string;

  // Data source tracking
  dataSource: DataSource;
  validationFlags?: string[];
  rawSpoonacularData?: any;
  aiProcessingInfo?: any;
}

export class DataSourceTracker {

  // Enhanced meal option with data source tracking
  static enhanceMealOption(
    originalOption: any,
    spoonacularData?: any,
    aiProcessingInfo?: any
  ): TrackedMealOption {

    const dataSource = spoonacularAuditor.generateDataSource(originalOption, {
      spoonacularVerified: !!spoonacularData,
      aiGenerated: !!aiProcessingInfo,
      spoonacularPrice: spoonacularData?.price
    });

    const validationFlags = this.generateValidationFlags(originalOption, dataSource);

    return {
      ...originalOption,
      dataSource,
      validationFlags,
      rawSpoonacularData: spoonacularData,
      aiProcessingInfo
    };
  }

  // Generate user-friendly validation flags
  private static generateValidationFlags(option: any, dataSource: DataSource): string[] {
    const flags: string[] = [];

    // Price validation
    if (option.priceEstimate) {
      const priceMatch = option.priceEstimate.match(/\$(\d+(?:,\d{3})*(?:\.\d{2})?)/);
      if (priceMatch) {
        const price = parseFloat(priceMatch[1].replace(/,/g, ''));
        if (price > 50) {
          flags.push('Data Error - Review Required');
        } else if (price > 25) {
          flags.push('High Price Alert');
        }
      }
    }

    // Confidence warnings
    if (dataSource.confidence < 50) {
      flags.push('Low Confidence Data');
    }

    // Data source warnings
    if (dataSource.pricing === 'unknown' || dataSource.nutrition === 'unknown') {
      flags.push('Incomplete Data');
    }

    return flags;
  }

  // Get CSS classes for UI indicators
  static getDataSourceIndicators(dataSource: DataSource): {
    borderColor: string;
    badgeColor: string;
    badgeText: string;
    confidenceColor: string;
  } {
    // Border colors based on data quality
    let borderColor = 'border-gray-200'; // Default
    if (dataSource.confidence >= 80) {
      borderColor = 'border-green-300'; // High confidence
    } else if (dataSource.confidence >= 60) {
      borderColor = 'border-blue-300'; // Medium confidence
    } else if (dataSource.confidence >= 40) {
      borderColor = 'border-yellow-300'; // Low confidence
    } else {
      borderColor = 'border-red-300'; // Very low confidence
    }

    // Badge styling based on nutrition source
    let badgeColor = 'bg-gray-100 text-gray-800';
    let badgeText = 'Unknown';

    switch (dataSource.nutrition) {
      case 'spoonacular_verified':
        badgeColor = 'bg-green-100 text-green-800';
        badgeText = 'Verified Data';
        break;
      case 'ai_estimated':
        badgeColor = 'bg-blue-100 text-blue-800';
        badgeText = 'AI Estimated';
        break;
      case 'calculated':
        badgeColor = 'bg-yellow-100 text-yellow-800';
        badgeText = 'Calculated';
        break;
    }

    // Confidence indicator color
    let confidenceColor = 'text-gray-500';
    if (dataSource.confidence >= 80) {
      confidenceColor = 'text-green-600';
    } else if (dataSource.confidence >= 60) {
      confidenceColor = 'text-blue-600';
    } else if (dataSource.confidence >= 40) {
      confidenceColor = 'text-yellow-600';
    } else {
      confidenceColor = 'text-red-600';
    }

    return {
      borderColor,
      badgeColor,
      badgeText,
      confidenceColor
    };
  }

  // Generate data source tooltip text
  static getDataSourceTooltip(dataSource: DataSource): string {
    const parts = [];

    parts.push(`Nutrition: ${this.formatDataSource(dataSource.nutrition)}`);
    parts.push(`Pricing: ${this.formatDataSource(dataSource.pricing)}`);
    parts.push(`Menu Item: ${this.formatDataSource(dataSource.menuItem)}`);
    parts.push(`Confidence: ${dataSource.confidence}%`);

    return parts.join('\n');
  }

  private static formatDataSource(source: string): string {
    return source.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  // Check if option needs user attention
  static needsAttention(option: TrackedMealOption): boolean {
    return option.validationFlags?.some(flag =>
      flag.includes('Data Error') ||
      flag.includes('Review Required') ||
      option.dataSource.confidence < 40
    ) || false;
  }

  // Get attention message for users
  static getAttentionMessage(option: TrackedMealOption): string | null {
    if (option.validationFlags?.some(flag => flag.includes('Data Error'))) {
      return 'This item may have incorrect pricing or nutrition data. Please verify before ordering.';
    }

    if (option.dataSource.confidence < 40) {
      return 'Low confidence in data accuracy. Information may be estimated.';
    }

    return null;
  }
}