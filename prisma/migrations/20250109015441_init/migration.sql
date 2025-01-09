-- CreateTable
CREATE TABLE "StarGiftNotification" (
    "giftId" BIGINT NOT NULL,
    "chatId" TEXT NOT NULL,
    "giftMessageId" INTEGER NOT NULL,
    "infoMessageId" INTEGER NOT NULL,
    "infoMessageText" TEXT NOT NULL,

    CONSTRAINT "StarGiftNotification_pkey" PRIMARY KEY ("giftId","chatId")
);
