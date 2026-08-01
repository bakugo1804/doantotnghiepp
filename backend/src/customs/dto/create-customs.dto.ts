import { IsOptional, IsString, IsEnum, IsDateString, IsNumber, IsArray, ValidateNested, Min, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export enum TransportType { AIR = 'AIR', SEA = 'SEA', RAIL = 'RAIL', ROAD = 'ROAD' }
export enum CustomsStatus { DRAFT = 'DRAFT', SUBMITTED = 'SUBMITTED', PROCESSING = 'PROCESSING', APPROVED = 'APPROVED', REJECTED = 'REJECTED', COMPLETED = 'COMPLETED' }

export class CreateMaterialDto {
  @ApiProperty() @IsNumber() itemNo: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() hsCode?: string;
  @ApiProperty() @IsString() description: string;
  @ApiProperty() @IsNumber() @Min(0) quantity: number;
  @ApiProperty() @IsString() unit: string;
  @ApiProperty() @IsNumber() @Min(0) unitPrice: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() origin?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() weight?: number;
}

export class CreateJourneyDto {
  @ApiProperty() @IsNumber() @Min(1) legNumber: number;
  @ApiProperty({ enum: TransportType }) @IsEnum(TransportType) transportType: TransportType;
  @ApiProperty() @IsString() origin: string;
  @ApiProperty() @IsString() destination: string;
}

export class CreateCustomsDto {
  @ApiProperty({ required: false, description: 'Số tờ khai (để trống sẽ tự sinh)' })
  @IsOptional()
  @IsString()
  recordNo?: string;
  @ApiProperty() @IsDateString() entryDate: string;
  @ApiProperty({ required: false }) @IsOptional() @IsDateString() exitDate?: string;
  @ApiProperty({ enum: TransportType }) @IsEnum(TransportType) transportType: TransportType;
  @ApiProperty({ required: false, description: 'Optional if journeys array is provided' })
  @IsOptional()
  @ValidateIf((o) => !o.journeys || o.journeys.length === 0)
  @IsString()
  leg1Origin?: string;
  @ApiProperty({ required: false, description: 'Optional if journeys array is provided' })
  @IsOptional()
  @ValidateIf((o) => !o.journeys || o.journeys.length === 0)
  @IsString()
  leg1Destination?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() leg2Origin?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() leg2Destination?: string;
  @ApiProperty({ type: [CreateJourneyDto], required: false, description: 'Array of journey legs (alternative to leg1Origin/leg1Destination)' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateJourneyDto)
  journeys?: CreateJourneyDto[];
  @ApiProperty({ required: false }) @IsOptional() @IsString() flightNo?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() vesselName?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() trainNo?: string;
  @ApiProperty() @IsString() exporterName: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() exporterAddress?: string;
  @ApiProperty({ default: 'VN' }) @IsOptional() @IsString() exporterCountry?: string;
  @ApiProperty() @IsString() importerName: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() importerAddress?: string;
  @ApiProperty({ default: 'VN' }) @IsOptional() @IsString() importerCountry?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() invoiceNo?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() billOfLading?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() containerNo?: string;
  @ApiProperty({ default: 'USD' }) @IsOptional() @IsString() currency?: string;
  @ApiProperty({ default: 10 }) @IsOptional() @IsNumber() vatRate?: number;
  @ApiProperty({ default: 0 }) @IsOptional() @IsNumber() shippingFee?: number;
  @ApiProperty({ default: 0 }) @IsOptional() @IsNumber() distanceKm?: number;
  @ApiProperty({ default: 25000 }) @IsOptional() @IsNumber() exchangeRate?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsString() notes?: string;
  @ApiProperty({ type: [CreateMaterialDto] }) @IsArray() @ValidateNested({ each: true }) @Type(() => CreateMaterialDto) materials: CreateMaterialDto[];
}
