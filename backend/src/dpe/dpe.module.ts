import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Dpe } from './dpe.entity';
import { DpeResolver } from './dpe.resolver';
import { DpeService } from './dpe.service';

@Module({
  imports: [TypeOrmModule.forFeature([Dpe])],
  providers: [DpeService, DpeResolver],
  exports: [DpeService],
})
export class DpeModule {}
