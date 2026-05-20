import { defineAdobeAccountTests, expect } from "../../src/adobe/spec";
import { AdobePage } from "../../src/pages/adobe";
import { GmailProvider } from "../../src/pages/gmailProvider";
import { MsProvider } from "../../src/pages/msProvider";

defineAdobeAccountTests(
  "script flow",
  async ({ page, account, stepTracker }) => {
    const adobe = new AdobePage(page);
    const ms = new MsProvider(page);
    const ggl = new GmailProvider(page);

    stepTracker.setStep("open login");
    await adobe.adb_login();

    stepTracker.setStep("Enter email at Adobe Login");
    await adobe.fill_adb_email_field(account.email);

    stepTracker.setStep("Handle Persoanl/Company screen on Adobe Login");
    await adobe.select_cmp_option();

    stepTracker.setStep("check email provider");
    const provider = await adobe.getLoginProvider();

    stepTracker.setStep("Login with" + provider);
    if (provider.includes("accounts.google.com")) {
      await ggl.g_login(account.email, account.password);
    } else if (provider.includes("login.microsoftonline.com")) {
      await ms.ms_login(account.email, account.password);
    }

    stepTracker.setStep("Wait for Adobe Dashboard");
    await adobe.waitForDashboard();

    stepTracker.setStep("Activate by Lets Go");

    const letsGoBtn = page.getByTestId("x-dialog-primary-cta");

    try {
      await letsGoBtn.waitFor({
        state: "visible",
        timeout: 15000,
      });

      await page.waitForTimeout(2000);

      // Real click
      await letsGoBtn.click({
        timeout: 10000,
      });

      console.log("Lets Go clicked");

      // Confirm popup/button disappeared
      await letsGoBtn.waitFor({
        state: "hidden",
        timeout: 10000,
      });

      console.log("Lets Go popup closed successfully");
    } catch (e) {
      console.log("Lets Go handling failed:", e);
      throw new Error(
        "Lets Go handling failed. Check Playwright video/trace artifacts for this account."
      );
    }

    stepTracker.setStep("Redirect to edit");
    await adobe.shortcut();

    stepTracker.setStep("Wait for Img Generation");
    await adobe.wait_for_generation();

    stepTracker.setStep("Download");
    const filePath = await adobe.download_img();

    // 3. Optional: Assertion to verify the download happened
    console.log(`File saved to: ${filePath}`);
    expect(filePath).toBeTruthy();
  }
);
