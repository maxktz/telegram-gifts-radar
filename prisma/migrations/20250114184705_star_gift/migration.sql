-- CreateTable
CREATE TABLE "StarGift" (
    "giftId" BIGINT NOT NULL,
    CONSTRAINT "StarGift_pkey" PRIMARY KEY ("giftId")
);

-- Insert StarGift records for all existing notifications
INSERT INTO "StarGift" ("giftId")
SELECT DISTINCT "giftId" 
FROM "StarGiftNotification"
ON CONFLICT ("giftId") DO NOTHING;

-- AddForeignKey
ALTER TABLE "StarGiftNotification" ADD CONSTRAINT "StarGiftNotification_giftId_fkey" 
FOREIGN KEY ("giftId") REFERENCES "StarGift"("giftId") 
ON DELETE RESTRICT ON UPDATE CASCADE;
