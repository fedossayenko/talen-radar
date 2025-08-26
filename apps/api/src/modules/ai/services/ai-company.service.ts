import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AICoreService } from './ai-core.service';
import { AIPromptService } from './ai-prompt.service';

export interface CompanyProfileAnalysisResult {
  name: string | null;
  description: string | null;
  industry: string | null;
  size: string | null;
  location: string | null;
  website: string | null;
  employeeCount: number | null;
  founded: number | null;
  technologies: string[] | null;
  benefits: string[] | null;
  culture: string | null;
  values: string[] | null;
  workEnvironment: string | null;
  careerOpportunities: string[] | null;
  socialImpact: string | null;
  financialHealth: string | null;
  recentNews: string[] | null;
  competitiveAdvantages: string[] | null;
  challenges: string[] | null;
  confidenceScore: number;
  analysisMetadata: {
    sourceType: string;
    contentLength: number;
    hasStructuredData: boolean;
    language: string;
    analysisDepth: 'basic' | 'detailed' | 'comprehensive';
  };
}

@Injectable()
export class AICompanyService {
  private readonly logger = new Logger(AICompanyService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly aiCore: AICoreService,
    private readonly aiPrompt: AIPromptService,
  ) {}

  /**
   * Analyze company profile from structured data or web content
   */
  async analyzeCompanyProfile(
    content: string,
    sourceUrl?: string,
    existingData?: any,
  ): Promise<CompanyProfileAnalysisResult> {
    const contentHash = this.aiCore.generateContentHash(content, { sourceUrl, existingData });

    // Check cache first
    if (this.configService.get<boolean>('ai.enableCaching')) {
      const cached = await this.aiCore.getCachedResult(contentHash, 'company_profile');
      if (cached) {
        return cached;
      }
    }

    try {
      const cleanedContent = await this.aiCore.cleanContent(content);
      const contentQuality = await this.aiCore.assessContentQuality(cleanedContent);

      const model = this.selectModelForAnalysis(contentQuality, 'profile');
      const isUnstructuredModel = model.includes('gpt-3.5') || model.includes('gpt-4-mini');

      this.logger.log(`Analyzing company profile with ${model} (quality: ${contentQuality.qualityScore})`);

      const messages = this.aiPrompt.buildCompanyProfileMessages(
        cleanedContent,
        sourceUrl,
        existingData,
        isUnstructuredModel
      );

      const response = await this.aiCore.callOpenAiWithLogging(
        messages,
        model,
        0.1,
        2000,
        'company_profile_analysis',
        sourceUrl,
      );

      const analysisResult = this.aiPrompt.parseCompanyAnalysisResponse(
        response,
        isUnstructuredModel,
        'profile',
        {
          contentLength: cleanedContent.length,
          qualityScore: contentQuality.qualityScore,
          sourceUrl,
        }
      );

      if (!analysisResult) {
        throw new Error('Failed to parse AI response for company profile analysis');
      }

      // Cache result
      if (this.configService.get<boolean>('ai.enableCaching')) {
        await this.aiCore.cacheResult(contentHash, 'company_profile', analysisResult);
      }

      return analysisResult;

    } catch (error) {
      this.logger.error(`Company profile analysis failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Analyze company website for additional insights
   */
  async analyzeCompanyWebsite(
    content: string,
    sourceUrl?: string,
    existingData?: any,
  ): Promise<CompanyProfileAnalysisResult> {
    const contentHash = this.aiCore.generateContentHash(content, { sourceUrl, existingData, type: 'website' });

    // Check cache first
    if (this.configService.get<boolean>('ai.enableCaching')) {
      const cached = await this.aiCore.getCachedResult(contentHash, 'company_website');
      if (cached) {
        return cached;
      }
    }

    try {
      const cleanedContent = await this.aiCore.cleanContent(content);
      const contentQuality = await this.aiCore.assessContentQuality(cleanedContent);

      const model = this.selectModelForAnalysis(contentQuality, 'website');
      const isUnstructuredModel = model.includes('gpt-3.5') || model.includes('gpt-4-mini');

      this.logger.log(`Analyzing company website with ${model} (quality: ${contentQuality.qualityScore})`);

      const messages = this.aiPrompt.buildCompanyWebsiteMessages(
        cleanedContent,
        sourceUrl,
        existingData,
        isUnstructuredModel
      );

      const response = await this.aiCore.callOpenAiWithLogging(
        messages,
        model,
        0.1,
        2500,
        'company_website_analysis',
        sourceUrl,
      );

      const analysisResult = this.aiPrompt.parseCompanyAnalysisResponse(
        response,
        isUnstructuredModel,
        'website',
        {
          contentLength: cleanedContent.length,
          qualityScore: contentQuality.qualityScore,
          sourceUrl,
        }
      );

      if (!analysisResult) {
        throw new Error('Failed to parse AI response for company website analysis');
      }

      // Cache result
      if (this.configService.get<boolean>('ai.enableCaching')) {
        await this.aiCore.cacheResult(contentHash, 'company_website', analysisResult);
      }

      return analysisResult;

    } catch (error) {
      this.logger.error(`Company website analysis failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Analyze company profile with raw response for debugging
   */
  async analyzeCompanyProfileWithRawResponse(
    content: string,
    sourceUrl?: string,
    existingData?: any,
  ): Promise<{ result: CompanyProfileAnalysisResult | null; rawResponse: string | null; model: string }> {
    try {
      const cleanedContent = await this.aiCore.cleanContent(content);
      const contentQuality = await this.aiCore.assessContentQuality(cleanedContent);
      
      const model = this.selectModelForAnalysis(contentQuality, 'profile');
      const isUnstructuredModel = model.includes('gpt-3.5') || model.includes('gpt-4-mini');

      this.logger.log(`Analyzing company profile (with raw response) using ${model}`);

      const messages = this.aiPrompt.buildCompanyProfileMessages(
        cleanedContent,
        sourceUrl,
        existingData,
        isUnstructuredModel
      );

      const rawResponse = await this.aiCore.callOpenAiWithLogging(
        messages,
        model,
        0.1,
        2000,
        'company_profile_debug',
        sourceUrl,
      );

      const result = this.aiPrompt.parseCompanyAnalysisResponse(
        rawResponse,
        isUnstructuredModel,
        'profile',
        {
          contentLength: cleanedContent.length,
          qualityScore: contentQuality.qualityScore,
          sourceUrl,
        }
      );

      return {
        result,
        rawResponse: rawResponse || null,
        model,
      };

    } catch (error) {
      this.logger.error(`Company profile analysis with raw response failed: ${error.message}`);
      return {
        result: null,
        rawResponse: null,
        model: 'error',
      };
    }
  }

  /**
   * Analyze company website with raw response for debugging
   */
  async analyzeCompanyWebsiteWithRawResponse(
    content: string,
    sourceUrl?: string,
    existingData?: any,
  ): Promise<{ result: CompanyProfileAnalysisResult | null; rawResponse: string | null; model: string }> {
    try {
      const cleanedContent = await this.aiCore.cleanContent(content);
      const contentQuality = await this.aiCore.assessContentQuality(cleanedContent);
      
      const model = this.selectModelForAnalysis(contentQuality, 'website');
      const isUnstructuredModel = model.includes('gpt-3.5') || model.includes('gpt-4-mini');

      this.logger.log(`Analyzing company website (with raw response) using ${model}`);

      const messages = this.aiPrompt.buildCompanyWebsiteMessages(
        cleanedContent,
        sourceUrl,
        existingData,
        isUnstructuredModel
      );

      const rawResponse = await this.aiCore.callOpenAiWithLogging(
        messages,
        model,
        0.1,
        2500,
        'company_website_debug',
        sourceUrl,
      );

      const result = this.aiPrompt.parseCompanyAnalysisResponse(
        rawResponse,
        isUnstructuredModel,
        'website',
        {
          contentLength: cleanedContent.length,
          qualityScore: contentQuality.qualityScore,
          sourceUrl,
        }
      );

      return {
        result,
        rawResponse: rawResponse || null,
        model,
      };

    } catch (error) {
      this.logger.error(`Company website analysis with raw response failed: ${error.message}`);
      return {
        result: null,
        rawResponse: null,
        model: 'error',
      };
    }
  }

  /**
   * Consolidate multiple company analyses into a comprehensive profile
   */
  async consolidateCompanyAnalysis(
    profileAnalysis: CompanyProfileAnalysisResult | null,
    websiteAnalysis: CompanyProfileAnalysisResult | null,
    existingCompanyData?: any,
  ): Promise<CompanyProfileAnalysisResult> {
    if (!profileAnalysis && !websiteAnalysis) {
      throw new Error('At least one analysis result is required for consolidation');
    }

    try {
      // Create consolidated input for AI
      const consolidationInput = {
        profileAnalysis,
        websiteAnalysis,
        existingCompanyData,
      };

      const contentHash = this.aiCore.generateContentHash(
        JSON.stringify(consolidationInput),
        { type: 'consolidation' }
      );

      // Check cache
      if (this.configService.get<boolean>('ai.enableCaching')) {
        const cached = await this.aiCore.getCachedResult(contentHash, 'company_consolidation');
        if (cached) {
          return cached;
        }
      }

      const model = this.configService.get<string>('ai.defaultModel') || 'gpt-4-mini';
      const isUnstructuredModel = model.includes('gpt-3.5') || model.includes('gpt-4-mini');

      this.logger.log(`Consolidating company analysis with ${model}`);

      const messages = this.aiPrompt.buildCompanyConsolidationMessages(
        consolidationInput,
        isUnstructuredModel
      );

      const response = await this.aiCore.callOpenAiWithLogging(
        messages,
        model,
        0.1,
        3000,
        'company_consolidation',
      );

      const consolidatedResult = this.aiPrompt.parseCompanyAnalysisResponse(
        response,
        isUnstructuredModel,
        'consolidated',
        {
          contentLength: JSON.stringify(consolidationInput).length,
          qualityScore: 85, // Assume high quality for consolidated data
        }
      );

      if (!consolidatedResult) {
        throw new Error('Failed to parse AI response for company consolidation');
      }

      // Cache result
      if (this.configService.get<boolean>('ai.enableCaching')) {
        await this.aiCore.cacheResult(contentHash, 'company_consolidation', consolidatedResult);
      }

      return consolidatedResult;

    } catch (error) {
      this.logger.error(`Company analysis consolidation failed: ${error.message}`);
      
      // Fallback: merge analyses manually
      return this.manualConsolidation(profileAnalysis, websiteAnalysis, existingCompanyData);
    }
  }

  /**
   * Select the best AI model based on analysis type and content characteristics
   */
  private selectModelForAnalysis(contentQuality: any, analysisType: 'profile' | 'website'): string {
    const defaultModel = this.configService.get<string>('ai.defaultModel') || 'gpt-4-mini';
    
    // Website analysis typically requires more sophisticated understanding
    if (analysisType === 'website') {
      if (contentQuality.qualityScore >= 70) {
        return 'gpt-4-turbo';
      }
      return 'gpt-4-mini';
    }
    
    // Profile analysis from structured data
    if (contentQuality.qualityScore >= 80 && contentQuality.hasStructuredContent) {
      return 'gpt-4-mini';
    }
    
    if (contentQuality.qualityScore < 50) {
      return 'gpt-4-turbo';
    }

    return defaultModel;
  }

  /**
   * Manual consolidation fallback when AI consolidation fails
   */
  private manualConsolidation(
    profileAnalysis: CompanyProfileAnalysisResult | null,
    websiteAnalysis: CompanyProfileAnalysisResult | null,
    existingData?: any,
  ): CompanyProfileAnalysisResult {
    const primary = profileAnalysis || websiteAnalysis;
    const secondary = profileAnalysis ? websiteAnalysis : null;

    if (!primary) {
      throw new Error('No valid analysis data for consolidation');
    }

    // Merge data, preferring more confident results
    const consolidated: CompanyProfileAnalysisResult = {
      ...primary,
      // Merge arrays
      technologies: this.mergeArrays(primary.technologies, secondary?.technologies),
      benefits: this.mergeArrays(primary.benefits, secondary?.benefits),
      values: this.mergeArrays(primary.values, secondary?.values),
      careerOpportunities: this.mergeArrays(primary.careerOpportunities, secondary?.careerOpportunities),
      recentNews: this.mergeArrays(primary.recentNews, secondary?.recentNews),
      competitiveAdvantages: this.mergeArrays(primary.competitiveAdvantages, secondary?.competitiveAdvantages),
      challenges: this.mergeArrays(primary.challenges, secondary?.challenges),
      
      // Use better confidence score
      confidenceScore: Math.max(primary.confidenceScore, secondary?.confidenceScore || 0),
      
      // Merge metadata
      analysisMetadata: {
        ...primary.analysisMetadata,
        analysisDepth: 'comprehensive',
        contentLength: primary.analysisMetadata.contentLength + (secondary?.analysisMetadata.contentLength || 0),
      },
    };

    // Override with existing data if available and more reliable
    if (existingData) {
      Object.keys(existingData).forEach(key => {
        if (existingData[key] && (!consolidated[key] || consolidated.confidenceScore < 0.8)) {
          consolidated[key] = existingData[key];
        }
      });
    }

    return consolidated;
  }

  /**
   * Merge arrays removing duplicates
   */
  private mergeArrays(arr1: string[] | null, arr2: string[] | null): string[] | null {
    if (!arr1 && !arr2) return null;
    if (!arr1) return arr2;
    if (!arr2) return arr1;
    
    const combined = [...arr1, ...arr2];
    return [...new Set(combined.map(item => item.toLowerCase()))].map(item => 
      combined.find(orig => orig.toLowerCase() === item) || item
    );
  }

  /**
   * Validate company analysis result
   */
  validateAnalysisResult(result: CompanyProfileAnalysisResult): { isValid: boolean; issues: string[] } {
    const issues: string[] = [];

    // Check required fields
    if (!result.name) issues.push('Missing company name');
    if (!result.description || result.description.length < 50) {
      issues.push('Missing or insufficient company description');
    }

    // Check data quality
    if (result.confidenceScore < 0.3) {
      issues.push('Low confidence score in analysis');
    }

    if (result.employeeCount && (result.employeeCount < 0 || result.employeeCount > 10000000)) {
      issues.push('Employee count seems unrealistic');
    }

    if (result.founded && (result.founded < 1800 || result.founded > new Date().getFullYear())) {
      issues.push('Founded year seems unrealistic');
    }

    return {
      isValid: issues.length === 0,
      issues,
    };
  }

  /**
   * Get company analysis statistics
   */
  async getAnalysisStats(): Promise<any> {
    const baseStats = await this.aiCore.getUsageStats();
    
    // Filter for company analysis requests
    const profileRequests = baseStats.requestTypeDistribution?.['company_profile_analysis'] || 0;
    const websiteRequests = baseStats.requestTypeDistribution?.['company_website_analysis'] || 0;
    const consolidationRequests = baseStats.requestTypeDistribution?.['company_consolidation'] || 0;
    const debugRequests = (baseStats.requestTypeDistribution?.['company_profile_debug'] || 0) +
                          (baseStats.requestTypeDistribution?.['company_website_debug'] || 0);

    return {
      ...baseStats,
      companyProfileAnalyses: profileRequests,
      companyWebsiteAnalyses: websiteRequests,
      companyConsolidations: consolidationRequests,
      debugAnalyses: debugRequests,
      totalCompanyRequests: profileRequests + websiteRequests + consolidationRequests + debugRequests,
    };
  }
}