export interface PaidScrapingOptions {
  url: string;
  siteName: string;
  render?: boolean;
  timeout?: number;
  retries?: number;
  session?: string;
  premium?: boolean;
  countryCode?: string;
}

export interface PaidScrapingResponse {
  html: string;
  success: boolean;
  credits: number;
  service: string;
  processingTime: number;
  error?: string;
  metadata?: {
    originalUrl: string;
    finalUrl: string;
    statusCode: number;
    responseHeaders?: Record<string, string>;
    proxyCountry?: string;
    limitation?: 'premium_required' | 'protected_domain' | string;
  };
}

export interface CreditUsage {
  service: string;
  site: string;
  credits: number;
  timestamp: Date;
  successful: boolean;
  url?: string;
}

export interface CreditTracker {
  id: string;
  service: string;
  year: number;
  month: number;
  creditsUsed: number;
  creditsLimit: number;
  requestCount: number;
  successfulRequests: number;
  lastUsed: Date;
  lastReset: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ServiceLimits {
  scraperapi: {
    monthly: number;
    daily: number;
    remaining: number;
  };
  scrapingdog: {
    trial: number;
    used: number;
    remaining: number;
  };
}

export interface PaidServiceStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalCredits: number;
  averageCreditsPerRequest: number;
  successRate: number;
  serviceBreakdown: {
    [serviceName: string]: {
      requests: number;
      credits: number;
      successRate: number;
    };
  };
  siteBreakdown: {
    [siteName: string]: {
      requests: number;
      credits: number;
      averageCreditsPerRequest: number;
    };
  };
}

export interface FallbackConfig {
  enableFallback: boolean;
  maxRetries: number;
  retryDelays: number[];
  services: string[];
  creditLimits: {
    [service: string]: number;
  };
}

export interface ScraperAPIResponse {
  // Raw response from ScraperAPI
  content?: string;
  statusCode?: number;
  url?: string;
  error?: string;
  credits_remaining?: number;
}

export interface ScrapingDogResponse {
  // Raw response from ScrapingDog
  html?: string;
  status?: number;
  url?: string;
  error?: string;
}