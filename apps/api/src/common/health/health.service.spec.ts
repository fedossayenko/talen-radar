import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { HealthService } from './health.service';
import { PrismaService } from '../database/prisma.service';
import { RedisService } from '../redis/redis.service';

describe('HealthService', () => {
  let service: HealthService;
  let prismaService: jest.Mocked<PrismaService>;
  let redisService: jest.Mocked<RedisService>;
  let loggerSpy: jest.SpyInstance;

  beforeEach(async () => {
    // Mock Logger
    loggerSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    // Mock PrismaService
    const mockPrismaService = {
      healthCheck: jest.fn(),
      getStats: jest.fn(),
    };

    // Mock RedisService
    const mockRedisService = {
      healthCheck: jest.fn(),
      getInfo: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HealthService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    service = module.get<HealthService>(HealthService);
    prismaService = module.get(PrismaService);
    redisService = module.get(RedisService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getHealthStatus', () => {
    it('should return healthy status when all services are ok', async () => {
      prismaService.healthCheck.mockResolvedValue(true);
      redisService.healthCheck.mockResolvedValue(true);

      const result = await service.getHealthStatus();

      expect(result.status).toBe('ok');
      expect(result.services.database).toBe('ok');
      expect(result.services.redis).toBe('ok');
      expect(result.timestamp).toBeDefined();
      expect(result.version).toBeDefined();
      expect(result.uptime).toBeDefined();
    });

    it('should return error status when database is down', async () => {
      prismaService.healthCheck.mockResolvedValue(false);
      redisService.healthCheck.mockResolvedValue(true);

      const result = await service.getHealthStatus();

      expect(result.status).toBe('error');
      expect(result.services.database).toBe('error');
      expect(result.services.redis).toBe('ok');
    });

    it('should return error status when redis is down', async () => {
      prismaService.healthCheck.mockResolvedValue(true);
      redisService.healthCheck.mockResolvedValue(false);

      const result = await service.getHealthStatus();

      expect(result.status).toBe('error');
      expect(result.services.database).toBe('ok');
      expect(result.services.redis).toBe('error');
    });

    it('should return error status when both services are down', async () => {
      prismaService.healthCheck.mockResolvedValue(false);
      redisService.healthCheck.mockResolvedValue(false);

      const result = await service.getHealthStatus();

      expect(result.status).toBe('error');
      expect(result.services.database).toBe('error');
      expect(result.services.redis).toBe('error');
    });

    it('should handle database health check rejection', async () => {
      prismaService.healthCheck.mockRejectedValue(new Error('Database connection failed'));
      redisService.healthCheck.mockResolvedValue(true);

      const result = await service.getHealthStatus();

      expect(result.status).toBe('error');
      expect(result.services.database).toBe('error');
      expect(result.services.redis).toBe('ok');
    });

    it('should handle redis health check rejection', async () => {
      prismaService.healthCheck.mockResolvedValue(true);
      redisService.healthCheck.mockRejectedValue(new Error('Redis connection failed'));

      const result = await service.getHealthStatus();

      expect(result.status).toBe('error');
      expect(result.services.database).toBe('ok');
      expect(result.services.redis).toBe('error');
    });

    it('should handle global errors gracefully', async () => {
      // Mock process.uptime to throw an error
      const originalUptime = process.uptime;
      process.uptime = jest.fn().mockImplementation(() => {
        throw new Error('Process error');
      });

      const result = await service.getHealthStatus();

      expect(result.status).toBe('error');
      expect(result.error).toBe('Health check failed');
      expect(result.services.database).toBe('unknown');
      expect(result.services.redis).toBe('unknown');
      expect(loggerSpy).toHaveBeenCalledWith('Health check failed:', expect.any(Error));

      // Restore original function
      process.uptime = originalUptime;
    });

    it('should include version from environment variable', async () => {
      const originalVersion = process.env.npm_package_version;
      process.env.npm_package_version = '1.2.3';

      prismaService.healthCheck.mockResolvedValue(true);
      redisService.healthCheck.mockResolvedValue(true);

      const result = await service.getHealthStatus();

      expect(result.version).toBe('1.2.3');

      // Restore original value
      if (originalVersion) {
        process.env.npm_package_version = originalVersion;
      } else {
        delete process.env.npm_package_version;
      }
    });

    it('should use default version when environment variable is not set', async () => {
      const originalVersion = process.env.npm_package_version;
      delete process.env.npm_package_version;

      prismaService.healthCheck.mockResolvedValue(true);
      redisService.healthCheck.mockResolvedValue(true);

      const result = await service.getHealthStatus();

      expect(result.version).toBe('0.1.0');

      // Restore original value
      if (originalVersion) {
        process.env.npm_package_version = originalVersion;
      }
    });
  });

  describe('getDetailedHealth', () => {
    it('should return detailed health with all services healthy', async () => {
      prismaService.healthCheck.mockResolvedValue(true);
      redisService.healthCheck.mockResolvedValue(true);

      const mockDbStats = {
        tables: [{
          schemaname: 'public',
          tablename: 'users',
          inserts: '100',
          updates: '50',
          deletes: '5',
          live_tuples: '95',
          dead_tuples: '5'
        }],
        connections: {
          total_connections: '5',
          active_connections: '2',
          idle_connections: '3'
        },
        timestamp: new Date().toISOString(),
      };
      const mockRedisInfo = {
        server: { redis_version: '6.0.0' },
        memory: { used_memory: 1024 },
        clients: { connected_clients: 5 },
      };

      prismaService.getStats.mockResolvedValue(mockDbStats);
      redisService.getInfo.mockResolvedValue(mockRedisInfo);

      const result = await service.getDetailedHealth();

      expect(result.status).toBe('ok');
      expect(result.details.database).toEqual(mockDbStats);
      expect(result.details.redis).toEqual(mockRedisInfo);
      expect(result.details.memory).toMatchObject({
        rss: expect.stringMatching(/\d+ MB/),
        heapTotal: expect.stringMatching(/\d+ MB/),
        heapUsed: expect.stringMatching(/\d+ MB/),
        external: expect.stringMatching(/\d+ MB/),
        arrayBuffers: expect.stringMatching(/\d+ MB/),
      });
      expect(result.details.environment).toMatchObject({
        nodeVersion: expect.any(String),
        platform: expect.any(String),
        arch: expect.any(String),
        environment: expect.any(String),
      });
    });

    it('should handle database stats failure gracefully', async () => {
      prismaService.healthCheck.mockResolvedValue(true);
      redisService.healthCheck.mockResolvedValue(true);

      prismaService.getStats.mockRejectedValue(new Error('Stats failed'));
      redisService.getInfo.mockResolvedValue({ server: { redis_version: '6.0.0' } });

      const result = await service.getDetailedHealth();

      expect(result.status).toBe('ok');
      expect(result.details.database).toEqual({ error: 'Failed to get stats' });
      expect(result.details.redis).toMatchObject({ server: { redis_version: '6.0.0' } });
    });

    it('should handle redis info failure gracefully', async () => {
      prismaService.healthCheck.mockResolvedValue(true);
      redisService.healthCheck.mockResolvedValue(true);

      prismaService.getStats.mockResolvedValue({ 
        tables: [],
        connections: [{ total_connections: 1, active_connections: 1, idle_connections: 0 }],
        database_size: [{ size: '0 MB' }]
      });
      redisService.getInfo.mockRejectedValue(new Error('Info failed'));

      const result = await service.getDetailedHealth();

      expect(result.status).toBe('ok');
      expect(result.details.database).toEqual({ 
        tables: [],
        connections: [{ total_connections: 1, active_connections: 1, idle_connections: 0 }],
        database_size: [{ size: '0 MB' }]
      });
      expect(result.details.redis).toEqual({ error: 'Failed to get stats' });
    });

    it('should handle global detailed health check failure', async () => {
      prismaService.healthCheck.mockResolvedValue(true);
      redisService.healthCheck.mockResolvedValue(true);

      // Mock process.memoryUsage to throw an error
      const originalMemoryUsage = process.memoryUsage;
      (process.memoryUsage as unknown as jest.Mock) = jest.fn().mockImplementation(() => {
        throw new Error('Memory usage error');
      });

      const result = await service.getDetailedHealth();

      expect(result.status).toBe('ok'); // Basic health should still work
      expect(result.details.error).toBe('Failed to get detailed health information');
      expect(loggerSpy).toHaveBeenCalledWith('Detailed health check failed:', expect.any(Error));

      // Restore original function
      process.memoryUsage = originalMemoryUsage;
    });

    it('should include environment information correctly', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'test';

      prismaService.healthCheck.mockResolvedValue(true);
      redisService.healthCheck.mockResolvedValue(true);
      prismaService.getStats.mockResolvedValue({ 
        tables: [],
        connections: [{ total_connections: 1, active_connections: 1, idle_connections: 0 }],
        database_size: [{ size: '0 MB' }]
      });
      redisService.getInfo.mockResolvedValue({ server: {} });

      const result = await service.getDetailedHealth();

      expect(result.details.environment.environment).toBe('test');
      expect(result.details.environment.nodeVersion).toBe(process.version);
      expect(result.details.environment.platform).toBe(process.platform);
      expect(result.details.environment.arch).toBe(process.arch);

      // Restore original value
      if (originalEnv) {
        process.env.NODE_ENV = originalEnv;
      } else {
        delete process.env.NODE_ENV;
      }
    });

    it('should use default environment when NODE_ENV is not set', async () => {
      const originalEnv = process.env.NODE_ENV;
      delete process.env.NODE_ENV;

      prismaService.healthCheck.mockResolvedValue(true);
      redisService.healthCheck.mockResolvedValue(true);
      prismaService.getStats.mockResolvedValue({ 
        tables: [],
        connections: [{ total_connections: 1, active_connections: 1, idle_connections: 0 }],
        database_size: [{ size: '0 MB' }]
      });
      redisService.getInfo.mockResolvedValue({ server: {} });

      const result = await service.getDetailedHealth();

      expect(result.details.environment.environment).toBe('development');

      // Restore original value
      if (originalEnv) {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });

  describe('Private Health Check Methods', () => {
    it('should check database health and handle success', async () => {
      prismaService.healthCheck.mockResolvedValue(true);

      // Access private method through any cast
      const result = await (service as any).checkDatabase();

      expect(result).toBe(true);
      expect(prismaService.healthCheck).toHaveBeenCalled();
    });

    it('should check database health and handle failure', async () => {
      const error = new Error('Database error');
      prismaService.healthCheck.mockRejectedValue(error);

      const result = await (service as any).checkDatabase();

      expect(result).toBe(false);
      expect(loggerSpy).toHaveBeenCalledWith('Database health check failed:', error);
    });

    it('should check redis health and handle success', async () => {
      redisService.healthCheck.mockResolvedValue(true);

      const result = await (service as any).checkRedis();

      expect(result).toBe(true);
      expect(redisService.healthCheck).toHaveBeenCalled();
    });

    it('should check redis health and handle failure', async () => {
      const error = new Error('Redis error');
      redisService.healthCheck.mockRejectedValue(error);

      const result = await (service as any).checkRedis();

      expect(result).toBe(false);
      expect(loggerSpy).toHaveBeenCalledWith('Redis health check failed:', error);
    });

    it('should get database stats and handle success', async () => {
      const mockStats = { 
        tables: [],
        connections: {
          total_connections: '1',
          active_connections: '1',
          idle_connections: '0'
        },
        timestamp: new Date().toISOString()
      };
      prismaService.getStats.mockResolvedValue(mockStats);

      const result = await (service as any).getDatabaseStats();

      expect(result).toEqual(mockStats);
      expect(prismaService.getStats).toHaveBeenCalled();
    });

    it('should get database stats and handle failure', async () => {
      const error = new Error('Stats error');
      prismaService.getStats.mockRejectedValue(error);

      await expect((service as any).getDatabaseStats()).rejects.toThrow('Stats error');
      expect(loggerSpy).toHaveBeenCalledWith('Failed to get database stats:', error);
    });

    it('should get redis stats and handle success', async () => {
      const mockInfo = { server: { redis_version: '6.0.0' } };
      redisService.getInfo.mockResolvedValue(mockInfo);

      const result = await (service as any).getRedisStats();

      expect(result).toEqual(mockInfo);
      expect(redisService.getInfo).toHaveBeenCalled();
    });

    it('should get redis stats and handle failure', async () => {
      const error = new Error('Info error');
      redisService.getInfo.mockRejectedValue(error);

      await expect((service as any).getRedisStats()).rejects.toThrow('Info error');
      expect(loggerSpy).toHaveBeenCalledWith('Failed to get Redis stats:', error);
    });
  });

  describe('Memory Usage Calculation', () => {
    it('should calculate memory usage correctly', () => {
      const mockMemoryUsage = {
        rss: 52428800, // 50 MB
        heapTotal: 31457280, // 30 MB
        heapUsed: 20971520, // 20 MB
        external: 10485760, // 10 MB
        arrayBuffers: 5242880, // 5 MB
      };

      // Mock process.memoryUsage
      const originalMemoryUsage = process.memoryUsage;
      (process.memoryUsage as unknown as jest.Mock) = jest.fn().mockReturnValue(mockMemoryUsage);

      const result = (service as any).getMemoryUsage();

      expect(result).toEqual({
        rss: '50 MB',
        heapTotal: '30 MB',
        heapUsed: '20 MB',
        external: '10 MB',
        arrayBuffers: '5 MB',
      });

      // Restore original function
      process.memoryUsage = originalMemoryUsage;
    });

    it('should handle fractional MB values correctly', () => {
      const mockMemoryUsage = {
        rss: 1572864, // 1.5 MB
        heapTotal: 1048576, // 1 MB
        heapUsed: 524288, // 0.5 MB
        external: 262144, // 0.25 MB
        arrayBuffers: 131072, // 0.125 MB
      };

      const originalMemoryUsage = process.memoryUsage;
      (process.memoryUsage as unknown as jest.Mock) = jest.fn().mockReturnValue(mockMemoryUsage);

      const result = (service as any).getMemoryUsage();

      expect(result).toEqual({
        rss: '2 MB', // Rounded up from 1.5
        heapTotal: '1 MB',
        heapUsed: '1 MB', // Rounded up from 0.5
        external: '0 MB', // Rounded down from 0.25
        arrayBuffers: '0 MB', // Rounded down from 0.125
      });

      process.memoryUsage = originalMemoryUsage;
    });
  });

  describe('Error Logging', () => {
    it('should log errors for failed health checks', async () => {
      const dbError = new Error('Database connection lost');
      const redisError = new Error('Redis timeout');

      prismaService.healthCheck.mockRejectedValue(dbError);
      redisService.healthCheck.mockRejectedValue(redisError);

      await service.getHealthStatus();

      expect(loggerSpy).toHaveBeenCalledWith('Database health check failed:', dbError);
      expect(loggerSpy).toHaveBeenCalledWith('Redis health check failed:', redisError);
    });

    it('should log errors for failed detailed checks', async () => {
      prismaService.healthCheck.mockResolvedValue(true);
      redisService.healthCheck.mockResolvedValue(true);

      const statsError = new Error('Stats query failed');
      prismaService.getStats.mockRejectedValue(statsError);
      redisService.getInfo.mockResolvedValue({});

      await service.getDetailedHealth();

      // Stats errors are logged for debugging purposes even though handled gracefully
      expect(loggerSpy).toHaveBeenCalledWith('Failed to get database stats:', statsError);
    });
  });

  describe('Concurrent Health Checks', () => {
    it('should handle concurrent health checks efficiently', async () => {
      prismaService.healthCheck.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve(true), 100))
      );
      redisService.healthCheck.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve(true), 150))
      );

      const startTime = Date.now();
      await service.getHealthStatus();
      const endTime = Date.now();

      // Should take about 150ms (longest service) not 250ms (sum of both)
      expect(endTime - startTime).toBeLessThan(200);
      expect(endTime - startTime).toBeGreaterThan(140);
    });

    it('should handle concurrent detailed checks efficiently', async () => {
      prismaService.healthCheck.mockResolvedValue(true);
      redisService.healthCheck.mockResolvedValue(true);

      prismaService.getStats.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({ 
          tables: [],
          connections: [{ total_connections: 1, active_connections: 1, idle_connections: 0 }],
          database_size: [{ size: '0 MB' }]
        }), 100))
      );
      redisService.getInfo.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({ server: {} }), 120))
      );

      const startTime = Date.now();
      await service.getDetailedHealth();
      const endTime = Date.now();

      // Should take about 120ms (longest service) not 220ms (sum of both)
      expect(endTime - startTime).toBeLessThan(180);
      expect(endTime - startTime).toBeGreaterThan(100);
    });
  });
});