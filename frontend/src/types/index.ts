export type Role = 'ADMIN' | 'DIRECTOR' | 'STAFF' | 'VIEWER';
export type TransportType = 'AIR' | 'SEA' | 'RAIL' | 'ROAD';
export type CustomsStatus = 'DRAFT' | 'SUBMITTED' | 'PROCESSING' | 'APPROVED' | 'REJECTED' | 'COMPLETED';
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE';

export interface User {
  id: string;
  email: string;
  fullName: string;
  phone?: string;
  avatarUrl?: string | null;
  role: Role;
  companyId?: string | null;
  company?: { id: string; name: string } | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CompanySummary {
  id: string;
  name: string;
  role: 'EXPORTER' | 'IMPORTER' | 'BOTH';
  contactEmail?: string | null;
  contactPhone?: string | null;
  address?: string | null;
  notes?: string | null;
  recordsCount: number;
  totalPayable: number;
  currency: string;
  lastActivity: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  isDirectoryEntry?: boolean;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  workDate: string;
  status: TaskStatus;
  assignedToId: string;
  assignedById: string;
  createdAt: string;
  updatedAt: string;
  assignedTo?: Pick<User, 'id' | 'fullName' | 'email' | 'role'>;
  assignedBy?: Pick<User, 'id' | 'fullName'>;
}

export interface Material {
  id: string;
  customsRecordId: string;
  itemNo: number;
  hsCode?: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
  origin?: string;
  weight?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Attachment {
  id: string;
  customsRecordId: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  createdAt: string;
}

export interface Journey {
  id: string;
  customsRecordId: string;
  legNumber: number;
  transportType: TransportType;
  origin: string;
  destination: string;
  createdAt: string;
  updatedAt: string;
}

export interface CustomsRecord {
  id: string;
  recordNo: string;
  entryDate: string;
  exitDate?: string;
  transportType: TransportType;
  leg1Origin?: string;
  leg1Destination?: string;
  leg2Origin?: string;
  leg2Destination?: string;
  flightNo?: string;
  vesselName?: string;
  trainNo?: string;
  exporterName: string;
  exporterAddress?: string;
  exporterCountry?: string;
  importerName: string;
  importerAddress?: string;
  importerCountry?: string;
  invoiceNo?: string;
  billOfLading?: string;
  containerNo?: string;
  totalValue: number;
  currency: string;
  vatRate: number;
  vatAmount: number;
  shippingFee: number;
  distanceKm?: number;
  exchangeRate?: number;
  totalPayable: number;
  status: CustomsStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  createdById: string;
  createdBy?: User;
  materials: Material[];
  attachments?: Attachment[];
  journeys?: Journey[];
}

export interface CustomsStats {
  total: number;
  byStatus: Record<CustomsStatus, number>;
  totalValue: number;
  totalVat: number;
}

export interface CreateMaterialDto {
  itemNo: number;
  hsCode?: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  origin?: string;
  weight?: number;
}

export interface CreateJourneyDto {
  legNumber: number;
  transportType: TransportType;
  origin: string;
  destination: string;
}

export interface CreateCustomsDto {
  entryDate: string;
  exitDate?: string;
  transportType: TransportType;
  leg1Origin?: string;
  leg1Destination?: string;
  leg2Origin?: string;
  leg2Destination?: string;
  journeys?: CreateJourneyDto[];
  flightNo?: string;
  vesselName?: string;
  trainNo?: string;
  exporterName: string;
  exporterAddress?: string;
  exporterCountry?: string;
  importerName: string;
  importerAddress?: string;
  importerCountry?: string;
  invoiceNo?: string;
  billOfLading?: string;
  containerNo?: string;
  currency?: string;
  vatRate?: number;
  shippingFee?: number;
  distanceKm?: number;
  exchangeRate?: number;
  notes?: string;
  materials: CreateMaterialDto[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface AuthSession {
  user: {
    id: string;
    email: string;
    fullName: string;
    avatarUrl?: string | null;
    role: Role;
    companyId?: string | null;
    accessToken: string;
  };
}

export interface SearchResults {
  customs: Array<Pick<CustomsRecord, 'id' | 'recordNo' | 'importerName' | 'exporterName' | 'status' | 'updatedAt'>>;
  companies: Array<Pick<CompanySummary, 'name' | 'lastActivity'>>;
  users: Array<Pick<User, 'id' | 'fullName' | 'email' | 'role' | 'isActive'>>;
  tasks: Task[];
}
