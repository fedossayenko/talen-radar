import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';

@Injectable()
export class VacancyService {
  private readonly logger = new Logger(VacancyService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: any) {
    const {
      page = 1,
      limit = 20,
      search,
      technologies,
      location,
      experienceLevel,
      salaryMin,
      salaryMax,
      sortBy = 'createdAt',
      order = 'desc',
    } = query;

    // Convert string parameters to numbers
    const pageNum = parseInt(page as string, 10) || 1;
    const limitNum = parseInt(limit as string, 10) || 20;
    const salaryMinNum = salaryMin ? parseInt(salaryMin as string, 10) : undefined;
    const salaryMaxNum = salaryMax ? parseInt(salaryMax as string, 10) : undefined;

    this.logger.log(`Finding vacancies with filters: ${JSON.stringify(query)}`);

    try {
      // Build filter conditions
      const where: any = {
        status: 'active',
      };

      if (search) {
        where.OR = [
          { title: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ];
      }

      if (technologies && technologies.length > 0) {
        where.technologies = {
          array_contains: Array.isArray(technologies) ? technologies : [technologies]
        };
      }

      if (location) {
        where.location = {
          contains: location,
          mode: 'insensitive',
        };
      }

      if (experienceLevel) {
        where.experienceLevel = experienceLevel;
      }

      if (salaryMinNum || salaryMaxNum) {
        where.AND = where.AND || [];
        if (salaryMinNum) {
          where.AND.push({ salaryMin: { gte: salaryMinNum } });
        }
        if (salaryMaxNum) {
          where.AND.push({ salaryMax: { lte: salaryMaxNum } });
        }
      }

      // Get total count for pagination
      const total = await this.prisma.vacancy.count({ where });

      // Build orderBy for sorting
      let orderBy: any;
      
      if (sortBy === 'score') {
        // Complex sorting for score requires array format
        orderBy = [
          { scores: { _count: order } },
          { createdAt: 'desc' } // Secondary sort for deterministic order
        ];
      } else {
        // Simple object format for other fields
        orderBy = { [sortBy]: order };
      }

      // Get vacancies with pagination
      const vacancies = await this.prisma.vacancy.findMany({
        where,
        include: {
          company: {
            select: {
              id: true,
              name: true,
              size: true,
              industry: true,
              logo: true,
            },
          },
        },
        orderBy,
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      });

      return {
        success: true,
        data: vacancies,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum),
        },
      };
    } catch (error) {
      this.logger.error('Failed to find vacancies:', error);
      throw error;
    }
  }

  async create(createData: any) {
    this.logger.log(`Creating vacancy with data:`, createData);

    try {
      const vacancy = await this.prisma.vacancy.create({
        data: createData,
        include: {
          company: {
            select: {
              id: true,
              name: true,
              logo: true,
            },
          },
        },
      });

      return {
        success: true,
        data: vacancy,
        message: 'Vacancy created successfully',
      };
    } catch (error) {
      this.logger.error('Failed to create vacancy:', error);
      throw error;
    }
  }

  async findOne(id: string) {
    this.logger.log(`Finding vacancy with ID: ${id}`);

    try {
      const vacancy = await this.prisma.vacancy.findUnique({
        where: { id },
        include: {
          company: true,
          scores: {
            orderBy: { scoredAt: 'desc' },
          },
          applications: {
            orderBy: { appliedAt: 'desc' },
            include: {
              cv: {
                select: {
                  id: true,
                  filename: true,
                },
              },
            },
          },
        },
      });

      if (!vacancy) {
        throw new NotFoundException(`Vacancy with ID ${id} not found`);
      }

      return {
        success: true,
        data: vacancy,
      };
    } catch (error) {
      this.logger.error(`Failed to find vacancy ${id}:`, error);
      throw error;
    }
  }

  async update(id: string, updateData: any) {
    this.logger.log(`Updating vacancy ${id} with data:`, updateData);

    try {
      const vacancy = await this.prisma.vacancy.update({
        where: { id },
        data: {
          ...updateData,
          updatedAt: new Date(),
        },
        include: {
          company: {
            select: {
              id: true,
              name: true,
              logo: true,
            },
          },
        },
      });

      return {
        success: true,
        data: vacancy,
        message: 'Vacancy updated successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to update vacancy ${id}:`, error);
      
      if (error.code === 'P2025') {
        throw new NotFoundException(`Vacancy with ID ${id} not found`);
      }
      
      throw error;
    }
  }

  async scoreVacancy(id: string, preferences: any) {
    this.logger.log(`Scoring vacancy ${id} with preferences:`, preferences);

    try {
      // Check if vacancy exists first
      const vacancy = await this.prisma.vacancy.findUnique({
        where: { id },
      });

      if (!vacancy) {
        throw new NotFoundException(`Vacancy with ID ${id} not found`);
      }

      // Placeholder for scoring logic
      // This will be implemented with the AI service
      const mockScore = Math.random() * 100;
      const mockBreakdown = {
        salaryScore: Math.random() * 100,
        techMatchScore: Math.random() * 100,
        companyScore: Math.random() * 100,
        locationScore: Math.random() * 100,
        totalScore: mockScore,
      };

      const updatedVacancy = await this.prisma.vacancy.update({
        where: { id },
        data: {
          updatedAt: new Date(),
        },
      });

      return {
        success: true,
        data: {
          id: updatedVacancy.id,
          score: mockScore,
          scoreBreakdown: mockBreakdown,
        },
        message: 'Vacancy scored successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to score vacancy ${id}:`, error);
      
      if (error.code === 'P2025') {
        throw new NotFoundException(`Vacancy with ID ${id} not found`);
      }
      
      throw error;
    }
  }

  async markDuplicate(duplicateId: string, originalId: string) {
    this.logger.log(`Marking vacancy ${duplicateId} as duplicate of ${originalId}`);

    try {
      // Start a transaction to update both vacancies and create the relationship
      const result = await this.prisma.$transaction(async (tx) => {
        // Mark the duplicate vacancy as duplicate
        const duplicateVacancy = await tx.vacancy.update({
          where: { id: duplicateId },
          data: {
            status: 'duplicate',
            updatedAt: new Date(),
          },
        });


        return duplicateVacancy;
      });

      return {
        success: true,
        data: result,
        message: 'Vacancy marked as duplicate successfully',
      };
    } catch (error) {
      this.logger.error(`Failed to mark vacancy ${duplicateId} as duplicate:`, error);
      
      if (error.code === 'P2025') {
        throw new NotFoundException(`Vacancy not found`);
      }
      
      throw error;
    }
  }
}