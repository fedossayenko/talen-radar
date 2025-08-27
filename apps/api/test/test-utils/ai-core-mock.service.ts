import { Injectable, Logger } from '@nestjs/common';

/**
 * Mock AICoreService for testing
 */
@Injectable()
export class AICoreServiceMock {
  private readonly logger = new Logger('AICoreServiceMock');

  async processText(_request: any): Promise<any> {
    this.logger.log('Mock AI processing text');
    
    return {
      success: true,
      result: {
        extractedData: {
          title: 'Mock Job Title',
          company: 'Mock Company',
          technologies: ['Java', 'Spring Boot'],
          location: 'Sofia, Bulgaria',
        },
        confidence: 0.95,
      },
      metadata: {
        model: 'mock-model',
        tokens: 100,
        processingTime: 500,
      },
    };
  }

  async extractVacancyData(content: string, url: string): Promise<any> {
    this.logger.log(`Mock extracting vacancy data from ${url}`);
    
    return {
      title: 'Senior Java Developer',
      company: 'Tech Company Ltd',
      location: 'Sofia, Bulgaria',
      description: content.slice(0, 200) + '...',
      requirements: ['Java 8+', 'Spring Framework', 'MySQL'],
      benefits: ['Remote work', 'Health insurance'],
      salary: {
        min: 4000,
        max: 6000,
        currency: 'BGN',
      },
      type: 'Full-time',
      level: 'Senior',
      technologies: ['java', 'spring', 'mysql'],
    };
  }

  async analyzeCompany(companyData: any): Promise<any> {
    this.logger.log(`Mock analyzing company: ${companyData.name}`);
    
    return {
      analysis: {
        industry: 'Technology',
        size: 'Mid-size',
        culture: 'Innovation-focused',
        techStack: ['Java', 'React', 'PostgreSQL'],
        benefits: ['Flexible hours', 'Remote work'],
      },
      scores: {
        overall: 85,
        technology: 90,
        culture: 80,
        benefits: 85,
        growth: 88,
      },
      recommendations: [
        'Great for Java developers',
        'Strong technical culture',
        'Good work-life balance',
      ],
    };
  }

  async generateEmbedding(_text: string): Promise<number[]> {
    this.logger.log('Mock generating embedding');
    // Return a mock embedding vector
    return Array.from({ length: 512 }, () => Math.random() - 0.5);
  }

  async calculateSimilarity(_embedding1: number[], _embedding2: number[]): Promise<number> {
    this.logger.log('Mock calculating similarity');
    return 0.75; // Mock similarity score
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }

  async getStatus(): Promise<any> {
    return {
      service: 'mock-ai',
      status: 'healthy',
      models: ['mock-model-1', 'mock-model-2'],
      lastUsed: new Date(),
    };
  }
}

/**
 * Mock AiRequestLoggerService for testing
 */
@Injectable()
export class AiRequestLoggerServiceMock {
  private readonly logger = new Logger('AiRequestLoggerServiceMock');

  async logRequest(method: string, _request: any, _response?: any): Promise<void> {
    this.logger.log(`Mock logging AI request: ${method}`);
  }

  async logError(method: string, request: any, error: any): Promise<void> {
    this.logger.log(`Mock logging AI error: ${method} - ${error.message}`);
  }

  async getStats(): Promise<any> {
    return {
      totalRequests: 100,
      successfulRequests: 95,
      failedRequests: 5,
      averageResponseTime: 1200,
      lastRequest: new Date(),
    };
  }
}