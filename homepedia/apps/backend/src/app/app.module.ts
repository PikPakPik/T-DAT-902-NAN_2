import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from '../health/health.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MongooseModule } from '@nestjs/mongoose';
import { Region } from '../region/region.entity';
import { Department } from '../department/department.entity';
import { City } from '../city/city.entity';
import { Section } from '../section/section.entity';
import { Plot } from '../plot/plot.entity';
import { Mutation } from '../mutation/mutation.entity';
import { Stats as DepartmentStats } from '../department/stats.entity';
import { Rent } from '../rent/rent.entity';
import { Stats as CityStats } from '../city/stats.entity';
import { Populate } from '../city/populate.entity';
import { Income } from '../city/income.entity';
import { AirQuality } from '../city/airQuality.entity';
import { Crime } from '../city/crime.entity';
import { TransportStop } from '../city/transportStop.entity';
import { Device } from '../city/device.entity';
import { Dpe } from '../dpe/dpe.entity';
import { Review, ReviewSchema } from '../review/review.schema';
import { City as CityMongo, CitySchema } from '../city/city.schema';

@Module({
  imports: [
    ConfigModule.forRoot(), 
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.get('POSTGRES_URL', 'postgresql://postgres:postgres@localhost:5432/homepedia'),
        entities: [
          Region, 
          Department, 
          City, 
          Section, 
          Plot, 
          Mutation, 
          DepartmentStats, 
          Rent, 
          CityStats, 
          Populate, 
          Income,
          Crime,
          AirQuality,
          TransportStop,
          Device,
          Dpe
        ],
        synchronize: configService.get('NODE_ENV') !== 'production',
      }),
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get('MONGODB_URL', 'mongodb://root:example@localhost:27017/homepedia?authSource=admin'),
      }),
    }),
    MongooseModule.forFeature([
      { name: Review.name, schema: ReviewSchema }, 
      { name: CityMongo.name, schema: CitySchema }
    ]),
    HealthModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
