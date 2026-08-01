import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SearchService {
  constructor(private prisma: PrismaService) {}

  async globalSearch(
    query: string,
    role: string,
    userId: string,
    companyId?: string | null,
    filters?: { status?: string; transportType?: string; only?: string },
  ) {
    const keyword = query.trim();
    if (!keyword) {
      return { customs: [], companies: [], users: [], tasks: [] };
    }

    const customsWhere: any = {
      OR: [
        { recordNo: { contains: keyword, mode: 'insensitive' } },
        { exporterName: { contains: keyword, mode: 'insensitive' } },
        { importerName: { contains: keyword, mode: 'insensitive' } },
      ],
    };
    if (role !== 'ADMIN') {
      if (companyId) customsWhere.companyId = companyId;
      else customsWhere.createdById = userId;
    }
    if (filters?.status) customsWhere.status = filters.status;
    if (filters?.transportType) customsWhere.transportType = filters.transportType;

    const tasksWhere: any = {
      AND: [
        {
          OR: [
            { title: { contains: keyword, mode: 'insensitive' } },
            { description: { contains: keyword, mode: 'insensitive' } },
          ],
        },
      ],
    };
    if (role !== 'ADMIN') {
      if (companyId) {
        tasksWhere.AND.push({
          OR: [{ assignedTo: { companyId } }, { assignedBy: { companyId } }],
        });
      } else {
        tasksWhere.assignedToId = userId;
      }
    }

    const includeCustoms = !filters?.only || filters.only === 'customs' || filters.only === 'all';
    const includeCompanies = !filters?.only || filters.only === 'companies' || filters.only === 'all';
    const includeUsers = !filters?.only || filters.only === 'users' || filters.only === 'all';
    const includeTasks = !filters?.only || filters.only === 'tasks' || filters.only === 'all';

    const [customs, taskResults, users, companySource, companyDirectory] = await Promise.all([
      includeCustoms ? this.prisma.customsRecord.findMany({
        where: customsWhere,
        take: 10,
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          recordNo: true,
          importerName: true,
          exporterName: true,
          status: true,
          updatedAt: true,
        },
      }) : Promise.resolve([]),
      includeTasks ? this.prisma.task.findMany({
        where: tasksWhere,
        take: 10,
        orderBy: [{ workDate: 'asc' }, { updatedAt: 'desc' }],
        include: {
          assignedTo: { select: { id: true, fullName: true, email: true } },
        },
      }) : Promise.resolve([]),
      (role === 'ADMIN' || role === 'DIRECTOR') && includeUsers
        ? this.prisma.user.findMany({
            where: {
              companyId: role === 'DIRECTOR' ? (companyId || undefined) : undefined,
              OR: [
                { fullName: { contains: keyword, mode: 'insensitive' } },
                { email: { contains: keyword, mode: 'insensitive' } },
              ],
            },
            take: 10,
            select: { id: true, fullName: true, email: true, role: true, isActive: true },
          })
        : Promise.resolve([]),
      includeCompanies ? this.prisma.customsRecord.findMany({
        where: {
          ...(role === 'ADMIN'
            ? {}
            : companyId
              ? { companyId }
              : { createdById: userId }),
          OR: [
            { exporterName: { contains: keyword, mode: 'insensitive' } },
            { importerName: { contains: keyword, mode: 'insensitive' } },
          ],
        },
        take: 50,
        select: { exporterName: true, importerName: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
      }) : Promise.resolve([]),
      includeCompanies ? this.prisma.company.findMany({
        where: { name: { contains: keyword, mode: 'insensitive' } },
        take: 20,
        select: { name: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
      }) : Promise.resolve([]),
    ]);

    const companiesMap = new Map<string, { name: string; lastActivity: Date }>();
    for (const record of companySource) {
      for (const name of [record.exporterName, record.importerName]) {
        if (!name.toLowerCase().includes(keyword.toLowerCase())) continue;
        const current = companiesMap.get(name);
        if (!current || current.lastActivity < record.updatedAt) {
          companiesMap.set(name, { name, lastActivity: record.updatedAt });
        }
      }
    }

    for (const company of companyDirectory) {
      const current = companiesMap.get(company.name);
      if (!current || current.lastActivity < company.updatedAt) {
        companiesMap.set(company.name, { name: company.name, lastActivity: company.updatedAt });
      }
    }

    return {
      customs: includeCustoms ? customs : [],
      companies: includeCompanies ? Array.from(companiesMap.values()).slice(0, 10) : [],
      users: includeUsers ? users : [],
      tasks: includeTasks ? taskResults : [],
    };
  }
}