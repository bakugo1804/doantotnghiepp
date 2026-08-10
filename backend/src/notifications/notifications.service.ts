import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import nodemailer from 'nodemailer';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';

@Injectable()
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  list(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { receivedAt: 'desc' },
      take: 100,
    });
  }

  markRead(id: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true },
    });
  }

  /**
   * Đánh dấu toàn bộ đã đọc.
   *
   * Giao diện chỉ có nút tick trên từng dòng, nên muốn tắt chấm đỏ phải bấm lần
   * lượt từng thông báo - đọc xong rồi mà số đỏ vẫn còn nguyên.
   */
  async markAllRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return { updated: result.count };
  }

  /** Đếm số chưa đọc, dùng cho chấm đỏ trên chuông. */
  async unreadCount(userId: string) {
    const count = await this.prisma.notification.count({ where: { userId, isRead: false } });
    return { count };
  }

  async sendToGmail(userId: string, subject: string, content: string) {
    const host = this.config.get<string>('SMTP_HOST') || 'smtp.gmail.com';
    const port = Number(this.config.get<string>('SMTP_PORT') || 587);
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');
    const to = this.config.get<string>('SMTP_TO') || user;

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    const info = await transporter.sendMail({
      from: user,
      to,
      subject,
      text: content,
    });

    await this.prisma.notification.create({
      data: {
        userId,
        subject,
        content,
        source: 'APP',
        externalId: info.messageId || undefined,
      },
    });

    return { ok: true, messageId: info.messageId };
  }

  async syncFromGmail(userId: string) {
    const user = this.config.get<string>('IMAP_USER') || this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('IMAP_PASS') || this.config.get<string>('SMTP_PASS');
    const host = this.config.get<string>('IMAP_HOST') || 'imap.gmail.com';
    const port = Number(this.config.get<string>('IMAP_PORT') || 993);
    const mailbox = this.config.get<string>('IMAP_MAILBOX') || 'INBOX';

    const client = new ImapFlow({
      host,
      port,
      secure: true,
      auth: { user, pass },
    });

    await client.connect();
    await client.mailboxOpen(mailbox);
    const lock = await client.getMailboxLock(mailbox);
    try {
      const list = await client.fetchAll('1:*', { envelope: true, source: true, uid: true, internalDate: true });
      let inserted = 0;
      for (const message of list.slice(-30)) {
        const externalId = `${mailbox}-${message.uid}`;
        const existing = await this.prisma.notification.findUnique({ where: { externalId } });
        if (existing) continue;
        const parsed = await simpleParser(message.source as Buffer);
        await this.prisma.notification.create({
          data: {
            userId,
            subject: message.envelope?.subject || '(No subject)',
            content: parsed.text?.slice(0, 4000) || '',
            source: 'EMAIL',
            externalId,
            receivedAt: message.internalDate || new Date(),
          },
        });
        inserted += 1;
      }
      return { inserted };
    } finally {
      lock.release();
      await client.logout();
    }
  }
}
