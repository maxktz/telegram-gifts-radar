import type { NotificationsService } from './notifications-service'
import { sleep } from './utils'
import { Prisma, PrismaClient, type StarGiftNotification } from '@prisma/client'
import { Api, type TelegramClient } from 'telegram'
import { CustomFile } from 'telegram/client/uploads'

export class GiftsRadar {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly client: TelegramClient,
    private readonly prisma: PrismaClient,
    private readonly chatIds: string[],
    private readonly updateIntervalSec: number = 10,
  ) {
    if (chatIds.length === 0) throw 'No chat IDs provided'
  }

  async run() {
    while (true) {
      console.log('Checking for new gifts...')
      // @ts-ignore
      const giftsResult: Api.payments.StarGifts = await this.client.invoke(
        new Api.payments.GetStarGifts({ hash: 0 }),
      )

      const gifts = giftsResult.gifts
        // @ts-expect-error bigint type bug
        .sort((a, b) => a.id.minus(b.id)) // sort by date asc

      const existingGifts = await this.prisma.starGift.findMany()
      const existingGiftIdsHashset = new Set(
        existingGifts.map((gift) => String(gift.giftId)),
      )

      const newGiftExists = gifts.some(
        (gift) => !existingGiftIdsHashset.has(String(gift.id)),
      )

      // handle gifts in all chats
      console.log('Syncing gift notifications...')
      const promises = [
        ...this.chatIds.map((chatId) => this.handleChatGifts(gifts, chatId)),
      ]
      if (newGiftExists) {
        console.log('New gift found, sending notifications...')
        promises.push(this.notifications.sendCallNotifications())
      } else {
        console.log('No new gifts found')
      }
      await Promise.all(promises)

      console.log(`Waiting ${this.updateIntervalSec}s till next check...`)
      await sleep(this.updateIntervalSec * 1000)
    }
  }

  private async handleChatGifts(gifts: Api.StarGift[], chatId: string) {
    for (const gift of gifts) {
      const notification = await this.prisma.starGiftNotification.findUnique({
        where: {
          // @ts-expect-error bigint type bug
          giftId_chatId: { giftId: gift.id, chatId },
        },
      })
      if (!notification) {
        try {
          const sent = await this.newGiftNotification(
            gift,
            chatId,
            notification !== undefined, // if existed before, silent = true
          )
          await this.prisma.starGiftNotification.upsert({
            where: {
              giftId_chatId: {
                // @ts-expect-error bigint type bug
                giftId: gift.id,
                chatId,
              },
            },
            update: {
              giftMessageId: sent.giftMsg.id,
              infoMessageId: sent.infoMsg.id,
              infoMessageText: sent.text,
            },
            create: {
              gift: {
                connectOrCreate: {
                  // @ts-expect-error bigint bug
                  where: { giftId: gift.id },
                  // @ts-expect-error bigint bug
                  create: { giftId: gift.id },
                },
              },
              chatId: chatId,
              giftMessageId: sent.giftMsg.id,
              infoMessageId: sent.infoMsg.id,
              infoMessageText: sent.text,
            },
          })
        } catch (e) {
          console.log(
            `error sending new gift notification into chat ${chatId}`,
            e,
          )
        }
      } else {
        try {
          await this.editGiftNotification(gift, notification)
        } catch (e) {
          // @ts-expect-error
          if (e.errorMessage === 'MESSAGE_NOT_MODIFIED') {
            continue
          } else {
            // @ts-expect-error
            console.error('error editing gift notification', e?.message)
          }
        }
      }
    }
  }

  private async deleteMessageNoThrow(chatId: string, messageId: number) {
    try {
      await this.client.deleteMessages(chatId, [messageId], { revoke: true })
    } catch {}
  }

  private async editGiftNotification(
    gift: Api.StarGift,
    notification: StarGiftNotification,
  ): Promise<any> {
    const newText = this.giftNotificationText(gift)
    if (newText === notification.infoMessageText) {
      return
    }
    const edit = await this.client.editMessage(notification.chatId, {
      message: notification.infoMessageId,
      text: this.giftNotificationText(gift),
      parseMode: 'html',
    })
    return edit
  }

  private async newGiftNotification(
    gift: Api.StarGift,
    chatId: string,
    silent: boolean,
  ) {
    const file = await this.getGiftMediaInputFile(gift)

    const giftMsg = await this.client.sendMessage(chatId, {
      file,
      silent: true, // sticker is always silent
    })
    const text = this.giftNotificationText(gift)
    const infoMsg = await this.client.sendMessage(chatId, {
      message: text,
      parseMode: 'html',
      silent,
    })
    return { giftMsg, infoMsg, text }
  }

  private giftNotificationText(gift: Api.StarGift) {
    // TODO: replace default emojis with premium animated ones

    const header = gift.limited
      ? 'New <u>Limited</u> Telegram Gift!'
      : 'New Telegram Gift!'

    const price = this.prettyNum(gift.stars)

    let text = `<b>${header}</b>

<b>⭐ Stars: ${price}</b>`

    if (gift.limited) {
      // const emoji = gift.availabilityRemains === 0 ? '⛔' : '✅'
      const instock = this.prettyNum(gift.availabilityRemains!)
      const total = this.prettyNum(gift.availabilityTotal!)

      const percent =
        (gift.availabilityRemains! / gift.availabilityTotal!) * 100
      text += `\n\n<b>${'📊'} Stock: ${instock} of ${total}</b>`
      if (percent) {
        text += ` <b>(${percent.toFixed()}%)</b>`
      }
    }

    const hashtags = [
      gift.availabilityRemains === 0 ? '#soldout' : '#instock',
      gift.limited && '#limited',
    ].filter(Boolean)

    text += `\n\n${hashtags.join(' ')}`
    return text
  }

  private async getGiftMediaInputFile(gift: Api.StarGift) {
    // @ts-expect-error hard typed
    const buffer: Buffer = await this.client.downloadMedia(gift.sticker)
    const filename = `maxktz.tgs`
    const size = Buffer.byteLength(buffer)
    const file = new CustomFile(filename, size, filename, buffer)
    const inputFile = await this.client.uploadFile({ file, workers: 1 })
    return inputFile
  }

  private prettyNum(num: any): string {
    return Number(num)?.toLocaleString('en-US')
  }
}
