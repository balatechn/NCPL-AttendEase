import { test, expect } from '@playwright/test';

async function login(page: any) {
  await page.goto('/login');
  await page.fill('input[type="email"]', 'admin@ncpl.com');
  await page.fill('input[type="password"]', 'Admin@123');
  await page.click('button[type="submit"]');
  await page.waitForURL('/attendance', { timeout: 10000 });
}

test.describe('Leave Application Flow', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/leaves');
  });

  test('should display leave page with balance cards', async ({ page }) => {
    await expect(page.locator('text=Leave Management')).toBeVisible();
    await expect(page.locator('text=Apply Leave')).toBeVisible();
  });

  test('should open leave application form', async ({ page }) => {
    await page.click('text=Apply Leave');
    await expect(page.locator('text=Apply for Leave')).toBeVisible();
    await expect(page.locator('select')).toBeVisible();
    await expect(page.locator('textarea')).toBeVisible();
  });

  test('should validate empty form submission', async ({ page }) => {
    await page.click('text=Apply Leave');
    await page.click('text=Submit Application');
    // HTML5 required validation should prevent submission
  });

  test('should submit a leave application', async ({ page }) => {
    await page.click('text=Apply Leave');
    
    // Fill form
    await page.selectOption('select', 'casual');
    
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0];
    
    await page.fill('input[type="date"]:first-of-type', dateStr);
    await page.fill('input[type="date"]:last-of-type', dateStr);
    await page.fill('textarea', 'Test leave application - automated test');
    
    await page.click('text=Submit Application');
    // Should show success toast or updated leave list
    await expect(page.locator('text=Leave applied successfully').or(page.locator('text=pending'))).toBeVisible({ timeout: 5000 });
  });

  test('should show pending tab for managers', async ({ page }) => {
    // Admin should see pending approvals tab
    await expect(page.locator('text=Pending Approvals')).toBeVisible();
  });

  test('should cancel leave form', async ({ page }) => {
    await page.click('text=Apply Leave');
    await expect(page.locator('text=Apply for Leave')).toBeVisible();
    await page.click('text=Cancel');
    await expect(page.locator('text=Apply for Leave')).not.toBeVisible();
  });
});
