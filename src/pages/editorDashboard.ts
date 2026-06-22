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
        this.createLinkBtn = page.getByText('Create link').first();
        this.copyLinkBtn = page.getByRole('button', { name: 'Copy link' });
        this.publishUrl = page.locator('a[href^="https://new.express.adobe.com/publishedV2/"]').first();
    }

    async clickOpenInEditor(): Promise<void> {
        // Required step — fail fast so a broken account aborts here instead of
        // limping through every later step and burning each one's timeout.
        await expect(this.openInEditor).toBeEnabled({ timeout: 20000 });
        await this.openInEditor.click({ timeout: 20000 });
    }

    async skipTutorial(): Promise<void> {
        // 1. The "Try the updated editor" coachmark tour appears at an unpredictable
        // time — often AFTER this method runs — and its underlay intercepts pointer
        // events on later steps (e.g. the search bar). A one-shot dismiss races that
        // timing, so register an auto-handler instead: whenever "Skip tour" becomes
        // visible during ANY subsequent action, Playwright clicks it and retries the
        // action. This is the idiomatic fix for intermittent overlays and carries no
        // fixed wait penalty when no tour appears.
        await this.page.addLocatorHandler(
            this.page.getByRole('button', { name: 'Skip tour' }),
            async (locator) => { await locator.click({ timeout: 5000 }).catch(() => { /* tour may close on its own */ }); },
        );

        // 2. Try to dismiss quick tips / popups (if visible)
        try {
            const gotItBtn = this.page.getByRole('button', { name: 'Got it' }).or(this.page.getByText('Got it'));
            if (await gotItBtn.isVisible()) {
                await gotItBtn.click({ timeout: 5000 });
            }
        } catch (e) {
            console.log('skipTutorial: error checking/clicking Got it', e);
        }
    }

    async clickShare(): Promise<void> {
        // Required step — fail fast instead of swallowing and continuing.
        await expect(this.navSharebtn).toBeEnabled({ timeout: 20000 });
        await this.navSharebtn.click({ timeout: 20000 });
    }

    async openViewOnlyLink(): Promise<void> {
        // After clicking Share, Adobe shows "We're working on your file…" while it
        // prepares the doc; the share options (incl. "View-only link") only appear
        // once that completes. The prep message renders a beat AFTER the Share click,
        // so waiting on it races its delayed render. Instead wait directly for the
        // end state — the View-only link menuitem — with a timeout generous enough
        // to cover file prep. Some accounts' files prep slowly (>120s), so allow 180s;
        // this still fits the 360s per-test budget alongside the downstream link steps.
        await expect(this.viewOnlyLink).toBeEnabled({ timeout: 180_000 });
        await this.viewOnlyLink.click({ timeout: 20000 });
        await expect(this.createLinkBtn).toBeVisible({ timeout: 30000 });
    }

    async clickCreateLink(): Promise<void> {
        // Required step — fail fast instead of swallowing and continuing.
        await expect(this.createLinkBtn).toBeEnabled({ timeout: 20000 });
        await this.createLinkBtn.click({ timeout: 20000 });
        // Link generation is done when EITHER a "Copy link" button appears (one panel
        // variant) OR the published URL is rendered directly with an icon copy control
        // (another variant). Wait for whichever shows up so both variants proceed.
        await expect(this.copyLinkBtn.or(this.publishUrl).first()).toBeVisible({ timeout: 30000 });
    }

    async clickCopyLink(): Promise<string> {
        // Best-effort: if this panel variant has a "Copy link" button, click it (puts the
        // URL on the clipboard). The other variant renders only the link with an icon
        // control and no labeled button — in that case skip the click. Either way, the
        // rendered published URL is the source of truth, so read the href from it.
        if (await this.copyLinkBtn.isVisible().catch(() => false)) {
            await this.copyLinkBtn.click({ timeout: 20000 }).catch(() => { /* link still readable below */ });
        }

        await expect(this.publishUrl).toHaveAttribute('href', /https:\/\/new\.express\.adobe\.com\/publishedV2\//, { timeout: 30000 });

        const link = await this.publishUrl.getAttribute('href') ?? '';
        console.log('Publish Link: ', link);
        return link.trim();
    }
}
