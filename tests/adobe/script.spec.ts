import { defineAdobeAccountTests, expect } from '../../src/adobe/spec';
import { ADOBE_LINK_ATTACHMENT, ADOBE_LOGIN_ATTACHMENT } from '../../src/adobe/runtime';
import { AdobePage } from "../../src/pages/adobe";
import { GmailProvider } from "../../src/pages/gmailProvider";
import { MsProvider} from "../../src/pages/msProvider";
import { EditorDashboard } from '../../src/pages/editorDashboard';

const FIXED_POSTCARD_URL = 'https://new.express.adobe.com/design/template/urn:aaid:sc:VA6C2:f2c97bf0-1039-5b0d-be7a-528c0060757b?category=text&entryPoint=template&taskID=postcard';

/** Host of an identity-provider URL, for use in step names and logs (no query tokens). */
function providerHost(providerUrl: string): string {
  try {
    return new URL(providerUrl).host;
  } catch {
    return providerUrl.slice(0, 60);
  }
}

defineAdobeAccountTests('script flow', async ({ page, context, account, stepTracker }, testInfo) => {
    const adobe = new AdobePage(page);
    let editor: EditorDashboard;   // bound to the postcard tab once it opens
    const ms = new MsProvider(page);
    const ggl = new GmailProvider(page);

  // Start intercepting UDS requests to capture auth credentials for API-based Let's Go dismissal
  adobe.startUdsCapture();

  stepTracker.setStep('open login');
  await adobe.adb_login()

  stepTracker.setStep('Enter email at Adobe Login');
  await adobe.fill_adb_email_field(account.email);

  stepTracker.setStep('Handle Personal/Company screen on Adobe Login');
  await adobe.select_cmp_option();

  stepTracker.setStep('check email provider');
  const provider  =  await adobe.getLoginProvider();

  // provider is a full OAuth URL. Use only its host in the step name: the raw URL
  // carries `state`/`part`/`rart` tokens, and the step name is echoed into the
  // results CSV and the [ADOBE_RESULT] log line — so the full URL both leaked
  // those tokens into logs and added ~1.5 KB per failure, which also made failure
  // grouping useless (every URL is unique).
  stepTracker.setStep('Login with ' + providerHost(provider));
  if(provider.includes('accounts.google.com')){
        await ggl.g_login(account.email,account.password);
  } else if (provider.includes('login.microsoftonline.com')){
        await ms.ms_login(account.email,account.password);
  }

  stepTracker.setStep('Wait for Adobe Dashboard');
  // Passing the email makes waitForDashboard emit the [ADOBE_LOGIN_OK] /
  // [ADOBE_LOGIN_FAIL] proof marker for this account.
  await adobe.waitForDashboard(account.email);

  stepTracker.setStep('Activate by Lets Go');
  await adobe.skipLetsGoViaAPI(account.email);

  // Attach login proof so the reporter can count logins independently of the
  // test's own pass/fail, and so it lands in the results CSV.
  const loginEvidence = adobe.getLoginEvidence();
  if (loginEvidence) {
    await testInfo.attach(ADOBE_LOGIN_ATTACHMENT, {
      body: Buffer.from(JSON.stringify(loginEvidence), 'utf8'),
      contentType: 'application/json',
    });
  }

  // Short dwell after Let's Go. Uses the page-independent timer in
  // dwellOnDashboard (NOT page.waitForTimeout): the page isn't reliably alive
  // right after Let's Go, so a page-bound wait throws "Target page ... closed".
  stepTracker.setStep('Wait 30s after Lets Go');
  await adobe.dwellOnDashboard(30_000);

  // Bulk "login till Let's Go" mode: stop right after the Let's Go step, skipping
  // the dashboard dwell + postcard + share-link flow. run-batches.sh sets
  // ADOBE_STOP_AFTER_LETS_GO=1 for the large login-only production run so each
  // account finishes in ~login time instead of ~6 min. Unset (or !=1) runs the
  // full flow (local/full runs) unchanged.
  if (process.env.ADOBE_STOP_AFTER_LETS_GO?.trim() === '1') {
    stepTracker.setStep('Stop after Lets Go');
    return;
  }

  

  // // Dwell on the dashboard for ~3-4 min once the Let's Go process is done.
  // stepTracker.setStep('Dwell on dashboard (3-4 min)');
  // await adobe.dwellOnDashboard();

  // stepTracker.setStep('Navigate to Fixed Postcard');
  // // Settle buffer to let late dashboard content/interrupts render.
  // await page.waitForTimeout(120_000);
  // const postcardPage = await context.newPage();
  // await postcardPage.goto(FIXED_POSTCARD_URL, { waitUntil: 'load' });
  // editor = new EditorDashboard(postcardPage);   // rebind; original tab stays open


  // // ── OLD flow (blank Square canvas → search inside editor) — replaced by v7's dashboard search ──
  // // stepTracker.setStep('Setup Canvas');
  // // await adobe.createTemplate();

  // // stepTracker.setStep('Search Template');
  // // const keyword: string = adobe.getRandomSearchKeyword()
  // // await adobe.searchForTemplate(keyword);

  // // stepTracker.setStep('Select Template');
  // // await adobe.selectTemplate(keyword);

  // // // ── NEW flow (from v7): search templates on the dashboard, click a random result ──
  // // stepTracker.setStep('Search Template');
  // // await adobe.searchDashboardTemplate('Postcard');
  // //
  // // stepTracker.setStep('Select Template');
  // // await adobe.selectRandomTemplate();

  // // The editor's tutorial/coachmark still appears after a template opens; skipTutorial
  // // registers a persistent "Skip tour" handler that also protects the Share click.
  // stepTracker.setStep('Skip Tutorial dialog if visible');
  // await editor.skipTutorial();

  // // stepTracker.setStep('Redirect to edit');
  // // await adobe.shortcut();
  
  // // stepTracker.setStep('Wait for Img Generation');
  // // await adobe.wait_for_generation();

  // // stepTracker.setStep('Open In Editor');
  // // await editor.clickOpenInEditor();


  // stepTracker.setStep('Click Share button');
  // await editor.clickShare();

  // stepTracker.setStep('Open View Only Link');
  // await editor.openViewOnlyLink();

  // stepTracker.setStep('Click Create Link button');
  // await editor.clickCreateLink();

  // stepTracker.setStep('Click Copy Link button');
  // const link = await editor.clickCopyLink();
  // console.log('Link Copied: ' + link);
  // expect(link).toBeTruthy();

  // // Attach published link to test results for CSV report
  // await testInfo.attach(ADOBE_LINK_ATTACHMENT, {
  //   body: Buffer.from(JSON.stringify({ publishedLink: link }), 'utf8'),
  //   contentType: 'application/json',
  // });

  
//   stepTracker.setStep('Download');
//   const filePath = await adobe.download_img(testInfo.workerIndex);
  
//   // 3. Optional: Assertion to verify the download happened
//   console.log(`File saved to: ${filePath}`);
//   expect(filePath).toBeTruthy();

});
