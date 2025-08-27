import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AiService, CompanyProfileAnalysisResult } from './ai.service';
import { RedisService } from '../../common/redis/redis.service';
import { RedisMockService } from '../../../test/test-utils/redis-mock.service';
import { AiRequestLoggerService } from '../../common/ai-logging/ai-request-logger.service';
import { ContentExtractorService } from '../scraper/services/content-extractor.service';
import { AIVacancyService } from './services/ai-vacancy.service';
import { AICompanyService } from './services/ai-company.service';
import { AICoreService } from './services/ai-core.service';
import { AIPromptService } from './services/ai-prompt.service';
import OpenAI from 'openai';

// Mock HashingUtil
jest.mock('../../common/utils/hashing.util', () => ({
  HashingUtil: {
    generateContentHash: jest.fn().mockImplementation(({ url, content }) => {
      // Create predictable hash based on URL and content for consistent testing
      if (url === 'https://dev.bg/company/techcorp/' && content.includes('Company profile content')) {
        return 'profile-hash-123';
      }
      if (url === 'https://techcorp.com/about' && content.includes('About TechCorp')) {
        return 'website-hash-456';
      }
      if (url === 'consolidated-TechCorp') {
        return 'consolidated-hash-789';
      }
      // Fallback for other cases
      return `test-hash-${url.length}-${content.length}`;
    }),
  },
}));

describe('AiService - Company Analysis Methods', () => {
  let service: AiService;
  let configService: jest.Mocked<ConfigService>;
  let redisService: RedisMockService;
  let mockOpenAI: jest.Mocked<OpenAI>;

  const mockConfig = {
    openai: {
      apiKey: 'test-api-key',
      baseUrl: 'https://api.openai.com/v1',
      timeout: 60000,
      maxRetries: 3,
    },
    models: {
      scraping: {
        vacancy: 'gpt-4',
        contentCleaning: 'gpt-4',
        qualityAssessment: 'gpt-4',
      },
    },
    prompts: {
      companyProfile: {
        template: 'Analyze this company profile: {content}\nSource: {sourceUrl}',
        maxTokens: 2000,
        temperature: 0.3,
      },
      companyWebsite: {
        template: 'Analyze this company website: {content}\nSource: {sourceUrl}',
        maxTokens: 2000,
        temperature: 0.3,
      },
      consolidatedCompany: {
        template: 'Consolidate company analysis for {companyName}:\nDev.bg data: {devBgData}\nWebsite data: {websiteData}',
        maxTokens: 3000,
        temperature: 0.2,
      },
    },
    enableCaching: true,
    tokenOptimization: {
      maxContentLength: 10000,
      enableContentTruncation: true,
      preserveImportantSections: true,
    },
    contentHashing: {
      enableUrlHashing: true,
      enableContentHashing: true,
      contentCleaningBeforeHash: true,
      hashCacheExpiryDays: 7,
    },
  };

  const mockCompanyProfileAnalysis: CompanyProfileAnalysisResult = {
    name: 'TechCorp',
    description: 'Innovative technology company',
    industry: 'Technology',
    size: '51-200',
    location: 'Sofia, Bulgaria',
    website: 'https://techcorp.com',
    employeeCount: 120,
    founded: 2015,
    technologies: ['JavaScript', 'TypeScript', 'React', 'Node.js'],
    benefits: ['Health insurance', 'Flexible hours', 'Remote work'],
    values: ['Innovation', 'Collaboration', 'Excellence'],
    cons: ['Fast-paced environment', 'High expectations'],
    cultureScore: 8.5,
    workLifeBalance: 8.0,
    careerGrowth: 7.5,
    techCulture: 9.0,
    confidenceScore: 85,
    dataCompleteness: 90,
  };

  const mockCompanyWebsiteAnalysis: CompanyProfileAnalysisResult = {
    name: 'TechCorp Solutions',
    description: 'Leading software development company',
    industry: 'Software Development',
    location: 'Sofia, Bulgaria',
    website: 'https://techcorp.com',
    technologies: ['React', 'Node.js', 'AWS', 'Docker'],
    benefits: ['Health insurance', 'Training budget', 'Team events'],
    values: ['Quality', 'Innovation', 'Teamwork'],
    workEnvironment: 'Modern office with flexible working arrangements',
    pros: ['Modern tech stack', 'Professional development'],
    cons: ['Competitive environment'],
    cultureScore: 8.0,
    workLifeBalance: 7.5,
    careerGrowth: 8.0,
    techCulture: 8.5,
    confidenceScore: 80,
    dataCompleteness: 85,
  };

  beforeEach(async () => {
    // Mock OpenAI
    mockOpenAI = {
      chat: {
        completions: {
          create: jest.fn(),
        },
      },
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => {
              if (key === 'ai') return mockConfig;
              return undefined;
            }),
          },
        },
        {
          provide: RedisService,
          useClass: RedisMockService,
        },
        {
          provide: AiRequestLoggerService,
          useValue: {
            isEnabled: jest.fn().mockReturnValue(false),
            getLogDirectoryPath: jest.fn().mockReturnValue('/tmp/test-logs'),
            logRequest: jest.fn(),
            logResponse: jest.fn(),
            logError: jest.fn(),
          },
        },
        {
          provide: ContentExtractorService,
          useValue: {
            preprocessHtml: jest.fn().mockImplementation((html) => ({
              processedContent: html,
              markdown: html, // Return the processed markdown content
              html: html,     // Fallback to original HTML
              metadata: {
                originalSize: html.length,
                processedSize: html.length,
                compressionRatio: 1.0,
                tokensEstimate: Math.floor(html.length / 4),
                sectionCount: 1,
                language: 'en',
              },
            })),
          },
        },
        {
          provide: AIVacancyService,
          useValue: {
            extractVacancyData: jest.fn(),
          },
        },
        AICompanyService,
        {
          provide: AICoreService,
          useValue: {
            processText: jest.fn(),
            isHealthy: jest.fn().mockReturnValue(true),
            generateContentHash: jest.fn().mockImplementation((content, options) => {
              if (options?.sourceUrl === 'https://dev.bg/company/techcorp/' && content.includes('Company profile content')) {
                return 'profile-hash-123';
              }
              if (options?.sourceUrl === 'https://techcorp.com/about' && content.includes('About TechCorp')) {
                return 'website-hash-456';
              }
              return `test-hash-${content.length}`;
            }),
            getCachedResult: jest.fn().mockResolvedValue(null), // No cache by default
            cleanContent: jest.fn().mockImplementation((content) => content.replace(/<[^>]*>/g, '')), // Simple HTML strip
            assessContentQuality: jest.fn().mockResolvedValue({
              qualityScore: 85,
              hasStructuredData: true,
              language: 'en'
            }),
            callOpenAI: jest.fn().mockImplementation(() => {
              return mockOpenAI.chat.completions.create(...arguments);
            }),
          },
        },
        {
          provide: AIPromptService,
          useValue: {
            buildCompanyProfileMessages: jest.fn().mockImplementation((content, sourceUrl, existingData, isUnstructured) => [
              {
                role: 'user',
                content: `Company profile content about TechCorp`
              }
            ]),
            buildCompanyWebsiteMessages: jest.fn().mockImplementation((content, sourceUrl, existingData, isUnstructured) => [
              {
                role: 'user', 
                content: `About TechCorp website content`
              }
            ]),
          },
        },
      ],
    }).compile();

    service = module.get<AiService>(AiService);
    configService = module.get<jest.Mocked<ConfigService>>(ConfigService);
    redisService = module.get<RedisMockService>(RedisService) as RedisMockService;

    // Replace the OpenAI instance with our mock
    (service as any).openai = mockOpenAI;
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await redisService.flushall();
  });

  describe('analyzeCompanyProfile', () => {
    const testContent = '<html>Company profile content about TechCorp...</html>';
    const sourceUrl = 'https://dev.bg/company/techcorp/';

    it('should successfully analyze company profile', async () => {
      // Arrange
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify(mockCompanyProfileAnalysis),
            },
          },
        ],
      };
      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse as any);

      // Act
      const result = await service.analyzeCompanyProfile(testContent, sourceUrl);

      // Assert
      expect(result).toEqual(mockCompanyProfileAnalysis);
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith({
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: expect.stringContaining('Company profile content about TechCorp'),
          },
        ],
        max_completion_tokens: 2000,
        temperature: 0.3,
        response_format: { type: 'json_object' },
      });
    });

    it('should use cache when available', async () => {
      // Arrange
      const cacheKey = 'company_analysis_profile:profile-hash-123';
      await redisService.set(cacheKey, JSON.stringify(mockCompanyProfileAnalysis), 3600);

      // Act
      const result = await service.analyzeCompanyProfile(testContent, sourceUrl);

      // Assert
      expect(result).toEqual(mockCompanyProfileAnalysis);
      expect(mockOpenAI.chat.completions.create).not.toHaveBeenCalled();
    });

    it('should skip cache when skipCache option is true', async () => {
      // Arrange
      const cacheKey = 'company_analysis_profile:test-hash-36-49';
      await redisService.set(cacheKey, JSON.stringify(mockCompanyProfileAnalysis), 3600);

      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({ ...mockCompanyProfileAnalysis, confidenceScore: 95 }),
            },
          },
        ],
      };
      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse as any);

      // Act
      const result = await service.analyzeCompanyProfile(testContent, sourceUrl, { skipCache: true });

      // Assert
      expect(result?.confidenceScore).toBe(95);
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalled();
    });

    it('should handle GPT-5 Nano model configurations', async () => {
      // Arrange
      configService.get.mockImplementation((key: string) => {
        if (key === 'ai') {
          return {
            ...mockConfig,
            models: {
              ...mockConfig.models,
              scraping: {
                ...mockConfig.models.scraping,
                vacancy: 'gpt-5-nano',
              },
            },
          };
        }
        return undefined;
      });

      // Re-initialize service with new config
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AiService,
          {
            provide: ConfigService,
            useValue: configService,
          },
          {
            provide: RedisService,
            useClass: RedisMockService,
          },
          {
            provide: AiRequestLoggerService,
            useValue: {
              isEnabled: jest.fn().mockReturnValue(false),
              getLogDirectoryPath: jest.fn().mockReturnValue('/tmp/test-logs'),
              logRequest: jest.fn(),
              logResponse: jest.fn(),
              logError: jest.fn(),
            },
          },
          {
            provide: ContentExtractorService,
            useValue: {
              preprocessHtml: jest.fn().mockImplementation((html) => ({
                processedContent: html,
                markdown: html,
                html: html,
                metadata: {
                  originalSize: html.length,
                  processedSize: html.length,
                  compressionRatio: 1.0,
                  tokensEstimate: Math.floor(html.length / 4),
                  sectionCount: 1,
                  language: 'en',
                },
              })),
            },
          },
          {
            provide: AIVacancyService,
            useValue: {
              extractVacancyData: jest.fn(),
            },
          },
          {
            provide: AICompanyService,
            useValue: {
              analyzeCompanyProfile: jest.fn(),
              analyzeCompanyWebsite: jest.fn(),
            },
          },
          {
            provide: AICoreService,
            useValue: {
              processText: jest.fn(),
              isHealthy: jest.fn().mockReturnValue(true),
            },
          },
        ],
      }).compile();

      service = module.get<AiService>(AiService);
      (service as any).openai = mockOpenAI;

      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify(mockCompanyProfileAnalysis),
            },
          },
        ],
      };
      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse as any);

      // Act
      const result = await service.analyzeCompanyProfile(testContent, sourceUrl);

      // Assert
      expect(result).toEqual(mockCompanyProfileAnalysis);
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith({
        model: 'gpt-5-nano',
        messages: [
          {
            role: 'user',
            content: expect.any(String),
          },
        ],
        max_completion_tokens: 2000,
        // Note: No temperature or response_format for GPT-5 Nano
      });
    });

    it('should handle OpenAI API errors gracefully', async () => {
      // Arrange
      mockOpenAI.chat.completions.create.mockRejectedValue(new Error('API rate limit exceeded'));

      // Act
      const result = await service.analyzeCompanyProfile(testContent, sourceUrl);

      // Assert
      expect(result).toBeNull();
    });

    it('should handle invalid JSON responses', async () => {
      // Arrange
      const mockResponse = {
        choices: [
          {
            message: {
              content: 'Invalid JSON response',
            },
          },
        ],
      };
      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse as any);

      // Act
      const result = await service.analyzeCompanyProfile(testContent, sourceUrl);

      // Assert
      expect(result).toBeNull();
    });

    it('should handle missing confidence score in response', async () => {
      // Arrange
      const invalidAnalysis = { ...mockCompanyProfileAnalysis };
      delete (invalidAnalysis as any).confidenceScore;

      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify(invalidAnalysis),
            },
          },
        ],
      };
      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse as any);

      // Act
      const result = await service.analyzeCompanyProfile(testContent, sourceUrl);

      // Assert
      expect(result).toBeNull();
    });

    it('should cache successful analysis results', async () => {
      // Arrange
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify(mockCompanyProfileAnalysis),
            },
          },
        ],
      };
      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse as any);

      // Act
      await service.analyzeCompanyProfile(testContent, sourceUrl);

      // Assert - Check if result was cached
      const cacheKey = 'company_analysis_profile:profile-hash-123';
      const cachedResult = await redisService.get(cacheKey);
      expect(cachedResult).toBeTruthy();
      expect(JSON.parse(cachedResult as string)).toEqual(mockCompanyProfileAnalysis);
    });

    it('should handle long content by truncating', async () => {
      // Arrange
      const longContent = 'x'.repeat(15000); // Exceeds maxContentLength of 10000
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify(mockCompanyProfileAnalysis),
            },
          },
        ],
      };
      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse as any);

      // Act
      const result = await service.analyzeCompanyProfile(longContent, sourceUrl);

      // Assert
      expect(result).toEqual(mockCompanyProfileAnalysis);
      // Should still work even with truncated content
    });
  });

  describe('analyzeCompanyWebsite', () => {
    const testContent = '<html><body>About TechCorp - We are a leading software company...</body></html>';
    const sourceUrl = 'https://techcorp.com/about';

    it('should successfully analyze company website', async () => {
      // Arrange
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify(mockCompanyWebsiteAnalysis),
            },
          },
        ],
      };
      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse as any);

      // Act
      const result = await service.analyzeCompanyWebsite(testContent, sourceUrl);

      // Assert
      expect(result).toEqual(mockCompanyWebsiteAnalysis);
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith({
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: expect.stringContaining('About TechCorp'),
          },
        ],
        max_completion_tokens: 2000,
        temperature: 0.3,
        response_format: { type: 'json_object' },
      });
    });

    it('should use different cache key than company profile', async () => {
      // Arrange
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify(mockCompanyWebsiteAnalysis),
            },
          },
        ],
      };
      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse as any);

      // Act
      await service.analyzeCompanyWebsite(testContent, sourceUrl);

      // Assert
      const cacheKey = 'company_analysis_website:website-hash-456';
      const cachedResult = await redisService.get(cacheKey);
      expect(cachedResult).toBeTruthy();
      expect(JSON.parse(cachedResult as string)).toEqual(mockCompanyWebsiteAnalysis);
    });

    it('should handle caching disabled', async () => {
      // Arrange
      configService.get.mockImplementation((key: string) => {
        if (key === 'ai') {
          return {
            ...mockConfig,
            enableCaching: false,
          };
        }
        return undefined;
      });

      // Re-initialize service
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          AiService,
          {
            provide: ConfigService,
            useValue: configService,
          },
          {
            provide: RedisService,
            useClass: RedisMockService,
          },
          {
            provide: AiRequestLoggerService,
            useValue: {
              isEnabled: jest.fn().mockReturnValue(false),
              getLogDirectoryPath: jest.fn().mockReturnValue('/tmp/test-logs'),
              logRequest: jest.fn(),
              logResponse: jest.fn(),
              logError: jest.fn(),
            },
          },
          {
            provide: ContentExtractorService,
            useValue: {
              preprocessHtml: jest.fn().mockImplementation((html) => ({
                processedContent: html,
                markdown: html,
                html: html,
                metadata: {
                  originalSize: html.length,
                  processedSize: html.length,
                  compressionRatio: 1.0,
                  tokensEstimate: Math.floor(html.length / 4),
                  sectionCount: 1,
                  language: 'en',
                },
              })),
            },
          },
        ],
      }).compile();

      service = module.get<AiService>(AiService);
      (service as any).openai = mockOpenAI;

      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify(mockCompanyWebsiteAnalysis),
            },
          },
        ],
      };
      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse as any);

      // Act
      const result = await service.analyzeCompanyWebsite(testContent, sourceUrl);

      // Assert
      expect(result).toEqual(mockCompanyWebsiteAnalysis);
      
      // Verify no caching occurred
      const cacheKey = 'company_analysis_website:website-hash-456';
      const cachedResult = await redisService.get(cacheKey);
      expect(cachedResult).toBeNull();
    });
  });

  describe('consolidateCompanyAnalysis', () => {
    const companyName = 'TechCorp';

    const mockConsolidatedAnalysis = {
      name: 'TechCorp',
      description: 'Innovative technology company specializing in software development',
      industry: 'Technology',
      size: '51-200',
      location: 'Sofia, Bulgaria',
      website: 'https://techcorp.com',
      employeeCount: 120,
      founded: 2015,
      technologies: ['JavaScript', 'TypeScript', 'React', 'Node.js', 'AWS', 'Docker'],
      benefits: ['Health insurance', 'Flexible hours', 'Remote work', 'Training budget', 'Team events'],
      values: ['Innovation', 'Collaboration', 'Excellence', 'Quality', 'Teamwork'],
      workEnvironment: 'Modern office with flexible working arrangements and great work-life balance',
        growthOpportunities: ['Career advancement', 'Professional development', 'Learning opportunities'],
      pros: ['Great tech stack', 'Good work-life balance', 'Learning opportunities', 'Modern tech stack', 'Professional development'],
      cons: ['Fast-paced environment', 'High expectations', 'Competitive environment'],
      interviewProcess: 'Standard technical and HR interview process',
      cultureScore: 8.5,
      retentionRate: 85.0,
      workLifeBalance: 8.0,
      careerGrowth: 7.8,
      salaryCompetitiveness: 8.2,
      benefitsScore: 8.5,
      techCulture: 8.8,
      recommendationScore: 8.3,
      confidenceScore: 88,
      dataCompleteness: 92,
      sourceDataSummary: 'Analysis consolidated from dev.bg profile and company website data',
    };

    it('should successfully consolidate analysis from both sources', async () => {
      // Arrange
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify(mockConsolidatedAnalysis),
            },
          },
        ],
      };
      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse as any);

      // Act
      const result = await service.consolidateCompanyAnalysis(
        companyName,
        mockCompanyProfileAnalysis,
        mockCompanyWebsiteAnalysis
      );

      // Assert
      expect(result).toEqual(mockConsolidatedAnalysis);
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith({
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: expect.stringMatching(/Consolidate company analysis for TechCorp/),
          },
        ],
        max_completion_tokens: 3000,
        temperature: 0.2,
        response_format: { type: 'json_object' },
      });
    });

    it('should work with only dev.bg data', async () => {
      // Arrange
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify(mockConsolidatedAnalysis),
            },
          },
        ],
      };
      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse as any);

      // Act
      const result = await service.consolidateCompanyAnalysis(
        companyName,
        mockCompanyProfileAnalysis,
        undefined
      );

      // Assert
      expect(result).toEqual(mockConsolidatedAnalysis);
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith({
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: expect.stringContaining('No website data available'),
          },
        ],
        max_completion_tokens: 3000,
        temperature: 0.2,
        response_format: { type: 'json_object' },
      });
    });

    it('should work with only website data', async () => {
      // Arrange
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify(mockConsolidatedAnalysis),
            },
          },
        ],
      };
      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse as any);

      // Act
      const result = await service.consolidateCompanyAnalysis(
        companyName,
        undefined,
        mockCompanyWebsiteAnalysis
      );

      // Assert
      expect(result).toEqual(mockConsolidatedAnalysis);
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith({
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: expect.stringContaining('No dev.bg data available'),
          },
        ],
        max_completion_tokens: 3000,
        temperature: 0.2,
        response_format: { type: 'json_object' },
      });
    });

    it('should return null when no data is provided', async () => {
      // Act
      const result = await service.consolidateCompanyAnalysis(companyName, undefined, undefined);

      // Assert
      expect(result).toBeNull();
      expect(mockOpenAI.chat.completions.create).not.toHaveBeenCalled();
    });

    it('should use consolidated cache key', async () => {
      // Arrange
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify(mockConsolidatedAnalysis),
            },
          },
        ],
      };
      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse as any);

      // Act
      await service.consolidateCompanyAnalysis(
        companyName,
        mockCompanyProfileAnalysis,
        mockCompanyWebsiteAnalysis
      );

      // Assert
      const cacheKey = 'company_analysis_consolidated:consolidated-hash-789';
      const cachedResult = await redisService.get(cacheKey);
      expect(cachedResult).toBeTruthy();
      expect(JSON.parse(cachedResult as string)).toEqual(mockConsolidatedAnalysis);
    });

    it('should handle consolidation errors gracefully', async () => {
      // Arrange
      mockOpenAI.chat.completions.create.mockRejectedValue(new Error('Consolidation failed'));

      // Act
      const result = await service.consolidateCompanyAnalysis(
        companyName,
        mockCompanyProfileAnalysis,
        mockCompanyWebsiteAnalysis
      );

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle Redis cache errors gracefully', async () => {
      // Arrange
      const testContent = '<html>Test content</html>';
      const sourceUrl = 'https://test.com';
      
      // Mock Redis to throw an error
      jest.spyOn(redisService, 'get').mockRejectedValue(new Error('Redis connection failed'));
      
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify(mockCompanyProfileAnalysis),
            },
          },
        ],
      };
      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse as any);

      // Act
      const result = await service.analyzeCompanyProfile(testContent, sourceUrl);

      // Assert
      expect(result).toEqual(mockCompanyProfileAnalysis);
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalled();
    });

    it('should handle empty responses from OpenAI', async () => {
      // Arrange
      const testContent = '<html>Test content</html>';
      const sourceUrl = 'https://test.com';
      
      const mockResponse = {
        choices: [
          {
            message: {
              content: '',
            },
          },
        ],
      };
      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse as any);

      // Act
      const result = await service.analyzeCompanyProfile(testContent, sourceUrl);

      // Assert
      expect(result).toBeNull();
    });

    it('should handle responses with invalid confidence scores', async () => {
      // Arrange
      const testContent = '<html>Test content</html>';
      const sourceUrl = 'https://test.com';
      
      const invalidAnalysis = { ...mockCompanyProfileAnalysis, confidenceScore: 150 }; // Invalid score > 100
      
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify(invalidAnalysis),
            },
          },
        ],
      };
      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse as any);

      // Act
      const result = await service.analyzeCompanyProfile(testContent, sourceUrl);

      // Assert
      expect(result).toBeNull();
    });
  });
});