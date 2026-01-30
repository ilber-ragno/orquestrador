import { prisma } from '../lib/prisma.js';
import { JobStatus } from '@prisma/client';

export interface JobInput {
  instanceId?: string;
  userId: string;
  type: string;
  description: string;
  input?: Record<string, unknown>;
  maxRetries?: number;
  timeout?: number;
  steps?: string[];
}

export async function createJob(data: JobInput) {
  const job = await prisma.job.create({
    data: {
      instanceId: data.instanceId,
      userId: data.userId,
      type: data.type,
      description: data.description,
      input: data.input as any,
      maxRetries: data.maxRetries ?? 3,
      timeout: data.timeout ?? 60000,
      steps: data.steps
        ? {
            create: data.steps.map((name, i) => ({
              name,
              sortOrder: i,
            })),
          }
        : undefined,
    },
    include: { steps: { orderBy: { sortOrder: 'asc' } } },
  });
  return job;
}

export async function startJob(jobId: string) {
  return prisma.job.update({
    where: { id: jobId },
    data: { status: JobStatus.RUNNING, startedAt: new Date() },
    include: { steps: { orderBy: { sortOrder: 'asc' } } },
  });
}

export async function completeStep(stepId: string, output?: string) {
  return prisma.jobStep.update({
    where: { id: stepId },
    data: { status: JobStatus.COMPLETED, output, endedAt: new Date() },
  });
}

export async function failStep(stepId: string, error: string) {
  return prisma.jobStep.update({
    where: { id: stepId },
    data: { status: JobStatus.FAILED, error, endedAt: new Date() },
  });
}

export async function startStep(stepId: string) {
  return prisma.jobStep.update({
    where: { id: stepId },
    data: { status: JobStatus.RUNNING, startedAt: new Date() },
  });
}

export async function completeJob(jobId: string, output?: Record<string, unknown>) {
  return prisma.job.update({
    where: { id: jobId },
    data: { status: JobStatus.COMPLETED, output: output as any, completedAt: new Date() },
    include: { steps: { orderBy: { sortOrder: 'asc' } } },
  });
}

export async function failJob(jobId: string, error: string) {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) throw new Error('Job not found');

  if (job.retries < job.maxRetries) {
    return prisma.job.update({
      where: { id: jobId },
      data: { retries: job.retries + 1, status: JobStatus.PENDING, error },
      include: { steps: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  return prisma.job.update({
    where: { id: jobId },
    data: { status: JobStatus.FAILED, error, completedAt: new Date() },
    include: { steps: { orderBy: { sortOrder: 'asc' } } },
  });
}

export async function cancelJob(jobId: string) {
  return prisma.job.update({
    where: { id: jobId },
    data: { status: JobStatus.CANCELLED, completedAt: new Date() },
    include: { steps: { orderBy: { sortOrder: 'asc' } } },
  });
}

export type { JobStatus };
