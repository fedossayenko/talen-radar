import { DevBgCompanyExtractor } from '../../../src/modules/scraper/services/devbg-company-extractor.service';

describe('DevBgCompanyExtractor', () => {
  let service: DevBgCompanyExtractor;

  beforeEach(() => {
    service = new DevBgCompanyExtractor();
  });

  describe('extractCompanyData', () => {
    it('should extract complete company data from Redis dev.bg page', async () => {
      const html = `
        <html>
          <head>
            <title>Redis - Dev.bg</title>
          </head>
          <body>
            <h1 class="company-name">Redis</h1>
            <div class="company-description">
              <p>Redis is the world's most popular in-memory database.</p>
              <p>We power the most demanding applications with ultra-fast data structures.</p>
            </div>
            <div class="company-info">
              <div class="info-item">
                <span class="label">Industry:</span>
                <span class="value">Database Technology</span>
              </div>
              <div class="info-item">
                <span class="label">Size:</span>
                <span class="value">201-500 employees</span>
              </div>
              <div class="info-item">
                <span class="label">Founded:</span>
                <span class="value">2011</span>
              </div>
              <div class="info-item">
                <span class="label">Location:</span>
                <span class="value">San Francisco, CA</span>
              </div>
            </div>
            <div class="benefits-section">
              <h3>Benefits</h3>
              <ul class="benefits-list">
                <li>Competitive salary</li>
                <li>Remote work options</li>
                <li>Health insurance</li>
                <li>Stock options</li>
              </ul>
            </div>
            <div class="tech-stack">
              <h3>Technologies</h3>
              <div class="tech-tags">
                <span class="tech-tag">Redis</span>
                <span class="tech-tag">C</span>
                <span class="tech-tag">Python</span>
                <span class="tech-tag">Go</span>
                <span class="tech-tag">Kubernetes</span>
                <span class="tech-tag">AWS</span>
              </div>
            </div>
            <div class="company-values">
              <h3>Our Values</h3>
              <ul>
                <li>Performance Excellence</li>
                <li>Open Source Community</li>
                <li>Innovation First</li>
                <li>Customer Success</li>
              </ul>
            </div>
            <div class="job-openings">
              <div class="job-item">Senior Engineer</div>
              <div class="job-item">Product Manager</div>
              <div class="job-item">DevOps Engineer</div>
            </div>
            <div class="awards-section">
              <span class="award">Best Database 2023</span>
              <span class="award">Tech Innovation Award</span>
            </div>
          </body>
        </html>
      `;

      const result = await service.extractCompanyData(html, 'https://dev.bg/company/redis/');

      expect(result).toBeDefined();
      expect(result.name).toBe('Redis');
      expect(result.description).toContain('Redis is the world\'s most popular in-memory database');
      expect(result.industry).toBe('Database Technology');
      expect(result.size).toBe('201-500 employees');
      expect(result.founded).toBe(2011);
      expect(result.location).toBe('San Francisco, CA');
      expect(result.sourceUrl).toBe('https://dev.bg/company/redis/');
      
      expect(result.technologies).toContain('Redis');
      expect(result.technologies).toContain('Python');
      expect(result.technologies).toContain('AWS');
      expect(result.technologies).toHaveLength(6);
      
      expect(result.benefits).toContain('Competitive salary');
      expect(result.benefits).toContain('Remote work options');
      expect(result.benefits).toHaveLength(4);
      
      expect(result.values).toContain('Performance Excellence');
      expect(result.values).toContain('Open Source Community');
      expect(result.values).toHaveLength(4);
      
      expect(result.awards).toContain('Best Database 2023');
      expect(result.awards).toContain('Tech Innovation Award');
      
      expect(result.jobOpenings).toBe(3);
      expect(result.employeeCount).toBe(350); // Midpoint of 201-500
      expect(result.dataCompleteness).toBeGreaterThan(80);
    });

    it('should handle minimal company data gracefully', async () => {
      const html = `
        <html>
          <head><title>MinimalCorp - Dev.bg</title></head>
          <body>
            <h1 class="company-name">MinimalCorp</h1>
            <div class="company-description">
              <p>A small tech company.</p>
            </div>
          </body>
        </html>
      `;

      const result = await service.extractCompanyData(html, 'https://dev.bg/company/minimal/');

      expect(result).toBeDefined();
      expect(result.name).toBe('MinimalCorp');
      expect(result.description).toBe('A small tech company.');
      expect(result.industry).toBeNull();
      expect(result.size).toBeNull();
      expect(result.founded).toBeNull();
      expect(result.location).toBeNull();
      expect(result.technologies).toEqual([]);
      expect(result.benefits).toEqual([]);
      expect(result.values).toEqual([]);
      expect(result.awards).toEqual([]);
      expect(result.jobOpenings).toBe(0);
      expect(result.employeeCount).toBeNull();
      expect(result.dataCompleteness).toBeLessThan(50);
    });

    it('should extract alternative company size formats', async () => {
      const testCases = [
        { input: '1-10 employees', expected: 5 },
        { input: '11-50 employees', expected: 30 },
        { input: '51-200 employees', expected: 125 },
        { input: '201-500 employees', expected: 350 },
        { input: '501-1000 employees', expected: 750 },
        { input: '1000+ employees', expected: 1500 },
        { input: 'Small (1-10)', expected: 5 },
        { input: 'Medium (51-200)', expected: 125 },
        { input: 'Large (500+)', expected: 750 },
      ];

      for (const testCase of testCases) {
        const html = `
          <html>
            <body>
              <h1 class="company-name">TestCorp</h1>
              <div class="company-info">
                <div class="info-item">
                  <span class="label">Size:</span>
                  <span class="value">${testCase.input}</span>
                </div>
              </div>
            </body>
          </html>
        `;

        const result = await service.extractCompanyData(html, 'https://dev.bg/company/test/');
        expect(result.employeeCount).toBe(testCase.expected);
      }
    });

    it('should extract technologies from various selectors', async () => {
      const html = `
        <html>
          <body>
            <h1 class="company-name">TechCorp</h1>
            <div class="tech-stack">
              <span class="tech-tag">JavaScript</span>
              <span class="tech-tag">React</span>
            </div>
            <div class="technologies">
              <div class="technology">Node.js</div>
              <div class="technology">MongoDB</div>
            </div>
            <div class="skills-section">
              <span class="skill">Docker</span>
              <span class="skill">Kubernetes</span>
            </div>
          </body>
        </html>
      `;

      const result = await service.extractCompanyData(html, 'https://dev.bg/company/techcorp/');

      expect(result.technologies).toContain('JavaScript');
      expect(result.technologies).toContain('React');
      expect(result.technologies).toContain('Node.js');
      expect(result.technologies).toContain('MongoDB');
      expect(result.technologies).toContain('Docker');
      expect(result.technologies).toContain('Kubernetes');
      expect(result.technologies).toHaveLength(6);
    });

    it('should handle Bulgarian text and extract meaningful data', async () => {
      const html = `
        <html>
          <body>
            <h1 class="company-name">БГ Технологии</h1>
            <div class="company-description">
              <p>Водеща българска IT компания в областта на финансовите технологии.</p>
            </div>
            <div class="company-info">
              <div class="info-item">
                <span class="label">Индустрия:</span>
                <span class="value">Финансови технологии</span>
              </div>
              <div class="info-item">
                <span class="label">Размер:</span>
                <span class="value">51-200 служители</span>
              </div>
              <div class="info-item">
                <span class="label">Основана:</span>
                <span class="value">2015</span>
              </div>
              <div class="info-item">
                <span class="label">Местоположение:</span>
                <span class="value">София, България</span>
              </div>
            </div>
            <div class="benefits-section">
              <ul>
                <li>Гъвкаво работно време</li>
                <li>Допълнително здравно осигуряване</li>
                <li>Обучения и конференции</li>
              </ul>
            </div>
            <div class="company-values">
              <ul>
                <li>Иновации</li>
                <li>Екипна работа</li>
                <li>Професионално развитие</li>
              </ul>
            </div>
          </body>
        </html>
      `;

      const result = await service.extractCompanyData(html, 'https://dev.bg/company/bg-tech/');

      expect(result.name).toBe('БГ Технологии');
      expect(result.description).toContain('Водеща българска IT компания');
      expect(result.industry).toBe('Финансови технологии');
      expect(result.size).toBe('51-200 служители');
      expect(result.founded).toBe(2015);
      expect(result.location).toBe('София, България');
      expect(result.employeeCount).toBe(125);
      
      expect(result.benefits).toContain('Гъвкаво работно време');
      expect(result.benefits).toContain('Допълнително здравно осигуряване');
      expect(result.benefits).toContain('Обучения и конференции');
      
      expect(result.values).toContain('Иновации');
      expect(result.values).toContain('Екипна работа');
      expect(result.values).toContain('Професионално развитие');
    });

    it('should calculate data completeness score accurately', async () => {
      const testCases = [
        {
          name: 'Complete data',
          html: `
            <html><body>
              <h1 class="company-name">CompleteCorp</h1>
              <div class="company-description"><p>Full description</p></div>
              <div class="company-info">
                <div class="info-item"><span class="label">Industry:</span><span class="value">Tech</span></div>
                <div class="info-item"><span class="label">Size:</span><span class="value">100-500</span></div>
                <div class="info-item"><span class="label">Founded:</span><span class="value">2020</span></div>
                <div class="info-item"><span class="label">Location:</span><span class="value">NYC</span></div>
              </div>
              <div class="benefits-section"><li>Benefit 1</li></div>
              <div class="tech-stack"><span class="tech-tag">Tech1</span></div>
              <div class="company-values"><li>Value 1</li></div>
              <div class="awards-section"><span class="award">Award 1</span></div>
              <div class="job-openings"><div class="job-item">Job 1</div></div>
            </body></html>
          `,
          expectedCompleteness: 100
        },
        {
          name: 'Minimal data',
          html: `
            <html><body>
              <h1 class="company-name">MinimalCorp</h1>
            </body></html>
          `,
          expectedCompleteness: 10
        },
        {
          name: 'Partial data',
          html: `
            <html><body>
              <h1 class="company-name">PartialCorp</h1>
              <div class="company-description"><p>Some description</p></div>
              <div class="company-info">
                <div class="info-item"><span class="label">Industry:</span><span class="value">Tech</span></div>
              </div>
              <div class="tech-stack"><span class="tech-tag">JavaScript</span></div>
            </body></html>
          `,
          expectedCompleteness: 40
        }
      ];

      for (const testCase of testCases) {
        const result = await service.extractCompanyData(testCase.html, 'https://dev.bg/company/test/');
        expect(result.dataCompleteness).toBe(testCase.expectedCompleteness);
      }
    });

    it('should handle malformed HTML gracefully', async () => {
      const malformedHtml = `
        <html>
          <body>
            <h1 class="company-name">BrokenCorp
            <div class="company-description">
              <p>Missing closing tags
            <div class="unclosed-div"
              Some content
        </html>
      `;

      expect(async () => {
        await service.extractCompanyData(malformedHtml, 'https://dev.bg/company/broken/');
      }).not.toThrow();

      const result = await service.extractCompanyData(malformedHtml, 'https://dev.bg/company/broken/');
      expect(result).toBeDefined();
      expect(result.name).toBe('BrokenCorp');
    });

    it('should handle empty or invalid HTML', async () => {
      const testCases = ['', '<html></html>', '<div>No company data</div>', 'Plain text'];

      for (const html of testCases) {
        const result = await service.extractCompanyData(html, 'https://dev.bg/company/test/');
        expect(result).toBeDefined();
        expect(result.name).toBeFalsy();
        expect(result.dataCompleteness).toBeLessThan(20);
      }
    });
  });

  describe('private helper methods', () => {
    describe('extractEmployeeCount', () => {
      it('should extract employee count from various formats', () => {
        const testCases = [
          { input: '1-10 employees', expected: 5 },
          { input: '11-50', expected: 30 },
          { input: 'Small (1-10)', expected: 5 },
          { input: 'Medium company (51-200)', expected: 125 },
          { input: 'Large (500+)', expected: 750 },
          { input: '1000+ employees', expected: 1500 },
          { input: 'Startup', expected: 15 },
          { input: 'Enterprise', expected: 1500 },
          { input: 'Unknown size', expected: null },
        ];

        testCases.forEach(testCase => {
          const result = service['extractEmployeeCount'](testCase.input);
          expect(result).toBe(testCase.expected);
        });
      });
    });

    describe('calculateDataCompleteness', () => {
      it('should calculate completeness based on available fields', () => {
        const completeData = {
          name: 'Test',
          description: 'Desc',
          website: 'https://test.com',
          logo: 'https://test.com/logo.png',
          employees: { global: 100, bulgaria: 50, it: 30 },
          founded: 2020,
          industry: 'Tech',
          companySize: 'medium',
          jobOpenings: 5,
          technologies: ['JS'],
          benefits: ['Benefit'],
          values: ['Value'],
          awards: ['Best Employer 2023'],
          locations: { headquarters: 'Sofia', offices: ['Sofia'] },
          workModel: 'Hybrid',
          workingHours: 'flexible',
          socialLinks: { linkedin: 'https://linkedin.com/company/test', facebook: null, instagram: null, youtube: null, twitter: null, github: null },
          contactInfo: { email: 'contact@test.com', phone: null, address: null },
          extractionMetadata: { extractedAt: new Date(), sourceUrl: 'https://test.com', dataCompleteness: 100, structuredDataFound: true }
        };

        const partialData = {
          name: 'Test',
          description: 'Desc',
          website: null,
          logo: null,
          employees: { global: null, bulgaria: null, it: null },
          founded: null,
          industry: null,
          companySize: null,
          jobOpenings: 0,
          technologies: [],
          benefits: [],
          values: [],
          awards: [],
          locations: { headquarters: null, offices: [] },
          workModel: null,
          workingHours: null,
          socialLinks: { linkedin: null, facebook: null, instagram: null, youtube: null, twitter: null, github: null },
          contactInfo: { email: null, phone: null, address: null },
          extractionMetadata: { extractedAt: new Date(), sourceUrl: 'https://test.com', dataCompleteness: 15, structuredDataFound: false }
        };

        const minimalData = {
          name: 'Test',
          description: null,
          website: null,
          logo: null,
          employees: { global: null, bulgaria: null, it: null },
          founded: null,
          industry: null,
          companySize: null,
          jobOpenings: 0,
          technologies: [],
          benefits: [],
          values: [],
          awards: [],
          locations: { headquarters: null, offices: [] },
          workModel: null,
          workingHours: null,
          socialLinks: { linkedin: null, facebook: null, instagram: null, youtube: null, twitter: null, github: null },
          contactInfo: { email: null, phone: null, address: null },
          extractionMetadata: { extractedAt: new Date(), sourceUrl: 'https://test.com', dataCompleteness: 8, structuredDataFound: false }
        };

        expect(service['calculateDataCompleteness'](completeData)).toBe(100);
        expect(service['calculateDataCompleteness'](partialData)).toBe(15);
        expect(service['calculateDataCompleteness'](minimalData)).toBe(8);
      });
    });
  });
});