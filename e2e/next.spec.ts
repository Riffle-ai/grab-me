import { expect, test } from '@playwright/test'
import { altClick, snippet } from './grab.js'

test('⌥-click in next dev copies the call site, client and server owners, and tokens', async ({
  page,
}) => {
  await page.goto('/')
  await page.evaluate(() => navigator.clipboard.writeText(''))
  await altClick(page, page.getByTestId('target'))
  const text = await snippet(page)
  expect(text).toMatch(/jsx: components\/card\.tsx:\d+/)
  expect(text).toMatch(/Card — components\/card\.tsx:\d+/)
  expect(text).toMatch(/Page \(server\) — app\/page\.tsx:\d+/)
  expect(text).toContain('font --text-sm (14px)')
  expect(text).toContain('color --color-ink (rgb(17, 17, 17))')
  expect(text).not.toContain('warnings:')
  await expect(page.getByTestId('count')).toHaveText('0')
})

test('a custom onGrab behind a dev-only dynamic import gets the same snippet', async ({ page }) => {
  const logged = page.waitForEvent('console', (m) => m.text().includes('</grab-me>'))
  await page.goto('/custom')
  await altClick(page, page.getByTestId('target'))
  const text = (await logged).text()
  expect(text).toMatch(/jsx: components\/card\.tsx:\d+/)
  expect(text).toMatch(/CustomPage \(server\) — app\/custom\/page\.tsx:\d+/)
  expect(text).not.toContain('warnings:')
})
