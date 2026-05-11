import { defineAdobeAccountTests, expect } from '../../src/adobe/spec';
import { AdobePage } from '../../src/pages/adobe';
import { GmailProvider } from '../../src/pages/gmailProvider';
import { MsProvider } from '../../src/pages/msProvider';

const FOUR_G_LIKE_DEBUG_PROFILE = {
  offline: false,
  latency: 150,
  downloadThroughput: Math.round((1.6 * 1024 * 1024) / 8),
  uploadThroughput: Math.round((750 * 1024) / 8),
} as const;

defineAdobeAccountTests('script flow [low-network debug]', async ({ page, account, stepTracker }) => {
  const adobe = new AdobePage(page);
  const ms = new MsProvider(page);
  const ggl = new GmailProvider(page);

  stepTracker.setStep('Apply low-network debug throttle');
  const client = await page.context().newCDPSession(page);
  await client.send('Network.enable');
  await client.send('Network.emulateNetworkConditions', FOUR_G_LIKE_DEBUG_PROFILE);

  stepTracker.setStep('open login');
  await adobe.adb_login()

  stepTracker.setStep('Enter email at Adobe Login');
  await adobe.fill_adb_email_field(account.email);

  stepTracker.setStep('Handle Persoanl/Company screen on Adobe Login');
  await adobe.select_cmp_option();

  stepTracker.setStep('check email provider');
  const provider  =  await adobe.getLoginProvider();

  stepTracker.setStep('Login with'+ provider);
  if(provider.includes('accounts.google.com')){
    await ggl.g_login(account.email,account.password);
  } else if (provider.includes('login.microsoftonline.com')){
    await ms.ms_login(account.email,account.password);
  }

  stepTracker.setStep('Wait for Adobe Dashboard');
  await adobe.waitForDashboard();

  const letsGoHandled = await adobe.handle_letsGoIfPresent(2000);
  if (letsGoHandled) {
    stepTracker.setStep('Activate by Lets Go');
  }

  stepTracker.setStep('Redirect to edit');
  await adobe.shortcut();

  stepTracker.setStep('Wait for Img Generation');
  await adobe.wait_for_generation();

  stepTracker.setStep('Download');
  const filePath = await adobe.download_img();

  // 3. Optional: Assertion to verify the download happened
  console.log(`File saved to: ${filePath}`);
  expect(filePath).toBeTruthy();
});
