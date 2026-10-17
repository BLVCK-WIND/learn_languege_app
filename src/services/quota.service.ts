import { prisma as defaultPrisma } from '@/lib/prisma';
import type { PrismaClient, StudyQuotaConfig } from '@prisma/client';

export const DEFAULT_QUOTA_CONFIG = {
  maxNewWordsPerDay: 10,
  maxNewMistakesPerDay: 5,
  maxReviewWordsPerDay: 50,
  maxReviewMistakesPerDay: 30,
};

export interface UpdateQuotaInput {
  maxNewWordsPerDay?: number;
  maxNewMistakesPerDay?: number;
  maxReviewWordsPerDay?: number;
  maxReviewMistakesPerDay?: number;
}

export class DefaultQuotaService {
  constructor(private readonly prisma: PrismaClient = defaultPrisma) {}

  /**
   * Lấy cấu hình hạn ngạch học tập hiện tại.
   * Nếu chưa tồn tại trong CSDL, tự động khởi tạo với giá trị mặc định chuẩn mực.
   */
  async getQuotaConfig(): Promise<StudyQuotaConfig> {
    const existing = await this.prisma.studyQuotaConfig.findFirst();
    if (existing) {
      return existing;
    }

    return this.prisma.studyQuotaConfig.create({
      data: {
        maxNewWordsPerDay: DEFAULT_QUOTA_CONFIG.maxNewWordsPerDay,
        maxNewMistakesPerDay: DEFAULT_QUOTA_CONFIG.maxNewMistakesPerDay,
        maxReviewWordsPerDay: DEFAULT_QUOTA_CONFIG.maxReviewWordsPerDay,
        maxReviewMistakesPerDay: DEFAULT_QUOTA_CONFIG.maxReviewMistakesPerDay,
      },
    });
  }

  /**
   * Cập nhật hạn ngạch học tập hằng ngày.
   */
  async updateQuotaConfig(input: UpdateQuotaInput): Promise<StudyQuotaConfig> {
    const current = await this.getQuotaConfig();

    return this.prisma.studyQuotaConfig.update({
      where: { id: current.id },
      data: {
        maxNewWordsPerDay:
          typeof input.maxNewWordsPerDay === 'number' && input.maxNewWordsPerDay >= 0
            ? Math.min(500, input.maxNewWordsPerDay)
            : current.maxNewWordsPerDay,
        maxNewMistakesPerDay:
          typeof input.maxNewMistakesPerDay === 'number' && input.maxNewMistakesPerDay >= 0
            ? Math.min(500, input.maxNewMistakesPerDay)
            : current.maxNewMistakesPerDay,
        maxReviewWordsPerDay:
          typeof input.maxReviewWordsPerDay === 'number' && input.maxReviewWordsPerDay >= 0
            ? Math.min(500, input.maxReviewWordsPerDay)
            : current.maxReviewWordsPerDay,
        maxReviewMistakesPerDay:
          typeof input.maxReviewMistakesPerDay === 'number' && input.maxReviewMistakesPerDay >= 0
            ? Math.min(500, input.maxReviewMistakesPerDay)
            : current.maxReviewMistakesPerDay,
      },
    });
  }
}

export const quotaService = new DefaultQuotaService();
