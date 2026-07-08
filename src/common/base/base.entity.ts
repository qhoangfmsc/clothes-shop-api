import { ApiResponseProperty } from '@nestjs/swagger';
import { customAlphabet } from 'nanoid';
import { BeforeInsert, CreateDateColumn, PrimaryColumn, UpdateDateColumn } from 'typeorm';

const nanoid16 = customAlphabet('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', 16);

export interface IBaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

export abstract class BaseEntity {
  @ApiResponseProperty({ example: 1 })
  @PrimaryColumn({ type: 'varchar', length: 16 })
  public id: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp with time zone' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp with time zone' })
  updatedAt: Date;

  /*
   *****************************************
   *
   *
   */

  @BeforeInsert()
  generateId() {
    if (!this.id) {
      this.id = nanoid16();
    }
  }
}
