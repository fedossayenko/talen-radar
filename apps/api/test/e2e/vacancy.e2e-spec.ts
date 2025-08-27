import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import helmet from 'helmet';
import compression from 'compression';
import { AppModule } from '../../src/app.module';
import { RedisService } from '../../src/common/redis/redis.service';
import { RedisMockService } from '../test-utils/redis-mock.service';
import { AICoreService } from '../../src/modules/ai/services/ai-core.service';
import { AiRequestLoggerService } from '../../src/common/ai-logging/ai-request-logger.service';
import { AICoreServiceMock, AiRequestLoggerServiceMock } from '../test-utils/ai-core-mock.service';
import { MockDataFactory } from '../test-utils/mock-data.factory';
import { DatabaseHelper } from '../test-utils/database.helper';

describe('VacancyController (e2e)', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
    .overrideProvider(RedisService)
    .useClass(RedisMockService)
    .overrideProvider(AICoreService)
    .useClass(AICoreServiceMock)
    .overrideProvider(AiRequestLoggerService)
    .useClass(AiRequestLoggerServiceMock)
    .compile();

    app = moduleRef.createNestApplication();
    
    if (!app) {
      throw new Error('Failed to create NestJS application for testing');
    }
    
    // Configure the app like in main.ts for tests
    app.use(helmet());
    app.use(compression());
    
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );
    
    app.setGlobalPrefix('api/v1');
    app.enableCors({
      origin: true, // Allow all origins in test environment
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    });
    
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (moduleRef) {
      await moduleRef.close();
    }
  });

  beforeEach(async () => {
    await DatabaseHelper.clearDatabase();
  });

  describe('GET /api/v1/vacancies', () => {
    it('should return empty list when no vacancies exist', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/vacancies')
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toEqual([]);
      expect(response.body).toHaveProperty('pagination');
      expect(response.body.pagination.total).toBe(0);
    });

    it('should return paginated list of vacancies', async () => {
      // Arrange: Create test vacancies
      const prisma = DatabaseHelper.getPrismaClient();
      
      await prisma.company.create({
        data: MockDataFactory.createCompanyData({ name: 'Tech Corp' }),
      });

      const company = await prisma.company.findFirst({ where: { name: 'Tech Corp' } });
      
      await prisma.vacancy.createMany({
        data: [
          MockDataFactory.createVacancyData({ 
            title: 'Senior Java Developer',
            companyId: company.id,
            technologies: ['java', 'spring', 'mysql'],
          }),
          MockDataFactory.createVacancyData({ 
            title: 'React Frontend Developer',
            companyId: company.id,
            technologies: ['react', 'typescript', 'nodejs'],
          }),
        ],
      });

      // Act & Assert
      const response = await request(app.getHttpServer())
        .get('/api/v1/vacancies')
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveLength(2);
      expect(response.body).toHaveProperty('pagination');
      expect(response.body.pagination.total).toBe(2);
      expect(response.body.data[0]).toHaveProperty('title');
      expect(response.body.data[0]).toHaveProperty('company');
    });

    it('should filter vacancies by search term', async () => {
      // Arrange
      const prisma = DatabaseHelper.getPrismaClient();
      
      await prisma.company.create({
        data: MockDataFactory.createCompanyData({ name: 'Tech Corp' }),
      });

      const company = await prisma.company.findFirst({ where: { name: 'Tech Corp' } });
      
      await prisma.vacancy.createMany({
        data: [
          MockDataFactory.createVacancyData({ 
            title: 'Java Developer',
            companyId: company.id,
            description: 'Java Spring Boot development',
          }),
          MockDataFactory.createVacancyData({ 
            title: 'Python Developer',
            companyId: company.id,
            description: 'Django and Flask development',
          }),
        ],
      });

      // Act & Assert - search for Java
      const response = await request(app.getHttpServer())
        .get('/api/v1/vacancies')
        .query({ search: 'java' })
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].title).toBe('Java Developer');
    });

    it('should filter vacancies by technologies', async () => {
      // Arrange
      const prisma = DatabaseHelper.getPrismaClient();
      
      await prisma.company.create({
        data: MockDataFactory.createCompanyData({ name: 'Tech Corp' }),
      });

      const company = await prisma.company.findFirst({ where: { name: 'Tech Corp' } });
      
      await prisma.vacancy.createMany({
        data: [
          MockDataFactory.createVacancyData({ 
            title: 'Java Developer',
            companyId: company.id,
            technologies: ['java', 'spring'],
          }),
          MockDataFactory.createVacancyData({ 
            title: 'React Developer',
            companyId: company.id,
            technologies: ['react', 'javascript'],
          }),
        ],
      });

      // Act & Assert
      const response = await request(app.getHttpServer())
        .get('/api/v1/vacancies')
        .query({ technologies: 'java' })
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].technologies).toContain('java');
    });

    it('should filter vacancies by location', async () => {
      // Arrange
      const prisma = DatabaseHelper.getPrismaClient();
      
      await prisma.company.create({
        data: MockDataFactory.createCompanyData({ name: 'Tech Corp' }),
      });

      const company = await prisma.company.findFirst({ where: { name: 'Tech Corp' } });
      
      await prisma.vacancy.createMany({
        data: [
          MockDataFactory.createVacancyData({ 
            title: 'Developer Sofia',
            companyId: company.id,
            location: 'Sofia, Bulgaria',
          }),
          MockDataFactory.createVacancyData({ 
            title: 'Developer Plovdiv',
            companyId: company.id,
            location: 'Plovdiv, Bulgaria',
          }),
        ],
      });

      // Act & Assert
      const response = await request(app.getHttpServer())
        .get('/api/v1/vacancies')
        .query({ location: 'Sofia' })
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].location).toContain('Sofia');
    });

    it('should handle pagination correctly', async () => {
      // Arrange - create more vacancies than default page size
      const prisma = DatabaseHelper.getPrismaClient();
      
      await prisma.company.create({
        data: MockDataFactory.createCompanyData({ name: 'Tech Corp' }),
      });

      const company = await prisma.company.findFirst({ where: { name: 'Tech Corp' } });
      
      // Create 15 vacancies
      for (let i = 1; i <= 15; i++) {
        await prisma.vacancy.create({
          data: MockDataFactory.createVacancyData({ 
            title: `Developer ${i}`,
            companyId: company.id,
          }),
        });
      }

      // Act & Assert - get page 1 with limit 10
      const response = await request(app.getHttpServer())
        .get('/api/v1/vacancies')
        .query({ page: 1, limit: 10 })
        .expect(200);

      expect(response.body.data).toHaveLength(10);
      expect(response.body.pagination).toMatchObject({
        page: 1,
        limit: 10,
        total: 15,
        pages: 2,
      });
    });
  });

  describe('GET /api/v1/vacancies/:id', () => {
    it('should return vacancy details by ID', async () => {
      // Arrange
      const prisma = DatabaseHelper.getPrismaClient();
      
      await prisma.company.create({
        data: MockDataFactory.createCompanyData({ name: 'Tech Corp' }),
      });

      const company = await prisma.company.findFirst({ where: { name: 'Tech Corp' } });
      
      const vacancy = await prisma.vacancy.create({
        data: MockDataFactory.createVacancyData({ 
          title: 'Senior Java Developer',
          companyId: company.id,
          technologies: ['java', 'spring', 'mysql'],
        }),
      });

      // Act & Assert
      const response = await request(app.getHttpServer())
        .get(`/api/v1/vacancies/${vacancy.id}`)
        .expect(200);

      expect(response.body).toHaveProperty('id', vacancy.id);
      expect(response.body).toHaveProperty('title', 'Senior Java Developer');
      expect(response.body).toHaveProperty('company');
      expect(response.body.company).toHaveProperty('name', 'Tech Corp');
      expect(response.body).toHaveProperty('technologies');
      expect(response.body.technologies).toContain('java');
    });

    it('should return 404 for non-existent vacancy', async () => {
      const nonExistentId = 'non-existent-id';
      
      const response = await request(app.getHttpServer())
        .get(`/api/v1/vacancies/${nonExistentId}`)
        .expect(404);

      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('statusCode', 404);
    });
  });

  describe('POST /api/v1/vacancies/:id/score', () => {
    it('should calculate vacancy score based on preferences', async () => {
      // Arrange
      const prisma = DatabaseHelper.getPrismaClient();
      
      await prisma.company.create({
        data: MockDataFactory.createCompanyData({ name: 'Tech Corp' }),
      });

      const company = await prisma.company.findFirst({ where: { name: 'Tech Corp' } });
      
      const vacancy = await prisma.vacancy.create({
        data: MockDataFactory.createVacancyData({ 
          title: 'Java Developer',
          companyId: company.id,
          technologies: ['java', 'spring', 'mysql'],
          experienceLevel: 'Mid-level',
          salary: { min: 4000, max: 6000, currency: 'BGN' },
        }),
      });

      const preferences = {
        technologies: ['java', 'spring'],
        experienceLevel: 'Mid-level',
        salaryExpectation: { min: 3500, max: 7000, currency: 'BGN' },
        location: 'Sofia',
        remoteWork: false,
      };

      // Act & Assert
      const response = await request(app.getHttpServer())
        .post(`/api/v1/vacancies/${vacancy.id}/score`)
        .send(preferences)
        .expect(200);

      expect(response.body).toHaveProperty('score');
      expect(response.body).toHaveProperty('breakdown');
      expect(response.body.score).toBeGreaterThan(0);
      expect(response.body.score).toBeLessThanOrEqual(100);
      expect(response.body.breakdown).toHaveProperty('technologies');
      expect(response.body.breakdown).toHaveProperty('experience');
      expect(response.body.breakdown).toHaveProperty('salary');
    });

    it('should return 404 for non-existent vacancy when scoring', async () => {
      const nonExistentId = 'non-existent-id';
      const preferences = {
        technologies: ['java'],
        experienceLevel: 'Senior',
      };

      const response = await request(app.getHttpServer())
        .post(`/api/v1/vacancies/${nonExistentId}/score`)
        .send(preferences)
        .expect(404);

      expect(response.body).toHaveProperty('statusCode', 404);
    });

    it('should validate scoring request body', async () => {
      const prisma = DatabaseHelper.getPrismaClient();
      
      await prisma.company.create({
        data: MockDataFactory.createCompanyData({ name: 'Tech Corp' }),
      });

      const company = await prisma.company.findFirst({ where: { name: 'Tech Corp' } });
      
      const vacancy = await prisma.vacancy.create({
        data: MockDataFactory.createVacancyData({ 
          title: 'Java Developer',
          companyId: company.id,
        }),
      });

      // Act & Assert - send invalid request body
      const response = await request(app.getHttpServer())
        .post(`/api/v1/vacancies/${vacancy.id}/score`)
        .send({ invalid: 'data' })
        .expect(400);

      expect(response.body).toHaveProperty('statusCode', 400);
    });
  });

  describe('PUT /api/v1/vacancies/:id', () => {
    it('should update vacancy successfully', async () => {
      // Arrange
      const prisma = DatabaseHelper.getPrismaClient();
      
      await prisma.company.create({
        data: MockDataFactory.createCompanyData({ name: 'Tech Corp' }),
      });

      const company = await prisma.company.findFirst({ where: { name: 'Tech Corp' } });
      
      const vacancy = await prisma.vacancy.create({
        data: MockDataFactory.createVacancyData({ 
          title: 'Java Developer',
          companyId: company.id,
          status: 'active',
        }),
      });

      const updateData = {
        title: 'Senior Java Developer',
        status: 'inactive',
      };

      // Act & Assert
      const response = await request(app.getHttpServer())
        .put(`/api/v1/vacancies/${vacancy.id}`)
        .send(updateData)
        .expect(200);

      expect(response.body).toHaveProperty('id', vacancy.id);
      expect(response.body).toHaveProperty('title', 'Senior Java Developer');
      expect(response.body).toHaveProperty('status', 'inactive');
    });

    it('should return 404 when updating non-existent vacancy', async () => {
      const nonExistentId = 'non-existent-id';
      const updateData = { title: 'Updated Title' };

      const response = await request(app.getHttpServer())
        .put(`/api/v1/vacancies/${nonExistentId}`)
        .send(updateData)
        .expect(404);

      expect(response.body).toHaveProperty('statusCode', 404);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid query parameters gracefully', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/vacancies')
        .query({ page: 'invalid', limit: 'invalid' })
        .expect(200); // Should default to valid values

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('pagination');
    });

    it('should handle invalid UUID format in params', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/vacancies/invalid-uuid')
        .expect(400);

      expect(response.body).toHaveProperty('statusCode', 400);
    });
  });
});