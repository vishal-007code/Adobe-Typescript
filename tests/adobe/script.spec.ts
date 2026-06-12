import { defineAdobeAccountTests, expect } from '../../src/adobe/spec';
import { AdobePage } from "../../src/pages/adobe";
import { GmailProvider } from "../../src/pages/gmailProvider";
import { MsProvider} from "../../src/pages/msProvider";
import { EditorDashboard } from '../../src/pages/editorDashboard';

defineAdobeAccountTests('script flow', async ({ page, account, stepTracker }) => {
    const adobe = new AdobePage(page);
    const editor = new EditorDashboard(page);
    const ms = new MsProvider(page);
    const ggl = new GmailProvider(page);

  // Start intercepting UDS requests to capture auth credentials for API-based Let's Go dismissal
  adobe.startUdsCapture();

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

  stepTracker.setStep('Activate by Lets Go');
  await adobe.skipLetsGoViaAPI(account.email);

  stepTracker.setStep('Redirect to edit');
  await adobe.shortcut();
  
  stepTracker.setStep('Wait for Img Generation');
  await adobe.wait_for_generation();

  stepTracker.setStep('Open In Editor');
  await editor.clickOpenInEditor();

  stepTracker.setStep('Skip Tutorial dialog if visible');
  await editor.skipTutorial();

  stepTracker.setStep('Click Share button');
  await editor.clickShare();

  stepTracker.setStep('Open View Only Link');
  await editor.openViewOnlyLink();

  stepTracker.setStep('Click Create Link button');
  await editor.clickCreateLink();

  stepTracker.setStep('Click Copy Link button');
  const link = await editor.clickCopyLink();
  console.log('Link Copied: ' + link);
  expect(link).toBeTruthy();

  
//   stepTracker.setStep('Download');
//   const filePath = await adobe.download_img();
  
//   // 3. Optional: Assertion to verify the download happened
//   console.log(`File saved to: ${filePath}`);
//   expect(filePath).toBeTruthy();

});
