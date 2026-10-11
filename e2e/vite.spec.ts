import { expect, test } from '@playwright/test'
import { altClick, snippet } from './grab.js'

test('⌥-click in vite dev copies the call site, owners and tokens', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => navigator.clipboard.writeText(''))
  await altClick(page, page.getByTestId('target'))
  const text = await snippet(page)
  expect(text).toMatch(/jsx: src\/card\.tsx:\d+/)
  expect(text).toMatch(/Card — src\/card\.tsx:\d+/)
  expect(text).toMatch(/App — src\/App\.tsx:\d+/)
  expect(text).toContain('font --text-sm (14px)')
  expect(text).not.toContain('warnings:')
  await expect(page.getByTestId('count')).toHaveText('0')
})
