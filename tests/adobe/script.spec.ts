import { loadFreshAdobeAccounts } from "../../src/adobe/accounts";
import { expect, test } from "../../src/adobe/spec";
import { AdobePage } from "../../src/pages/adobe";
import { GmailProvider } from "../../src/pages/gmailProvider";
import { MsProvider } from "../../src/pages/msProvider";

const SCRIPT_ACCOUNT_LIMIT = resolveScriptAccountLimit(process.env.ADOBE_SCRIPT_ACCOUNT_LIMIT);
const { accounts, shard, skipReason } = loadFreshAdobeAccounts();
const selectedAccounts = selectScriptAccounts(accounts, SCRIPT_ACCOUNT_LIMIT);

if (selectedAccounts.length === 0) {
  test.skip(skipReason ?? "No fresh accounts available", async () => { });
} else {
  if (shard) {
    console.log(
      `script.spec.ts account shard ${shard.index + 1}/${shard.total}: ${selectedAccounts.length} account(s) assigned.`,
    );
  }

  if (SCRIPT_ACCOUNT_LIMIT && SCRIPT_ACCOUNT_LIMIT < accounts.length) {
    console.log(
      `script.spec.ts limited run: ${selectedAccounts.length}/${accounts.length} account(s) selected `
      + `with ADOBE_SCRIPT_ACCOUNT_LIMIT=${SCRIPT_ACCOUNT_LIMIT}.`,
    );
  }

  for (const account of selectedAccounts) {
    test.describe(account.email, () => {
      test.use({ assignedAccount: account });
      test("script flow", async ({ page, account: loginAccount, stepTracker }) => {
        const adobe = new AdobePage(page);
        const ms = new MsProvider(page);
        const ggl = new GmailProvider(page);

        stepTracker.setStep("open login");
        await adobe.adb_login();

        stepTracker.setStep("Enter email at Adobe Login");
        await adobe.fill_adb_email_field(loginAccount.email);

        stepTracker.setStep("Handle Persoanl/Company screen on Adobe Login");
        await adobe.select_cmp_option();

        stepTracker.setStep("check email provider");
        const provider = await adobe.getLoginProvider();

        stepTracker.setStep("Login with" + provider);
        if (provider.includes("accounts.google.com")) {
          await ggl.g_login(loginAccount.email, loginAccount.password);
        } else if (provider.includes("login.microsoftonline.com")) {
          await ms.ms_login(loginAccount.email, loginAccount.password);
        }

        stepTracker.setStep("Wait for Adobe Dashboard");
        await adobe.waitForDashboard();

        stepTracker.setStep("Activate by Lets Go");
        await adobe.handle_letsGo(loginAccount);

        if (process.env.ADOBE_STOP_AFTER_LOGIN?.trim() === "1") {
          return;
        }



        // stepTracker.setStep('Redirect to edit');
        // await adobe.shortcut();

        // stepTracker.setStep('Wait for Img Generation');
        // await adobe.wait_for_generation();

        // stepTracker.setStep('Download');
        // const filePath = await adobe.download_img();

        // // 3. Optional: Assertion to verify the download happened
        // console.log(`File saved to: ${filePath}`);
        // expect(filePath).toBeTruthy();
      });
    });
  }
}

function resolveScriptAccountLimit(rawValue: string | undefined): number | undefined {
  const value = rawValue?.trim();
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`ADOBE_SCRIPT_ACCOUNT_LIMIT must be a positive integer. Got "${rawValue}".`);
  }

  return parsed;
}

function selectScriptAccounts<T>(accounts: T[], limit?: number): T[] {
  if (!limit) {
    return accounts;
  }

  return accounts.slice(0, limit);
}
