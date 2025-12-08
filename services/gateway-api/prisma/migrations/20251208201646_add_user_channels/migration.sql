-- CreateTable
CREATE TABLE "user_channels" (
    "id" STRING NOT NULL,
    "user_id" STRING NOT NULL,
    "channel_name" STRING NOT NULL,
    "channel_user_id" STRING NOT NULL,
    "display_name" STRING,
    "credentials" JSONB,
    "is_active" BOOL NOT NULL DEFAULT true,
    "metadata" JSONB,
    "webhook_secret" STRING,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_channels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_channels_user_id_idx" ON "user_channels"("user_id");

-- CreateIndex
CREATE INDEX "user_channels_channel_name_idx" ON "user_channels"("channel_name");

-- CreateIndex
CREATE UNIQUE INDEX "user_channels_user_id_channel_name_channel_user_id_key" ON "user_channels"("user_id", "channel_name", "channel_user_id");

-- AddForeignKey
ALTER TABLE "user_channels" ADD CONSTRAINT "user_channels_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
