import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/health')
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

  it('GraphQL ping', () => {
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
