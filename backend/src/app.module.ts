import { Module } from '@nestjs/common';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { ConfigModule } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { MongooseModule } from '@nestjs/mongoose';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { City, CitySchema } from './city/city.schema';
import { City as CityEntity } from './city/city.entity';
import { AppGraphqlModule } from './graphql/graphql.module';
import { HealthModule } from './health/health.module';
import { Review, ReviewSchema } from './review/review.schema';

@Module({
  imports: [
    ConfigModule.forRoot(),
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      path: '/graphql',
      autoSchemaFile: true,
      playground: process.env.NODE_ENV !== 'production',
      introspection: process.env.NODE_ENV !== 'production',
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url:
        process.env.POSTGRES_URL ||
        'postgresql://postgres:postgres@localhost:5432/homepedia',
      entities: [__dirname + '/**/*.entity{.ts,.js}'],
      migrations: [__dirname + '/migrations/*{.ts,.js}'],
      synchronize: process.env.NODE_ENV !== 'production',
      logging: process.env.NODE_ENV !== 'production',
    }),
    TypeOrmModule.forFeature([CityEntity]),
    MongooseModule.forRoot(
      process.env.MONGODB_URL ||
        'mongodb://root:example@localhost:27017/homepedia?authSource=admin',
    ),
    MongooseModule.forFeature([
      { name: Review.name, schema: ReviewSchema },
      { name: City.name, schema: CitySchema },
    ]),
    AppGraphqlModule,
    HealthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
