import { sleep } from './utils'
import { PrismaClient, type StarGiftNotification } from '@prisma/client'
import { Api, type TelegramClient } from 'telegram'
import { CustomFile } from 'telegram/client/uploads'

export class GiftsRadar {
  constructor(
    private readonly client: TelegramClient,
    private readonly prisma: PrismaClient,
    private readonly chatIds: string[],
    private readonly updateIntervalSec: number = 30,
  ) {
    if (chatIds.length === 0) throw 'No chat IDs provided'
  }

  async run() {
    while (true) {
      // @ts-ignore
      const giftsResult: Api.payments.StarGifts = await this.client.invoke(
        new Api.payments.GetStarGifts({ hash: 0 }),
      )

      // @ts-expect-error bigint type bug
      const gifts = giftsResult.gifts.sort((a, b) => a.id.minus(b.id)) // sort by date asc

      // handle gifts in all chats
      await Promise.all(
        this.chatIds.map((chatId) => this.handleChatGifts(gifts, chatId)),
      )

      // TODO: update pinned message with date of last update and other info
      await sleep(this.updateIntervalSec * 1000)
    }
  }

  private async handleChatGifts(gifts: Api.StarGift[], chatId: string) {
    for (const gift of gifts) {
      const notification = await this.prisma.starGiftNotification.findUnique({
        where: {
          giftId_chatId: {
            // @ts-expect-error bigint type bug
            giftId: gift.id,
            chatId,
          },
        },
      })

      try {
        // try edit existing notification
        if (!notification) throw new Error('No notification found')
        await this.editGiftNotification(gift, notification)
      } catch (e) {
        // @ts-expect-error
        if (e.errorMessage === 'MESSAGE_NOT_MODIFIED') {
          continue
        }
        if (notification) {
          // cleanup old notification if exists
          this.deleteMessageNoThrow(chatId, notification.giftMessageId)
          this.deleteMessageNoThrow(chatId, notification.infoMessageId)
        }
        // create new notification
        const newNotification = await this.newGiftNotification(
          gift,
          chatId,
          notification !== undefined, // if it existed, silent = true
        )
        await this.prisma.starGiftNotification.upsert({
          where: {
            giftId_chatId: {
              // @ts-expect-error bigint type bug
              giftId: gift.id,
              chatId,
            },
          },
          update: newNotification,
          create: newNotification,
        })
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
  ): Promise<StarGiftNotification> {
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

    return {
      // @ts-expect-error bigint type bug
      giftId: gift.id,
      chatId: chatId,
      giftMessageId: giftMsg.id,
      infoMessageId: infoMsg.id,
      infoMessageText: text,
    }
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
