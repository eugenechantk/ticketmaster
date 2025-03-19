import Browserbase from "@browserbasehq/sdk";
import dotenv from "dotenv";
import { chromium } from "playwright";
import { STEPS } from "./main.js";
import { withTimeoutAndInfiniteRetry } from "./utils.js";

dotenv.config();

const bb = new Browserbase({
  apiKey: process.env.BROWSERBASE_API_KEY,
});

async function createSessionWithGeoLocation() {
  const session = await bb.sessions.create({
    projectId: process.env.BROWSERBASE_PROJECT_ID,
    proxies: [
      {
        type: "external",
        server: process.env.PROXY_SERVER_URL,
        username: process.env.PROXY_USERNAME,
        password: process.env.PROXY_PASSWORD,
      },
    ],
  });
  return session;
}

const launchLiveView = async (liveViewLink) => {
  const viewerBrowser = await chromium.launch({
    headless: false,
    args: ["--start-maximized", "--window-position=0,0"],
  });
  const viewerContext = await viewerBrowser.newContext({
    viewport: null,
  });
  const viewerPage = await viewerContext.newPage();
  await viewerPage.goto(liveViewLink);
};

const main = async () => {
  try {
    const session = await createSessionWithGeoLocation();

    const browser = await chromium.connectOverCDP(session.connectUrl);

    const liveViewLinks = await bb.sessions.debug(session.id);
    const liveViewLink = liveViewLinks.debuggerFullscreenUrl;
    await launchLiveView(liveViewLink);

    const context = browser.contexts()[0];
    const page = context.pages()[0];

    // Step 0: navigate to the ticketing page
    await withTimeoutAndInfiniteRetry(
      async () => {
        await page.goto("https://www.cityline.com/zh_HK/Events.html");
      },
      {
        actionName: STEPS.INITIALIZED,
        timeout: 3000,
        page,
      }
    );

    // Step 1: navigate to the event page
    await withTimeoutAndInfiniteRetry(
      async () => {
        await page.waitForSelector("span.event-tag");

        // Click and wait for new page
        await page
          .locator('a:has(span.event-tag:text("伯大尼"))')
          .first()
          .click();
      },
      {
        actionName: STEPS.NAVIGATED_TO_EVENT_PAGE,
        timeout: 3000,
        page,
      }
    );

    // Step 2: click the button and join the queue
    await withTimeoutAndInfiniteRetry(
      async () => {
        // Get the event page (last opened page)
        const pages = await context.pages();
        const eventPage = pages[pages.length - 1];
        console.log("Event page:", await eventPage.url());

        // Wait for and click the buy ticket button inside buyTicketBox when it's enabled
        await eventPage.waitForSelector(
          "div.buyTicketBox button:not([disabled])"
        );
        await eventPage.click("div.buyTicketBox button:not([disabled])");

        browsers.get(i).step = STEPS.NAVIGATED_TO_QUEUE;
      },
      {
        actionName: STEPS.NAVIGATED_TO_QUEUE,
        timeout: 5000,
        page: (await context.pages())[context.pages().length - 1],
      }
    );

    // Step 3: wait for the buy page to be available, and then make the page bigger
    await withTimeoutAndInfiniteRetry(
      async () => {
        const pages = await context.pages();
        const buyPage = pages[pages.length - 1];

        await buyPage.waitForSelector("button.purchase-btn", {
          state: "visible",
        });

        // Get the Chrome DevTools Protocol session
        const cdpSession = await context.newCDPSession(buyPage);

        // Get the target info first
        const targetInfo = await cdpSession.send("Browser.getWindowForTarget");

        // Use the Browser.setWindowBounds method to resize the window
        await cdpSession.send("Browser.setWindowBounds", {
          windowId: targetInfo.windowId,
          bounds: {
            width: 1440,
            height: 1200,
            left: 0,
            top: 0,
          },
        });
      },
      {
        actionName: STEPS.WAITED_TO_BUY_PAGE,
        timeout: 3000,
        page: (await context.pages())[context.pages().length - 1],
        reload: false,
      }
    );
  } catch (error) {
    console.error(error);
  }
};

main();
