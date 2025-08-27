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

describe('ApplicationController (e2e)', () => {
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

  describe('GET /api/v1/applications', () => {
    it('should return empty list when no applications exist', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/applications')
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toEqual([]);
      expect(response.body).toHaveProperty('pagination');
      expect(response.body.pagination.total).toBe(0);
    });

    it('should return paginated list of applications', async () => {
      // Arrange: Create test data
      const prisma = DatabaseHelper.getPrismaClient();
      
      // Create company
      await prisma.company.create({
        data: MockDataFactory.createCompanyData({ name: 'Tech Corp' }),
      });

      const company = await prisma.company.findFirst({ where: { name: 'Tech Corp' } });
      
      // Create vacancy
      const vacancy = await prisma.vacancy.create({
        data: MockDataFactory.createVacancyData({ 
          title: 'Java Developer',
          companyId: company.id,
        }),
      });

      // Create applications
      await prisma.application.createMany({
        data: [
          MockDataFactory.createApplicationData({ 
            vacancyId: vacancy.id,
            applicantName: 'John Doe',
            status: 'pending',
          }),
          MockDataFactory.createApplicationData({ 
            vacancyId: vacancy.id,
            applicantName: 'Jane Smith',
            status: 'applied',
          }),
        ],
      });

      // Act & Assert
      const response = await request(app.getHttpServer())
        .get('/api/v1/applications')
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body.data).toHaveLength(2);
      expect(response.body).toHaveProperty('pagination');
      expect(response.body.pagination.total).toBe(2);
      expect(response.body.data[0]).toHaveProperty('applicantName');
      expect(response.body.data[0]).toHaveProperty('status');
      expect(response.body.data[0]).toHaveProperty('vacancy');
    });

    it('should filter applications by status', async () => {
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
        }),
      });

      await prisma.application.createMany({
        data: [
          MockDataFactory.createApplicationData({ 
            vacancyId: vacancy.id,
            applicantName: 'John Doe',
            status: 'pending',
          }),
          MockDataFactory.createApplicationData({ 
            vacancyId: vacancy.id,
            applicantName: 'Jane Smith',
            status: 'approved',
          }),
        ],
      });

      // Act & Assert - filter by pending status
      const response = await request(app.getHttpServer())
        .get('/api/v1/applications')
        .query({ status: 'pending' })
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].status).toBe('pending');
      expect(response.body.data[0].applicantName).toBe('John Doe');
    });
  });

  describe('POST /api/v1/applications', () => {
    it('should create new application', async () => {
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
        }),
      });

      const applicationData = {
        vacancyId: vacancy.id,
        applicantName: 'John Doe',
        applicantEmail: 'john.doe@example.com',
        coverLetter: 'I am interested in this position...',
        resumeUrl: 'https://example.com/resume.pdf',
      };

      // Act & Assert
      const response = await request(app.getHttpServer())
        .post('/api/v1/applications')
        .send(applicationData)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('applicantName', 'John Doe');
      expect(response.body).toHaveProperty('applicantEmail', 'john.doe@example.com');
      expect(response.body).toHaveProperty('status', 'pending');
      expect(response.body).toHaveProperty('vacancy');
    });

    it('should validate required fields when creating application', async () => {
      const incompleteData = {
        applicantName: 'John Doe',
        // Missing required fields
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/applications')
        .send(incompleteData)
        .expect(400);

      expect(response.body).toHaveProperty('statusCode', 400);
      expect(response.body).toHaveProperty('message');
    });

    it('should return 404 when creating application for non-existent vacancy', async () => {
      const applicationData = {
        vacancyId: 'non-existent-id',
        applicantName: 'John Doe',
        applicantEmail: 'john.doe@example.com',
      };

      const response = await request(app.getHttpServer())
        .post('/api/v1/applications')
        .send(applicationData)
        .expect(404);

      expect(response.body).toHaveProperty('statusCode', 404);
    });
  });

  describe('GET /api/v1/applications/:id', () => {
    it('should return application details by ID', async () => {
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
        }),
      });

      const application = await prisma.application.create({
        data: MockDataFactory.createApplicationData({ 
          vacancyId: vacancy.id,
          applicantName: 'John Doe',
          applicantEmail: 'john.doe@example.com',
        }),
      });

      // Act & Assert
      const response = await request(app.getHttpServer())
        .get(`/api/v1/applications/${application.id}`)
        .expect(200);

      expect(response.body).toHaveProperty('id', application.id);
      expect(response.body).toHaveProperty('applicantName', 'John Doe');
      expect(response.body).toHaveProperty('applicantEmail', 'john.doe@example.com');
      expect(response.body).toHaveProperty('vacancy');
      expect(response.body.vacancy).toHaveProperty('title', 'Java Developer');
    });

    it('should return 404 for non-existent application', async () => {
      const nonExistentId = 'non-existent-id';
      
      const response = await request(app.getHttpServer())
        .get(`/api/v1/applications/${nonExistentId}`)
        .expect(404);

      expect(response.body).toHaveProperty('statusCode', 404);
    });
  });

  describe('PUT /api/v1/applications/:id', () => {
    it('should update application status', async () => {
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
        }),
      });

      const application = await prisma.application.create({
        data: MockDataFactory.createApplicationData({ 
          vacancyId: vacancy.id,
          applicantName: 'John Doe',
          status: 'pending',
        }),
      });

      const updateData = {
        status: 'approved',
        notes: 'Great candidate, approved for interview',
      };

      // Act & Assert
      const response = await request(app.getHttpServer())
        .put(`/api/v1/applications/${application.id}`)
        .send(updateData)
        .expect(200);

      expect(response.body).toHaveProperty('id', application.id);
      expect(response.body).toHaveProperty('status', 'approved');
      expect(response.body).toHaveProperty('notes', 'Great candidate, approved for interview');
    });

    it('should return 404 when updating non-existent application', async () => {
      const nonExistentId = 'non-existent-id';
      const updateData = { status: 'approved' };

      const response = await request(app.getHttpServer())
        .put(`/api/v1/applications/${nonExistentId}`)
        .send(updateData)
        .expect(404);

      expect(response.body).toHaveProperty('statusCode', 404);
    });

    it('should validate status transitions', async () => {
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
        }),
      });

      const application = await prisma.application.create({
        data: MockDataFactory.createApplicationData({ 
          vacancyId: vacancy.id,
          applicantName: 'John Doe',
          status: 'rejected',
        }),
      });

      const updateData = {
        status: 'invalid-status',
      };

      // Act & Assert
      const response = await request(app.getHttpServer())
        .put(`/api/v1/applications/${application.id}`)
        .send(updateData)
        .expect(400);

      expect(response.body).toHaveProperty('statusCode', 400);
    });
  });

  describe('DELETE /api/v1/applications/:id', () => {
    it('should delete application', async () => {
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
        }),
      });

      const application = await prisma.application.create({
        data: MockDataFactory.createApplicationData({ 
          vacancyId: vacancy.id,
          applicantName: 'John Doe',
        }),
      });

      // Act & Assert
      const response = await request(app.getHttpServer())
        .delete(`/api/v1/applications/${application.id}`)
        .expect(200);

      expect(response.body).toHaveProperty('message');
      
      // Verify application is deleted
      const deletedApp = await prisma.application.findUnique({
        where: { id: application.id },
      });
      expect(deletedApp).toBeNull();
    });

    it('should return 404 when deleting non-existent application', async () => {
      const nonExistentId = 'non-existent-id';

      const response = await request(app.getHttpServer())
        .delete(`/api/v1/applications/${nonExistentId}`)
        .expect(404);

      expect(response.body).toHaveProperty('statusCode', 404);
    });
  });

  describe('GET /api/v1/applications/stats', () => {
    it('should return application statistics', async () => {
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
        }),
      });

      // Create applications with different statuses
      await prisma.application.createMany({
        data: [
          MockDataFactory.createApplicationData({ 
            vacancyId: vacancy.id,
            status: 'pending',
          }),
          MockDataFactory.createApplicationData({ 
            vacancyId: vacancy.id,
            status: 'approved',
          }),
          MockDataFactory.createApplicationData({ 
            vacancyId: vacancy.id,
            status: 'rejected',
          }),
        ],
      });

      // Act & Assert
      const response = await request(app.getHttpServer())
        .get('/api/v1/applications/stats')
        .expect(200);

      expect(response.body).toHaveProperty('total', 3);
      expect(response.body).toHaveProperty('byStatus');
      expect(response.body.byStatus).toHaveProperty('pending', 1);
      expect(response.body.byStatus).toHaveProperty('approved', 1);
      expect(response.body.byStatus).toHaveProperty('rejected', 1);
    });

    it('should return zero stats when no applications exist', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/applications/stats')
        .expect(200);

      expect(response.body).toHaveProperty('total', 0);
      expect(response.body).toHaveProperty('byStatus');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid UUID format in params', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/applications/invalid-uuid')
        .expect(400);

      expect(response.body).toHaveProperty('statusCode', 400);
    });

    it('should handle malformed JSON in request body', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/applications')
        .set('Content-Type', 'application/json')
        .send('invalid json')
        .expect(400);

      expect(response.body).toHaveProperty('statusCode', 400);
    });
  });
});