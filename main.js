import dotenv from "dotenv";
import { chromium } from "playwright";
import { withTimeoutAndInfiniteRetry } from "./utils.js";

dotenv.config();

const BROWSER_COUNT = 10;
const BROWSER_WIDTH = 480; // Each browser window will be 480x360
const BROWSER_HEIGHT = 360;
const COLUMNS = 4;

export const STEPS = {
  INITIALIZED: "Initialized",
  NAVIGATED_TO_EVENT_PAGE: "Navigated to JJ concert page",
  NAVIGATED_TO_QUEUE: "Navigatd to the queue",
  WAITED_TO_BUY_PAGE: "Waited to the buy page",
};

const browsers = new Map();
let purchaseBrowser = null;

const launchBrowsers = async () => {
  try {
    console.log(`Launching ${BROWSER_COUNT} browser instances...`);

    // Calculate positions for a 4x3 grid layout
    const positions = [];
    for (let row = 0; row < Math.ceil(BROWSER_COUNT / COLUMNS); row++) {
      for (let col = 0; col < COLUMNS; col++) {
        positions.push({
          x: col * BROWSER_WIDTH,
          y: row * BROWSER_HEIGHT,
        });
      }
    }

    // Launch browser instances in parallel
    await Promise.all(
      Array.from({ length: BROWSER_COUNT }, async (_, i) => {
        console.log(`Launching browser ${i + 1}...`);
        const browser = await chromium.launch({
          headless: false,
          //   proxy: {
          //     server: process.env.PROXY_SERVER_URL,
          //     username: process.env.PROXY_USERNAME,
          //     password: process.env.PROXY_PASSWORD,
          //   },
          args: [
            `--window-position=${positions[i].x},${positions[i].y}`,
            `--window-size=${BROWSER_WIDTH + 16},${BROWSER_HEIGHT + 88}`, // Add padding for browser chrome
          ],
        });

        // Create context with specific viewport size
        const context = await browser.newContext({
          viewport: null,
          screen: { width: BROWSER_WIDTH, height: BROWSER_HEIGHT },
        });

        // Add browser to map with initial state
        browsers.set(i, {
          browser,
          context,
          step: STEPS.INITIALIZED,
        });

        const page = await context.newPage();

        // Step 1: go to the event page
        await withTimeoutAndInfiniteRetry(
          async () => {
            // Early return if browser has already navigated to the event page
            if (browsers.get(i).step === STEPS.NAVIGATED_TO_EVENT_PAGE) {
              return;
            }

            await page.goto("https://www.cityline.com/zh_HK/Events.html");
            await page.waitForSelector("span.event-tag");

            // Click and wait for new page
            await page
              .locator('a:has(span.event-tag:text("伯大尼"))')
              .first()
              .click();

            // Update step after successful navigation
            browsers.get(i).step = STEPS.NAVIGATED_TO_EVENT_PAGE;
          },
          {
            actionName: STEPS.NAVIGATED_TO_EVENT_PAGE,
            timeout: 3000,
            page,
          }
        );

        await new Promise((resolve) => setTimeout(resolve, 500));

        // Step 2: click the button and join the queue
        await withTimeoutAndInfiniteRetry(
          async () => {
            if (browsers.get(i).step === STEPS.NAVIGATED_TO_QUEUE) {
              return;
            }

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
            timeout: 3000,
            page: (await context.pages())[context.pages().length - 1],
          }
        );

        // Step 3: wait for the buy page to be available, and then make the page bigger
        await withTimeoutAndInfiniteRetry(
          async () => {
            // early return if there is a browser that exits the queue
            if (purchaseBrowser) {
              return;
            }

            const pages = await context.pages();
            const buyPage = pages[pages.length - 1];

            await buyPage.waitForSelector("button.purchase-btn", {
              state: "visible",
            });

            // Store both browser and context
            purchaseBrowser = { browser, context, page: buyPage };
          },
          {
            actionName: STEPS.WAITED_TO_BUY_PAGE,
            timeout: 800,
            page: (await context.pages())[context.pages().length - 1],
            reload: false,
          }
        );

        // STEP 4: resize the window
        if (purchaseBrowser) {
          // Use the stored context and page
          const cdpSession = await purchaseBrowser.context.newCDPSession(
            purchaseBrowser.page
          );

          // Get the target info first
          const targetInfo = await cdpSession.send(
            "Browser.getWindowForTarget"
          );

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
        }
      })
    );

    console.log("All browsers launched and positioned!");
    console.log("Press Ctrl+C to close all browsers and exit");
  } catch (error) {
    console.error("An error occurred:", error);
  }
};

launchBrowsers();
