-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- AlterTable
ALTER TABLE "instances" ADD COLUMN     "container_host" TEXT,
ADD COLUMN     "container_name" TEXT,
ADD COLUMN     "container_type" TEXT,
ADD COLUMN     "gateway_bind" TEXT,
ADD COLUMN     "gateway_mode" TEXT,
ADD COLUMN     "gateway_port" INTEGER,
ADD COLUMN     "gateway_status" TEXT,
ADD COLUMN     "gateway_token" TEXT,
ADD COLUMN     "plan_id" TEXT;

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "instance_id" TEXT,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "input" JSONB,
    "output" JSONB,
    "error" TEXT,
    "retries" INTEGER NOT NULL DEFAULT 0,
    "max_retries" INTEGER NOT NULL DEFAULT 3,
    "timeout" INTEGER NOT NULL DEFAULT 60000,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_steps" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "output" TEXT,
    "error" TEXT,
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "job_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "max_messages" INTEGER,
    "max_sessions" INTEGER,
    "max_tokens" INTEGER,
    "max_cost_cents" INTEGER,
    "max_channels" INTEGER,
    "max_providers" INTEGER,
    "block_on_exceed" BOOLEAN NOT NULL DEFAULT true,
    "fallback_action" TEXT NOT NULL DEFAULT 'block',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_usages" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "instance_id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "messages" INTEGER NOT NULL DEFAULT 0,
    "sessions" INTEGER NOT NULL DEFAULT 0,
    "tokens_used" INTEGER NOT NULL DEFAULT 0,
    "cost_cents" INTEGER NOT NULL DEFAULT 0,
    "channels" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_usages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "setup_progress" (
    "id" TEXT NOT NULL,
    "instance_id" TEXT NOT NULL,
    "current_step" INTEGER NOT NULL DEFAULT 0,
    "steps" JSONB NOT NULL DEFAULT '[]',
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "setup_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "jobs_instance_id_idx" ON "jobs"("instance_id");

-- CreateIndex
CREATE INDEX "jobs_user_id_idx" ON "jobs"("user_id");

-- CreateIndex
CREATE INDEX "jobs_status_idx" ON "jobs"("status");

-- CreateIndex
CREATE INDEX "jobs_created_at_idx" ON "jobs"("created_at");

-- CreateIndex
CREATE INDEX "job_steps_job_id_idx" ON "job_steps"("job_id");

-- CreateIndex
CREATE UNIQUE INDEX "plans_name_key" ON "plans"("name");

-- CreateIndex
CREATE INDEX "plan_usages_instance_id_idx" ON "plan_usages"("instance_id");

-- CreateIndex
CREATE UNIQUE INDEX "plan_usages_plan_id_instance_id_period_key" ON "plan_usages"("plan_id", "instance_id", "period");

-- CreateIndex
CREATE UNIQUE INDEX "setup_progress_instance_id_key" ON "setup_progress"("instance_id");

-- AddForeignKey
ALTER TABLE "job_steps" ADD CONSTRAINT "job_steps_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_usages" ADD CONSTRAINT "plan_usages_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
