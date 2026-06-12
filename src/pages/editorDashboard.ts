import { expect, Locator, Page } from "@playwright/test";

export class EditorDashboard {
    readonly page: Page;
    readonly openInEditor: Locator;
    readonly skipTutorial_btn: Locator;
    readonly navSharebtn: Locator;
    readonly viewOnlyLink: Locator;
    readonly createLinkBtn: Locator;
    readonly copyLinkBtn: Locator;
    readonly publishUrl: Locator;

    constructor(page: Page) {
        this.page = page;
        this.openInEditor = page.getByRole('button', { name: 'Open in editor' });
        this.skipTutorial_btn = page.getByText('Skip tour');
        this.navSharebtn = page.locator('#share-btn');
        this.viewOnlyLink = page.getByRole('menuitem', { name: 'View-only link' });
        this.createLinkBtn = page.locator('#ptwPublishBtn');
        this.copyLinkBtn = page.getByRole('button', { name: 'Copy link' });
        this.publishUrl = page.getByLabel('Published URL');
    }

    async clickOpenInEditor(): Promise<void> {
        try {
            await expect(this.openInEditor).toBeEnabled({ timeout: 20000 })
            await this.openInEditor.click({ timeout: 20000 });
            // await this.page.waitForLoadState('networkidle', { timeout: 20000 });
        } catch (e) {
            console.log('xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx  Open In Editor Button NOT VISIBLE  xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', e);
        }
    }

    async skipTutorial(): Promise<void> {
        try {
            await this.skipTutorial_btn.waitFor({ state: 'visible', timeout: 20000 });
            await this.skipTutorial_btn.click({ timeout: 5000 });
            // await this.page.waitForLoadState('networkidle', { timeout: 5000 });
        } catch {
            console.log('xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx  Tutorial NOT VISIBLE  xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
        }
    }

    async clickShare(): Promise<void> {
        try {
            await expect(this.navSharebtn).toBeEnabled({ timeout: 20000 });
            await this.navSharebtn.click({ timeout: 20000 });
            // await this.page.waitForLoadState('networkidle', { timeout: 5000 });
        } catch (e) {
            console.log('xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx  Share Button NOT VISIBLE  xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', e);
        }
    }

    async openViewOnlyLink(): Promise<void> {
        try {
            await expect(this.viewOnlyLink).toBeEnabled({ timeout: 20000 });
            await this.viewOnlyLink.click({ timeout: 20000 });
            // await this.page.waitForLoadState('networkidle', { timeout: 5000 });
        } catch (e) {
            console.log('xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx  View Only Link NOT VISIBLE  xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', e);
        }
    }

    async clickCreateLink(): Promise<void> {
        try {
            await expect(this.createLinkBtn).toBeEnabled({ timeout: 20000 });
            await this.createLinkBtn.click({ timeout: 20000 });
            // await this.page.waitForLoadState('networkidle', { timeout: 5000 });
        } catch (e) {
            console.log('xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx  Create Link Button NOT VISIBLE  xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', e);
        }
    }

    async clickCopyLink(): Promise<string> {
        try {
            await expect(this.copyLinkBtn).toBeEnabled({ timeout: 20000 });
            await this.copyLinkBtn.click({ timeout: 20000 });
            // await this.page.waitForLoadState('networkidle', { timeout: 5000 });
            const link = await this.publishUrl.inputValue() ?? '';
            console.log('Publish Link: ', link);
            return link.trim();
        } catch (e) {
            console.log('xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx  Copy Link Button NOT VISIBLE  xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', e);
            return '';
        }
    }
}