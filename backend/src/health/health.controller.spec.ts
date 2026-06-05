import { Test, TestingModule } from '@nestjs/testing';
import {
  HealthCheckService,
  MongooseHealthIndicator,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;
  let healthCheck: jest.Mock;

  beforeEach(async () => {
    healthCheck = jest.fn().mockResolvedValue({
      status: 'ok',
      info: {
        database: { status: 'up' },
        mongodb: { status: 'up' },
      },
    });

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthCheckService,
          useValue: { check: healthCheck },
        },
        {
          provide: TypeOrmHealthIndicator,
          useValue: { pingCheck: jest.fn() },
        },
        {
          provide: MongooseHealthIndicator,
          useValue: { pingCheck: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get(HealthController);
  });

  it('delegates to HealthCheckService with postgres and mongo indicators', async () => {
    const result = await controller.check();

    expect(healthCheck).toHaveBeenCalledTimes(1);
    expect(healthCheck.mock.calls[0]?.[0]).toHaveLength(2);
    expect(result.status).toBe('ok');
  });
});
