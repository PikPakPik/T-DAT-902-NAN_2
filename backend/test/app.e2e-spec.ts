import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

describe('App (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  }, 30_000);

  afterAll(async () => {
    await app?.close();
  });

  it('GET /api', () => {
    return request(app.getHttpServer())
      .get('/api')
      .expect(200)
      .expect('Hello World!');
  });

  it('GET /api/health', () => {
    return request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect((res) => {
        const body = res.body as {
          status: string;
          info: {
            database: { status: string };
            mongodb: { status: string };
          };
        };
        expect(body.status).toBe('ok');
        expect(body.info.database.status).toBe('up');
        expect(body.info.mongodb.status).toBe('up');
      });
  });

  it('POST /graphql ping', () => {
    return request(app.getHttpServer())
      .post('/graphql')
      .send({ query: '{ ping }' })
      .expect(200)
      .expect((res) => {
        const body = res.body as { data: { ping: string } };
        expect(body.data.ping).toBe('pong');
      });
  });
});
