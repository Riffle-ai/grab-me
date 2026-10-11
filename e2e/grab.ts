import { expect, type Locator, type Page } from '@playwright/test'

export async function altClick(page: Page, target: Locator) {
  const box = await target.boundingBox()
  if (!box) throw new Error('target has no box')
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2]
  await page.mouse.move(x, y)
  await page.keyboard.down('Alt')
  await page.mouse.move(x + 1, y)
  await page.mouse.click(x, y)
  await page.keyboard.up('Alt')
}

export async function snippet(page: Page): Promise<string> {
  const read = () => page.evaluate(() => navigator.clipboard.readText())
  await expect.poll(read, { timeout: 15_000 }).toContain('</grab-me>')
  return read()
}
