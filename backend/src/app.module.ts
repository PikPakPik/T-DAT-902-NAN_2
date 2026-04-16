import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MongooseModule } from '@nestjs/mongoose';
import { Review, ReviewSchema } from './review/review.schema';
import { City, CitySchema } from './city/city.schema';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot(),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.POSTGRES_URL || 'postgresql://postgres:postgres@localhost:5432/homepedia',
      entities: [
        __dirname + '/**/*.entity{.ts,.js}',
      ],
      migrations: [
        __dirname + '/migrations/*{.ts,.js}',
      ],
      synchronize: process.env.NODE_ENV !== 'production',
      logging: process.env.NODE_ENV !== 'production',
    }),
    MongooseModule.forRoot(process.env.MONGODB_URL || 'mongodb://root:example@localhost:27017/homepedia?authSource=admin'),
    MongooseModule.forFeature([
      { name: Review.name, schema: ReviewSchema }, 
      { name: City.name, schema: CitySchema }
    ]),
    HealthModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
