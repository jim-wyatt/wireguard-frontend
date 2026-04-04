import { test, expect } from '@playwright/test'

test('public dashboard is reachable', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('WireGuard Management')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  await expect(page.getByText('Total Clients')).toBeVisible()
  await expect(page.getByText('Active Clients')).toBeVisible()
  await expect(page.getByText('Connected Now')).toBeVisible()
})

test('clients page loads with operator token', async ({ page }) => {
  const token = (process.env.API_AUTH_TOKEN || '').trim()
  test.skip(!token, 'API_AUTH_TOKEN is required for operator page check')

  await page.addInitScript((authToken) => {
    window.localStorage.setItem('apiToken', authToken)
  }, token)

  await page.goto('/clients')
  await expect(page.getByRole('heading', { name: 'Clients' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Create Client' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Email' })).toBeVisible()
})
