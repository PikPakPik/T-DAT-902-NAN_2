import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Department } from './department.entity';
import { DepartmentResolver } from './department.resolver';
import { DepartmentService } from './department.service';

@Module({
  imports: [TypeOrmModule.forFeature([Department])],
  providers: [DepartmentService, DepartmentResolver],
  exports: [DepartmentService],
})
export class DepartmentModule {}
